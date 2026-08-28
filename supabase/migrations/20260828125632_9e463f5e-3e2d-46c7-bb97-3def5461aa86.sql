-- ============================================================================
-- F3-B REGISTRATION CONTROLLED REMEDIATION — PART 1
-- Authority boundary, governed applicant mutations, status vocabulary,
-- grant/policy alignment, definer + anon hardening.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Canonical status vocabulary (GAP-F3-03 / GAP-F3-13)
-- ---------------------------------------------------------------------------
UPDATE public.registrations
   SET status = CASE
     WHEN lower(btrim(status)) IN ('correction_required','changes_requested','returned_for_correction','resubmission_requested','info_requested','more_info_requested','query_raised') THEN 'resubmission_required'
     WHEN lower(btrim(status)) IN ('submitted','pending') THEN 'pending_review'
     WHEN lower(btrim(status)) IN ('under_review','in_review','resubmitted') THEN 'in_progress'
     WHEN lower(btrim(status)) IN ('final_approved','active','validated') THEN 'approved'
     ELSE lower(btrim(status))
   END
 WHERE status IS NOT NULL
   AND status <> CASE
     WHEN lower(btrim(status)) IN ('correction_required','changes_requested','returned_for_correction','resubmission_requested','info_requested','more_info_requested','query_raised') THEN 'resubmission_required'
     WHEN lower(btrim(status)) IN ('submitted','pending') THEN 'pending_review'
     WHEN lower(btrim(status)) IN ('under_review','in_review','resubmitted') THEN 'in_progress'
     WHEN lower(btrim(status)) IN ('final_approved','active','validated') THEN 'approved'
     ELSE lower(btrim(status))
   END;

ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS registrations_status_chk;
ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_status_chk CHECK (status IN (
    'pending_verification','pending_review','in_progress',
    'resubmission_required','approved','rejected','withdrawn'
  ));

CREATE OR REPLACE FUNCTION public.registration_status_vocabulary()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ARRAY['pending_verification','pending_review','in_progress',
               'resubmission_required','approved','rejected','withdrawn']::text[];
$$;
REVOKE ALL ON FUNCTION public.registration_status_vocabulary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_status_vocabulary() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Authority boundary: no direct browser writes (GAP-F3-01 / GAP-F3-04)
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.registrations FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.registrations FROM anon;
DROP POLICY IF EXISTS "Users can update own registrations" ON public.registrations;
DROP POLICY IF EXISTS "Internal staff update registrations" ON public.registrations;
DROP POLICY IF EXISTS "Users can insert own registrations" ON public.registrations;

CREATE OR REPLACE FUNCTION public.tg_registrations_guard_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('app.registration_mutation_context', true), '') = 'governed'
     OR public.is_trusted_service_request() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF public.request_role() IN ('anon','authenticated') THEN
    RAISE EXCEPTION 'registrations may only be modified through governed registration functions'
      USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS registrations_guard_write ON public.registrations;
CREATE TRIGGER registrations_guard_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.tg_registrations_guard_write();

