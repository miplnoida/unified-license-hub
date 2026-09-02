-- =====================================================================
-- EPIC 3 / MIGRATION B — canonical supervisory finding + remediation
-- =====================================================================

-- only one ACTIVE AML methodology (the earlier stub carries no assessments)
UPDATE public.supervisory_methodology
   SET status = 'SUPERSEDED', effective_to = COALESCE(effective_to, current_date), updated_at = now()
 WHERE domain_code = 'AML_CFT' AND code = 'AML_RBA' AND status = 'ACTIVE'
   AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment a WHERE a.methodology_id = supervisory_methodology.id);

-- ------------------------------------------------- 1. canonical finding
CREATE SEQUENCE IF NOT EXISTS public.supervisory_finding_seq;
CREATE SEQUENCE IF NOT EXISTS public.supervisory_remediation_seq;

CREATE TABLE IF NOT EXISTS public.supervisory_finding (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference                text NOT NULL UNIQUE,
  entity_id                uuid NOT NULL,
  domain_code              text NOT NULL,
  regulator_id             uuid,
  sector_id                uuid,
  finding_category         text,
  severity                 text NOT NULL DEFAULT 'MEDIUM',
  title                    text NOT NULL,
  observation              text,
  root_cause               text,
  risk_impact              text,
  regulatory_criterion     text,
  required_action          text,
  recommendation           text,
  confidentiality          text NOT NULL DEFAULT 'STANDARD',
  status                   text NOT NULL DEFAULT 'DRAFT',
  -- FK-backed provenance
  source_kind              text NOT NULL,
  assessment_id            uuid REFERENCES public.supervisory_assessment(id),
  assessment_dimension_id  uuid REFERENCES public.supervisory_assessment_dimension(id),
  attention_id             uuid REFERENCES public.supervisory_attention(id),
  plan_id                  uuid REFERENCES public.supervisory_plan(id),
  intervention_id          uuid REFERENCES public.supervisory_intervention(id),
  examination_id           uuid REFERENCES public.examinations(id),
  workpaper_id             uuid REFERENCES public.examination_workpapers(id),
  signal_id                uuid REFERENCES public.supervisory_signal(id),
  evidence_document_id     uuid,
  evidence_refs            jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- management response
  response_state           text,
  management_response      text,
  proposed_action          text,
  responsible_person       text,
  response_target_date     date,
  response_attachments     jsonb NOT NULL DEFAULT '[]'::jsonb,
  response_by              uuid,
  response_at              timestamptz,
  response_decision        text,
  response_decision_by     uuid,
  response_decision_at     timestamptz,
  -- ownership / lifecycle
  owner_id                 uuid,
  team_id                  uuid,
  due_date                 date,
  issued_by                uuid,
  issued_at                timestamptz,
  reviewed_by              uuid,
  reviewed_at              timestamptz,
  closed_by                uuid,
  closed_at                timestamptz,
  closure_rationale        text,
  validation_conclusion    text,
  superseded_by_id         uuid REFERENCES public.supervisory_finding(id),
  -- legacy display metadata only (never authoritative)
  legacy_source_table      text,
  legacy_source_id         uuid,
  origin_provenance        text NOT NULL DEFAULT 'GOVERNED',
  created_by               uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_finding_domain_chk CHECK (public.supervisory_domain_valid(domain_code)),
  CONSTRAINT supervisory_finding_severity_chk CHECK (severity = ANY (ARRAY['LOW','MEDIUM','HIGH','CRITICAL'])),
  CONSTRAINT supervisory_finding_conf_chk CHECK (confidentiality = ANY (ARRAY['STANDARD','CONFIDENTIAL'])),
  CONSTRAINT supervisory_finding_status_chk CHECK (status = ANY (ARRAY[
    'DRAFT','REVIEW','ISSUED','MANAGEMENT_RESPONSE','REMEDIATION_REQUIRED',
    'VALIDATION','CLOSED','WITHDRAWN','SUPERSEDED','REOPENED'])),
  CONSTRAINT supervisory_finding_source_chk CHECK (source_kind = ANY (ARRAY[
    'EXAMINATION','ASSESSMENT','OFFSITE_REVIEW','COMPLAINT','THEMATIC_REVIEW',
    'INVESTIGATION','RETURN_REVIEW','SIGNAL','OTHER_GOVERNED_SOURCE'])),
  CONSTRAINT supervisory_finding_origin_chk CHECK (origin_provenance = ANY (ARRAY[
    'GOVERNED','BACKFILL_DETERMINISTIC','LEGACY_UNKNOWN'])),
  CONSTRAINT supervisory_finding_response_chk CHECK (
    response_state IS NULL OR response_state = ANY (ARRAY['ACCEPTED','DISPUTED','PARTIALLY_ACCEPTED'])),
  CONSTRAINT supervisory_finding_validation_chk CHECK (
    validation_conclusion IS NULL OR validation_conclusion = ANY (ARRAY['EFFECTIVE','PARTIALLY_EFFECTIVE','INEFFECTIVE'])),
  -- a governed finding must carry at least one authoritative origin
  CONSTRAINT supervisory_finding_provenance_chk CHECK (
    origin_provenance <> 'GOVERNED'
    OR assessment_id IS NOT NULL OR assessment_dimension_id IS NOT NULL
    OR examination_id IS NOT NULL OR workpaper_id IS NOT NULL
    OR attention_id IS NOT NULL OR signal_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_sup_finding_entity ON public.supervisory_finding(entity_id, domain_code, status);
CREATE INDEX IF NOT EXISTS idx_sup_finding_exam ON public.supervisory_finding(examination_id);
CREATE INDEX IF NOT EXISTS idx_sup_finding_assessment ON public.supervisory_finding(assessment_id);
CREATE INDEX IF NOT EXISTS idx_sup_finding_dimension ON public.supervisory_finding(assessment_dimension_id);
CREATE INDEX IF NOT EXISTS idx_sup_finding_open ON public.supervisory_finding(status, severity, due_date);

CREATE TABLE IF NOT EXISTS public.supervisory_finding_event (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id  uuid NOT NULL REFERENCES public.supervisory_finding(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  from_status text,
  to_status   text,
  rationale   text,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id    uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sup_finding_event ON public.supervisory_finding_event(finding_id, created_at DESC);

-- ------------------------------------------------- 2. canonical remediation
CREATE TABLE IF NOT EXISTS public.supervisory_remediation_action (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference             text NOT NULL UNIQUE,
  finding_id            uuid NOT NULL REFERENCES public.supervisory_finding(id) ON DELETE CASCADE,
  entity_id             uuid NOT NULL,
  domain_code           text NOT NULL,
  description           text NOT NULL,
  required_outcome      text,
  entity_response       text,
  owner_id              uuid,
  responsible_party     text,
  target_date           date,
  status                text NOT NULL DEFAULT 'OPEN',
  evidence              jsonb NOT NULL DEFAULT '[]'::jsonb,
  supervisor_decision   text,
  decision_by           uuid,
  decision_at           timestamptz,
  decision_rationale    text,
  effectiveness         text,
  escalated_attention_id uuid REFERENCES public.supervisory_attention(id),
  escalated_at          timestamptz,
  escalation_reason     text,
  completed_at          timestamptz,
  closed_at             timestamptz,
  closed_by             uuid,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sup_remediation_domain_chk CHECK (public.supervisory_domain_valid(domain_code)),
  CONSTRAINT sup_remediation_status_chk CHECK (status = ANY (ARRAY[
    'OPEN','ACTION_PLAN_SUBMITTED','UNDER_REVIEW','ACCEPTED','IMPLEMENTING',
    'EVIDENCE_SUBMITTED','VALIDATION','EFFECTIVE','PARTIALLY_EFFECTIVE',
    'INEFFECTIVE','REOPENED','CLOSED'])),
  CONSTRAINT sup_remediation_effectiveness_chk CHECK (
    effectiveness IS NULL OR effectiveness = ANY (ARRAY['EFFECTIVE','PARTIALLY_EFFECTIVE','INEFFECTIVE']))
);
CREATE INDEX IF NOT EXISTS idx_sup_remediation_finding ON public.supervisory_remediation_action(finding_id);
CREATE INDEX IF NOT EXISTS idx_sup_remediation_open ON public.supervisory_remediation_action(status, target_date);

CREATE TABLE IF NOT EXISTS public.supervisory_remediation_event (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id   uuid NOT NULL REFERENCES public.supervisory_remediation_action(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  from_status text,
  to_status   text,
  rationale   text,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id    uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sup_remediation_event ON public.supervisory_remediation_event(action_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.supervisory_remediation_validation (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id         uuid NOT NULL REFERENCES public.supervisory_remediation_action(id) ON DELETE CASCADE,
  finding_id        uuid NOT NULL REFERENCES public.supervisory_finding(id) ON DELETE CASCADE,
  evidence_reviewed text NOT NULL,
  procedure_applied text NOT NULL,
  conclusion        text NOT NULL,
  rationale         text NOT NULL,
  next_step         text,
  workpaper_id      uuid REFERENCES public.examination_workpapers(id),
  document_id       uuid,
  validated_by      uuid NOT NULL,
  validated_at      timestamptz NOT NULL DEFAULT now(),
  countersigned_by  uuid,
  countersigned_at  timestamptz,
  CONSTRAINT sup_validation_conclusion_chk CHECK (
    conclusion = ANY (ARRAY['EFFECTIVE','PARTIALLY_EFFECTIVE','INEFFECTIVE']))
);
CREATE INDEX IF NOT EXISTS idx_sup_validation_action ON public.supervisory_remediation_validation(action_id);

-- ------------------------------------------------- 3. grants + RLS
GRANT SELECT, INSERT, UPDATE ON public.supervisory_finding TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.supervisory_remediation_action TO authenticated;
GRANT SELECT ON public.supervisory_finding_event TO authenticated;
GRANT SELECT ON public.supervisory_remediation_event TO authenticated;
GRANT SELECT ON public.supervisory_remediation_validation TO authenticated;
GRANT ALL ON public.supervisory_finding, public.supervisory_finding_event,
             public.supervisory_remediation_action, public.supervisory_remediation_event,
             public.supervisory_remediation_validation TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.supervisory_finding_seq, public.supervisory_remediation_seq TO authenticated, service_role;

ALTER TABLE public.supervisory_finding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisory_finding_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisory_remediation_action ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisory_remediation_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisory_remediation_validation ENABLE ROW LEVEL SECURITY;

-- read: supervisory staff with a domain view permission; CONFIDENTIAL needs the
-- confidential permission. Entity users see only ISSUED findings for their entity.
CREATE OR REPLACE FUNCTION public.supervisory_finding_can_read(_f public.supervisory_finding)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_super_admin(auth.uid())
      OR (
        public.has_any_permission(auth.uid(), ARRAY[
          'supervisory_spine.view','prudential_supervision.view',
          'market_conduct.view','aml_supervision.view','inspection_management.view'])
        AND (_f.confidentiality <> 'CONFIDENTIAL'
             OR public.has_any_permission(auth.uid(), ARRAY[
                  'aml_supervision.view_confidential','supervisory_spine.view_confidential']))
      );
$$;

DROP POLICY IF EXISTS supervisory_finding_read ON public.supervisory_finding;
CREATE POLICY supervisory_finding_read ON public.supervisory_finding
  FOR SELECT TO authenticated
  USING (public.supervisory_finding_can_read(supervisory_finding));

DROP POLICY IF EXISTS supervisory_finding_no_direct_write ON public.supervisory_finding;
CREATE POLICY supervisory_finding_no_direct_write ON public.supervisory_finding
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS supervisory_finding_no_direct_update ON public.supervisory_finding;
CREATE POLICY supervisory_finding_no_direct_update ON public.supervisory_finding
  FOR UPDATE TO authenticated USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS supervisory_finding_event_read ON public.supervisory_finding_event;
CREATE POLICY supervisory_finding_event_read ON public.supervisory_finding_event
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supervisory_finding f
                  WHERE f.id = supervisory_finding_event.finding_id
                    AND public.supervisory_finding_can_read(f)));

DROP POLICY IF EXISTS supervisory_remediation_read ON public.supervisory_remediation_action;
CREATE POLICY supervisory_remediation_read ON public.supervisory_remediation_action
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supervisory_finding f
                  WHERE f.id = supervisory_remediation_action.finding_id
                    AND public.supervisory_finding_can_read(f)));

DROP POLICY IF EXISTS supervisory_remediation_no_direct_write ON public.supervisory_remediation_action;
CREATE POLICY supervisory_remediation_no_direct_write ON public.supervisory_remediation_action
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS supervisory_remediation_no_direct_update ON public.supervisory_remediation_action;
CREATE POLICY supervisory_remediation_no_direct_update ON public.supervisory_remediation_action
  FOR UPDATE TO authenticated USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS supervisory_remediation_event_read ON public.supervisory_remediation_event;
CREATE POLICY supervisory_remediation_event_read ON public.supervisory_remediation_event
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supervisory_remediation_action a
                  JOIN public.supervisory_finding f ON f.id = a.finding_id
                  WHERE a.id = supervisory_remediation_event.action_id
                    AND public.supervisory_finding_can_read(f)));

DROP POLICY IF EXISTS supervisory_remediation_validation_read ON public.supervisory_remediation_validation;
CREATE POLICY supervisory_remediation_validation_read ON public.supervisory_remediation_validation
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supervisory_finding f
                  WHERE f.id = supervisory_remediation_validation.finding_id
                    AND public.supervisory_finding_can_read(f)));

