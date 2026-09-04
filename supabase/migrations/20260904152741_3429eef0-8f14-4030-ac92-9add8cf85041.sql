-- ============================================================
-- Generic supervisory methodology contract extension
-- ============================================================

ALTER TABLE public.supervisory_methodology_question
  ADD COLUMN IF NOT EXISTS axis text,
  ADD COLUMN IF NOT EXISTS effectiveness_focus text,
  ADD COLUMN IF NOT EXISTS question_class text,
  ADD COLUMN IF NOT EXISTS response_semantics_code text,
  ADD COLUMN IF NOT EXISTS calculation_participation text,
  ADD COLUMN IF NOT EXISTS trigger_condition text,
  ADD COLUMN IF NOT EXISTS applicability_rule jsonb,
  ADD COLUMN IF NOT EXISTS supervisory_intent text,
  ADD COLUMN IF NOT EXISTS na_conditions text,
  ADD COLUMN IF NOT EXISTS minimum_evidence_note text,
  ADD COLUMN IF NOT EXISTS evidence_basis_types text[],
  ADD COLUMN IF NOT EXISTS supervisory_judgement_required boolean,
  ADD COLUMN IF NOT EXISTS factual_auto_prefill_possible boolean,
  ADD COLUMN IF NOT EXISTS standards_reference text,
  ADD COLUMN IF NOT EXISTS standards_reference_strength text,
  ADD COLUMN IF NOT EXISTS standards_reference_review text,
  ADD COLUMN IF NOT EXISTS sector_classification text,
  ADD COLUMN IF NOT EXISTS sector_notes text,
  ADD COLUMN IF NOT EXISTS sector_applicability text,
  ADD COLUMN IF NOT EXISTS change_classification text,
  ADD COLUMN IF NOT EXISTS predecessor_mapping text,
  ADD COLUMN IF NOT EXISTS provenance jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'smq_question_class_chk') THEN
    ALTER TABLE public.supervisory_methodology_question
      ADD CONSTRAINT smq_question_class_chk
      CHECK (question_class IS NULL OR question_class IN ('CORE','CONDITIONAL','ENHANCED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'smq_calc_participation_chk') THEN
    ALTER TABLE public.supervisory_methodology_question
      ADD CONSTRAINT smq_calc_participation_chk
      CHECK (calculation_participation IS NULL
             OR calculation_participation IN ('SCORED','CONTEXTUAL_NOT_SCORED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'smq_axis_chk') THEN
    ALTER TABLE public.supervisory_methodology_question
      ADD CONSTRAINT smq_axis_chk
      CHECK (axis IS NULL OR axis IN ('INHERENT_EXPOSURE','CONTROL_EFFECTIVENESS','CONTEXT'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'smq_focus_chk') THEN
    ALTER TABLE public.supervisory_methodology_question
      ADD CONSTRAINT smq_focus_chk
      CHECK (effectiveness_focus IS NULL
             OR effectiveness_focus IN ('INHERENT_EXPOSURE','DESIGN','OPERATING','DESIGN_AND_OPERATING'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'smq_std_strength_chk') THEN
    ALTER TABLE public.supervisory_methodology_question
      ADD CONSTRAINT smq_std_strength_chk
      CHECK (standards_reference_strength IS NULL
             OR standards_reference_strength IN
                ('DIRECT_REQUIREMENT','RELATED_RISK_FACTOR','SUPERVISORY_GUIDANCE_CONTEXT'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'smq_sector_applicability_chk') THEN
    ALTER TABLE public.supervisory_methodology_question
      ADD CONSTRAINT smq_sector_applicability_chk
      CHECK (sector_applicability IS NULL
             OR sector_applicability IN
                ('CORE_ALL','CORE_WITH_SECTOR_GUIDANCE','SECTOR_CONDITIONAL','SECTOR_OVERLAY_CANDIDATE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'smq_evidence_basis_chk') THEN
    ALTER TABLE public.supervisory_methodology_question
      ADD CONSTRAINT smq_evidence_basis_chk
      CHECK (evidence_basis_types IS NULL OR evidence_basis_types <@ ARRAY[
        'ENTERPRISE_DOCUMENT','SYSTEM_FACT','REGULATORY_RETURN','STRUCTURED_METRIC',
        'SUPERVISORY_SAMPLE','WORKPAPER','PRIOR_EXAMINATION','FINDING',
        'REMEDIATION_RECORD','RFI_RESPONSE','AUTHORISED_EXTERNAL_SOURCE']::text[]);
  END IF;
END $$;

ALTER TABLE public.supervisory_methodology_dimension
  ADD COLUMN IF NOT EXISTS provenance jsonb;

-- ---------- semantic profiles (business meaning only, no scores) ----------
CREATE TABLE IF NOT EXISTS public.supervisory_methodology_semantic_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_code text NOT NULL,
  semantic_code text NOT NULL,
  label text NOT NULL,
  description text,
  response_meaning jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  provenance jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain_code, semantic_code)
);
GRANT SELECT ON public.supervisory_methodology_semantic_profile TO authenticated;
GRANT ALL ON public.supervisory_methodology_semantic_profile TO service_role;
ALTER TABLE public.supervisory_methodology_semantic_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS smsp_read ON public.supervisory_methodology_semantic_profile;
CREATE POLICY smsp_read ON public.supervisory_methodology_semantic_profile
  FOR SELECT TO authenticated USING (true);

-- ---------- structured fact requirements ----------
CREATE TABLE IF NOT EXISTS public.supervisory_methodology_fact_requirement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  methodology_id uuid NOT NULL REFERENCES public.supervisory_methodology(id) ON DELETE CASCADE,
  fact_code text NOT NULL,
  label text,
  data_type text,
  unit text,
  numerator_basis text,
  denominator_basis text,
  period_expectation text,
  source_type_expectation text[],
  materiality_parameter_code text,
  is_required boolean NOT NULL DEFAULT false,
  auto_prefill_allowed boolean NOT NULL DEFAULT false,
  officer_edit_allowed boolean NOT NULL DEFAULT true,
  attribute_source text,
  definition_status text NOT NULL DEFAULT 'ATTRIBUTES_PENDING',
  provenance jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (methodology_id, fact_code),
  CONSTRAINT smfr_definition_status_chk
    CHECK (definition_status IN ('ATTRIBUTES_PENDING','DEFINED','RETIRED'))
);
GRANT SELECT ON public.supervisory_methodology_fact_requirement TO authenticated;
GRANT ALL ON public.supervisory_methodology_fact_requirement TO service_role;
ALTER TABLE public.supervisory_methodology_fact_requirement ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS smfr_read ON public.supervisory_methodology_fact_requirement;
CREATE POLICY smfr_read ON public.supervisory_methodology_fact_requirement
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.supervisory_methodology_question_fact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.supervisory_methodology_question(id) ON DELETE CASCADE,
  fact_requirement_id uuid NOT NULL REFERENCES public.supervisory_methodology_fact_requirement(id) ON DELETE CASCADE,
  is_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, fact_requirement_id)
);
GRANT SELECT ON public.supervisory_methodology_question_fact TO authenticated;
GRANT ALL ON public.supervisory_methodology_question_fact TO service_role;
ALTER TABLE public.supervisory_methodology_question_fact ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS smqf_read ON public.supervisory_methodology_question_fact;
CREATE POLICY smqf_read ON public.supervisory_methodology_question_fact
  FOR SELECT TO authenticated USING (true);

-- ---------- configurable methodology parameters (materiality) ----------
CREATE TABLE IF NOT EXISTS public.supervisory_methodology_parameter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  methodology_id uuid NOT NULL REFERENCES public.supervisory_methodology(id) ON DELETE CASCADE,
  parameter_code text NOT NULL,
  parameter_kind text NOT NULL DEFAULT 'MATERIALITY',
  label text,
  data_type text,
  unit text,
  value_numeric numeric,
  value_text text,
  approval_status text NOT NULL DEFAULT 'UNAPPROVED',
  provenance jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (methodology_id, parameter_code),
  CONSTRAINT smp_approval_status_chk CHECK (approval_status IN ('UNAPPROVED','APPROVED','RETIRED')),
  CONSTRAINT smp_unapproved_has_no_value_chk
    CHECK (approval_status <> 'UNAPPROVED' OR (value_numeric IS NULL AND value_text IS NULL))
);
GRANT SELECT ON public.supervisory_methodology_parameter TO authenticated;
GRANT ALL ON public.supervisory_methodology_parameter TO service_role;
ALTER TABLE public.supervisory_methodology_parameter ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS smp_read ON public.supervisory_methodology_parameter;
CREATE POLICY smp_read ON public.supervisory_methodology_parameter
  FOR SELECT TO authenticated USING (true);

-- ---------- reference design decisions (explicit approval scope) ----------
CREATE TABLE IF NOT EXISTS public.supervisory_methodology_reference_decision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_code text NOT NULL,
  methodology_code text NOT NULL,
  methodology_version text NOT NULL,
  decision_code text NOT NULL,
  title text NOT NULL,
  decision_text text NOT NULL,
  approval_scope text NOT NULL DEFAULT 'MIPL_REFERENCE_APPROVAL',
  decision_source text NOT NULL DEFAULT 'MIPL_REFERENCE_DESIGN',
  status text NOT NULL DEFAULT 'REFERENCE_APPROVED',
  rationale text NOT NULL,
  regulator_approval_recorded boolean NOT NULL DEFAULT false,
  customer_adoption_recorded boolean NOT NULL DEFAULT false,
  provenance jsonb,
  recorded_by uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (methodology_code, methodology_version, decision_code, approval_scope),
  CONSTRAINT smrd_scope_chk CHECK (approval_scope IN
    ('MIPL_REFERENCE_APPROVAL','REGULATOR_APPROVAL','CUSTOMER_POLICY_APPROVAL')),
  CONSTRAINT smrd_status_chk CHECK (status IN
    ('REFERENCE_APPROVED','AWAITING_SUPERVISORY_APPROVAL','SUPERSEDED','WITHDRAWN')),
  CONSTRAINT smrd_reference_never_regulator_chk CHECK (
    approval_scope <> 'MIPL_REFERENCE_APPROVAL'
    OR (regulator_approval_recorded = false AND customer_adoption_recorded = false))
);
GRANT SELECT ON public.supervisory_methodology_reference_decision TO authenticated;
GRANT ALL ON public.supervisory_methodology_reference_decision TO service_role;
ALTER TABLE public.supervisory_methodology_reference_decision ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS smrd_read ON public.supervisory_methodology_reference_decision;
CREATE POLICY smrd_read ON public.supervisory_methodology_reference_decision
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- Governed operations
-- ============================================================

CREATE OR REPLACE FUNCTION public.supervisory_methodology_semantic_profile_set(
  _domain_code text, _payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid; _n integer := 0; r jsonb;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'array' THEN
    RAISE EXCEPTION 'payload must be an array' USING ERRCODE = '22023'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(_payload) LOOP
    INSERT INTO public.supervisory_methodology_semantic_profile(
      domain_code, semantic_code, label, description, response_meaning, provenance)
    VALUES (upper(_domain_code), upper(r->>'semantic_code'),
            COALESCE(r->>'label', r->>'semantic_code'), r->>'description',
            COALESCE(r->'response_meaning','{}'::jsonb), r->'provenance')
    ON CONFLICT (domain_code, semantic_code) DO UPDATE SET
      label = EXCLUDED.label, description = EXCLUDED.description,
      response_meaning = EXCLUDED.response_meaning, provenance = EXCLUDED.provenance,
      active = true, updated_at = now();
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_methodology_parameter_set(
  _methodology_id uuid, _payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid; _status text; _n integer := 0; r jsonb;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  SELECT status INTO _status FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _status IS NULL THEN RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023'; END IF;
  IF _status NOT IN ('DRAFT','REVIEW') THEN
    RAISE EXCEPTION 'methodology_immutable: version status % is structurally frozen', _status
      USING ERRCODE = '22023'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(_payload) LOOP
    INSERT INTO public.supervisory_methodology_parameter(
      methodology_id, parameter_code, parameter_kind, label, data_type, unit, provenance)
    VALUES (_methodology_id, upper(r->>'parameter_code'),
            COALESCE(upper(r->>'parameter_kind'),'MATERIALITY'), r->>'label',
            r->>'data_type', r->>'unit', r->'provenance')
    ON CONFLICT (methodology_id, parameter_code) DO UPDATE SET
      parameter_kind = EXCLUDED.parameter_kind, label = EXCLUDED.label,
      data_type = EXCLUDED.data_type, unit = EXCLUDED.unit,
      provenance = EXCLUDED.provenance, updated_at = now();
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_methodology_fact_requirement_set(
  _methodology_id uuid, _payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid; _status text; _n integer := 0; r jsonb;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  SELECT status INTO _status FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _status IS NULL THEN RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023'; END IF;
  IF _status NOT IN ('DRAFT','REVIEW') THEN
    RAISE EXCEPTION 'methodology_immutable: version status % is structurally frozen', _status
      USING ERRCODE = '22023'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(_payload) LOOP
    INSERT INTO public.supervisory_methodology_fact_requirement(
      methodology_id, fact_code, label, data_type, unit, numerator_basis, denominator_basis,
      period_expectation, source_type_expectation, materiality_parameter_code, is_required,
      auto_prefill_allowed, officer_edit_allowed, attribute_source, definition_status, provenance)
    VALUES (_methodology_id, upper(r->>'fact_code'), r->>'label', r->>'data_type', r->>'unit',
            r->>'numerator_basis', r->>'denominator_basis', r->>'period_expectation',
            CASE WHEN r ? 'source_type_expectation'
                 THEN ARRAY(SELECT jsonb_array_elements_text(r->'source_type_expectation')) END,
            r->>'materiality_parameter_code',
            COALESCE((r->>'is_required')::boolean, false),
            COALESCE((r->>'auto_prefill_allowed')::boolean, false),
            COALESCE((r->>'officer_edit_allowed')::boolean, true),
            r->>'attribute_source',
            COALESCE(r->>'definition_status','ATTRIBUTES_PENDING'), r->'provenance')
    ON CONFLICT (methodology_id, fact_code) DO UPDATE SET
      label = EXCLUDED.label, data_type = EXCLUDED.data_type, unit = EXCLUDED.unit,
      numerator_basis = EXCLUDED.numerator_basis, denominator_basis = EXCLUDED.denominator_basis,
      period_expectation = EXCLUDED.period_expectation,
      source_type_expectation = EXCLUDED.source_type_expectation,
      materiality_parameter_code = EXCLUDED.materiality_parameter_code,
      is_required = EXCLUDED.is_required,
      auto_prefill_allowed = EXCLUDED.auto_prefill_allowed,
      officer_edit_allowed = EXCLUDED.officer_edit_allowed,
      attribute_source = EXCLUDED.attribute_source,
      definition_status = EXCLUDED.definition_status,
      provenance = EXCLUDED.provenance, updated_at = now();
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $function$;

-- Extended, non-scoring question attributes for a DRAFT/REVIEW methodology version.
CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_attributes_set(
  _methodology_id uuid, _payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid; _status text; _n integer := 0; r jsonb; _qid uuid; _fact text;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  SELECT status INTO _status FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _status IS NULL THEN RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023'; END IF;
  IF _status NOT IN ('DRAFT','REVIEW') THEN
    RAISE EXCEPTION 'methodology_immutable: version status % is structurally frozen', _status
      USING ERRCODE = '22023'; END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(_payload) LOOP
    SELECT id INTO _qid FROM public.supervisory_methodology_question
     WHERE methodology_id = _methodology_id AND question_code = upper(r->>'question_code');
    IF _qid IS NULL THEN
      RAISE EXCEPTION 'not_found: question % in this methodology version', r->>'question_code'
        USING ERRCODE = '22023'; END IF;

    UPDATE public.supervisory_methodology_question SET
      axis = r->>'axis',
      effectiveness_focus = r->>'effectiveness_focus',
      question_class = r->>'question_class',
      response_semantics_code = r->>'response_semantics_code',
      calculation_participation = r->>'calculation_participation',
      trigger_condition = r->>'trigger_condition',
      applicability_rule = r->'applicability_rule',
      supervisory_intent = r->>'supervisory_intent',
      na_conditions = r->>'na_conditions',
      minimum_evidence_note = r->>'minimum_evidence_note',
      evidence_basis_types = CASE WHEN r ? 'evidence_basis_types'
        THEN ARRAY(SELECT jsonb_array_elements_text(r->'evidence_basis_types')) END,
      supervisory_judgement_required = (r->>'supervisory_judgement_required')::boolean,
      factual_auto_prefill_possible = (r->>'factual_auto_prefill_possible')::boolean,
      standards_reference = r->>'standards_reference',
      standards_reference_strength = r->>'standards_reference_strength',
      standards_reference_review = r->>'standards_reference_review',
      sector_classification = r->>'sector_classification',
      sector_notes = r->>'sector_notes',
      sector_applicability = r->>'sector_applicability',
      change_classification = r->>'change_classification',
      predecessor_mapping = r->>'predecessor_mapping',
      provenance = r->'provenance',
      updated_at = now()
     WHERE id = _qid;

    DELETE FROM public.supervisory_methodology_question_fact WHERE question_id = _qid;
    IF r ? 'fact_codes' THEN
      FOR _fact IN SELECT jsonb_array_elements_text(r->'fact_codes') LOOP
        INSERT INTO public.supervisory_methodology_question_fact(question_id, fact_requirement_id)
        SELECT _qid, f.id FROM public.supervisory_methodology_fact_requirement f
         WHERE f.methodology_id = _methodology_id AND f.fact_code = upper(_fact)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
    _n := _n + 1;
  END LOOP;

  INSERT INTO public.supervisory_methodology_event(
    methodology_id, event_type, to_status, rationale, actor_id, detail)
  VALUES (_methodology_id, 'QUESTION_ATTRIBUTES_SET', _status,
          'Extended question attributes applied from the approved reference catalogue', _uid,
          jsonb_build_object('questions', _n));
  RETURN _n;
END $function$;

-- Remove questions of a DRAFT version that carry no assessment response.
CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_purge(
  _methodology_id uuid, _rationale text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid; _status text; _n integer := 0; _used integer;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;
  SELECT status INTO _status FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _status IS NULL THEN RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023'; END IF;
  IF _status <> 'DRAFT' THEN
    RAISE EXCEPTION 'only a DRAFT methodology version may have its question set purged'
      USING ERRCODE = '22023'; END IF;

  SELECT count(*) INTO _used
    FROM public.supervisory_assessment_question_response r
    JOIN public.supervisory_methodology_question q ON q.id = r.methodology_question_id
   WHERE q.methodology_id = _methodology_id;
  IF _used > 0 THEN
    RAISE EXCEPTION 'refused: % recorded responses reference this version''s questions', _used
      USING ERRCODE = '22023'; END IF;

  DELETE FROM public.supervisory_methodology_question WHERE methodology_id = _methodology_id;
  GET DIAGNOSTICS _n = ROW_COUNT;

  INSERT INTO public.supervisory_methodology_event(
    methodology_id, event_type, to_status, rationale, actor_id, detail)
  VALUES (_methodology_id, 'QUESTIONS_PURGED', 'DRAFT', btrim(_rationale), _uid,
          jsonb_build_object('removed', _n));
  RETURN _n;
END $function$;

-- Reference-design decision record. Cannot express regulator or customer approval.
CREATE OR REPLACE FUNCTION public.supervisory_methodology_reference_decision_record(
  _payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid; _n integer := 0; r jsonb;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'array' THEN
    RAISE EXCEPTION 'payload must be an array' USING ERRCODE = '22023'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(_payload) LOOP
    IF COALESCE(upper(r->>'approval_scope'),'MIPL_REFERENCE_APPROVAL') <> 'MIPL_REFERENCE_APPROVAL' THEN
      RAISE EXCEPTION 'this operation records reference approvals only; regulator or customer policy approval is a separate governed decision'
        USING ERRCODE = '22023'; END IF;
    IF length(btrim(COALESCE(r->>'rationale',''))) < 10 THEN
      RAISE EXCEPTION 'a rationale of at least 10 characters is required for %', r->>'decision_code'
        USING ERRCODE = '22023'; END IF;
    INSERT INTO public.supervisory_methodology_reference_decision(
      domain_code, methodology_code, methodology_version, decision_code, title, decision_text,
      approval_scope, decision_source, status, rationale, provenance, recorded_by)
    VALUES (upper(r->>'domain_code'), r->>'methodology_code', r->>'methodology_version',
            upper(r->>'decision_code'), r->>'title', r->>'decision_text',
            'MIPL_REFERENCE_APPROVAL', 'MIPL_REFERENCE_DESIGN', 'REFERENCE_APPROVED',
            btrim(r->>'rationale'), r->'provenance', _uid)
    ON CONFLICT (methodology_code, methodology_version, decision_code, approval_scope)
      DO UPDATE SET title = EXCLUDED.title, decision_text = EXCLUDED.decision_text,
        rationale = EXCLUDED.rationale, provenance = EXCLUDED.provenance,
        recorded_by = EXCLUDED.recorded_by, recorded_at = now();
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_methodology_semantic_profile_set(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_methodology_parameter_set(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_methodology_fact_requirement_set(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_methodology_question_attributes_set(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_methodology_question_purge(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_methodology_reference_decision_record(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_semantic_profile_set(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_parameter_set(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_fact_requirement_set(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_question_attributes_set(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_question_purge(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_reference_decision_record(jsonb) TO authenticated, service_role;