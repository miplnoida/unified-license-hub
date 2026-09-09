-- =====================================================================
-- AML-05: governed evidence basis, structured facts, server readiness
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Evidence basis type catalogue (provider-neutral, reuse-first)
-- ---------------------------------------------------------------------
CREATE TABLE public.supervisory_evidence_basis_type (
  code                   text PRIMARY KEY,
  label                  text NOT NULL,
  description            text,
  source_table           text,
  reference_column       text,
  entity_column          text,
  requires_source_object boolean NOT NULL DEFAULT false,
  active                 boolean NOT NULL DEFAULT true,
  sort_order             integer NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.supervisory_evidence_basis_type TO authenticated;
GRANT ALL ON public.supervisory_evidence_basis_type TO service_role;
ALTER TABLE public.supervisory_evidence_basis_type ENABLE ROW LEVEL SECURITY;
CREATE POLICY "evidence basis types are readable by signed-in staff"
  ON public.supervisory_evidence_basis_type FOR SELECT TO authenticated USING (true);

INSERT INTO public.supervisory_evidence_basis_type
  (code, label, description, source_table, reference_column, entity_column, requires_source_object, sort_order)
VALUES
  ('ENTERPRISE_DOCUMENT','Registered document','A document already registered in the central document register.','document_groups','document_reference','primary_entity_id',true,10),
  ('REGULATORY_RETURN','Regulatory return','A submitted regulatory return or filing held by the platform.','return_filings','filing_reference','entity_id',true,20),
  ('PRIOR_EXAMINATION','Prior examination','An examination record already held by the platform.','examinations','reference','entity_id',true,30),
  ('FINDING','Supervisory finding','An existing supervisory finding record.','supervisory_finding','reference','entity_id',true,40),
  ('REMEDIATION_RECORD','Remediation record','An existing remediation action record.','supervisory_remediation_action','reference','entity_id',true,50),
  ('WORKPAPER','Examination workpaper','A governed examination workpaper.','examination_workpapers','reference',NULL,true,60),
  ('RFI_RESPONSE','Request for information response','A response received through a governed request for information.',NULL,NULL,NULL,false,70),
  ('SYSTEM_FACT','System fact','A value derived from platform data, recorded with its source and retrieval time.',NULL,NULL,NULL,false,80),
  ('STRUCTURED_METRIC','Structured metric','A structured supervisory metric with a stated basis and period.',NULL,NULL,NULL,false,90),
  ('SUPERVISORY_SAMPLE','Supervisory sample','A sample tested by the officer, described by population, basis and period.',NULL,NULL,NULL,false,100),
  ('AUTHORISED_EXTERNAL_SOURCE','Authorised external source','An external source the regulator is authorised to rely on, recorded with citation and retrieval time.',NULL,NULL,NULL,false,110);

-- ---------------------------------------------------------------------
-- 2. Assessment evidence basis + reusable links
-- ---------------------------------------------------------------------
CREATE TABLE public.supervisory_assessment_evidence_basis (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id      uuid NOT NULL REFERENCES public.supervisory_assessment(id) ON DELETE CASCADE,
  entity_id          uuid,
  methodology_id     uuid,
  evidence_type      text NOT NULL REFERENCES public.supervisory_evidence_basis_type(code),
  source_object_type text,
  source_object_id   uuid,
  source_reference   text,
  source_version     text,
  title              text,
  note               text,
  period_start       date,
  period_end         date,
  as_of_date         date,
  retrieved_at       timestamptz,
  source_timestamp   timestamptz,
  confidentiality    text,
  provenance         jsonb NOT NULL DEFAULT '{}'::jsonb,
  origin             text NOT NULL DEFAULT 'OFFICER_LINKED',
  recorded_by        uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX supervisory_assessment_evidence_basis_dedupe
  ON public.supervisory_assessment_evidence_basis
  (assessment_id, evidence_type, COALESCE(source_object_id::text, lower(btrim(COALESCE(source_reference,'')))));
CREATE INDEX supervisory_assessment_evidence_basis_assessment
  ON public.supervisory_assessment_evidence_basis (assessment_id);

CREATE TABLE public.supervisory_assessment_question_evidence (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id            uuid NOT NULL REFERENCES public.supervisory_assessment_evidence_basis(id) ON DELETE CASCADE,
  assessment_id          uuid NOT NULL REFERENCES public.supervisory_assessment(id) ON DELETE CASCADE,
  methodology_question_id uuid NOT NULL REFERENCES public.supervisory_methodology_question(id),
  question_code          text,
  relevance_note         text,
  linked_by              uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evidence_id, methodology_question_id)
);
CREATE INDEX supervisory_assessment_question_evidence_q
  ON public.supervisory_assessment_question_evidence (assessment_id, methodology_question_id);

CREATE TABLE public.supervisory_assessment_dimension_evidence (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id             uuid NOT NULL REFERENCES public.supervisory_assessment_evidence_basis(id) ON DELETE CASCADE,
  assessment_id           uuid NOT NULL REFERENCES public.supervisory_assessment(id) ON DELETE CASCADE,
  methodology_dimension_id uuid NOT NULL REFERENCES public.supervisory_methodology_dimension(id),
  dimension_code          text,
  relevance_note          text,
  linked_by               uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evidence_id, methodology_dimension_id)
);
CREATE INDEX supervisory_assessment_dimension_evidence_d
  ON public.supervisory_assessment_dimension_evidence (assessment_id, methodology_dimension_id);