-- ------------------------------------------------- 4. governed operations
CREATE OR REPLACE FUNCTION public.supervisory_finding_reference(_domain text)
RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT 'SF-' || CASE upper(_domain) WHEN 'AML_CFT' THEN 'AML'
                                      WHEN 'PRUDENTIAL' THEN 'PRU'
                                      WHEN 'MARKET_CONDUCT' THEN 'MCD'
                                      WHEN 'OPERATIONAL_RESILIENCE' THEN 'OPR'
                                      ELSE 'XDM' END
      || '-' || to_char(current_date,'YYYY') || '-'
      || lpad(nextval('public.supervisory_finding_seq')::text, 5, '0');
$$;

CREATE OR REPLACE FUNCTION public.supervisory_finding_create(_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _id uuid; _entity uuid; _domain text; _sev text;
        _exam uuid; _assess uuid; _dim uuid; _wp uuid;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.finding_manage',
            'supervisory_spine.edit','prudential_supervision.manage_remediation',
            'market_conduct.approve','inspection_management.edit']);

  _entity := NULLIF(_payload->>'entity_id','')::uuid;
  _domain := upper(COALESCE(_payload->>'domain_code',''));
  _sev    := upper(COALESCE(_payload->>'severity','MEDIUM'));
  _exam   := NULLIF(_payload->>'examination_id','')::uuid;
  _assess := NULLIF(_payload->>'assessment_id','')::uuid;
  _dim    := NULLIF(_payload->>'assessment_dimension_id','')::uuid;
  _wp     := NULLIF(_payload->>'workpaper_id','')::uuid;

  IF _entity IS NULL THEN RAISE EXCEPTION 'entity_id required' USING ERRCODE='22023'; END IF;
  IF NOT public.supervisory_domain_valid(_domain) THEN
    RAISE EXCEPTION 'invalid_domain: %', _domain USING ERRCODE='22023'; END IF;
  IF _exam IS NULL AND _assess IS NULL AND _dim IS NULL AND _wp IS NULL THEN
    RAISE EXCEPTION 'a governed finding requires an authoritative origin (examination, assessment, dimension or workpaper)'
      USING ERRCODE='22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity);

  -- derive the assessment from the dimension when only the dimension is supplied
  IF _assess IS NULL AND _dim IS NOT NULL THEN
    SELECT assessment_id INTO _assess FROM public.supervisory_assessment_dimension WHERE id = _dim;
  END IF;

  INSERT INTO public.supervisory_finding(
    reference, entity_id, domain_code, regulator_id, sector_id, finding_category, severity,
    title, observation, root_cause, risk_impact, regulatory_criterion, required_action,
    recommendation, confidentiality, status, source_kind,
    assessment_id, assessment_dimension_id, attention_id, plan_id, intervention_id,
    examination_id, workpaper_id, signal_id, evidence_document_id, evidence_refs,
    owner_id, team_id, due_date, origin_provenance, created_by)
  VALUES (
    public.supervisory_finding_reference(_domain), _entity, _domain,
    NULLIF(_payload->>'regulator_id','')::uuid, NULLIF(_payload->>'sector_id','')::uuid,
    _payload->>'finding_category', _sev,
    COALESCE(_payload->>'title','Untitled finding'),
    _payload->>'observation', _payload->>'root_cause', _payload->>'risk_impact',
    _payload->>'regulatory_criterion', _payload->>'required_action', _payload->>'recommendation',
    COALESCE(upper(_payload->>'confidentiality'),'STANDARD'), 'DRAFT',
    COALESCE(upper(_payload->>'source_kind'), CASE WHEN _exam IS NOT NULL THEN 'EXAMINATION' ELSE 'ASSESSMENT' END),
    _assess, _dim,
    NULLIF(_payload->>'attention_id','')::uuid, NULLIF(_payload->>'plan_id','')::uuid,
    NULLIF(_payload->>'intervention_id','')::uuid, _exam, _wp,
    NULLIF(_payload->>'signal_id','')::uuid, NULLIF(_payload->>'evidence_document_id','')::uuid,
    COALESCE(_payload->'evidence_refs','[]'::jsonb),
    NULLIF(_payload->>'owner_id','')::uuid, NULLIF(_payload->>'team_id','')::uuid,
    NULLIF(_payload->>'due_date','')::date, 'GOVERNED', _uid)
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_finding_event(finding_id, event_type, to_status, rationale, actor_id, detail)
  VALUES (_id, 'CREATED', 'DRAFT', 'Finding raised', _uid,
          jsonb_build_object('severity', _sev, 'source_kind', COALESCE(upper(_payload->>'source_kind'),'')));

  PERFORM public.log_compliance_audit('CREATE','supervisory_finding', _id, NULL,
    jsonb_build_object('severity',_sev,'domain',_domain,'entity_id',_entity), 'Supervisory finding raised');

  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_finding_update(
  _finding_id uuid, _patch jsonb, _rationale text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _row public.supervisory_finding; _new_sev text;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.finding_manage',
            'supervisory_spine.edit','prudential_supervision.manage_remediation',
            'market_conduct.approve','inspection_management.edit']);
  SELECT * INTO _row FROM public.supervisory_finding WHERE id = _finding_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: finding' USING ERRCODE='22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _row.entity_id);
  IF _row.status IN ('CLOSED','WITHDRAWN','SUPERSEDED') THEN
    RAISE EXCEPTION 'finding_not_editable: %', _row.status USING ERRCODE='22023'; END IF;

  _new_sev := upper(COALESCE(_patch->>'severity', _row.severity));
  IF _new_sev <> _row.severity AND length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a severity change requires a rationale of at least 10 characters' USING ERRCODE='22023'; END IF;

  UPDATE public.supervisory_finding SET
    title = COALESCE(_patch->>'title', title),
    finding_category = COALESCE(_patch->>'finding_category', finding_category),
    severity = _new_sev,
    observation = COALESCE(_patch->>'observation', observation),
    root_cause = COALESCE(_patch->>'root_cause', root_cause),
    risk_impact = COALESCE(_patch->>'risk_impact', risk_impact),
    regulatory_criterion = COALESCE(_patch->>'regulatory_criterion', regulatory_criterion),
    required_action = COALESCE(_patch->>'required_action', required_action),
    recommendation = COALESCE(_patch->>'recommendation', recommendation),
    confidentiality = COALESCE(upper(_patch->>'confidentiality'), confidentiality),
    owner_id = COALESCE(NULLIF(_patch->>'owner_id','')::uuid, owner_id),
    team_id = COALESCE(NULLIF(_patch->>'team_id','')::uuid, team_id),
    due_date = COALESCE(NULLIF(_patch->>'due_date','')::date, due_date),
    evidence_refs = COALESCE(_patch->'evidence_refs', evidence_refs),
    updated_at = now()
  WHERE id = _finding_id;

  IF _new_sev <> _row.severity THEN
    INSERT INTO public.supervisory_finding_event(finding_id, event_type, rationale, actor_id, detail)
    VALUES (_finding_id, 'SEVERITY_CHANGE', btrim(_rationale), _uid,
            jsonb_build_object('from', _row.severity, 'to', _new_sev));
    PERFORM public.log_compliance_audit('UPDATE','supervisory_finding', _finding_id,
      jsonb_build_object('severity',_row.severity), jsonb_build_object('severity',_new_sev),
      'Finding severity changed');
  ELSE
    INSERT INTO public.supervisory_finding_event(finding_id, event_type, rationale, actor_id, detail)
    VALUES (_finding_id, 'UPDATED', btrim(COALESCE(_rationale,'')), _uid, _patch);
  END IF;
  RETURN _finding_id;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_finding_lifecycle(
  _finding_id uuid, _to_status text, _rationale text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _row public.supervisory_finding; _to text; _allowed boolean; _material boolean;
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

  -- maker/checker on material findings
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
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_finding_response(
  _finding_id uuid, _response_state text, _management_response text,
  _proposed_action text DEFAULT NULL, _responsible_person text DEFAULT NULL,
  _target_date date DEFAULT NULL, _attachments jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _row public.supervisory_finding; _state text; _internal boolean;
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

  -- either the regulated entity's own users, or an internal officer recording it
  _internal := public.is_super_admin(_uid) OR public.has_any_permission(_uid, ARRAY[
      'aml_supervision.finding_manage','supervisory_spine.edit',
      'prudential_supervision.manage_remediation','inspection_management.edit']);
  IF NOT _internal AND NOT public.user_has_entity_assignment(_uid, _row.entity_id) THEN
    RAISE EXCEPTION 'not_authorized: you may only respond to findings for your own entity' USING ERRCODE='42501'; END IF;

  UPDATE public.supervisory_finding SET
    response_state = _state,
    management_response = btrim(_management_response),
    proposed_action = COALESCE(_proposed_action, proposed_action),
    responsible_person = COALESCE(_responsible_person, responsible_person),
    response_target_date = COALESCE(_target_date, response_target_date),
    response_attachments = COALESCE(_attachments, response_attachments),
    response_by = _uid,
    response_at = now(),
    status = CASE WHEN status = 'ISSUED' THEN 'MANAGEMENT_RESPONSE' ELSE status END,
    updated_at = now()
  WHERE id = _finding_id;

  INSERT INTO public.supervisory_finding_event(finding_id, event_type, from_status, to_status, rationale, actor_id, detail)
  VALUES (_finding_id, 'MANAGEMENT_RESPONSE', _row.status, 'MANAGEMENT_RESPONSE',
          btrim(_management_response), _uid,
          jsonb_build_object('response_state', _state, 'internal_recorder', _internal));
  RETURN _finding_id;
END $$;

-- ---------- remediation operations
CREATE OR REPLACE FUNCTION public.supervisory_remediation_open(
  _finding_id uuid, _description text, _required_outcome text DEFAULT NULL,
  _owner_id uuid DEFAULT NULL, _responsible_party text DEFAULT NULL, _target_date date DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _row public.supervisory_finding; _id uuid;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.remediation_manage',
            'supervisory_spine.edit','prudential_supervision.manage_remediation',
            'market_conduct.approve','inspection_management.edit']);
  SELECT * INTO _row FROM public.supervisory_finding WHERE id = _finding_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: finding' USING ERRCODE='22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _row.entity_id);
  IF _row.status NOT IN ('ISSUED','MANAGEMENT_RESPONSE','REMEDIATION_REQUIRED','REOPENED') THEN
    RAISE EXCEPTION 'remediation_not_open: finding is %', _row.status USING ERRCODE='22023'; END IF;
  IF length(btrim(COALESCE(_description,''))) < 10 THEN
    RAISE EXCEPTION 'a corrective action description of at least 10 characters is required' USING ERRCODE='22023'; END IF;

  INSERT INTO public.supervisory_remediation_action(
    reference, finding_id, entity_id, domain_code, description, required_outcome,
    owner_id, responsible_party, target_date, status, created_by)
  VALUES ('RA-' || to_char(current_date,'YYYY') || '-'
            || lpad(nextval('public.supervisory_remediation_seq')::text, 5, '0'),
          _finding_id, _row.entity_id, _row.domain_code, btrim(_description), _required_outcome,
          _owner_id, _responsible_party, _target_date, 'OPEN', _uid)
  RETURNING id INTO _id;

  IF _row.status IN ('ISSUED','MANAGEMENT_RESPONSE') THEN
    UPDATE public.supervisory_finding SET status = 'REMEDIATION_REQUIRED', updated_at = now()
     WHERE id = _finding_id;
    INSERT INTO public.supervisory_finding_event(finding_id, event_type, from_status, to_status, rationale, actor_id)
    VALUES (_finding_id, 'STATUS_CHANGE', _row.status, 'REMEDIATION_REQUIRED',
            'Corrective action required', _uid);
  END IF;

  INSERT INTO public.supervisory_remediation_event(action_id, event_type, to_status, rationale, actor_id)
  VALUES (_id, 'CREATED', 'OPEN', 'Corrective action opened', _uid);

  PERFORM public.log_compliance_audit('CREATE','supervisory_remediation_action', _id, NULL,
    jsonb_build_object('finding_id',_finding_id), 'Corrective action opened');
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_remediation_transition(
  _action_id uuid, _to_status text, _rationale text DEFAULT NULL,
  _entity_response text DEFAULT NULL, _evidence jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

  -- validation conclusions are recorded only by the governed validation operation
  IF _to IN ('EFFECTIVE','PARTIALLY_EFFECTIVE','INEFFECTIVE')
     AND current_setting('app.supervisory_validation_writer', true) IS DISTINCT FROM 'validation' THEN
    RAISE EXCEPTION 'validation_required: use supervisory_remediation_validate to conclude effectiveness'
      USING ERRCODE='22023'; END IF;

  IF _to = 'CLOSED' AND _row.status = 'EFFECTIVE' IS NOT TRUE AND _to = 'CLOSED' THEN
    IF _row.status NOT IN ('EFFECTIVE','PARTIALLY_EFFECTIVE') THEN
      RAISE EXCEPTION 'closure_blocked: remediation must be validated before closure' USING ERRCODE='22023';
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
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_remediation_validate(
  _action_id uuid, _conclusion text, _evidence_reviewed text, _procedure_applied text,
  _rationale text, _next_step text DEFAULT NULL, _workpaper_id uuid DEFAULT NULL,
  _document_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _row public.supervisory_remediation_action; _f public.supervisory_finding;
        _c text; _vid uuid;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.remediation_manage',
            'aml_supervision.approve','supervisory_spine.approve',
            'prudential_supervision.manage_remediation','market_conduct.approve',
            'inspection_management.edit']);
  SELECT * INTO _row FROM public.supervisory_remediation_action WHERE id = _action_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: remediation action' USING ERRCODE='22023'; END IF;
  SELECT * INTO _f FROM public.supervisory_finding WHERE id = _row.finding_id;
  PERFORM public.supervisory_entity_scope_check(_uid, _row.entity_id);

  _c := upper(COALESCE(_conclusion,''));
  IF _c NOT IN ('EFFECTIVE','PARTIALLY_EFFECTIVE','INEFFECTIVE') THEN
    RAISE EXCEPTION 'invalid_conclusion: %', _c USING ERRCODE='22023'; END IF;
  IF _row.status <> 'VALIDATION' THEN
    RAISE EXCEPTION 'validation_not_open: remediation is %', _row.status USING ERRCODE='22023'; END IF;
  IF length(btrim(COALESCE(_evidence_reviewed,''))) < 5 OR length(btrim(COALESCE(_procedure_applied,''))) < 5
     OR length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'validation requires the evidence reviewed, the procedure applied and a rationale'
      USING ERRCODE='22023'; END IF;
  -- the entity's own action owner may not validate their own remediation
  IF NOT public.is_super_admin(_uid) AND _row.created_by IS NOT NULL AND _row.owner_id = _uid
     AND _f.severity IN ('HIGH','CRITICAL') THEN
    RAISE EXCEPTION 'not_authorized: the remediation owner cannot validate a high or critical action'
      USING ERRCODE='42501'; END IF;

  INSERT INTO public.supervisory_remediation_validation(
    action_id, finding_id, evidence_reviewed, procedure_applied, conclusion, rationale,
    next_step, workpaper_id, document_id, validated_by)
  VALUES (_action_id, _row.finding_id, btrim(_evidence_reviewed), btrim(_procedure_applied),
          _c, btrim(_rationale), _next_step, _workpaper_id, _document_id, _uid)
  RETURNING id INTO _vid;

  PERFORM set_config('app.supervisory_validation_writer','validation', true);
  PERFORM public.supervisory_remediation_transition(_action_id, _c,
    'Validation concluded: ' || _c || ' — ' || btrim(_rationale));
  PERFORM set_config('app.supervisory_validation_writer','', true);

  UPDATE public.supervisory_remediation_action
     SET effectiveness = _c, updated_at = now() WHERE id = _action_id;
  UPDATE public.supervisory_finding
     SET validation_conclusion = _c,
         status = CASE WHEN status IN ('REMEDIATION_REQUIRED','REOPENED') THEN 'VALIDATION' ELSE status END,
         updated_at = now()
   WHERE id = _row.finding_id;

  INSERT INTO public.supervisory_finding_event(finding_id, event_type, rationale, actor_id, detail)
  VALUES (_row.finding_id, 'VALIDATION', btrim(_rationale), _uid,
          jsonb_build_object('action_id',_action_id,'conclusion',_c,'validation_id',_vid));

  RETURN jsonb_build_object('validation_id',_vid,'action_id',_action_id,'conclusion',_c);
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_remediation_escalate(
  _action_id uuid, _reason text, _materiality text DEFAULT 'high', _urgency text DEFAULT 'high'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _row public.supervisory_remediation_action; _f public.supervisory_finding;
        _attention uuid; _overdue boolean;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.remediation_manage',
            'supervisory_spine.edit','prudential_supervision.manage_remediation',
            'market_conduct.approve']);
  SELECT * INTO _row FROM public.supervisory_remediation_action WHERE id = _action_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: remediation action' USING ERRCODE='22023'; END IF;
  SELECT * INTO _f FROM public.supervisory_finding WHERE id = _row.finding_id;
  PERFORM public.supervisory_entity_scope_check(_uid, _row.entity_id);
  IF length(btrim(COALESCE(_reason,''))) < 20 THEN
    RAISE EXCEPTION 'an escalation basis of at least 20 characters is required' USING ERRCODE='22023'; END IF;

  _overdue := _row.target_date IS NOT NULL AND _row.target_date < current_date
              AND _row.status NOT IN ('EFFECTIVE','CLOSED');
  IF NOT _overdue AND _row.status NOT IN ('INEFFECTIVE','PARTIALLY_EFFECTIVE','REOPENED') THEN
    RAISE EXCEPTION 'escalation_not_available: the action is neither materially overdue nor ineffective'
      USING ERRCODE='22023'; END IF;

  -- governed escalation opportunity only: a supervisor still decides the response
  _attention := public.supervisory_attention_open(
    _title := 'Unresolved remediation: ' || _f.reference || ' (' || _row.reference || ')',
    _domain_code := _row.domain_code,
    _supervisory_basis := btrim(_reason),
    _origin_kind := 'UNRESOLVED_REMEDIATION',
    _entity_ids := ARRAY[_row.entity_id],
    _assessment_id := _f.assessment_id,
    _assessment_dimension_id := _f.assessment_dimension_id,
    _examination_id := _f.examination_id,
    _external_reference := _row.reference,
    _materiality := lower(_materiality),
    _urgency := lower(_urgency));

  UPDATE public.supervisory_remediation_action
     SET escalated_attention_id = _attention, escalated_at = now(),
         escalation_reason = btrim(_reason), updated_at = now()
   WHERE id = _action_id;

  INSERT INTO public.supervisory_remediation_event(action_id, event_type, rationale, actor_id, detail)
  VALUES (_action_id, 'ESCALATED', btrim(_reason), _uid,
          jsonb_build_object('attention_id', _attention, 'overdue', _overdue));

  RETURN _attention;