-- Governed context inside the canonical lifecycle writers.
CREATE OR REPLACE FUNCTION public.perform_registration_workflow_transition_internal(
  _registration_id uuid, _instance_id uuid, _step_id uuid, _action_type text,
  _comments text, _actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_reg record; v_instance record; v_step record; v_auth jsonb; v_allowed text[];
  v_steps_total int; v_current_idx int; v_is_first boolean; v_is_last boolean;
  v_next record; v_prev record; v_new_step_id uuid; v_new_reg_status text;
  v_new_instance_status text; v_now timestamptz := now();
  v_is_internal boolean; v_role_match boolean; v_effective_action text;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);
  PERFORM set_config('app.registration_mutation_context', 'governed', true);

  IF _actor_id IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;
  IF _action_type NOT IN (
    'approve','reject','send_back','escalate',
    'request_resubmission','return_for_correction','request_more_info',
    'save_comment'
  ) THEN
    RETURN jsonb_build_object('error','Invalid action_type','code','BAD_ACTION','http',400);
  END IF;

  v_effective_action := CASE WHEN _action_type = 'save_comment' THEN 'approve' ELSE _action_type END;

  IF _action_type IN (
    'approve','reject','request_resubmission','return_for_correction','request_more_info','save_comment'
  ) AND (_comments IS NULL OR length(trim(_comments)) = 0) THEN
    RETURN jsonb_build_object('error','Remarks are mandatory for this action','code','REMARKS_REQUIRED','http',422);
  END IF;

  SELECT id, status, registration_reference, sector_id
    INTO v_reg FROM public.registrations WHERE id = _registration_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Registration not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_reg.status NOT IN ('pending_review','in_progress','resubmission_required') THEN
    RETURN jsonb_build_object('error',format('Registration is in ''%s'' status', v_reg.status),
                              'code','INVALID_STATUS','http',409);
  END IF;

  SELECT id, workflow_id, current_step_id, status INTO v_instance
    FROM public.workflow_instances
   WHERE entity_id = _registration_id AND entity_type = 'registration'
     AND status IN ('active','paused')
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','No active workflow instance','code','NO_ACTIVE_INSTANCE','http',409);
  END IF;
  IF _instance_id IS NOT NULL AND _instance_id <> v_instance.id THEN
    RETURN jsonb_build_object('error','Stale workflow instance','code','STALE_INSTANCE','http',409);
  END IF;
  IF _step_id IS NOT NULL AND _step_id <> v_instance.current_step_id THEN
    RETURN jsonb_build_object('error','Stale step','code','STALE_STEP','http',409);
  END IF;

  SELECT id, step_order, name, approver_role, approver_role_id, allowed_actions
    INTO v_step FROM public.approval_steps WHERE id = v_instance.current_step_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Current step not found','code','STEP_NOT_FOUND','http',409);
  END IF;

  SELECT count(*),
         (SELECT count(*) FROM public.approval_steps s2
           WHERE s2.workflow_id = v_instance.workflow_id AND s2.step_order < v_step.step_order)
    INTO v_steps_total, v_current_idx
    FROM public.approval_steps WHERE workflow_id = v_instance.workflow_id;
  v_is_first := (v_current_idx = 0);
  v_is_last  := (v_current_idx = v_steps_total - 1);

  v_auth := public.user_can_act_on_workflow_step(_actor_id, v_step.id);
  v_role_match := COALESCE((v_auth->>'can_act')::boolean, false);
  v_is_internal := COALESCE((v_auth->>'is_internal')::boolean, false);

  IF _action_type = 'save_comment' THEN
    IF NOT v_is_internal THEN
      RETURN jsonb_build_object('error','Only internal staff can save a comment on this step',
                                'code','FORBIDDEN','http',403,'diagnostic',v_auth);
    END IF;
  ELSIF NOT v_role_match THEN
    PERFORM public.log_workflow_authz_denial(_actor_id, v_step.id, _action_type, COALESCE(v_auth->>'reason','WRONG_APPROVER'), v_auth);
    RETURN jsonb_build_object(
      'error', format('Only %s can act on this step',
                      COALESCE(v_auth->>'required_role_name', v_step.approver_role::text)),
      'code','WRONG_APPROVER','http',403, 'diagnostic', v_auth);
  END IF;

  IF _action_type <> 'save_comment' THEN
    v_allowed := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_step.allowed_actions, '[]'::jsonb)));
    IF NOT (_action_type = ANY(v_allowed)) THEN
      RETURN jsonb_build_object('error',format('Action ''%s'' is not allowed on this step', _action_type),
                                'code','ACTION_NOT_ALLOWED','http',422);
    END IF;
  END IF;

  IF _action_type = 'send_back' AND v_is_first THEN
    RETURN jsonb_build_object('error','Cannot send back from the first step','code','CANNOT_SEND_BACK','http',422);
  END IF;
  IF _action_type = 'escalate' AND v_is_last THEN
    RETURN jsonb_build_object('error','Cannot escalate from the last step','code','CANNOT_ESCALATE','http',422);
  END IF;

  v_new_step_id := v_step.id;

  IF v_effective_action = 'approve' THEN
    IF v_is_last THEN
      v_new_reg_status := 'approved';
      v_new_instance_status := 'completed';
    ELSE
      SELECT id INTO v_next FROM public.approval_steps
       WHERE workflow_id = v_instance.workflow_id AND step_order > v_step.step_order
       ORDER BY step_order ASC LIMIT 1;
      v_new_step_id := v_next.id;
      v_new_reg_status := 'in_progress';
    END IF;
  ELSIF _action_type = 'reject' THEN
    v_new_reg_status := 'rejected';
    v_new_instance_status := 'completed';
  ELSIF _action_type = 'send_back' THEN
    SELECT id INTO v_prev FROM public.approval_steps
     WHERE workflow_id = v_instance.workflow_id AND step_order < v_step.step_order
     ORDER BY step_order DESC LIMIT 1;
    v_new_step_id := v_prev.id;
    v_new_reg_status := 'in_progress';
  ELSIF _action_type = 'escalate' THEN
    SELECT id INTO v_next FROM public.approval_steps
     WHERE workflow_id = v_instance.workflow_id AND step_order > v_step.step_order
     ORDER BY step_order ASC LIMIT 1;
    v_new_step_id := v_next.id;
    v_new_reg_status := 'in_progress';
  ELSIF _action_type IN ('request_resubmission','return_for_correction','request_more_info') THEN
    v_new_reg_status := 'resubmission_required';
    v_new_instance_status := 'paused';
  END IF;

  IF _action_type = 'save_comment' THEN
    DELETE FROM public.approval_actions
     WHERE entity_type = 'registration'
       AND entity_id = _registration_id
       AND step_id = v_step.id
       AND actor_id = _actor_id
       AND action_type = 'save_comment';
  END IF;

  INSERT INTO public.approval_actions (
    workflow_instance_id, step_id, actor_id, action, action_type, comments,
    entity_type, entity_id
  ) VALUES (
    v_instance.id, v_step.id, _actor_id,
    CASE WHEN _action_type = 'save_comment' THEN 'comment_saved' ELSE _action_type END,
    _action_type, _comments,
    'registration', _registration_id
  );

  UPDATE public.workflow_instances
     SET current_step_id = v_new_step_id,
         status = COALESCE(v_new_instance_status, status),
         completed_at = CASE WHEN COALESCE(v_new_instance_status, status) = 'completed' THEN v_now ELSE completed_at END,
         updated_at = v_now
   WHERE id = v_instance.id;

  IF v_new_reg_status IS NOT NULL THEN
    UPDATE public.registrations SET status = v_new_reg_status, updated_at = v_now
     WHERE id = _registration_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action_type', _action_type,
    'registration_id', _registration_id,
    'registration_reference', v_reg.registration_reference,
    'new_step_id', v_new_step_id,
    'new_status', COALESCE(v_new_reg_status, v_reg.status),
    'instance_id', v_instance.id,
    'http', 200
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.resume_registration_workflow(
  _registration_id uuid, _actor_id uuid, _comments text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_reg record; v_instance record; v_now timestamptz := now();
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);
  PERFORM set_config('app.registration_mutation_context', 'governed', true);

  IF _actor_id IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;

  SELECT id, status, user_id, registration_reference
    INTO v_reg FROM public.registrations WHERE id = _registration_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Registration not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_reg.user_id IS DISTINCT FROM _actor_id THEN
    RETURN jsonb_build_object('error','Only the applicant can resume this workflow','code','FORBIDDEN','http',403);
  END IF;

  SELECT id, workflow_id, workflow_version_id, current_step_id, status
    INTO v_instance FROM public.workflow_instances
   WHERE entity_id = _registration_id AND entity_type = 'registration'
     AND status IN ('active','paused')
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.registrations
       SET status = 'pending_review', updated_at = v_now
     WHERE id = _registration_id;
    RETURN jsonb_build_object('success', true, 'resumed', false, 'matched', false, 'http', 200);
  END IF;

  IF v_instance.status = 'paused' THEN
    UPDATE public.workflow_instances SET status = 'active', updated_at = v_now WHERE id = v_instance.id;
  END IF;

  UPDATE public.registrations SET status = 'in_progress', updated_at = v_now WHERE id = _registration_id;

  IF v_instance.current_step_id IS NOT NULL THEN
    INSERT INTO public.approval_actions (
      workflow_instance_id, step_id, actor_id, action, action_type, comments,
      entity_type, entity_id, workflow_version_id
    ) VALUES (
      v_instance.id, v_instance.current_step_id, _actor_id,
      'resubmit', 'resubmit', COALESCE(_comments, 'Applicant resubmitted registration'),
      'registration', _registration_id, v_instance.workflow_version_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'resumed', true, 'matched', true,
    'instance_id', v_instance.id, 'workflow_id', v_instance.workflow_id,
    'current_step_id', v_instance.current_step_id, 'http', 200);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Governed applicant mutations (GAP-F3-04 / GAP-F3-06 / GAP-F3-10)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registration_applicant_editable_fields()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ARRAY[
    'sector_id','sub_sector_id','category_id','applicant_name','applicant_name_alt',
    'registration_number','mailing_address','physical_address','same_as_mailing',
    'first_name','last_name','telephone','username','entity_specific_data',
    'documents_metadata','terms_accepted'
  ]::text[];