-- EV-04: a link may never cross assessments
CREATE OR REPLACE FUNCTION public.supervisory_assessment_evidence_link_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _ev_assessment uuid;
BEGIN
  SELECT assessment_id INTO _ev_assessment
    FROM public.supervisory_assessment_evidence_basis WHERE id = NEW.evidence_id;
  IF _ev_assessment IS NULL THEN
    RAISE EXCEPTION 'not_found: evidence basis' USING ERRCODE = '22023';
  END IF;
  IF _ev_assessment <> NEW.assessment_id THEN
    RAISE EXCEPTION 'cross_assessment_evidence: evidence basis belongs to a different assessment'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER supervisory_assessment_question_evidence_guard
  BEFORE INSERT OR UPDATE ON public.supervisory_assessment_question_evidence
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_assessment_evidence_link_guard();
CREATE TRIGGER supervisory_assessment_dimension_evidence_guard
  BEFORE INSERT OR UPDATE ON public.supervisory_assessment_dimension_evidence
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_assessment_evidence_link_guard();

-- ---------------------------------------------------------------------
-- 3. Structured assessment facts
-- ---------------------------------------------------------------------
CREATE TABLE public.supervisory_assessment_fact (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id        uuid NOT NULL REFERENCES public.supervisory_assessment(id) ON DELETE CASCADE,
  entity_id            uuid,
  methodology_id       uuid,
  fact_requirement_id  uuid REFERENCES public.supervisory_methodology_fact_requirement(id),
  fact_code            text NOT NULL,
  data_type            text NOT NULL,
  unit                 text,
  value_numeric        numeric,
  value_text           text,
  value_date           date,
  value_boolean        boolean,
  numerator            numeric,
  denominator          numeric,
  period_start         date,
  period_end           date,
  as_of_date           date,
  source_type          text NOT NULL,
  source_reference     text,
  source_object_type   text,
  source_object_id     uuid,
  source_timestamp     timestamptz,
  extraction_timestamp timestamptz,
  auto_prefilled       boolean NOT NULL DEFAULT false,
  system_value         jsonb,
  officer_overridden   boolean NOT NULL DEFAULT false,
  override_reason      text,
  overridden_by        uuid,
  overridden_at        timestamptz,
  provenance           jsonb NOT NULL DEFAULT '{}'::jsonb,
  note                 text,
  recorded_by          uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, fact_code)
);
CREATE INDEX supervisory_assessment_fact_assessment ON public.supervisory_assessment_fact (assessment_id);

-- ---------------------------------------------------------------------
-- 4. Access: read-only to authorised readers, no direct client writes
-- ---------------------------------------------------------------------
GRANT SELECT ON public.supervisory_assessment_evidence_basis TO authenticated;
GRANT SELECT ON public.supervisory_assessment_question_evidence TO authenticated;
GRANT SELECT ON public.supervisory_assessment_dimension_evidence TO authenticated;
GRANT SELECT ON public.supervisory_assessment_fact TO authenticated;
GRANT ALL ON public.supervisory_assessment_evidence_basis TO service_role;
GRANT ALL ON public.supervisory_assessment_question_evidence TO service_role;
GRANT ALL ON public.supervisory_assessment_dimension_evidence TO service_role;
GRANT ALL ON public.supervisory_assessment_fact TO service_role;

ALTER TABLE public.supervisory_assessment_evidence_basis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisory_assessment_question_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisory_assessment_dimension_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisory_assessment_fact ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evidence basis readable within assessment authority"
  ON public.supervisory_assessment_evidence_basis FOR SELECT TO authenticated
  USING (public.supervisory_assessment_question_readable(auth.uid(), assessment_id));
