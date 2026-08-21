-- Entity Resolution maker-checker: officer recommendation + supervisor decision
-- ---------------------------------------------------------------------------

ALTER TABLE public.entity_resolution_policies
  ADD COLUMN IF NOT EXISTS requires_maker_checker boolean NOT NULL DEFAULT true;

ALTER TABLE public.entity_resolution_cases
  ADD COLUMN IF NOT EXISTS recommended_action    text,
  ADD COLUMN IF NOT EXISTS recommended_entity_id uuid,
  ADD COLUMN IF NOT EXISTS recommended_by        uuid,
  ADD COLUMN IF NOT EXISTS recommended_at        timestamptz,
  ADD COLUMN IF NOT EXISTS recommendation_notes  text,
  ADD COLUMN IF NOT EXISTS escalation_reason     text,
  ADD COLUMN IF NOT EXISTS supervisor_decision   text,
  ADD COLUMN IF NOT EXISTS supervisor_notes      text,
  ADD COLUMN IF NOT EXISTS supervisor_decided_by uuid,
  ADD COLUMN IF NOT EXISTS supervisor_decided_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.entity_resolution_cases
    ADD CONSTRAINT entity_resolution_cases_recommended_action_chk
    CHECK (recommended_action IS NULL OR recommended_action IN ('RESOLVE_EXISTING','CONFIRM_NEW'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.entity_resolution_cases
    ADD CONSTRAINT entity_resolution_cases_supervisor_decision_chk
    CHECK (supervisor_decision IS NULL OR supervisor_decision IN ('APPROVED','RETURNED','EVIDENCE_REQUESTED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Governed configuration: is supervisory approval required for this case?
CREATE OR REPLACE FUNCTION public.entity_resolution_requires_maker_checker(_case_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    (SELECT p.requires_maker_checker
       FROM public.entity_resolution_cases c
       LEFT JOIN public.entity_resolution_policies p ON p.id = c.resolution_policy_id
      WHERE c.id = _case_id),
    (SELECT requires_maker_checker FROM public.entity_resolution_policies WHERE is_default AND is_active LIMIT 1),
    true);
$$;

-- Surface an escalated case to every user who can approve it.
CREATE OR REPLACE FUNCTION public.entity_resolution_notify_approvers(_case_id uuid, _title text, _body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ur.user_id
      FROM public.sec_user_roles ur
     WHERE public.sec_has_permission(ur.user_id, 'entity_resolution', 'approve')
     LIMIT 50
  LOOP
    BEGIN
      PERFORM public.create_notification(r.user_id, _title, _body, 'action_required',
                                         'entity_resolution_case', _case_id::text);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

-- Transactional final resolution: bind the entity, close the case, update the
-- registration binding and resume the applicant journey.
CREATE OR REPLACE FUNCTION public.entity_resolution_finalise(
  _case_id uuid, _action text, _entity_id uuid, _resolver uuid, _approver uuid, _notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  c public.entity_resolution_cases;
  v_entity uuid := _entity_id;
  v_outcome text;
  b public.registration_entity_bindings;
  v_user uuid;
BEGIN
  SELECT * INTO c FROM public.entity_resolution_cases WHERE id = _case_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Case not found' USING ERRCODE='22023'; END IF;
  IF c.status = 'RESOLVED' THEN RAISE EXCEPTION 'Case already resolved' USING ERRCODE='22023'; END IF;

  IF _action = 'RESOLVE_EXISTING' THEN
    IF v_entity IS NULL THEN RAISE EXCEPTION 'entity_id required' USING ERRCODE='22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.licensees l
                    WHERE l.id = v_entity AND l.merged_into_entity_id IS NULL) THEN
      RAISE EXCEPTION 'Recommended entity is no longer valid (merged or removed)' USING ERRCODE='22023';
    END IF;
    UPDATE public.entity_match_candidates SET is_selected = (entity_id = v_entity) WHERE case_id = _case_id;
    v_outcome := 'RESOLVED_EXISTING';
  ELSIF _action = 'CONFIRM_NEW' THEN
    v_entity := public.entity_create_local(
      c.subject_name, c.subject_identifiers,
      NULLIF(c.subject_payload->>'sector_id','')::uuid,
      'applicant', 'provisional', _case_id);
    v_outcome := 'CONFIRMED_NEW';
  ELSE
    RAISE EXCEPTION 'Unsupported final action %', _action USING ERRCODE='22023';
  END IF;

  UPDATE public.entity_resolution_cases
     SET status = 'RESOLVED', outcome = v_outcome, resolved_entity_id = v_entity,
         resolved_by = COALESCE(_resolver, auth.uid()), resolved_at = now(),
         approved_by = COALESCE(_approver, approved_by),
         approved_at = CASE WHEN _approver IS NOT NULL THEN now() ELSE approved_at END,
         decision_notes = COALESCE(_notes, decision_notes)
   WHERE id = _case_id;

  SELECT * INTO b FROM public.registration_entity_bindings WHERE resolution_case_id = _case_id;
  IF b.id IS NOT NULL THEN
    UPDATE public.registration_entity_bindings
       SET entity_id = v_entity,
           binding_status = CASE WHEN v_outcome = 'RESOLVED_EXISTING' THEN 'BOUND_EXISTING' ELSE 'BOUND_PROVISIONAL' END,
           bound_at = now(), updated_at = now()
     WHERE id = b.id;
    SELECT user_id INTO v_user FROM public.registrations WHERE id = b.registration_id;
    IF v_user IS NOT NULL THEN
      PERFORM public.onboarding_record_journey_event(
        v_user, 'ENTITY_IDENTIFICATION', 'FORM_FIRST', v_entity, b.registration_id, b.identification_event_id,
        jsonb_build_object('resolution_case_id', _case_id, 'outcome', v_outcome, 'source', 'regulator_decision'));
      BEGIN
        PERFORM public.create_notification(v_user, 'Organisation verification complete',
          'The regulator has completed verification of your organisation details. Your registration continues.',
          'info', 'registration', b.registration_id::text);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END IF;

  INSERT INTO public.entity_resolution_events (case_id, event_type, actor_id, detail)
  VALUES (_case_id,
          CASE WHEN v_outcome = 'RESOLVED_EXISTING' THEN 'entity.resolution.resolved_existing'
               ELSE 'entity.resolution.confirmed_new' END,
          COALESCE(_approver, _resolver, auth.uid()),
          jsonb_build_object('entity_id', v_entity, 'resolver', _resolver, 'approver', _approver, 'notes', _notes));

  PERFORM public.create_audit_log(COALESCE(_approver, _resolver, auth.uid()),
    CASE WHEN v_outcome = 'RESOLVED_EXISTING' THEN 'entity.resolution.resolved_existing'
         ELSE 'entity.resolution.confirmed_new' END,
    'entity_resolution_case', _case_id::text, NULL,
    jsonb_build_object('entity_id', v_entity, 'resolver', _resolver, 'approver', _approver), '{}'::jsonb);

  RETURN v_entity;
END $$;

-- Governed decision surface (officer + supervisor)
CREATE OR REPLACE FUNCTION public.entity_resolution_decide(
  _case_id uuid, _action text, _entity_id uuid DEFAULT NULL::uuid, _notes text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  uid uuid := auth.uid();
  c public.entity_resolution_cases;
  v_entity uuid;
  v_event text;
  v_mc boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.entity_resolution_cases WHERE id = _case_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Case not found' USING ERRCODE='22023'; END IF;
  IF c.status IN ('RESOLVED','REJECTED','CLOSED') THEN
    RAISE EXCEPTION 'Case is already closed' USING ERRCODE='22023'; END IF;

  v_mc := public.entity_resolution_requires_maker_checker(_case_id);

  IF _action IN ('RECOMMEND_EXISTING','RECOMMEND_NEW') THEN
    IF NOT public.sec_has_permission(uid,'entity_resolution','resolve') THEN
      RAISE EXCEPTION 'entity_resolution.resolve required' USING ERRCODE='42501'; END IF;
    IF COALESCE(length(btrim(_notes)),0) < 10 THEN
      RAISE EXCEPTION 'A recommendation rationale is required' USING ERRCODE='22023'; END IF;
    IF _action = 'RECOMMEND_EXISTING' AND _entity_id IS NULL THEN
      RAISE EXCEPTION 'entity_id required' USING ERRCODE='22023'; END IF;

    UPDATE public.entity_resolution_cases
       SET recommended_action = CASE WHEN _action='RECOMMEND_EXISTING' THEN 'RESOLVE_EXISTING' ELSE 'CONFIRM_NEW' END,
           recommended_entity_id = CASE WHEN _action='RECOMMEND_EXISTING' THEN _entity_id ELSE NULL END,
           recommended_by = uid, recommended_at = now(), recommendation_notes = btrim(_notes),
           status = 'PENDING_REVIEW',
           supervisor_decision = NULL, supervisor_notes = NULL,
           supervisor_decided_by = NULL, supervisor_decided_at = NULL
     WHERE id = _case_id;
    v_entity := _entity_id;
    v_event := CASE WHEN _action='RECOMMEND_EXISTING' THEN 'entity.resolution.recommended_existing'
                    ELSE 'entity.resolution.recommended_new' END;

  ELSIF _action IN ('RESOLVE_EXISTING','CONFIRM_NEW') THEN
    IF NOT public.sec_has_permission(uid,'entity_resolution','resolve') THEN
      RAISE EXCEPTION 'entity_resolution.resolve required' USING ERRCODE='42501'; END IF;
    IF c.status = 'ESCALATED' AND NOT public.sec_has_permission(uid,'entity_resolution','approve') THEN
      RAISE EXCEPTION 'Escalated cases require entity_resolution.approve' USING ERRCODE='42501'; END IF;
    IF v_mc AND c.status <> 'ESCALATED' AND NOT public.sec_has_permission(uid,'entity_resolution','approve') THEN
      RAISE EXCEPTION 'Supervisory approval is required: record a recommendation and escalate' USING ERRCODE='42501';
    END IF;
    v_entity := public.entity_resolution_finalise(_case_id, _action, _entity_id, uid,
                  CASE WHEN c.status='ESCALATED' THEN uid ELSE NULL END, _notes);
    RETURN jsonb_build_object('case_id', _case_id, 'entity_id', v_entity, 'action', _action);

  ELSIF _action = 'REQUEST_EVIDENCE' THEN
    IF NOT (public.sec_has_permission(uid,'entity_resolution','verify')
            OR public.sec_has_permission(uid,'entity_resolution','approve')) THEN
      RAISE EXCEPTION 'entity_resolution.verify required' USING ERRCODE='42501'; END IF;
    IF COALESCE(length(btrim(_notes)),0) < 10 THEN
      RAISE EXCEPTION 'An explanation of the evidence required is mandatory' USING ERRCODE='22023'; END IF;
    UPDATE public.entity_resolution_cases
       SET status='EVIDENCE_REQUESTED', decision_notes = btrim(_notes),
           supervisor_decision = CASE WHEN c.status='ESCALATED' THEN 'EVIDENCE_REQUESTED' ELSE supervisor_decision END,
           supervisor_notes = CASE WHEN c.status='ESCALATED' THEN btrim(_notes) ELSE supervisor_notes END,
           supervisor_decided_by = CASE WHEN c.status='ESCALATED' THEN uid ELSE supervisor_decided_by END,
           supervisor_decided_at = CASE WHEN c.status='ESCALATED' THEN now() ELSE supervisor_decided_at END
     WHERE id = _case_id;
    v_event := 'entity.resolution.evidence_requested';

  ELSIF _action = 'ESCALATE' THEN
    IF NOT public.sec_has_permission(uid,'entity_resolution','escalate') THEN
      RAISE EXCEPTION 'entity_resolution.escalate required' USING ERRCODE='42501'; END IF;
    IF COALESCE(length(btrim(_notes)),0) < 10 THEN
      RAISE EXCEPTION 'An escalation reason is required' USING ERRCODE='22023'; END IF;
    UPDATE public.entity_resolution_cases
       SET status='ESCALATED', escalated_by=uid, escalated_at=now(),
           escalation_reason = btrim(_notes),
           supervisor_decision = NULL, supervisor_notes = NULL,
           supervisor_decided_by = NULL, supervisor_decided_at = NULL
     WHERE id = _case_id;
    PERFORM public.entity_resolution_notify_approvers(_case_id,
      'Entity resolution awaiting supervisor decision',
      'Case ' || c.case_number || ' (' || c.subject_name || ') needs a supervisory decision.');
    v_event := 'entity.resolution.escalated';

  ELSIF _action = 'APPROVE' THEN
    IF NOT public.sec_has_permission(uid,'entity_resolution','approve') THEN
      RAISE EXCEPTION 'entity_resolution.approve required' USING ERRCODE='42501'; END IF;
    IF c.status <> 'ESCALATED' THEN
      RAISE EXCEPTION 'Only escalated cases awaiting a supervisory decision can be approved' USING ERRCODE='22023'; END IF;
    IF c.recommended_action IS NULL THEN
      RAISE EXCEPTION 'There is no officer recommendation to approve' USING ERRCODE='22023'; END IF;
    IF c.recommended_by IS NOT NULL AND c.recommended_by = uid THEN
      RAISE EXCEPTION 'Maker-checker: you cannot approve your own recommendation' USING ERRCODE='42501'; END IF;

    UPDATE public.entity_resolution_cases
       SET supervisor_decision='APPROVED', supervisor_notes = COALESCE(btrim(_notes), supervisor_notes),
           supervisor_decided_by = uid, supervisor_decided_at = now()
     WHERE id = _case_id;

    INSERT INTO public.entity_resolution_events (case_id, event_type, actor_id, detail)
    VALUES (_case_id, 'entity.resolution.approved', uid,
            jsonb_build_object('recommended_action', c.recommended_action,
                               'recommended_entity_id', c.recommended_entity_id,
                               'recommended_by', c.recommended_by, 'notes', _notes));
    PERFORM public.create_audit_log(uid, 'entity.resolution.approved', 'entity_resolution_case',
      _case_id::text, NULL, jsonb_build_object('recommended_action', c.recommended_action,
      'recommended_by', c.recommended_by), '{}'::jsonb);

    v_entity := public.entity_resolution_finalise(_case_id, c.recommended_action,
                  c.recommended_entity_id, c.recommended_by, uid,
                  COALESCE(btrim(_notes), c.recommendation_notes));
    RETURN jsonb_build_object('case_id', _case_id, 'entity_id', v_entity, 'action', 'APPROVE');

  ELSIF _action = 'RETURN_FOR_REVIEW' THEN
    IF NOT public.sec_has_permission(uid,'entity_resolution','approve') THEN
      RAISE EXCEPTION 'entity_resolution.approve required' USING ERRCODE='42501'; END IF;
    IF c.status <> 'ESCALATED' THEN
      RAISE EXCEPTION 'Only escalated cases can be returned for review' USING ERRCODE='22023'; END IF;
    IF COALESCE(length(btrim(_notes)),0) < 10 THEN
      RAISE EXCEPTION 'A return reason is required' USING ERRCODE='22023'; END IF;
    UPDATE public.entity_resolution_cases
       SET status='PENDING_REVIEW', supervisor_decision='RETURNED',
           supervisor_notes = btrim(_notes), supervisor_decided_by = uid, supervisor_decided_at = now()
     WHERE id = _case_id;
    v_event := 'entity.resolution.returned';

  ELSE
    RAISE EXCEPTION 'Unsupported action %', _action USING ERRCODE='22023';
  END IF;

  INSERT INTO public.entity_resolution_events (case_id, event_type, actor_id, detail)
  VALUES (_case_id, v_event, uid,
          jsonb_build_object('action', _action, 'entity_id', v_entity, 'notes', _notes));

  PERFORM public.create_audit_log(uid, v_event, 'entity_resolution_case', _case_id::text, NULL,
    jsonb_build_object('action', _action, 'entity_id', v_entity), '{}'::jsonb);

  RETURN jsonb_build_object('case_id', _case_id, 'entity_id', v_entity, 'action', _action);
END $$;

REVOKE ALL ON FUNCTION public.entity_resolution_finalise(uuid,text,uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.entity_resolution_finalise(uuid,text,uuid,uuid,uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.entity_resolution_finalise(uuid,text,uuid,uuid,uuid,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.entity_resolution_finalise(uuid,text,uuid,uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.entity_resolution_notify_approvers(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.entity_resolution_notify_approvers(uuid,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.entity_resolution_notify_approvers(uuid,text,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.entity_resolution_notify_approvers(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.entity_resolution_decide(uuid,text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_resolution_requires_maker_checker(uuid) TO authenticated;