$$;
REVOKE ALL ON FUNCTION public.registration_applicant_editable_fields() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_applicant_editable_fields() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.registration_applicant_apply_edit(
  _registration_id uuid, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reg record;
  v_allowed text[] := public.registration_applicant_editable_fields();
  v_rejected text[];
  v_payload jsonb := COALESCE(_payload, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT id, user_id, status, registration_reference
    INTO v_reg FROM public.registrations WHERE id = _registration_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registration not found' USING ERRCODE = '42501';
  END IF;
  IF v_reg.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'you may only edit your own registration' USING ERRCODE = '42501';
  END IF;
  IF v_reg.status NOT IN ('pending_verification','resubmission_required') THEN
    RAISE EXCEPTION 'registration in ''%'' status cannot be edited by the applicant', v_reg.status
      USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(k ORDER BY k) INTO v_rejected
    FROM jsonb_object_keys(v_payload) AS k
   WHERE k <> ALL (v_allowed);
  IF v_rejected IS NOT NULL THEN
    RAISE EXCEPTION 'field(s) % are not applicant editable', array_to_string(v_rejected, ', ')
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.registration_mutation_context', 'governed', true);

  UPDATE public.registrations r SET
    sector_id            = CASE WHEN v_payload ? 'sector_id' AND NULLIF(v_payload->>'sector_id','') IS NOT NULL THEN (v_payload->>'sector_id')::uuid ELSE r.sector_id END,
    sub_sector_id        = CASE WHEN v_payload ? 'sub_sector_id' AND NULLIF(v_payload->>'sub_sector_id','') IS NOT NULL THEN (v_payload->>'sub_sector_id')::uuid ELSE r.sub_sector_id END,
    category_id          = CASE WHEN v_payload ? 'category_id' AND NULLIF(v_payload->>'category_id','') IS NOT NULL THEN (v_payload->>'category_id')::uuid ELSE r.category_id END,
    applicant_name       = CASE WHEN v_payload ? 'applicant_name' AND NULLIF(btrim(v_payload->>'applicant_name'),'') IS NOT NULL THEN btrim(v_payload->>'applicant_name') ELSE r.applicant_name END,
    applicant_name_alt   = CASE WHEN v_payload ? 'applicant_name_alt' THEN NULLIF(btrim(COALESCE(v_payload->>'applicant_name_alt','')),'') ELSE r.applicant_name_alt END,
    registration_number  = CASE WHEN v_payload ? 'registration_number' THEN NULLIF(btrim(COALESCE(v_payload->>'registration_number','')),'') ELSE r.registration_number END,
    mailing_address      = CASE WHEN v_payload ? 'mailing_address' THEN v_payload->'mailing_address' ELSE r.mailing_address END,
    physical_address     = CASE WHEN v_payload ? 'physical_address' THEN v_payload->'physical_address' ELSE r.physical_address END,
    same_as_mailing      = CASE WHEN v_payload ? 'same_as_mailing' THEN COALESCE((v_payload->>'same_as_mailing')::boolean, r.same_as_mailing) ELSE r.same_as_mailing END,
    first_name           = CASE WHEN v_payload ? 'first_name' AND NULLIF(btrim(v_payload->>'first_name'),'') IS NOT NULL THEN btrim(v_payload->>'first_name') ELSE r.first_name END,
    last_name            = CASE WHEN v_payload ? 'last_name' AND NULLIF(btrim(v_payload->>'last_name'),'') IS NOT NULL THEN btrim(v_payload->>'last_name') ELSE r.last_name END,
    telephone            = CASE WHEN v_payload ? 'telephone' THEN COALESCE(btrim(v_payload->>'telephone'), r.telephone) ELSE r.telephone END,
    username             = CASE WHEN v_payload ? 'username' THEN NULLIF(btrim(COALESCE(v_payload->>'username','')),'') ELSE r.username END,
    entity_specific_data = CASE WHEN v_payload ? 'entity_specific_data' THEN v_payload->'entity_specific_data' ELSE r.entity_specific_data END,
    documents_metadata   = CASE WHEN v_payload ? 'documents_metadata' THEN v_payload->'documents_metadata' ELSE r.documents_metadata END,
    terms_accepted       = CASE WHEN v_payload ? 'terms_accepted' THEN COALESCE((v_payload->>'terms_accepted')::boolean, r.terms_accepted) ELSE r.terms_accepted END,
    updated_at           = now()
   WHERE r.id = _registration_id;

  PERFORM public.onboarding_record_journey_event(
    v_uid, 'registration_applicant_edit', NULL, NULL, _registration_id, NULL,
    jsonb_build_object('fields', (SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[]) FROM jsonb_object_keys(v_payload) k),
                       'status', v_reg.status));

  RETURN jsonb_build_object('success', true, 'registration_id', _registration_id,
                            'status', v_reg.status,
                            'registration_reference', v_reg.registration_reference);
END $$;
REVOKE ALL ON FUNCTION public.registration_applicant_apply_edit(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_applicant_apply_edit(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.registration_applicant_resubmit(
  _registration_id uuid,
  _payload jsonb DEFAULT '{}'::jsonb,
  _form_data jsonb DEFAULT NULL::jsonb,
  _form_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_edit jsonb;
  v_resume jsonb;
  v_submission_id uuid;
  v_form_id uuid := _form_id;
BEGIN
  v_edit := public.registration_applicant_apply_edit(_registration_id, _payload);

  IF _form_data IS NOT NULL THEN
    IF v_form_id IS NULL THEN
      SELECT form_id INTO v_form_id FROM public.registration_form_submissions
       WHERE registration_id = _registration_id AND user_id = v_uid
       ORDER BY updated_at DESC LIMIT 1;
    END IF;

    IF v_form_id IS NOT NULL THEN
      SELECT id INTO v_submission_id FROM public.registration_form_submissions
       WHERE registration_id = _registration_id AND user_id = v_uid AND form_id = v_form_id
       ORDER BY updated_at DESC LIMIT 1;

      IF v_submission_id IS NULL THEN
        INSERT INTO public.registration_form_submissions
          (registration_id, user_id, form_id, form_data, status)
        VALUES (_registration_id, v_uid, v_form_id, _form_data, 'submitted')
        RETURNING id INTO v_submission_id;
      ELSE
        UPDATE public.registration_form_submissions
           SET form_data = _form_data, status = 'submitted', updated_at = now()
         WHERE id = v_submission_id;
      END IF;
    END IF;
  END IF;

  v_resume := public.resume_registration_workflow(
    _registration_id, v_uid, 'Applicant resubmitted registration');

  PERFORM public.onboarding_record_journey_event(
    v_uid, 'registration_resubmitted', NULL, NULL, _registration_id, NULL,
    jsonb_build_object('submission_id', v_submission_id, 'resume', v_resume));

  RETURN jsonb_build_object('success', true, 'registration_id', _registration_id,
                            'submission_id', v_submission_id,
                            'workflow', v_resume, 'edit', v_edit);
END $$;
REVOKE ALL ON FUNCTION public.registration_applicant_resubmit(uuid, jsonb, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_applicant_resubmit(uuid, jsonb, jsonb, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.registration_applicant_withdraw(
  _registration_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reg record;
  v_instance record;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'a withdrawal reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT id, user_id, status, registration_reference
    INTO v_reg FROM public.registrations WHERE id = _registration_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registration not found' USING ERRCODE = '42501';
  END IF;
  IF v_reg.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'you may only withdraw your own registration' USING ERRCODE = '42501';
  END IF;
  IF v_reg.status NOT IN ('pending_verification','pending_review','in_progress','resubmission_required') THEN
    RAISE EXCEPTION 'registration in ''%'' status can no longer be withdrawn', v_reg.status
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);
  PERFORM set_config('app.registration_mutation_context', 'governed', true);

  UPDATE public.registrations SET status = 'withdrawn', updated_at = v_now
   WHERE id = _registration_id;

  SELECT id, current_step_id, workflow_version_id INTO v_instance
    FROM public.workflow_instances
   WHERE entity_id = _registration_id AND entity_type = 'registration'
     AND status IN ('active','paused')
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    UPDATE public.workflow_instances
       SET status = 'completed', completed_at = v_now, updated_at = v_now
     WHERE id = v_instance.id;

    IF v_instance.current_step_id IS NOT NULL THEN
      INSERT INTO public.approval_actions (
        workflow_instance_id, step_id, actor_id, action, action_type, comments,
        entity_type, entity_id, workflow_version_id)
      VALUES (v_instance.id, v_instance.current_step_id, v_uid,
              'withdraw', 'withdraw', btrim(_reason),
              'registration', _registration_id, v_instance.workflow_version_id);
    END IF;
  END IF;

  PERFORM public.onboarding_record_journey_event(
    v_uid, 'registration_withdrawn', NULL, NULL, _registration_id, NULL,
    jsonb_build_object('reason', btrim(_reason), 'previous_status', v_reg.status));

  RETURN jsonb_build_object('success', true, 'registration_id', _registration_id,
                            'status', 'withdrawn',
                            'registration_reference', v_reg.registration_reference);
END $$;
REVOKE ALL ON FUNCTION public.registration_applicant_withdraw(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_applicant_withdraw(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Grant/policy alignment for applicant reads (GAP-F3-07)
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.registration_entity_bindings TO authenticated;
GRANT SELECT ON public.registration_journey_events TO authenticated;

UPDATE public.identity_governed_tables
   SET authenticated_writes = ARRAY[]::text[],
       canonical_write_path = 'register-pre-licensee (service role) + registration_applicant_* / registration workflow RPCs',
       write_retention_justification = NULL,
       notes = 'Direct signed-in writes removed in F3-B; all applicant and reviewer mutations are governed RPCs.',
       updated_at = now()
 WHERE table_name = 'registrations';

UPDATE public.identity_governed_tables
   SET authenticated_select_allowed = true,
       notes = 'Owner-scoped read restored in F3-B (RLS policy already owner/staff scoped).',
       updated_at = now()
 WHERE table_name IN ('registration_entity_bindings','registration_journey_events');

-- ---------------------------------------------------------------------------
-- 5. Definer / anon hardening (GAP-F3-08 / GAP-F3-14)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_registration_workflow(_registration_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_reg record; v_workflow_id uuid; v_first_step uuid; v_existing uuid; v_instance_id uuid;
  v_uid uuid := auth.uid();
BEGIN
  SELECT id, sector_id, user_id INTO v_reg FROM public.registrations WHERE id = _registration_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF NOT (
    public.is_trusted_service_request()
    OR public.request_role() NOT IN ('anon','authenticated')
    OR (v_uid IS NOT NULL AND v_reg.user_id = v_uid)
    OR (v_uid IS NOT NULL AND (
          public.has_permission(v_uid, 'registration_management', 'approve') -- F3-B2 DEF-F3-C-01: canonical catalogued permission
          OR public.has_permission(v_uid, 'registration_management', 'workflow_action')))
  ) THEN
    RAISE EXCEPTION 'not authorised to start a registration workflow' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  SELECT id INTO v_existing FROM public.workflow_instances
   WHERE entity_id = _registration_id AND entity_type = 'registration'
     AND status IN ('active','paused')
   ORDER BY created_at DESC LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  v_workflow_id := public.resolve_registration_workflow(v_reg.sector_id);
  IF v_workflow_id IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_first_step FROM public.approval_steps
   WHERE workflow_id = v_workflow_id ORDER BY step_order ASC LIMIT 1;
  IF v_first_step IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.workflow_instances (workflow_id, entity_type, entity_id, current_step_id, status, started_at)
  VALUES (v_workflow_id, 'registration', _registration_id, v_first_step, 'active', now())
  RETURNING id INTO v_instance_id;

  RETURN v_instance_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.start_registration_workflow(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_registration_workflow(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.start_registration_workflow(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.check_applicant_name_exists(text) FROM anon;
REVOKE ALL ON FUNCTION public.check_applicant_name_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_applicant_name_exists(text) TO authenticated, service_role;
DELETE FROM public.sec_anon_execute_allowlist WHERE function_name = 'check_applicant_name_exists';

-- ---------------------------------------------------------------------------
-- 6. Notification vocabulary alignment (GAP-F3-03)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notify_registration_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_route text; v_payload jsonb;
BEGIN
  v_route := '/admin/registrations/' || NEW.id;
  v_payload := jsonb_build_object(
    'registration_reference', coalesce(NEW.registration_reference, NEW.id::text),
    'applicant_name', coalesce(NEW.applicant_name, ''),
    'status', NEW.status,
    'email', coalesce(NEW.email, ''),
    'review_notes', coalesce(NEW.review_notes, '')
  );

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notif_enqueue('registration.new_submission', 'registration', NEW.id,
      NEW.registration_reference, v_route, v_payload, 'new');
    PERFORM public.notif_enqueue('registration.workflow_started', 'registration', NEW.id,
      NEW.registration_reference, v_route, v_payload, 'started');
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  CASE NEW.status
    WHEN 'pending_review' THEN
      PERFORM public.notif_enqueue('registration.pending_review', 'registration', NEW.id,
        NEW.registration_reference, v_route, v_payload, 'pending_review');
    WHEN 'pending_verification' THEN
      PERFORM public.notif_enqueue('registration.pending_review', 'registration', NEW.id,
        NEW.registration_reference, v_route, v_payload, 'pending_verification');
    WHEN 'resubmission_required' THEN
      PERFORM public.notif_enqueue('registration.correction_required', 'registration', NEW.id,
        NEW.registration_reference, v_route, v_payload, 'resubmission_required');
    WHEN 'in_progress' THEN
      PERFORM public.notif_enqueue('registration.resubmitted', 'registration', NEW.id,
        NEW.registration_reference, v_route, v_payload, 'in_progress');
    WHEN 'rejected' THEN
      PERFORM public.notif_enqueue('registration.rejected', 'registration', NEW.id,
        NEW.registration_reference, v_route, v_payload, 'rejected');
    WHEN 'withdrawn' THEN
      PERFORM public.notif_enqueue('registration.withdrawn', 'registration', NEW.id,
        NEW.registration_reference, v_route, v_payload, 'withdrawn');
    WHEN 'approved' THEN
      PERFORM public.notif_enqueue('registration.workflow_completed', 'registration', NEW.id,
        NEW.registration_reference, v_route, v_payload, 'approved');
    ELSE
      NULL;
  END CASE;
  RETURN NEW;
END;
$function$;