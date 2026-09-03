-- ============================================================ W4-A5 closure integrity
-- 1. Management response provenance -------------------------------------------------
ALTER TABLE public.supervisory_finding
  ADD COLUMN IF NOT EXISTS response_source        text,
  ADD COLUMN IF NOT EXISTS response_received_from text,
  ADD COLUMN IF NOT EXISTS response_received_date date,
  ADD COLUMN IF NOT EXISTS response_channel       text,
  ADD COLUMN IF NOT EXISTS response_recorded_by   uuid,
  ADD COLUMN IF NOT EXISTS response_recorded_at   timestamptz;

-- backfill from the previous free-form JSON receipt so history is not lost
UPDATE public.supervisory_finding f SET
  response_source = CASE
    WHEN COALESCE((f.response_attachments->'receipt'->>'recorded_externally')::boolean, false)
      THEN 'OFFICER_RECORDED' ELSE 'ENTITY_SUBMITTED' END,
  response_received_from = NULLIF(btrim(COALESCE(f.response_attachments->'receipt'->>'received_from','')), ''),
  response_received_date = CASE
    WHEN (f.response_attachments->'receipt'->>'received_date') ~ '^\d{4}-\d{2}-\d{2}$'
      THEN (f.response_attachments->'receipt'->>'received_date')::date ELSE NULL END,
  response_channel = upper(NULLIF(btrim(COALESCE(f.response_attachments->'receipt'->>'channel','')), '')),
  response_recorded_by = f.response_by,
  response_recorded_at = f.response_at
WHERE f.response_at IS NOT NULL AND f.response_source IS NULL;

