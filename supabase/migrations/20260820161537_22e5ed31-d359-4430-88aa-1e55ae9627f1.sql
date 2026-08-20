-- =========================================================================
-- A1 · APPLICATIONS / APPROVAL LIFECYCLE AUTHORITY CLOSURE
-- classification=REGULATORY_DECISION priority=P1 remediation_status=GOVERNED
-- =========================================================================

CREATE OR REPLACE FUNCTION public.app_require_rationale(_text text, _min integer, _label text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF _text IS NULL OR length(trim(_text)) < _min THEN
    RAISE EXCEPTION '% must be at least % characters', _label, _min USING ERRCODE = '22023';
  END IF;
END; $$;

-- ---------------------------------------------------------------- actions ---
-- Formal, non-final application action record (edit request lifecycle,
-- resubmission record, recorded decision-option outcomes, other
-- non-final workflow annotations). Final approve/reject/cancel remain the
-- exclusive responsibility of the existing governed flows
-- (perform-workflow-action / reject_application_action / cancel_application).
CREATE OR REPLACE FUNCTION public.application_record_action(
  _application_id uuid,
  _action text,
  _comments text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
  v_applicant_action boolean;
  v_now timestamptz := now();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _action IS NULL OR trim(_action) = '' THEN
    RAISE EXCEPTION 'action is required' USING ERRCODE = '22023';
  END IF;
  IF lower(_action) IN ('approved','rejected','cancelled','approve','reject') THEN
    RAISE EXCEPTION 'Final decisions must use the governed decision workflow'
      USING ERRCODE = '22023';
  END IF;

  SELECT id, applicant_id, status, application_number
    INTO v_app FROM public.applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = 'P0002';
  END IF;

  v_applicant_action := lower(_action) IN ('edit_requested','resubmitted','withdraw_requested');

  IF v_applicant_action THEN
    IF NOT public.can_mutate_application(v_uid, _application_id) THEN
      RAISE EXCEPTION 'You are not entitled to act on this application'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_permission(v_uid, 'application_management', 'workflow_action') THEN
      RAISE EXCEPTION 'Application workflow authority required' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Reason is mandatory on every action that changes what the applicant or
  -- the regulator may next do with the application.
  IF lower(_action) IN ('edit_requested','edit_denied','edit_approved') THEN
    PERFORM public.app_require_rationale(_comments, 10, 'Reason');
  END IF;

  INSERT INTO public.approval_actions (
    application_id, actor_id, action, action_type, comments, responded_at,
    entity_type, entity_id
  ) VALUES (
    _application_id, v_uid, _action, lower(_action), NULLIF(trim(_comments), ''), v_now,
    'application', _application_id
  ) RETURNING id INTO v_id;

  PERFORM public.create_audit_log(
    v_uid, 'application_action_recorded', 'application', _application_id::text, NULL,
    jsonb_build_object('action', _action, 'comments', _comments),
    COALESCE(_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object('success', true, 'action_id', v_id);
END; $$;

-- ---------------------------------------------------------------- triage ----
-- Priority and officer assignment. Actor, timestamps and attribution columns
-- are derived server-side; the browser can no longer claim to be another user.
CREATE OR REPLACE FUNCTION public.application_triage_update(
  _application_ids uuid[],
  _priority integer DEFAULT NULL,
  _priority_reason text DEFAULT NULL,
  _assigned_to uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_id uuid;
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_uid, 'application_management', 'edit') THEN
    RAISE EXCEPTION 'Application management authority required' USING ERRCODE = '42501';
  END IF;
  IF _application_ids IS NULL OR array_length(_application_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one application is required' USING ERRCODE = '22023';
  END IF;
  IF _priority IS NULL AND _assigned_to IS NULL THEN
    RAISE EXCEPTION 'Provide a priority or an assignee' USING ERRCODE = '22023';
  END IF;
  IF _priority IS NOT NULL AND (_priority < 1 OR _priority > 5) THEN
    RAISE EXCEPTION 'Priority must be between 1 and 5' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  FOREACH v_id IN ARRAY _application_ids LOOP
    UPDATE public.applications
       SET priority        = COALESCE(_priority, priority),
           priority_reason = CASE WHEN _priority IS NOT NULL
                                  THEN NULLIF(trim(_priority_reason), '') ELSE priority_reason END,
           priority_set_by = CASE WHEN _priority IS NOT NULL THEN v_uid ELSE priority_set_by END,
           priority_set_at = CASE WHEN _priority IS NOT NULL THEN v_now ELSE priority_set_at END,
           assigned_to     = COALESCE(_assigned_to, assigned_to),
           assigned_by     = CASE WHEN _assigned_to IS NOT NULL THEN v_uid ELSE assigned_by END,
           assigned_at     = CASE WHEN _assigned_to IS NOT NULL THEN v_now ELSE assigned_at END,
           updated_at      = v_now
     WHERE id = v_id;
    IF FOUND THEN
      v_count := v_count + 1;
      PERFORM public.create_audit_log(
        v_uid, 'application_triage_updated', 'application', v_id::text, NULL,
        jsonb_build_object('priority', _priority, 'assigned_to', _assigned_to,
                           'priority_reason', _priority_reason), NULL);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated', v_count);
END; $$;

-- ----------------------------------------------------------- draft delete ---
CREATE OR REPLACE FUNCTION public.application_delete_draft(_application_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT id, applicant_id, status, application_number
    INTO v_app FROM public.applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_app.applicant_id <> v_uid THEN
    RAISE EXCEPTION 'You cannot delete this application' USING ERRCODE = '42501';
  END IF;
  IF v_app.status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft application can be deleted' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);
  DELETE FROM public.applications WHERE id = _application_id;

  PERFORM public.create_audit_log(
    v_uid, 'application_draft_deleted', 'application', _application_id::text,
    jsonb_build_object('application_number', v_app.application_number), NULL, NULL);

  RETURN jsonb_build_object('success', true);
END; $$;

-- ---------------------------------------------------------------- lockdown --
-- Binding approval state is append-only through governed operations.
REVOKE INSERT, UPDATE, DELETE ON public.approval_actions FROM authenticated;
REVOKE ALL ON public.approval_actions FROM anon;
GRANT SELECT ON public.approval_actions TO authenticated;
GRANT ALL ON public.approval_actions TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.approval_step_actions FROM authenticated;
REVOKE ALL ON public.approval_step_actions FROM anon;
GRANT SELECT ON public.approval_step_actions TO authenticated;
GRANT ALL ON public.approval_step_actions TO service_role;

-- Applications: the browser may only edit draft answers (`data`). Every
-- regulatory field (status, priority, assignment, decision timestamps) is
-- server-governed. Column-level grants require withdrawing the table grant.
REVOKE UPDATE, DELETE ON public.applications FROM authenticated;
REVOKE ALL ON public.applications FROM anon;
GRANT SELECT, INSERT ON public.applications TO authenticated;
GRANT UPDATE (data, updated_at) ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;

REVOKE ALL ON FUNCTION public.application_record_action(uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.application_triage_update(uuid[], integer, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.application_delete_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.application_record_action(uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.application_triage_update(uuid[], integer, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.application_delete_draft(uuid) TO authenticated;