END $$;

REVOKE ALL ON FUNCTION public.supervisory_finding_create(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_finding_update(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_finding_lifecycle(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_finding_response(uuid, text, text, text, text, date, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_finding_reference(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_finding_can_read(public.supervisory_finding) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_remediation_open(uuid, text, text, uuid, text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_remediation_transition(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_remediation_validate(uuid, text, text, text, text, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_remediation_escalate(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_finding_create(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_finding_update(uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_finding_lifecycle(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_finding_response(uuid, text, text, text, text, date, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_finding_reference(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_finding_can_read(public.supervisory_finding) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_remediation_open(uuid, text, text, uuid, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_remediation_transition(uuid, text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_remediation_validate(uuid, text, text, text, text, text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_remediation_escalate(uuid, text, text, text) TO authenticated, service_role;

-- ------------------------------------------------- 5. legacy convergence
ALTER TABLE public.examination_findings
  ADD COLUMN IF NOT EXISTS supervisory_finding_id uuid REFERENCES public.supervisory_finding(id);
ALTER TABLE public.conduct_findings
  ADD COLUMN IF NOT EXISTS supervisory_finding_id uuid REFERENCES public.supervisory_finding(id);
ALTER TABLE public.aml_findings
  ADD COLUMN IF NOT EXISTS supervisory_finding_id uuid REFERENCES public.supervisory_finding(id);
ALTER TABLE public.inspection_findings
  ADD COLUMN IF NOT EXISTS supervisory_finding_id uuid REFERENCES public.supervisory_finding(id);

-- deterministic backfill of examination findings
DO $$
DECLARE _r record; _new uuid;
BEGIN
  FOR _r IN
    SELECT ef.*, e.entity_id, COALESCE(e.domain_code,'PRUDENTIAL') AS dom, e.regulator_id, e.sector_id
      FROM public.examination_findings ef
      JOIN public.examinations e ON e.id = ef.examination_id
     WHERE ef.supervisory_finding_id IS NULL
  LOOP
    INSERT INTO public.supervisory_finding(
      reference, entity_id, domain_code, regulator_id, sector_id, finding_category, severity,
      title, observation, root_cause, regulatory_criterion, recommendation,
      status, source_kind, examination_id, workpaper_id, due_date,
      management_response, closed_at, closed_by,
      legacy_source_table, legacy_source_id, origin_provenance, created_by, created_at)
    VALUES (
      COALESCE(NULLIF(_r.reference,''), public.supervisory_finding_reference(_r.dom)),
      _r.entity_id, _r.dom, _r.regulator_id, _r.sector_id, _r.category,
      CASE upper(COALESCE(_r.severity,'MEDIUM'))
        WHEN 'LOW' THEN 'LOW' WHEN 'MEDIUM' THEN 'MEDIUM'
        WHEN 'HIGH' THEN 'HIGH' WHEN 'CRITICAL' THEN 'CRITICAL'
        WHEN 'MATERIAL' THEN 'HIGH' ELSE 'MEDIUM' END,
      _r.title, _r.observation, _r.root_cause, _r.criteria_breached, _r.recommendation,
      CASE upper(COALESCE(_r.status,'DRAFT'))
        WHEN 'CLOSED' THEN 'CLOSED' WHEN 'OPEN' THEN 'ISSUED'
        WHEN 'ISSUED' THEN 'ISSUED' WHEN 'DRAFT' THEN 'DRAFT'
        WHEN 'REMEDIATION' THEN 'REMEDIATION_REQUIRED' ELSE 'ISSUED' END,
      'EXAMINATION', _r.examination_id, _r.workpaper_id, _r.target_date,
      _r.entity_response, _r.closed_at, _r.closed_by,
      'examination_findings', _r.id, 'BACKFILL_DETERMINISTIC', _r.created_by, _r.created_at)
    RETURNING id INTO _new;

    UPDATE public.examination_findings SET supervisory_finding_id = _new WHERE id = _r.id;

    INSERT INTO public.supervisory_finding_event(finding_id, event_type, to_status, rationale, actor_id, detail)
    VALUES (_new, 'BACKFILL', NULL, 'Converged from examination_findings', NULL,
            jsonb_build_object('legacy_table','examination_findings','legacy_id',_r.id));
  END LOOP;
END $$;

-- deterministic backfill of conduct findings
DO $$
DECLARE _r record; _new uuid; _entity uuid; _has_entity boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='conduct_findings' AND column_name='entity_id')
    INTO _has_entity;
  IF NOT _has_entity THEN RETURN; END IF;

  FOR _r IN EXECUTE
    'SELECT id, entity_id, title, description, severity, status, created_at, created_by,
            investigation_id
       FROM public.conduct_findings WHERE supervisory_finding_id IS NULL AND entity_id IS NOT NULL'
  LOOP
    INSERT INTO public.supervisory_finding(
      reference, entity_id, domain_code, severity, title, observation, status,
      source_kind, legacy_source_table, legacy_source_id, origin_provenance, created_by, created_at)
    VALUES (public.supervisory_finding_reference('MARKET_CONDUCT'), _r.entity_id, 'MARKET_CONDUCT',
      CASE upper(COALESCE(_r.severity,'MEDIUM'))
        WHEN 'LOW' THEN 'LOW' WHEN 'MEDIUM' THEN 'MEDIUM'
        WHEN 'HIGH' THEN 'HIGH' WHEN 'CRITICAL' THEN 'CRITICAL' ELSE 'MEDIUM' END,
      COALESCE(_r.title,'Conduct finding'), _r.description,
      CASE upper(COALESCE(_r.status,'ISSUED'))
        WHEN 'CLOSED' THEN 'CLOSED' WHEN 'DRAFT' THEN 'DRAFT' ELSE 'ISSUED' END,
      'INVESTIGATION', 'conduct_findings', _r.id, 'BACKFILL_DETERMINISTIC', _r.created_by, _r.created_at)
    RETURNING id INTO _new;

    UPDATE public.conduct_findings SET supervisory_finding_id = _new WHERE id = _r.id;

    INSERT INTO public.supervisory_finding_event(finding_id, event_type, rationale, actor_id, detail)
    VALUES (_new, 'BACKFILL', 'Converged from conduct_findings', NULL,
            jsonb_build_object('legacy_table','conduct_findings','legacy_id',_r.id));
  END LOOP;
END $$;

-- write-block the empty duplicate finding stores
CREATE OR REPLACE FUNCTION public.legacy_finding_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF current_setting('app.legacy_finding_writer', true) = 'converged' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  RAISE EXCEPTION
    '% is retired for new writes: raise findings through supervisory_finding_create', TG_TABLE_NAME
    USING ERRCODE = '42501';
END $$;

REVOKE ALL ON FUNCTION public.legacy_finding_write_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS aml_findings_legacy_write_guard ON public.aml_findings;
CREATE TRIGGER aml_findings_legacy_write_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.aml_findings
  FOR EACH ROW EXECUTE FUNCTION public.legacy_finding_write_guard();

DROP TRIGGER IF EXISTS inspection_findings_legacy_write_guard ON public.inspection_findings;
CREATE TRIGGER inspection_findings_legacy_write_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.inspection_findings
  FOR EACH ROW EXECUTE FUNCTION public.legacy_finding_write_guard();

-- ------------------------------------------------- 6. enforcement linkage
ALTER TABLE public.enforcement_actions
  ADD COLUMN IF NOT EXISTS supervisory_finding_id uuid REFERENCES public.supervisory_finding(id),
  ADD COLUMN IF NOT EXISTS remediation_action_id uuid REFERENCES public.supervisory_remediation_action(id),
  ADD COLUMN IF NOT EXISTS supervisory_assessment_id uuid REFERENCES public.supervisory_assessment(id),
  ADD COLUMN IF NOT EXISTS remediation_bypass_reason text;

CREATE INDEX IF NOT EXISTS idx_enforcement_actions_finding ON public.enforcement_actions(supervisory_finding_id);