DO $$ BEGIN
  ALTER TABLE public.supervisory_finding
    ADD CONSTRAINT supervisory_finding_response_source_chk
    CHECK (response_source IS NULL OR response_source IN ('ENTITY_SUBMITTED','OFFICER_RECORDED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.supervisory_finding
    ADD CONSTRAINT supervisory_finding_response_channel_chk
    CHECK (response_channel IS NULL OR response_channel IN ('PORTAL','EMAIL','LETTER','MEETING','TELEPHONE','OTHER'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.supervisory_finding.response_source IS
  'Authoritative provenance of the management response: ENTITY_SUBMITTED (the entity itself acted in the platform) or OFFICER_RECORDED (an officer transcribed a response received outside the platform).';

-- 2. Residual deficiency acceptance -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supervisory_residual_acceptance (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id             uuid NOT NULL REFERENCES public.supervisory_remediation_action(id) ON DELETE CASCADE,
  finding_id            uuid NOT NULL REFERENCES public.supervisory_finding(id) ON DELETE CASCADE,
  entity_id             uuid NOT NULL,
  domain_code           text NOT NULL,
  validation_id         uuid REFERENCES public.supervisory_remediation_validation(id),
  remaining_deficiency  text NOT NULL,
  residual_materiality  text NOT NULL,
  follow_up_requirement text NOT NULL,
  next_review_date      date,
  rationale             text NOT NULL,
  accepted_by           uuid NOT NULL,
  accepted_at           timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_residual_acceptance_materiality_chk
    CHECK (residual_materiality IN ('LOW','MEDIUM','HIGH')),
  CONSTRAINT supervisory_residual_acceptance_action_uq UNIQUE (action_id)
);

CREATE INDEX IF NOT EXISTS supervisory_residual_acceptance_finding_idx
  ON public.supervisory_residual_acceptance(finding_id);

GRANT SELECT ON public.supervisory_residual_acceptance TO authenticated;
GRANT ALL    ON public.supervisory_residual_acceptance TO service_role;

ALTER TABLE public.supervisory_residual_acceptance ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY supervisory_residual_acceptance_read
    ON public.supervisory_residual_acceptance FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.supervisory_finding f
                    WHERE f.id = supervisory_residual_acceptance.finding_id
                      AND public.supervisory_finding_can_read(f.*)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.supervisory_residual_acceptance IS
  'Governed acceptance of a residual deficiency where remediation was concluded only PARTIALLY_EFFECTIVE. Written only by supervisory_residual_acceptance_record; required before such a corrective action can be closed or its finding closed.';

-- 3. Governed operation: accept a residual deficiency -------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_residual_acceptance_record(
  _action_id uuid,
  _remaining_deficiency text,
  _residual_materiality text,
  _follow_up_requirement text,
  _rationale text,
  _next_review_date date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _row public.supervisory_remediation_action; _mat text; _validation uuid; _id uuid;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.approve','supervisory_spine.approve',
            'prudential_supervision.initiate_supervisory_action','market_conduct.approve']);

  SELECT * INTO _row FROM public.supervisory_remediation_action WHERE id = _action_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: remediation action' USING ERRCODE='22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _row.entity_id);

  IF _row.status <> 'PARTIALLY_EFFECTIVE' THEN
    RAISE EXCEPTION 'residual_acceptance_not_applicable: % is %, not PARTIALLY_EFFECTIVE', _row.reference, _row.status
      USING ERRCODE='22023';
  END IF;

  _mat := upper(COALESCE(_residual_materiality,''));
  IF _mat NOT IN ('LOW','MEDIUM','HIGH') THEN
    RAISE EXCEPTION 'invalid_residual_materiality: %', _mat USING ERRCODE='22023'; END IF;
  IF length(btrim(COALESCE(_remaining_deficiency,''))) < 20 THEN
    RAISE EXCEPTION 'a description of the remaining deficiency of at least 20 characters is required' USING ERRCODE='22023'; END IF;
  IF length(btrim(COALESCE(_follow_up_requirement,''))) < 20 THEN
    RAISE EXCEPTION 'a follow-up supervisory requirement of at least 20 characters is required' USING ERRCODE='22023'; END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 20 THEN
    RAISE EXCEPTION 'an acceptance rationale of at least 20 characters is required' USING ERRCODE='22023'; END IF;

  SELECT v.id INTO _validation FROM public.supervisory_remediation_validation v
   WHERE v.action_id = _action_id ORDER BY v.validated_at DESC LIMIT 1;
  IF _validation IS NULL THEN
    RAISE EXCEPTION 'residual_acceptance_blocked: a governed validation must exist before a residual deficiency can be accepted'
      USING ERRCODE='22023'; END IF;

  -- the validator of the partial conclusion cannot also accept the residual risk
  IF NOT public.is_super_admin(_uid)
     AND EXISTS (SELECT 1 FROM public.supervisory_remediation_validation v
                  WHERE v.id = _validation AND v.validated_by = _uid) THEN
    RAISE EXCEPTION 'not_authorized: the officer who concluded the validation cannot also accept the residual deficiency'
      USING ERRCODE='42501'; END IF;

  INSERT INTO public.supervisory_residual_acceptance(
    action_id, finding_id, entity_id, domain_code, validation_id,
    remaining_deficiency, residual_materiality, follow_up_requirement, next_review_date,
    rationale, accepted_by)
  VALUES (_action_id, _row.finding_id, _row.entity_id, _row.domain_code, _validation,
          btrim(_remaining_deficiency), _mat, btrim(_follow_up_requirement), _next_review_date,
          btrim(_rationale), _uid)
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_remediation_event(action_id, event_type, from_status, to_status, rationale, actor_id, detail)
  VALUES (_action_id, 'RESIDUAL_ACCEPTED', _row.status, _row.status, btrim(_rationale), _uid,
          jsonb_build_object('residual_materiality', _mat, 'follow_up_requirement', btrim(_follow_up_requirement),
                             'next_review_date', _next_review_date, 'validation_id', _validation));

  PERFORM public.log_compliance_audit('APPROVE','supervisory_residual_acceptance', _id,
    NULL, jsonb_build_object('action_id', _action_id, 'finding_id', _row.finding_id,
                             'residual_materiality', _mat),
    'Residual deficiency accepted on ' || _row.reference);

  RETURN _id;
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_residual_acceptance_record(uuid,text,text,text,text,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_residual_acceptance_record(uuid,text,text,text,text,date)
  TO authenticated, service_role;

-- 4. Management response: authoritative provenance ---------------------------------
DROP FUNCTION IF EXISTS public.supervisory_finding_response(uuid,text,text,text,text,date,jsonb);

CREATE OR REPLACE FUNCTION public.supervisory_finding_response(
  _finding_id uuid,
  _response_state text,
  _management_response text,
  _proposed_action text DEFAULT NULL,
  _responsible_person text DEFAULT NULL,
  _target_date date DEFAULT NULL,
  _attachments jsonb DEFAULT NULL,
  _received_from text DEFAULT NULL,
  _received_date date DEFAULT NULL,
  _channel text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _row public.supervisory_finding; _state text; _internal boolean;
        _entity_side boolean; _source text; _chan text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO _row FROM public.supervisory_finding WHERE id = _finding_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: finding' USING ERRCODE='22023'; END IF;
  IF _row.status NOT IN ('ISSUED','MANAGEMENT_RESPONSE') THEN
    RAISE EXCEPTION 'response_not_open: finding is %', _row.status USING ERRCODE='22023'; END IF;

  _state := upper(COALESCE(_response_state,''));
  IF _state NOT IN ('ACCEPTED','DISPUTED','PARTIALLY_ACCEPTED') THEN
    RAISE EXCEPTION 'invalid_response_state: %', _state USING ERRCODE='22023'; END IF;
  IF length(btrim(COALESCE(_management_response,''))) < 10 THEN
    RAISE EXCEPTION 'a management response of at least 10 characters is required' USING ERRCODE='22023'; END IF;

  _internal := public.is_super_admin(_uid) OR public.has_any_permission(_uid, ARRAY[
      'aml_supervision.finding_manage','supervisory_spine.edit',
      'prudential_supervision.manage_remediation','inspection_management.edit']);
  _entity_side := public.user_has_entity_assignment(_uid, _row.entity_id);
  IF NOT _internal AND NOT _entity_side THEN
    RAISE EXCEPTION 'not_authorized: you may only respond to findings for your own entity' USING ERRCODE='42501'; END IF;

  -- provenance is derived from who is acting: an officer transcribing a letter is
  -- never recorded as the entity having answered in the platform.
  _source := CASE WHEN _internal AND NOT _entity_side THEN 'OFFICER_RECORDED' ELSE 'ENTITY_SUBMITTED' END;
  _chan := upper(NULLIF(btrim(COALESCE(_channel,'')), ''));

  IF _source = 'OFFICER_RECORDED' THEN
    IF length(btrim(COALESCE(_received_from,''))) < 3 THEN
      RAISE EXCEPTION 'response_provenance_required: record who the response was received from' USING ERRCODE='22023'; END IF;
    IF _received_date IS NULL THEN
      RAISE EXCEPTION 'response_provenance_required: record the date the response was received' USING ERRCODE='22023'; END IF;
    IF _received_date > CURRENT_DATE THEN
      RAISE EXCEPTION 'response_provenance_invalid: the receipt date cannot be in the future' USING ERRCODE='22023'; END IF;
    IF _row.issued_at IS NOT NULL AND _received_date < _row.issued_at::date THEN
      RAISE EXCEPTION 'response_provenance_invalid: the response cannot predate issue of the finding' USING ERRCODE='22023'; END IF;
    IF _chan IS NULL OR _chan NOT IN ('EMAIL','LETTER','MEETING','TELEPHONE','OTHER') THEN
      RAISE EXCEPTION 'response_provenance_required: record the channel the response arrived through' USING ERRCODE='22023'; END IF;
  ELSE
    _chan := 'PORTAL';
  END IF;

  UPDATE public.supervisory_finding SET
    response_state = _state,
    management_response = btrim(_management_response),
    proposed_action = COALESCE(_proposed_action, proposed_action),
    responsible_person = COALESCE(_responsible_person, responsible_person),
    response_target_date = COALESCE(_target_date, response_target_date),
    response_attachments = COALESCE(_attachments, response_attachments),
    response_source = _source,
    response_received_from = CASE WHEN _source='OFFICER_RECORDED' THEN btrim(_received_from) ELSE NULL END,
    response_received_date = CASE WHEN _source='OFFICER_RECORDED' THEN _received_date ELSE CURRENT_DATE END,
    response_channel = _chan,
    response_recorded_by = _uid,
    response_recorded_at = now(),
    -- response_by remains the entity's own act; an officer transcription leaves it unset
    response_by = CASE WHEN _source='ENTITY_SUBMITTED' THEN _uid ELSE NULL END,
    response_at = now(),
    status = CASE WHEN status = 'ISSUED' THEN 'MANAGEMENT_RESPONSE' ELSE status END,
    updated_at = now()
  WHERE id = _finding_id;

  INSERT INTO public.supervisory_finding_event(finding_id, event_type, from_status, to_status, rationale, actor_id, detail)
  VALUES (_finding_id, 'MANAGEMENT_RESPONSE', _row.status, 'MANAGEMENT_RESPONSE',
          btrim(_management_response), _uid,
          jsonb_build_object('response_state', _state, 'response_source', _source,
                             'received_from', CASE WHEN _source='OFFICER_RECORDED' THEN btrim(_received_from) END,
                             'received_date', CASE WHEN _source='OFFICER_RECORDED' THEN _received_date END,
                             'channel', _chan));
  RETURN _finding_id;
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_finding_response(uuid,text,text,text,text,date,jsonb,text,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_finding_response(uuid,text,text,text,text,date,jsonb,text,date,text)
  TO authenticated, service_role;

-- 5. Closure policy: a partial outcome is not a closed matter ----------------------
CREATE OR REPLACE FUNCTION public.supervisory_finding_lifecycle(_finding_id uuid, _to_status text, _rationale text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _row public.supervisory_finding; _to text; _allowed boolean; _material boolean;
        _open text; _partial text;
BEGIN
  _to := upper(COALESCE(_to_status,''));
  IF _to IN ('ISSUED','CLOSED','WITHDRAWN','SUPERSEDED') THEN
    _uid := public.supervisory_spine_require(ARRAY['aml_supervision.approve','supervisory_spine.approve',
              'prudential_supervision.initiate_supervisory_action','market_conduct.approve']);
  ELSE
    _uid := public.supervisory_spine_require(ARRAY['aml_supervision.finding_manage','aml_supervision.review',
              'supervisory_spine.edit','prudential_supervision.manage_remediation',
              'market_conduct.approve','inspection_management.edit']);
  END IF;

  SELECT * INTO _row FROM public.supervisory_finding WHERE id = _finding_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: finding' USING ERRCODE='22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _row.entity_id);
  _material := _row.severity IN ('HIGH','CRITICAL');

  _allowed := CASE _row.status
    WHEN 'DRAFT'                 THEN _to IN ('REVIEW','WITHDRAWN')
    WHEN 'REVIEW'                THEN _to IN ('ISSUED','DRAFT','WITHDRAWN')
    WHEN 'ISSUED'                THEN _to IN ('MANAGEMENT_RESPONSE','REMEDIATION_REQUIRED','WITHDRAWN','SUPERSEDED')
    WHEN 'MANAGEMENT_RESPONSE'   THEN _to IN ('REMEDIATION_REQUIRED','CLOSED','WITHDRAWN')
    WHEN 'REMEDIATION_REQUIRED'  THEN _to IN ('VALIDATION','CLOSED')
    WHEN 'VALIDATION'            THEN _to IN ('CLOSED','REMEDIATION_REQUIRED')
    WHEN 'CLOSED'                THEN _to = 'REOPENED'
    WHEN 'REOPENED'              THEN _to IN ('REMEDIATION_REQUIRED','VALIDATION')
    ELSE false END;
  IF NOT _allowed THEN
    RAISE EXCEPTION 'transition_not_permitted: % -> %', _row.status, _to USING ERRCODE='22023'; END IF;

  IF _to IN ('ISSUED','CLOSED','WITHDRAWN','SUPERSEDED','REOPENED')
     AND length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a decision rationale of at least 10 characters is required' USING ERRCODE='22023'; END IF;

  IF _to = 'ISSUED' AND _material AND NOT public.is_super_admin(_uid) AND _row.created_by = _uid THEN
    RAISE EXCEPTION 'not_authorized: a high or critical finding cannot be issued by the officer who raised it'
      USING ERRCODE='42501'; END IF;
  IF _to = 'CLOSED' AND _material AND NOT public.is_super_admin(_uid)
     AND EXISTS (SELECT 1 FROM public.supervisory_remediation_validation v
                  WHERE v.finding_id = _finding_id AND v.validated_by = _uid) THEN
    RAISE EXCEPTION 'not_authorized: the validator of a high or critical finding cannot also close it'
      USING ERRCODE='42501'; END IF;
  IF _to = 'CLOSED' AND _row.status IN ('REMEDIATION_REQUIRED','VALIDATION','REOPENED')
     AND NOT EXISTS (SELECT 1 FROM public.supervisory_remediation_validation v WHERE v.finding_id = _finding_id) THEN
    RAISE EXCEPTION 'closure_blocked: a governed remediation validation is required before closure'
      USING ERRCODE='22023'; END IF;

  IF _to = 'CLOSED' THEN
    SELECT string_agg(a.reference || ' (' || a.status || ')', ', ' ORDER BY a.reference)
      INTO _open
      FROM public.supervisory_remediation_action a
     WHERE a.finding_id = _finding_id
       AND a.status NOT IN ('EFFECTIVE','PARTIALLY_EFFECTIVE','CLOSED');
    IF _open IS NOT NULL THEN
      RAISE EXCEPTION 'closure_blocked: unresolved corrective action(s): %', _open USING ERRCODE='22023';
    END IF;

    -- a partially effective outcome is an accepted residual risk or it is unresolved
    SELECT string_agg(a.reference, ', ' ORDER BY a.reference)
      INTO _partial
      FROM public.supervisory_remediation_action a
     WHERE a.finding_id = _finding_id
       AND a.status = 'PARTIALLY_EFFECTIVE'
       AND NOT EXISTS (SELECT 1 FROM public.supervisory_residual_acceptance ra WHERE ra.action_id = a.id);
    IF _partial IS NOT NULL THEN
      RAISE EXCEPTION 'closure_blocked: partially effective corrective action(s) require a recorded residual acceptance: %', _partial
        USING ERRCODE='22023';
    END IF;
  END IF;

  UPDATE public.supervisory_finding SET
    status = _to,
    reviewed_by = CASE WHEN _to='REVIEW' THEN _uid ELSE reviewed_by END,
    reviewed_at = CASE WHEN _to='REVIEW' THEN now() ELSE reviewed_at END,
    issued_by = CASE WHEN _to='ISSUED' THEN _uid ELSE issued_by END,
    issued_at = CASE WHEN _to='ISSUED' THEN now() ELSE issued_at END,
    closed_by = CASE WHEN _to='CLOSED' THEN _uid ELSE closed_by END,
    closed_at = CASE WHEN _to='CLOSED' THEN now() ELSE closed_at END,
    closure_rationale = CASE WHEN _to='CLOSED' THEN btrim(_rationale) ELSE closure_rationale END,
    updated_at = now()
  WHERE id = _finding_id;

  INSERT INTO public.supervisory_finding_event(finding_id, event_type, from_status, to_status, rationale, actor_id)
  VALUES (_finding_id,
          CASE _to WHEN 'ISSUED' THEN 'ISSUE' WHEN 'CLOSED' THEN 'CLOSURE' ELSE 'STATUS_CHANGE' END,
          _row.status, _to, btrim(COALESCE(_rationale,'')), _uid);

  PERFORM public.log_compliance_audit(
    CASE WHEN _to IN ('ISSUED','CLOSED') THEN 'APPROVE' ELSE 'WORKFLOW_TRANSITION' END,
    'supervisory_finding', _finding_id,
    jsonb_build_object('status',_row.status), jsonb_build_object('status',_to),
    'Supervisory finding ' || _row.reference || ': ' || _row.status || ' -> ' || _to);

  RETURN jsonb_build_object('id',_finding_id,'reference',_row.reference,
    'from_status',_row.status,'to_status',_to);
END $function$;

-- 6. The same policy at the corrective-action boundary -----------------------------
CREATE OR REPLACE FUNCTION public.supervisory_remediation_transition(_action_id uuid, _to_status text, _rationale text DEFAULT NULL::text, _entity_response text DEFAULT NULL::text, _evidence jsonb DEFAULT NULL::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _row public.supervisory_remediation_action;
        _to text; _allowed boolean; _entity_side boolean; _internal boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE='42501'; END IF;
  _to := upper(COALESCE(_to_status,''));
  SELECT * INTO _row FROM public.supervisory_remediation_action WHERE id = _action_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: remediation action' USING ERRCODE='22023'; END IF;

  _entity_side := _to IN ('ACTION_PLAN_SUBMITTED','EVIDENCE_SUBMITTED');
  _internal := public.is_super_admin(_uid) OR public.has_any_permission(_uid, ARRAY[
      'aml_supervision.remediation_manage','supervisory_spine.edit',
      'prudential_supervision.manage_remediation','market_conduct.approve','inspection_management.edit']);

  IF NOT _internal THEN
    IF NOT (_entity_side AND public.user_has_entity_assignment(_uid, _row.entity_id)) THEN
      RAISE EXCEPTION 'not_authorized: this remediation decision is reserved to the supervisor'
        USING ERRCODE='42501';
    END IF;
  END IF;

  _allowed := CASE _row.status
    WHEN 'OPEN'                  THEN _to IN ('ACTION_PLAN_SUBMITTED','UNDER_REVIEW')
    WHEN 'ACTION_PLAN_SUBMITTED' THEN _to IN ('UNDER_REVIEW','OPEN')
    WHEN 'UNDER_REVIEW'          THEN _to IN ('ACCEPTED','OPEN')
    WHEN 'ACCEPTED'              THEN _to = 'IMPLEMENTING'
    WHEN 'IMPLEMENTING'          THEN _to = 'EVIDENCE_SUBMITTED'
    WHEN 'EVIDENCE_SUBMITTED'    THEN _to = 'VALIDATION'
    WHEN 'VALIDATION'            THEN _to IN ('EFFECTIVE','PARTIALLY_EFFECTIVE','INEFFECTIVE')
    WHEN 'EFFECTIVE'             THEN _to IN ('CLOSED','REOPENED')
    WHEN 'PARTIALLY_EFFECTIVE'   THEN _to IN ('IMPLEMENTING','REOPENED','CLOSED')
    WHEN 'INEFFECTIVE'           THEN _to IN ('IMPLEMENTING','REOPENED')
    WHEN 'REOPENED'              THEN _to IN ('IMPLEMENTING','UNDER_REVIEW')
    ELSE false END;
  IF NOT _allowed THEN
    RAISE EXCEPTION 'transition_not_permitted: % -> %', _row.status, _to USING ERRCODE='22023'; END IF;

  IF _to IN ('EFFECTIVE','PARTIALLY_EFFECTIVE','INEFFECTIVE')
     AND current_setting('app.supervisory_validation_writer', true) IS DISTINCT FROM 'validation' THEN
    RAISE EXCEPTION 'validation_required: use supervisory_remediation_validate to conclude effectiveness'
      USING ERRCODE='22023'; END IF;

  IF _to = 'CLOSED' THEN
    IF _row.status NOT IN ('EFFECTIVE','PARTIALLY_EFFECTIVE') THEN
      RAISE EXCEPTION 'closure_blocked: remediation must be validated before closure' USING ERRCODE='22023';
    END IF;
    IF _row.status = 'PARTIALLY_EFFECTIVE'
       AND NOT EXISTS (SELECT 1 FROM public.supervisory_residual_acceptance ra WHERE ra.action_id = _action_id) THEN
      RAISE EXCEPTION 'closure_blocked: % is only partially effective and no residual acceptance has been recorded', _row.reference
        USING ERRCODE='22023';
    END IF;
  END IF;

  UPDATE public.supervisory_remediation_action SET
    status = _to,
    entity_response = COALESCE(_entity_response, entity_response),
    evidence = COALESCE(_evidence, evidence),
    supervisor_decision = CASE WHEN _to IN ('ACCEPTED','OPEN') AND _internal THEN _to ELSE supervisor_decision END,
    decision_by = CASE WHEN _to = 'ACCEPTED' THEN _uid ELSE decision_by END,
    decision_at = CASE WHEN _to = 'ACCEPTED' THEN now() ELSE decision_at END,
    decision_rationale = CASE WHEN _to = 'ACCEPTED' THEN btrim(COALESCE(_rationale,'')) ELSE decision_rationale END,
    completed_at = CASE WHEN _to = 'EVIDENCE_SUBMITTED' THEN now() ELSE completed_at END,
    closed_at = CASE WHEN _to = 'CLOSED' THEN now() ELSE closed_at END,
    closed_by = CASE WHEN _to = 'CLOSED' THEN _uid ELSE closed_by END,
    updated_at = now()
  WHERE id = _action_id;

  INSERT INTO public.supervisory_remediation_event(action_id, event_type, from_status, to_status, rationale, actor_id)
  VALUES (_action_id, 'STATUS_CHANGE', _row.status, _to, btrim(COALESCE(_rationale,'')), _uid);

  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION','supervisory_remediation_action', _action_id,
    jsonb_build_object('status',_row.status), jsonb_build_object('status',_to),
    'Remediation ' || _row.reference || ': ' || _row.status || ' -> ' || _to);

  RETURN jsonb_build_object('id',_action_id,'from_status',_row.status,'to_status',_to);
END $function$;