CREATE POLICY "question evidence links readable within assessment authority"
  ON public.supervisory_assessment_question_evidence FOR SELECT TO authenticated
  USING (public.supervisory_assessment_question_readable(auth.uid(), assessment_id));
CREATE POLICY "dimension evidence links readable within assessment authority"
  ON public.supervisory_assessment_dimension_evidence FOR SELECT TO authenticated
  USING (public.supervisory_assessment_question_readable(auth.uid(), assessment_id));
CREATE POLICY "assessment facts readable within assessment authority"
  ON public.supervisory_assessment_fact FOR SELECT TO authenticated
  USING (public.supervisory_assessment_question_readable(auth.uid(), assessment_id));

-- ---------------------------------------------------------------------
-- 5. Shared helpers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_execution_require_edit(_assessment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _actions text[];
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;

  _actions := public.supervisory_domain_actions(_a.domain_code, 'edit');
  IF NOT public.is_super_admin(_uid) AND NOT public.has_any_permission(_uid, _actions) THEN
    RAISE EXCEPTION 'not_authorized: % required', array_to_string(_actions, ' or ')
      USING ERRCODE = '42501';
  END IF;
  IF _a.status NOT IN ('draft','returned_for_revision') THEN
    RAISE EXCEPTION 'assessment is not editable in status %', _a.status USING ERRCODE = '55000';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);
  RETURN _uid;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_execution_require_edit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_execution_require_edit(uuid) TO authenticated;

