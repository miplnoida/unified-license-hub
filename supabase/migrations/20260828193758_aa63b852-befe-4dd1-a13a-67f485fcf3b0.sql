-- ===========================================================================
-- F5-B2 DELTA — authority / service-scope closure
--   * delegated submission restricted to genuine F5 filings
--   * complete F5 service applicability predicate (fail-closed)
--   * arbitrary service ids can no longer reclassify an initial application
-- ===========================================================================

-- Supported F5 lifecycle stages (canonical, single source).
CREATE OR REPLACE FUNCTION public.post_license_service_stages()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$ SELECT ARRAY['post_license','renewal']::text[] $function$;

-- Stable, governed applicability codes for a (service, licence) pair.
-- Returns 'OK' or one of the governed failure codes. Fails closed.
CREATE OR REPLACE FUNCTION public.post_license_service_applicability(
  _service_id uuid,
  _license_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_svc public.services;
  v_lic public.licenses;
  v_svc_regulator uuid;
  v_lic_regulator uuid;
BEGIN
  IF _license_id IS NULL THEN
    RETURN 'LICENSE_REQUIRED';
  END IF;

  SELECT * INTO v_lic FROM public.licenses WHERE id = _license_id;
  IF v_lic.id IS NULL THEN
    RETURN 'LICENSE_NOT_FOUND';
  END IF;

  IF _service_id IS NULL THEN
    RETURN 'POST_LICENSE_SERVICE_REQUIRED';
  END IF;

  SELECT * INTO v_svc FROM public.services WHERE id = _service_id;
  IF v_svc.id IS NULL THEN
    RETURN 'POST_LICENSE_SERVICE_NOT_FOUND';
  END IF;

  -- lifecycle stage must be explicitly one of the supported F5 stages;
  -- a pre-licensing / registration / other-stage service is never an F5 service.
  IF v_svc.lifecycle_stage IS NULL
     OR NOT (lower(v_svc.lifecycle_stage) = ANY (public.post_license_service_stages())) THEN
    RETURN 'POST_LICENSE_SERVICE_NOT_APPLICABLE';
  END IF;

  -- active and effective
  IF lower(COALESCE(v_svc.status,'')) <> 'active' THEN
    RETURN 'POST_LICENSE_SERVICE_NOT_APPLICABLE';
  END IF;
  IF v_svc.effective_from IS NOT NULL AND v_svc.effective_from > now() THEN
    RETURN 'POST_LICENSE_SERVICE_NOT_APPLICABLE';
  END IF;
  IF v_svc.effective_to IS NOT NULL AND v_svc.effective_to <= now() THEN
    RETURN 'POST_LICENSE_SERVICE_NOT_APPLICABLE';
  END IF;

  -- regulator scope: both sides must resolve, and must agree
  SELECT COALESCE(v_svc.regulator_id, s.regulator_id)
    INTO v_svc_regulator
    FROM public.sectors s
   WHERE s.id = public.sector_effective_id(v_svc.sector_id);
  v_svc_regulator := COALESCE(v_svc_regulator, v_svc.regulator_id);

  v_lic_regulator := public._resolve_effective_regulator(
    v_lic.regulator_id, v_lic.sector_id, v_lic.category_id
  );

  IF v_svc_regulator IS NULL OR v_lic_regulator IS NULL
     OR v_svc_regulator <> v_lic_regulator THEN
    RETURN 'SERVICE_LICENSE_INCOMPATIBLE';
  END IF;

  -- sector scope: both sides must resolve, and must agree
  IF public.sector_effective_id(v_svc.sector_id) IS NULL
     OR public.sector_effective_id(v_lic.sector_id) IS NULL
     OR public.sector_effective_id(v_svc.sector_id)
        IS DISTINCT FROM public.sector_effective_id(v_lic.sector_id) THEN
    RETURN 'SERVICE_LICENSE_INCOMPATIBLE';
  END IF;

  -- sub-sector scope: enforced whenever either side is scoped (ambiguity fails closed)
  IF v_lic.sub_sector_id IS NOT NULL OR v_svc.sub_sector_id IS NOT NULL THEN
    IF v_lic.sub_sector_id IS NULL OR v_svc.sub_sector_id IS NULL
       OR v_lic.sub_sector_id <> v_svc.sub_sector_id THEN
      RETURN 'SERVICE_LICENSE_INCOMPATIBLE';
    END IF;
  END IF;

  -- category scope: services carry no category column, so a category-scoped
  -- licence is bound through the licence-derived taxonomy only. If the service
  -- catalogue ever gains a category scope, enforce it here.

  RETURN 'OK';
END $function$;

-- Human-readable message for each governed applicability code.
CREATE OR REPLACE FUNCTION public.post_license_applicability_message(_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE _code
    WHEN 'LICENSE_REQUIRED' THEN 'Select the licence this post-licence service relates to.'
    WHEN 'LICENSE_NOT_FOUND' THEN 'The selected licence could not be found.'
    WHEN 'POST_LICENSE_SERVICE_REQUIRED' THEN 'Select the post-licence service you are requesting.'
    WHEN 'POST_LICENSE_SERVICE_NOT_FOUND' THEN 'The selected service could not be found.'
    WHEN 'POST_LICENSE_SERVICE_NOT_APPLICABLE' THEN 'The selected service is not a post-licence or renewal service.'
    WHEN 'SERVICE_LICENSE_INCOMPATIBLE' THEN 'The selected service is not available for the scope of this licence.'
    ELSE 'This post-licence request could not be validated.'
  END
$function$;

-- Compatibility is now exactly "applicable as an F5 service for this licence".
CREATE OR REPLACE FUNCTION public.service_license_compatible(_service_id uuid, _license_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.post_license_service_applicability(_service_id, _license_id) = 'OK'
$function$;

-- Canonical classification: a filing is F5 only when it is bound to a real
-- licence AND to a service that is genuinely applicable to that licence.
CREATE OR REPLACE FUNCTION public.is_post_license_filing(_license_id uuid, _service_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.post_license_service_applicability(_service_id, _license_id) = 'OK'
$function$;

-- ===========================================================================
-- Submission authority: delegation applies to F5 filings ONLY. Initial (F4)
-- applications keep the certified F3/F4 creator/applicant authority model.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.can_submit_application(_application_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
  v_license_id uuid;
  v_service_id uuid;
  v_holder uuid;
BEGIN
  IF v_uid IS NULL OR _application_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT id, applicant_id, entity_id, data
    INTO v_app
    FROM public.applications
   WHERE id = _application_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- the creator/applicant always retains authority (F3/F4 certified model)
  IF v_app.applicant_id = v_uid THEN
    RETURN true;
  END IF;

  v_license_id := NULLIF(v_app.data->>'license_id','')::uuid;
  v_service_id := NULLIF(v_app.data->>'service_id','')::uuid;

  -- delegation is an F5 capability only; entity membership alone never grants
  -- authority over an initial licensing application.
  IF NOT public.is_post_license_filing(v_license_id, v_service_id) THEN
    RETURN false;
  END IF;

  SELECT holder_id INTO v_holder FROM public.licenses WHERE id = v_license_id;
  IF v_holder IS NULL
     OR v_app.entity_id IS NULL
     OR v_app.entity_id <> v_holder THEN
    RETURN false;
  END IF;

  RETURN public.entity_membership_capability(v_uid, v_holder, 'submit');
END $function$;

-- ===========================================================================
-- submit_application: classification precedes authority; forged post-licence
-- claims are refused with stable governed codes.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.submit_application(_application_id uuid, _ack_text text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
  v_now timestamptz := now();
  v_is_resub boolean;
  v_payment_count int;
  v_sector_id uuid;
  v_sub_sector_id uuid;
  v_service_id uuid;
  v_category_id uuid;
  v_license_id uuid;
  v_workflow_id uuid;
  v_first_step_id uuid;
  v_existing_instance record;
  v_new_instance_id uuid;
  v_action_label text;
  v_audit_action text;
  v_app_status_target text;
  v_effective_regulator uuid;
  v_is_post_license boolean;
  v_post_claim boolean;
  v_applicability text;
  v_ctx record;
  v_authority text;
  v_canonical jsonb;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;

  SELECT id, applicant_id, entity_id, application_number, status, license_type,
         regulator_id, data
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  v_sector_id := NULLIF(v_app.data->>'sector_id','')::uuid;
  v_sub_sector_id := NULLIF(v_app.data->>'sub_sector_id','')::uuid;
  v_service_id := NULLIF(v_app.data->>'service_id','')::uuid;
  v_category_id := NULLIF(v_app.data->>'category_id','')::uuid;
  v_license_id := NULLIF(v_app.data->>'license_id','')::uuid;

  -- F5-B2 DELTA: classification is canonical (licence binding + applicable F5
  -- service) and is decided BEFORE authority, so delegation cannot leak into
  -- initial (F4) licensing.
  v_post_claim := v_license_id IS NOT NULL
                  OR v_service_id IS NOT NULL
                  OR lower(COALESCE(v_app.data->>'type','')) = 'post_license';

  IF v_post_claim THEN
    v_applicability := public.post_license_service_applicability(v_service_id, v_license_id);
    v_is_post_license := v_applicability = 'OK';
    IF NOT v_is_post_license THEN
      RETURN jsonb_build_object(
        'error', public.post_license_applicability_message(v_applicability),
        'code', v_applicability, 'http', 409);
    END IF;
  ELSE
    v_is_post_license := false;
  END IF;

  -- Authority. Creator/applicant always; entity delegation for F5 filings only.
  IF v_app.applicant_id = v_uid THEN
    v_authority := 'applicant';
  ELSIF v_is_post_license AND public.can_submit_application(_application_id) THEN
    v_authority := 'entity_delegate';
  ELSE
    RETURN jsonb_build_object(
      'error','You are not authorised to submit this filing for this entity',
      'code','FORBIDDEN','http',403);
  END IF;

  v_is_resub := v_app.status IN (
    'resubmission_requested','resubmission_required',
    'returned_for_correction','info_requested',
    'query_raised'
  );
  IF v_app.status NOT IN ('draft', 'in_progress') AND NOT v_is_resub THEN
    RETURN jsonb_build_object(
      'error', format('Application is in ''%s'' status — cannot submit', v_app.status),
      'code','INVALID_STATUS','http',409
    );
  END IF;

  SELECT count(*) INTO v_payment_count
    FROM public.payments
   WHERE application_id = _application_id
     AND status IN ('completed','success','paid');
  IF v_payment_count = 0 THEN
    RETURN jsonb_build_object(
      'error','No completed payment found — please complete payment first',
      'code','PAYMENT_REQUIRED','http',402
    );
  END IF;

  -- GAP-F5-01 / GAP-F5-15: re-derive taxonomy from the licence at submission
  -- and refuse any ineligible binding.
  IF v_is_post_license THEN
    SELECT * INTO v_ctx
      FROM public.resolve_post_license_intake_context(v_license_id, v_service_id);
    IF v_ctx.entity_id IS NULL THEN
      RETURN jsonb_build_object(
        'error','The licence for this filing could not be found','code','LICENSE_NOT_FOUND','http',409);
    END IF;

    IF NOT public.can_act_on_specific_license(v_license_id, v_ctx.entity_id, NULL, NULL, NULL) THEN
      RETURN jsonb_build_object(
        'error','This service is unavailable because the related licence is not currently approved, issued and in good standing.',
        'code','LICENSE_ENTITLEMENT_REQUIRED','http',409);
    END IF;

    v_sector_id := v_ctx.sector_id;
    v_sub_sector_id := v_ctx.sub_sector_id;
    v_category_id := v_ctx.category_id;

    v_canonical := jsonb_build_object(
      'licensee_id', v_ctx.entity_id,
      'sector_id', v_ctx.sector_id,
      'sub_sector_id', v_ctx.sub_sector_id,
      'category_id', v_ctx.category_id
    );

    UPDATE public.applications
       SET data = COALESCE(data,'{}'::jsonb) || v_canonical,
           entity_id = COALESCE(entity_id, v_ctx.entity_id),
           updated_at = v_now
     WHERE id = _application_id;
  END IF;

  v_effective_regulator := public._resolve_effective_regulator(
    v_app.regulator_id, v_sector_id, v_category_id
  );

  SELECT id, workflow_id, current_step_id, status
    INTO v_existing_instance
    FROM public.workflow_instances
   WHERE entity_id = _application_id
     AND entity_type = 'application'
     AND status IN ('active','paused')
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    v_workflow_id := v_existing_instance.workflow_id;
    v_first_step_id := v_existing_instance.current_step_id;
    IF v_existing_instance.status = 'paused' THEN
      UPDATE public.workflow_instances
         SET status = 'active', updated_at = v_now
       WHERE id = v_existing_instance.id;
    END IF;
  ELSE
    SELECT r.workflow_id, r.first_step_id INTO v_workflow_id, v_first_step_id
      FROM public._resolve_application_workflow(
             v_app.license_type, v_effective_regulator, v_sector_id, v_category_id,
             v_is_post_license, v_service_id, v_sub_sector_id) r;

    IF v_workflow_id IS NOT NULL THEN
      INSERT INTO public.workflow_instances (
        workflow_id, entity_type, entity_id, current_step_id, status
      ) VALUES (
        v_workflow_id, 'application', _application_id, v_first_step_id, 'active'
      )
      RETURNING id INTO v_new_instance_id;
    END IF;
  END IF;

  v_app_status_target := 'submitted';

  UPDATE public.applications
     SET status = v_app_status_target,
         submitted_at = COALESCE(submitted_at, v_now),
         workflow_id = COALESCE(workflow_id, v_workflow_id),
         current_step_id = v_first_step_id,
         regulator_id = COALESCE(v_effective_regulator, regulator_id),
         ack_by = CASE WHEN _ack_text IS NOT NULL THEN v_uid ELSE ack_by END,
         ack_at = CASE WHEN _ack_text IS NOT NULL THEN v_now ELSE ack_at END,
         ack_text = CASE WHEN _ack_text IS NOT NULL
                         THEN substring(_ack_text from 1 for 4000)
                         ELSE ack_text END,
         updated_at = v_now
   WHERE id = _application_id;

  UPDATE public.form_responses
     SET status = 'submitted', submitted_at = v_now
   WHERE entity_id = _application_id
     AND entity_type = 'application';

  v_action_label := CASE WHEN v_is_resub THEN 'resubmitted' ELSE 'submitted' END;
  v_audit_action := CASE WHEN v_is_resub THEN 'resubmitted' ELSE 'submitted' END;

  INSERT INTO public.audit_logs (
    entity_type, entity_id, action, user_id, new_value, metadata
  ) VALUES (
    'application',
    _application_id::text,
    'application.' || v_audit_action,
    v_uid,
    jsonb_build_object('status', v_app_status_target),
    jsonb_build_object(
      'source', 'submit_application_rpc',
      'application_id', _application_id,
      'application_number', v_app.application_number,
      'workflow_id', v_workflow_id,
      'first_step_id', v_first_step_id,
      'is_resubmission', v_is_resub,
      'previous_status', v_app.status,
      'resumed', v_is_resub,
      'submission_authority', v_authority,
      'is_post_license', v_is_post_license,
      'submitted_by', v_uid,
      'applicant_id', v_app.applicant_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'application_id', _application_id,
    'application_number', v_app.application_number,
    'status', v_app_status_target,
    'workflow_id', v_workflow_id,
    'first_step_id', v_first_step_id,
    'is_resubmission', v_is_resub,
    'resumed', v_is_resub,
    'workflow_attached', v_workflow_id IS NOT NULL,
    'submission_authority', v_authority,
    'is_post_license', v_is_post_license,
    'previous_status', v_app.status
  );
END;
$function$;

-- ===========================================================================
-- create_application_draft: an arbitrary service id can no longer reclassify an
-- initial application, and a non-F5 service never falls through to F4 intake.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.create_application_draft(_license_type text, _data jsonb DEFAULT '{}'::jsonb, _regulator_id uuid DEFAULT NULL::uuid)
RETURNS applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_application public.applications;
  v_entity_id uuid;
  v_is_post boolean;
  v_is_staff boolean;
  v_license_id uuid := NULLIF(_data->>'license_id','')::uuid;
  v_claimed_entity uuid := NULLIF(_data->>'licensee_id','')::uuid;
  v_license_holder uuid;
  v_service_id text := NULLIF(_data->>'service_id','');
  v_applicability text;
  v_existing uuid;
  v_reg_id uuid := NULLIF(_data->>'registration_id','')::uuid;
  v_handoff record;
  v_ctx record;
  v_data jsonb := COALESCE(_data, '{}'::jsonb);
  v_regulator uuid := _regulator_id;
  v_trusted boolean := COALESCE(current_setting('app.workflow_mutation_context', true), '') = 'trusted';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: You must be signed in to create an application draft.'
      USING ERRCODE = '42501';
  END IF;

  v_is_staff := public.is_super_admin(v_uid)
                OR public.has_permission(v_uid, 'application_management', 'create');

  IF NOT (
    v_is_staff
    OR public.has_role(v_uid, 'applicant'::public.app_role)
    OR public.has_role(v_uid, 'pre_licensee'::public.app_role)
    OR public.has_role(v_uid, 'licensee_primary'::public.app_role)
    OR public.has_role(v_uid, 'licensee_secondary'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'APPLICATION_CREATE_FORBIDDEN: You do not have permission to create an application draft.'
      USING ERRCODE = '42501';
  END IF;

  SELECT m.entity_id INTO v_entity_id
    FROM public.entity_user_memberships m
    JOIN public.licensees l ON l.id = m.entity_id
   WHERE m.user_id = v_uid AND m.status = 'APPROVED' AND l.merged_into_entity_id IS NULL
   ORDER BY m.approved_at DESC NULLS LAST
   LIMIT 1;

  IF v_entity_id IS NULL THEN
    SELECT p.licensee_id INTO v_entity_id
      FROM public.profiles p JOIN public.licensees l ON l.id = p.licensee_id
     WHERE p.id = v_uid AND l.merged_into_entity_id IS NULL;
  END IF;

  IF v_entity_id IS NULL THEN
    SELECT l.id INTO v_entity_id
      FROM public.licensees l
     WHERE l.applicant_id = v_uid AND l.merged_into_entity_id IS NULL
     ORDER BY l.created_at
     LIMIT 1;
  END IF;

  -- A post-licence CLAIM is anything that references a licence, a service, or
  -- declares itself post-licence. The claim is then validated canonically: it
  -- either resolves to a genuine F5 filing or it is refused. It never falls
  -- through into initial licensing.
  v_is_post := (v_service_id IS NOT NULL)
               OR lower(COALESCE(_data->>'type','')) = 'post_license'
               OR v_license_id IS NOT NULL;

  IF v_is_post THEN
    v_applicability := public.post_license_service_applicability(
      NULLIF(v_service_id,'')::uuid, v_license_id
    );

    IF v_applicability <> 'OK' THEN
      RAISE EXCEPTION '%: %',
        v_applicability, public.post_license_applicability_message(v_applicability)
        USING ERRCODE = CASE
          WHEN v_applicability IN ('LICENSE_REQUIRED','LICENSE_NOT_FOUND',
                                   'POST_LICENSE_SERVICE_REQUIRED',
                                   'POST_LICENSE_SERVICE_NOT_FOUND') THEN '22023'
          ELSE '42501'
        END;
    END IF;

    SELECT * INTO v_ctx
      FROM public.resolve_post_license_intake_context(v_license_id, v_service_id::uuid);
    IF v_ctx.entity_id IS NULL THEN
      RAISE EXCEPTION 'LICENSE_NOT_FOUND: The selected licence could not be found.'
        USING ERRCODE = '22023';
    END IF;
    v_license_holder := v_ctx.entity_id;

    IF v_claimed_entity IS NOT NULL AND v_claimed_entity IS DISTINCT FROM v_license_holder THEN
      RAISE EXCEPTION 'LICENSE_ENTITY_MISMATCH: The selected licence does not belong to the selected entity.'
        USING ERRCODE = '42501';
    END IF;
    v_entity_id := v_license_holder;

    v_data := v_data || jsonb_build_object(
      'type', 'post_license',
      'license_id', v_license_id,
      'service_id', v_service_id,
      'licensee_id', v_entity_id,
      'sector_id', v_ctx.sector_id,
      'sub_sector_id', v_ctx.sub_sector_id,
      'category_id', v_ctx.category_id
    );
    v_regulator := COALESCE(v_regulator, v_ctx.regulator_id);

    IF NOT v_is_staff THEN
      IF NOT public.can_act_on_specific_license(v_license_id, v_license_holder, NULL, NULL, NULL) THEN
        RAISE EXCEPTION 'LICENSE_ENTITLEMENT_REQUIRED: Post-licence services are only available for a licence that is approved, issued and in good standing for this sector.'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended('post_license_request:' || v_license_id::text || ':' || v_service_id, 0)
    );

    SELECT a.id INTO v_existing
      FROM public.applications a
     WHERE COALESCE(a.data->>'license_id','') = v_license_id::text
       AND COALESCE(a.data->>'service_id','') = v_service_id
       AND a.status = ANY (public.post_license_open_statuses())
     ORDER BY a.created_at
     LIMIT 1;

    IF v_existing IS NOT NULL THEN
      RAISE EXCEPTION 'DUPLICATE_POST_LICENSE_REQUEST: %', v_existing
        USING ERRCODE = 'unique_violation',
              HINT = v_existing::text;
    END IF;
  ELSE
    IF NOT v_trusted THEN
      IF v_reg_id IS NULL THEN
        SELECT h.registration_id INTO v_reg_id
          FROM public.registration_licensing_handoffs h
          JOIN public.registrations r ON r.id = h.registration_id
         WHERE r.user_id = v_uid AND lower(r.status) = 'approved'
         ORDER BY h.created_at DESC
         LIMIT 1;
      END IF;

      IF v_reg_id IS NULL THEN
        RAISE EXCEPTION 'REGISTRATION_HANDOFF_REQUIRED: A new licence application requires an approved registration handoff.'
          USING ERRCODE = '42501';
      END IF;

      SELECT h.*, r.status AS reg_status, r.user_id AS reg_user
        INTO v_handoff
        FROM public.registration_licensing_handoffs h
        JOIN public.registrations r ON r.id = h.registration_id
       WHERE h.registration_id = v_reg_id;

      IF NOT FOUND OR lower(COALESCE(v_handoff.reg_status,'')) <> 'approved' THEN
        RAISE EXCEPTION 'REGISTRATION_HANDOFF_REQUIRED: A new licence application requires an approved registration handoff.'
          USING ERRCODE = '42501';
      END IF;

      IF NOT v_is_staff AND v_handoff.reg_user IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'REGISTRATION_HANDOFF_FORBIDDEN: This registration handoff does not belong to you.'
          USING ERRCODE = '42501';
      END IF;

      IF v_handoff.application_id IS NOT NULL THEN
        SELECT * INTO v_application FROM public.applications WHERE id = v_handoff.application_id;
        IF FOUND THEN
          RETURN v_application;
        END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.applications (
    applicant_id, license_type, status, data, regulator_id, entity_id
  )
  VALUES (
    v_uid,
    COALESCE(NULLIF(trim(_license_type), ''), 'Application'),
    'draft',
    v_data || CASE WHEN v_reg_id IS NOT NULL
      THEN jsonb_build_object('registration_id', v_reg_id) ELSE '{}'::jsonb END,
    v_regulator,
    v_entity_id
  )
  RETURNING * INTO v_application;

  IF NOT v_is_post AND v_reg_id IS NOT NULL THEN
    UPDATE public.registration_licensing_handoffs
       SET application_id = v_application.id, updated_at = now()
     WHERE registration_id = v_reg_id AND application_id IS NULL;
  END IF;

  RETURN v_application;
END $function$;

-- ===========================================================================
-- Privileges: browser-facing predicates for signed-in users only.
-- ===========================================================================
REVOKE ALL ON FUNCTION public.post_license_service_stages() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_license_applicability_message(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_license_service_applicability(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_post_license_filing(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.service_license_compatible(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_submit_application(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.post_license_service_stages() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_license_applicability_message(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_license_service_applicability(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_post_license_filing(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.service_license_compatible(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_submit_application(uuid) TO authenticated, service_role;