-- 1. derive the canonical phase event from CURRENT domain state
CREATE OR REPLACE FUNCTION public.mc_complaint_derive_phase_event(_complaint_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE c public.complaints; ja public.complaint_jurisdiction_assessments;
        v_plan text; v_ready text;
BEGIN
  SELECT * INTO c FROM public.complaints WHERE id=_complaint_id;
  IF c.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO ja FROM public.complaint_jurisdiction_assessments
   WHERE complaint_id=_complaint_id ORDER BY created_at DESC LIMIT 1;
  SELECT status INTO v_plan FROM public.complaint_investigation_plans
   WHERE complaint_id=_complaint_id AND is_current;

  IF v_plan = 'APPROVED' THEN
    v_ready := public.complaint_investigation_readiness(_complaint_id)->>'readiness';
    IF v_ready = 'READY_FOR_OUTCOME_REVIEW' THEN
      RETURN 'complaint.investigation.ready_for_outcome_review';
    END IF;
    RETURN 'complaint.investigation.plan_approved';
  END IF;

  IF ja.decision_outcome IN ('REFERRED') THEN RETURN 'complaint.jurisdiction.referred'; END IF;
  IF ja.decision_outcome IN ('OUT_OF_JURISDICTION','NOT_ACCEPTED') THEN
    RETURN 'complaint.jurisdiction.out_of_jurisdiction'; END IF;

  IF coalesce(c.triage_confirmation_status,'') IN ('CONFIRMED','OVERRIDDEN') THEN
    RETURN 'complaint.triage.confirmed'; END IF;

  IF ja.decision_outcome = 'ACCEPTED' THEN RETURN 'complaint.jurisdiction.accepted'; END IF;
  IF ja.decision_outcome = 'PARTIALLY_ACCEPTED' THEN
    RETURN 'complaint.jurisdiction.partially_accepted'; END IF;

  RETURN 'complaint.created';
END $$;

REVOKE ALL ON FUNCTION public.mc_complaint_derive_phase_event(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mc_complaint_derive_phase_event(uuid) TO authenticated, service_role;

-- 2. governed disposition of a retired-workflow instance
CREATE OR REPLACE FUNCTION public.workflow_instance_dispose(
  _instance_id uuid, _classification text, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); i public.workflow_instances;
        v_event text; v_sync jsonb := NULL; v_allowed text[] :=
        ARRAY['HISTORICAL_COMPLETE','TEST_OR_CERTIFICATION',
              'LIVE_OPEN_CASE_REQUIRES_MIGRATION','ORPHANED_INVALID_INSTANCE'];
BEGIN
  IF v_uid IS NOT NULL
     AND NOT (public.is_super_admin(v_uid) OR public.has_complaint_perm(v_uid,'approve')) THEN
    RAISE EXCEPTION 'You are not authorised to dispose of workflow instances' USING ERRCODE='42501';
  END IF;
  IF _classification IS NULL OR NOT (_classification = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Unknown disposition classification' USING ERRCODE='22023';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'A disposition reason is required' USING ERRCODE='22023';
  END IF;

  SELECT * INTO i FROM public.workflow_instances WHERE id=_instance_id FOR UPDATE;
  IF i.id IS NULL THEN RAISE EXCEPTION 'Workflow instance not found' USING ERRCODE='22023'; END IF;
  IF i.status = 'cancelled' THEN
    RETURN jsonb_build_object('disposed',true,'unchanged',true,'instance_id',i.id);
  END IF;

  -- Historical truth: current_step_id / workflow_id / history are NEVER repointed.
  UPDATE public.workflow_instances
     SET status='cancelled', completed_at=now(), updated_at=now(),
         paused_reason = left(coalesce(paused_reason||' | ','')||_classification||': '||_reason, 2000)
   WHERE id=i.id;

  IF _classification = 'LIVE_OPEN_CASE_REQUIRES_MIGRATION' AND i.entity_type='complaint' THEN
    v_event := public.mc_complaint_derive_phase_event(i.entity_id);
    IF v_event IS NOT NULL THEN
      v_sync := public.mc_complaint_workflow_sync(i.entity_id, v_event);
    END IF;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (v_uid,'workflow.instance.disposed', i.entity_type, i.entity_id,
          jsonb_build_object('instance_id',i.id,'workflow_id',i.workflow_id,
                             'status',i.status,'step_id',i.current_step_id),
          jsonb_build_object('classification',_classification,'reason',_reason,
                             'derived_event',v_event,'migration',v_sync));

  RETURN jsonb_build_object('disposed',true,'instance_id',i.id,
                            'classification',_classification,
                            'derived_event',v_event,'migration',v_sync);
END $$;

REVOKE ALL ON FUNCTION public.workflow_instance_dispose(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workflow_instance_dispose(uuid,text,text) TO authenticated, service_role;

-- 3. dispose the 15 legacy instances
DO $$
DECLARE r record; v_class text; v_reason text;
BEGIN
  FOR r IN
    SELECT i.id, i.entity_id, c.id AS complaint_id, c.status AS c_status, c.complaint_number
      FROM public.workflow_instances i
      JOIN public.approval_workflows w ON w.id=i.workflow_id
      LEFT JOIN public.complaints c ON c.id=i.entity_id
     WHERE w.name='Complaint Management Workflow'
       AND i.status <> 'cancelled'
  LOOP
    IF r.complaint_id IS NULL THEN
      v_class := 'ORPHANED_INVALID_INSTANCE';
      v_reason := 'Instance references no existing complaint; no regulatory history to preserve.';
    ELSIF r.c_status IN ('closed','resolved','withdrawn','rejected') THEN
      v_class := 'HISTORICAL_COMPLETE';
      v_reason := 'Complaint '||r.complaint_number||' is already concluded; legacy instance archived against the retired workflow.';
    ELSE
      v_class := 'LIVE_OPEN_CASE_REQUIRES_MIGRATION';
      v_reason := 'Complaint '||r.complaint_number||' is open; migrated to the canonical Market Conduct workflow at the phase derived from current domain state.';
    END IF;
    PERFORM public.workflow_instance_dispose(r.id, v_class, v_reason);
  END LOOP;
END $$;