-- Does a governed source record exist, and may this user see it?
CREATE OR REPLACE FUNCTION public.supervisory_evidence_source_resolve(
  _uid uuid, _evidence_type text, _source_object_id uuid, _entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _t public.supervisory_evidence_basis_type; _exists boolean := false;
        _readable boolean := false; _ref text; _sql text; _row_entity uuid;
BEGIN
  SELECT * INTO _t FROM public.supervisory_evidence_basis_type WHERE code = _evidence_type AND active;
  IF _t.code IS NULL THEN
    RETURN jsonb_build_object('known_type', false, 'resolves', false, 'readable', false);
  END IF;
  IF _t.source_table IS NULL OR _source_object_id IS NULL THEN
    RETURN jsonb_build_object('known_type', true, 'requires_source_object', _t.requires_source_object,
      'resolves', NOT _t.requires_source_object, 'readable', NOT _t.requires_source_object,
      'source_table', _t.source_table);
  END IF;

  _sql := format('SELECT true, %s, %s FROM public.%I WHERE id = $1',
    CASE WHEN _t.reference_column IS NULL THEN 'NULL::text'
         ELSE format('%I::text', _t.reference_column) END,
    CASE WHEN _t.entity_column IS NULL THEN 'NULL::uuid'
         ELSE format('%I::uuid', _t.entity_column) END,
    _t.source_table);
  EXECUTE _sql INTO _exists, _ref, _row_entity USING _source_object_id;
  _exists := COALESCE(_exists, false);

  IF _exists THEN
    IF _t.code = 'ENTERPRISE_DOCUMENT' THEN
      -- never widen document visibility: the register's own rule decides
      _readable := COALESCE(public.dms_can_view_document(_source_object_id), false);
    ELSIF _t.entity_column IS NULL THEN
      _readable := true;
    ELSE
      -- a governed supervisory source must belong to the assessment's own entity
      _readable := (_row_entity IS NOT NULL AND _entity_id IS NOT NULL AND _row_entity = _entity_id);
    END IF;
  END IF;

  RETURN jsonb_build_object('known_type', true, 'requires_source_object', _t.requires_source_object,
    'resolves', _exists, 'readable', _readable, 'source_reference', _ref,
    'source_table', _t.source_table, 'source_entity_id', _row_entity);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_evidence_source_resolve(uuid,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_evidence_source_resolve(uuid,text,uuid,uuid) TO authenticated;

-- Governed evidence count for a question: canonical links plus preserved legacy refs
CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_evidence_count(
  _assessment_id uuid, _question_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT (SELECT count(*)::int FROM public.supervisory_assessment_question_evidence e
            WHERE e.assessment_id = _assessment_id AND e.methodology_question_id = _question_id)
       + (SELECT public.jsonb_array_len_safe(r.evidence_refs)
            FROM public.supervisory_assessment_question_response r
           WHERE r.assessment_id = _assessment_id AND r.methodology_question_id = _question_id);
$$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_question_evidence_count(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_question_evidence_count(uuid,uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 6. Governed writes
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_evidence_link(
  _assessment_id uuid, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _type text; _obj uuid; _ref text;
        _resolved jsonb; _q public.supervisory_methodology_question; _qid uuid; _did uuid;
        _md public.supervisory_methodology_dimension; _ev_id uuid; _pstate text; _allowed text[];
BEGIN
  _uid := public.supervisory_assessment_execution_require_edit(_assessment_id);
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;

  _type := upper(btrim(COALESCE(_payload->>'evidence_type','')));
  IF _type = '' THEN
    RAISE EXCEPTION 'validation_required: an evidence basis type is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_evidence_basis_type WHERE code = _type AND active) THEN
    RAISE EXCEPTION 'validation_required: % is not a permitted evidence basis type', _type USING ERRCODE = '22023';
  END IF;

  _obj := NULLIF(_payload->>'source_object_id','')::uuid;
  _ref := NULLIF(btrim(COALESCE(_payload->>'source_reference','')),'');
  _qid := NULLIF(_payload->>'methodology_question_id','')::uuid;
  _did := NULLIF(_payload->>'methodology_dimension_id','')::uuid;
  IF _qid IS NULL AND _did IS NULL THEN
    RAISE EXCEPTION 'validation_required: evidence must be linked to a question or a dimension'
      USING ERRCODE = '22023';
  END IF;

  _resolved := public.supervisory_evidence_source_resolve(_uid, _type, _obj, _a.entity_id);
  IF NOT (_resolved->>'resolves')::boolean THEN
    RAISE EXCEPTION 'validation_required: the evidence source could not be resolved as a governed record'
      USING ERRCODE = '22023';
  END IF;
  IF NOT (_resolved->>'readable')::boolean THEN
    RAISE EXCEPTION 'not_authorized: you are not authorised to use that source as evidence'
      USING ERRCODE = '42501';
  END IF;
  IF _obj IS NULL AND _ref IS NULL THEN
    RAISE EXCEPTION 'validation_required: a source reference is required for this evidence basis type'
      USING ERRCODE = '22023';
  END IF;

  IF _qid IS NOT NULL THEN
    SELECT * INTO _q FROM public.supervisory_methodology_question WHERE id = _qid;
    IF _q.id IS NULL THEN RAISE EXCEPTION 'not_found: methodology question' USING ERRCODE = '22023'; END IF;
    IF _a.methodology_id IS NOT NULL AND _q.methodology_id <> _a.methodology_id THEN
      RAISE EXCEPTION 'validation_required: the question does not belong to the methodology version attached to this assessment'
        USING ERRCODE = '22023';
    END IF;
    _pstate := public.supervisory_assessment_question_plan_state(_assessment_id, _qid);
    IF _pstate IS NOT NULL AND _pstate NOT LIKE 'INCLUDED%' THEN
      RAISE EXCEPTION 'question_not_in_scope: this question is % in the governed question plan and takes no evidence',
        lower(replace(_pstate,'_',' ')) USING ERRCODE = '42501';
    END IF;
    _allowed := _q.evidence_basis_types;
    IF _allowed IS NOT NULL AND array_length(_allowed,1) > 0 AND NOT (_type = ANY (_allowed)) THEN
      RAISE EXCEPTION 'validation_required: the methodology does not accept % evidence for question %',
        _type, _q.question_code USING ERRCODE = '22023';
    END IF;
  END IF;

  IF _did IS NOT NULL THEN
    SELECT * INTO _md FROM public.supervisory_methodology_dimension WHERE id = _did;
    IF _md.id IS NULL THEN RAISE EXCEPTION 'not_found: methodology dimension' USING ERRCODE = '22023'; END IF;
    IF _a.methodology_id IS NOT NULL AND _md.methodology_id <> _a.methodology_id THEN
      RAISE EXCEPTION 'validation_required: the dimension does not belong to the methodology version attached to this assessment'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- reuse: one governed evidence record per source within an assessment
  SELECT id INTO _ev_id FROM public.supervisory_assessment_evidence_basis
   WHERE assessment_id = _assessment_id AND evidence_type = _type
     AND COALESCE(source_object_id::text, lower(btrim(COALESCE(source_reference,''))))
         = COALESCE(_obj::text, lower(btrim(COALESCE(_ref,''))));

  IF _ev_id IS NULL THEN
    INSERT INTO public.supervisory_assessment_evidence_basis(
      assessment_id, entity_id, methodology_id, evidence_type, source_object_type, source_object_id,
      source_reference, source_version, title, note, period_start, period_end, as_of_date,
      retrieved_at, source_timestamp, confidentiality, provenance, origin, recorded_by)
    VALUES (_assessment_id, _a.entity_id, _a.methodology_id, _type,
      _resolved->>'source_table', _obj,
      COALESCE(_ref, _resolved->>'source_reference'),
      NULLIF(_payload->>'source_version',''),
      NULLIF(btrim(COALESCE(_payload->>'title','')),''),
      NULLIF(btrim(COALESCE(_payload->>'note','')),''),
      NULLIF(_payload->>'period_start','')::date,
      NULLIF(_payload->>'period_end','')::date,
      NULLIF(_payload->>'as_of_date','')::date,
      now(), NULLIF(_payload->>'source_timestamp','')::timestamptz,
      NULLIF(_payload->>'confidentiality',''),
      jsonb_build_object('recorded_by', _uid, 'recorded_at', now(),
        'source_resolution', _resolved, 'basis', COALESCE(_payload->>'provenance_basis','OFFICER_LINKED')),
      'OFFICER_LINKED', _uid)
    RETURNING id INTO _ev_id;
  ELSE
    UPDATE public.supervisory_assessment_evidence_basis
       SET note = COALESCE(NULLIF(btrim(COALESCE(_payload->>'note','')),''), note),
           updated_at = now()
     WHERE id = _ev_id;
  END IF;

  IF _qid IS NOT NULL THEN
    INSERT INTO public.supervisory_assessment_question_evidence(
      evidence_id, assessment_id, methodology_question_id, question_code, relevance_note, linked_by)
    VALUES (_ev_id, _assessment_id, _qid, _q.question_code,
      NULLIF(btrim(COALESCE(_payload->>'relevance_note','')),''), _uid)
    ON CONFLICT (evidence_id, methodology_question_id) DO UPDATE
      SET relevance_note = COALESCE(EXCLUDED.relevance_note,
            public.supervisory_assessment_question_evidence.relevance_note);
  END IF;
  IF _did IS NOT NULL THEN
    INSERT INTO public.supervisory_assessment_dimension_evidence(
      evidence_id, assessment_id, methodology_dimension_id, dimension_code, relevance_note, linked_by)
    VALUES (_ev_id, _assessment_id, _did, _md.dimension_code,
      NULLIF(btrim(COALESCE(_payload->>'relevance_note','')),''), _uid)
    ON CONFLICT (evidence_id, methodology_dimension_id) DO NOTHING;
  END IF;

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, rationale, detail, actor_id)
  VALUES (_assessment_id, 'EVIDENCE_LINKED',
    format('Linked %s evidence', _type),
    jsonb_build_object('evidence_id', _ev_id, 'evidence_type', _type,
      'question_id', _qid, 'dimension_id', _did, 'source_object_id', _obj), _uid);

  RETURN jsonb_build_object('evidence_id', _ev_id, 'evidence_type', _type,
    'assessment_id', _assessment_id, 'question_id', _qid, 'dimension_id', _did);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_evidence_link(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_evidence_link(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_evidence_unlink(
  _evidence_id uuid, _question_id uuid DEFAULT NULL, _dimension_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _ev public.supervisory_assessment_evidence_basis; _removed int := 0; _left int;
BEGIN
  SELECT * INTO _ev FROM public.supervisory_assessment_evidence_basis WHERE id = _evidence_id;
  IF _ev.id IS NULL THEN RAISE EXCEPTION 'not_found: evidence basis' USING ERRCODE = '22023'; END IF;
  _uid := public.supervisory_assessment_execution_require_edit(_ev.assessment_id);

  IF _question_id IS NOT NULL THEN
    DELETE FROM public.supervisory_assessment_question_evidence
     WHERE evidence_id = _evidence_id AND methodology_question_id = _question_id;
    _removed := _removed + 1;
  END IF;
  IF _dimension_id IS NOT NULL THEN
    DELETE FROM public.supervisory_assessment_dimension_evidence
     WHERE evidence_id = _evidence_id AND methodology_dimension_id = _dimension_id;
    _removed := _removed + 1;
  END IF;
  IF _question_id IS NULL AND _dimension_id IS NULL THEN
    DELETE FROM public.supervisory_assessment_question_evidence WHERE evidence_id = _evidence_id;
    DELETE FROM public.supervisory_assessment_dimension_evidence WHERE evidence_id = _evidence_id;
  END IF;

  SELECT (SELECT count(*) FROM public.supervisory_assessment_question_evidence WHERE evidence_id = _evidence_id)
       + (SELECT count(*) FROM public.supervisory_assessment_dimension_evidence WHERE evidence_id = _evidence_id)
    INTO _left;
  IF _left = 0 THEN
    DELETE FROM public.supervisory_assessment_evidence_basis WHERE id = _evidence_id;
  END IF;

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, rationale, detail, actor_id)
  VALUES (_ev.assessment_id, 'EVIDENCE_UNLINKED', 'Evidence link removed',
    jsonb_build_object('evidence_id', _evidence_id, 'question_id', _question_id,
      'dimension_id', _dimension_id, 'evidence_retained', _left > 0), _uid);

  RETURN jsonb_build_object('evidence_id', _evidence_id, 'links_remaining', _left);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_evidence_unlink(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_evidence_unlink(uuid,uuid,uuid) TO authenticated;

-- Fact writes -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_fact_typed_value(
  _data_type text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE _raw text; _dt text; _num numeric;
BEGIN
  _dt := lower(btrim(COALESCE(_data_type,'')));
  _raw := NULLIF(btrim(COALESCE(_payload->>'value','')),'');
  IF _raw IS NULL THEN
    RAISE EXCEPTION 'validation_required: a fact value is required' USING ERRCODE = '22023';
  END IF;

  IF _dt IN ('integer','whole_number') THEN
    BEGIN _num := _raw::numeric; EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'validation_required: % is not a whole number', _raw USING ERRCODE = '22023'; END;
    IF _num <> trunc(_num) THEN
      RAISE EXCEPTION 'validation_required: % is not a whole number', _raw USING ERRCODE = '22023'; END IF;
    RETURN jsonb_build_object('value_numeric', _num);
  ELSIF _dt IN ('decimal','number','numeric','currency','percentage','ratio','rate') THEN
    BEGIN _num := _raw::numeric; EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'validation_required: % is not a number', _raw USING ERRCODE = '22023'; END;
    IF _dt = 'percentage' AND (_num < 0 OR _num > 100) THEN
      RAISE EXCEPTION 'validation_required: a percentage must be between 0 and 100' USING ERRCODE = '22023'; END IF;
    RETURN jsonb_build_object('value_numeric', _num);
  ELSIF _dt = 'date' THEN
    BEGIN RETURN jsonb_build_object('value_date', _raw::date);
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'validation_required: % is not a date', _raw USING ERRCODE = '22023'; END;
  ELSIF _dt IN ('boolean','yes_no') THEN
    IF lower(_raw) NOT IN ('true','false','yes','no') THEN
      RAISE EXCEPTION 'validation_required: % is not a yes/no value', _raw USING ERRCODE = '22023'; END IF;
    RETURN jsonb_build_object('value_boolean', lower(_raw) IN ('true','yes'));
  ELSIF _dt IN ('text','category','string') THEN
    RETURN jsonb_build_object('value_text', _raw);
  END IF;
  RAISE EXCEPTION 'validation_required: % is not a supported fact data type', _data_type USING ERRCODE = '22023';
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_fact_set(
  _assessment_id uuid, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _a public.supervisory_assessment;
        _fr public.supervisory_methodology_fact_requirement;
        _typed jsonb; _src text; _auto boolean; _id uuid; _num numeric; _den numeric;
        _existing public.supervisory_assessment_fact; _sysval jsonb;
BEGIN
  _uid := public.supervisory_assessment_execution_require_edit(_assessment_id);
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;

  -- FACT-01: the requirement must come from the methodology version bound to this assessment
  IF NULLIF(_payload->>'fact_requirement_id','') IS NOT NULL THEN
    SELECT * INTO _fr FROM public.supervisory_methodology_fact_requirement
     WHERE id = (_payload->>'fact_requirement_id')::uuid;
  ELSIF NULLIF(_payload->>'fact_code','') IS NOT NULL AND _a.methodology_id IS NOT NULL THEN
    SELECT * INTO _fr FROM public.supervisory_methodology_fact_requirement
     WHERE methodology_id = _a.methodology_id AND fact_code = _payload->>'fact_code';
  END IF;
  IF _fr.id IS NULL THEN
    RAISE EXCEPTION 'validation_required: the fact is not defined by the methodology version attached to this assessment'
      USING ERRCODE = '22023';
  END IF;
  IF _a.methodology_id IS NOT NULL AND _fr.methodology_id <> _a.methodology_id THEN
    RAISE EXCEPTION 'validation_required: the fact requirement belongs to a different methodology version'
      USING ERRCODE = '22023';
  END IF;

  -- FACT-02: data type is methodology-owned and validated server-side
  _typed := public.supervisory_assessment_fact_typed_value(_fr.data_type, _payload);

  -- FACT-03: ratio provenance
  _num := NULLIF(_payload->>'numerator','')::numeric;
  _den := NULLIF(_payload->>'denominator','')::numeric;
  IF (_fr.numerator_basis IS NOT NULL OR _fr.denominator_basis IS NOT NULL)
     AND (_num IS NULL OR _den IS NULL) THEN
    RAISE EXCEPTION 'validation_required: this fact requires a numerator and a denominator, not a bare ratio'
      USING ERRCODE = '22023';
  END IF;
  IF _den IS NOT NULL AND _den = 0 THEN
    RAISE EXCEPTION 'validation_required: a denominator of zero cannot support a ratio' USING ERRCODE = '22023';
  END IF;

  -- FACT-04: provenance is mandatory
  _src := upper(btrim(COALESCE(_payload->>'source_type','')));
  IF _src = '' THEN
    RAISE EXCEPTION 'validation_required: state where this value came from' USING ERRCODE = '22023';
  END IF;
  IF _fr.source_type_expectation IS NOT NULL AND array_length(_fr.source_type_expectation,1) > 0
     AND NOT (_src = ANY (_fr.source_type_expectation)) THEN
    RAISE EXCEPTION 'validation_required: % is not an accepted source for %', _src, _fr.fact_code
      USING ERRCODE = '22023';
  END IF;

  _auto := COALESCE((_payload->>'auto_prefilled')::boolean, false);
  IF _auto AND NOT COALESCE(_fr.auto_prefill_allowed, false) THEN
    RAISE EXCEPTION 'validation_required: the methodology does not permit auto-prefill for %', _fr.fact_code
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _existing FROM public.supervisory_assessment_fact
   WHERE assessment_id = _assessment_id AND fact_code = _fr.fact_code;

  _sysval := CASE WHEN _auto THEN jsonb_build_object(
      'value', _payload->>'value', 'numerator', _num, 'denominator', _den,
      'source_type', _src, 'source_reference', _payload->>'source_reference',
      'as_of_date', _payload->>'as_of_date',
      'extraction_timestamp', COALESCE(NULLIF(_payload->>'extraction_timestamp','')::timestamptz, now()))
    ELSE _existing.system_value END;

  INSERT INTO public.supervisory_assessment_fact(
    assessment_id, entity_id, methodology_id, fact_requirement_id, fact_code, data_type, unit,
    value_numeric, value_text, value_date, value_boolean, numerator, denominator,
    period_start, period_end, as_of_date, source_type, source_reference, source_object_type,
    source_object_id, source_timestamp, extraction_timestamp, auto_prefilled, system_value,
    provenance, note, recorded_by)
  VALUES (_assessment_id, _a.entity_id, _fr.methodology_id, _fr.id, _fr.fact_code, _fr.data_type,
    COALESCE(NULLIF(_payload->>'unit',''), _fr.unit),
    (_typed->>'value_numeric')::numeric, _typed->>'value_text',
    (_typed->>'value_date')::date, (_typed->>'value_boolean')::boolean, _num, _den,
    NULLIF(_payload->>'period_start','')::date, NULLIF(_payload->>'period_end','')::date,
    NULLIF(_payload->>'as_of_date','')::date, _src,
    NULLIF(btrim(COALESCE(_payload->>'source_reference','')),''),
    NULLIF(_payload->>'source_object_type',''), NULLIF(_payload->>'source_object_id','')::uuid,
    NULLIF(_payload->>'source_timestamp','')::timestamptz,
    COALESCE(NULLIF(_payload->>'extraction_timestamp','')::timestamptz, CASE WHEN _auto THEN now() END),
    _auto, _sysval,
    jsonb_build_object('recorded_by', _uid, 'recorded_at', now(), 'basis',
      CASE WHEN _auto THEN 'AUTO_PREFILL' ELSE 'OFFICER_RECORDED' END),
    NULLIF(btrim(COALESCE(_payload->>'note','')),''), _uid)
  ON CONFLICT (assessment_id, fact_code) DO UPDATE
    SET fact_requirement_id = EXCLUDED.fact_requirement_id,
        data_type = EXCLUDED.data_type, unit = EXCLUDED.unit,
        value_numeric = EXCLUDED.value_numeric, value_text = EXCLUDED.value_text,
        value_date = EXCLUDED.value_date, value_boolean = EXCLUDED.value_boolean,
        numerator = EXCLUDED.numerator, denominator = EXCLUDED.denominator,
        period_start = EXCLUDED.period_start, period_end = EXCLUDED.period_end,
        as_of_date = EXCLUDED.as_of_date, source_type = EXCLUDED.source_type,
        source_reference = EXCLUDED.source_reference,
        source_object_type = EXCLUDED.source_object_type,
        source_object_id = EXCLUDED.source_object_id,
        source_timestamp = EXCLUDED.source_timestamp,
        extraction_timestamp = EXCLUDED.extraction_timestamp,
        auto_prefilled = EXCLUDED.auto_prefilled,
        system_value = EXCLUDED.system_value,
        provenance = EXCLUDED.provenance, note = EXCLUDED.note, updated_at = now()
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, rationale, detail, actor_id)
  VALUES (_assessment_id, CASE WHEN _auto THEN 'FACT_AUTO_PREFILLED' ELSE 'FACT_RECORDED' END,
    format('%s recorded', _fr.fact_code),
    jsonb_build_object('fact_id', _id, 'fact_code', _fr.fact_code, 'source_type', _src,
      'auto_prefilled', _auto), _uid);

  -- FACT-05: a fact never becomes a supervisory answer
  RETURN jsonb_build_object('fact_id', _id, 'fact_code', _fr.fact_code,
    'auto_prefilled', _auto, 'response_recorded', false);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_fact_set(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_fact_set(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_fact_override(
  _fact_id uuid, _payload jsonb, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _f public.supervisory_assessment_fact;
        _fr public.supervisory_methodology_fact_requirement; _typed jsonb; _num numeric; _den numeric;
BEGIN
  SELECT * INTO _f FROM public.supervisory_assessment_fact WHERE id = _fact_id;
  IF _f.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment fact' USING ERRCODE = '22023'; END IF;
  _uid := public.supervisory_assessment_execution_require_edit(_f.assessment_id);

  SELECT * INTO _fr FROM public.supervisory_methodology_fact_requirement WHERE id = _f.fact_requirement_id;
  IF _fr.id IS NULL THEN
    RAISE EXCEPTION 'validation_required: the fact is no longer defined by the methodology' USING ERRCODE = '22023';
  END IF;
  IF NOT COALESCE(_fr.officer_edit_allowed, true) THEN
    RAISE EXCEPTION 'validation_required: the methodology does not permit an officer value for %', _fr.fact_code
      USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(_reason,''))) < 10 THEN
    RAISE EXCEPTION 'validation_required: a reason of at least 10 characters is required to change a prefilled value'
      USING ERRCODE = '22023';
  END IF;

  _typed := public.supervisory_assessment_fact_typed_value(_f.data_type, _payload);
  _num := NULLIF(_payload->>'numerator','')::numeric;
  _den := NULLIF(_payload->>'denominator','')::numeric;
  IF (_fr.numerator_basis IS NOT NULL OR _fr.denominator_basis IS NOT NULL)
     AND (_num IS NULL OR _den IS NULL) THEN
    RAISE EXCEPTION 'validation_required: this fact requires a numerator and a denominator, not a bare ratio'
      USING ERRCODE = '22023';
  END IF;

  -- FACT-07: the original system value and its provenance are never overwritten
  UPDATE public.supervisory_assessment_fact
     SET system_value = COALESCE(system_value, jsonb_build_object(
           'value', COALESCE(value_numeric::text, value_text, value_date::text, value_boolean::text),
           'numerator', numerator, 'denominator', denominator,
           'source_type', source_type, 'source_reference', source_reference,
           'as_of_date', as_of_date, 'extraction_timestamp', extraction_timestamp)),
         value_numeric = (_typed->>'value_numeric')::numeric,
         value_text = _typed->>'value_text',
         value_date = (_typed->>'value_date')::date,
         value_boolean = (_typed->>'value_boolean')::boolean,
         numerator = COALESCE(_num, numerator),
         denominator = COALESCE(_den, denominator),
         officer_overridden = true,
         override_reason = btrim(_reason),
         overridden_by = _uid,
         overridden_at = now(),
         source_type = COALESCE(NULLIF(upper(btrim(COALESCE(_payload->>'source_type',''))),''), 'OFFICER_ENTERED'),
         source_reference = COALESCE(NULLIF(btrim(COALESCE(_payload->>'source_reference','')),''), source_reference),
         provenance = provenance || jsonb_build_object('override',
           jsonb_build_object('by', _uid, 'at', now(), 'reason', btrim(_reason))),
         updated_at = now()
   WHERE id = _fact_id;

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, rationale, detail, actor_id)
  VALUES (_f.assessment_id, 'FACT_OVERRIDDEN', btrim(_reason),
    jsonb_build_object('fact_id', _fact_id, 'fact_code', _f.fact_code), _uid);

  RETURN jsonb_build_object('fact_id', _fact_id, 'fact_code', _f.fact_code, 'officer_overridden', true);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_fact_override(uuid,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_fact_override(uuid,jsonb,text) TO authenticated;
