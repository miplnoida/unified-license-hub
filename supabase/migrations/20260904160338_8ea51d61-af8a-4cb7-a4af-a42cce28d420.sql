-- =====================================================================
-- v1.1 DRAFT PLATFORM-CONTRACT CLOSURE
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Domain-scoped configuration authority
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supervisory_domain_authority (
  domain_code                   text PRIMARY KEY,
  manage_config_permission      text,
  regulator_approval_permission text,
  notes                         text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.supervisory_domain_authority TO authenticated;
GRANT ALL    ON public.supervisory_domain_authority TO service_role;
ALTER TABLE public.supervisory_domain_authority ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sda_read ON public.supervisory_domain_authority;
CREATE POLICY sda_read ON public.supervisory_domain_authority
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.supervisory_domain_authority
  (domain_code, manage_config_permission, regulator_approval_permission, notes)
VALUES
  ('AML_CFT', 'aml_supervision.manage_config', 'aml_supervision.approve',
   'Canonical AML/CFT configuration and approval authority.'),
  ('PRUDENTIAL', 'prudential_supervision.manage_config', 'supervisory_spine.approve',
   'Prudential holds its own manage_config; no prudential-specific approve permission exists, so the enterprise supervisory approval permission is required.'),
  ('MARKET_CONDUCT', NULL, 'supervisory_spine.approve',
   'GAP: the permission catalogue contains no market_conduct.manage_config. Until one is registered, only a super administrator can configure market-conduct methodology.')
ON CONFLICT (domain_code) DO UPDATE SET
  manage_config_permission      = EXCLUDED.manage_config_permission,
  regulator_approval_permission = EXCLUDED.regulator_approval_permission,
  notes = EXCLUDED.notes, updated_at = now();

-- Resolve and enforce the manage-config permission of a named domain.
CREATE OR REPLACE FUNCTION public.supervisory_domain_require_manage(_domain_code text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid := auth.uid(); _d text; _perm text; _module text; _action text; _found boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;
  _d := upper(btrim(COALESCE(_domain_code,'')));
  SELECT true, manage_config_permission INTO _found, _perm
    FROM public.supervisory_domain_authority WHERE domain_code = _d;
  IF NOT COALESCE(_found,false) THEN
    RAISE EXCEPTION 'unsupported supervisory domain %', _d USING ERRCODE = '22023'; END IF;

  IF public.is_super_admin(_uid) THEN RETURN _uid; END IF;

  IF _perm IS NULL THEN
    RAISE EXCEPTION 'not_authorized: no configuration permission is registered for domain %; only a super administrator may configure it', _d
      USING ERRCODE = '42501'; END IF;

  _module := split_part(_perm, '.', 1);
  _action := split_part(_perm, '.', 2);
  IF public.has_permission(_uid, _module, _action) THEN RETURN _uid; END IF;

  RAISE EXCEPTION 'not_authorized: % required to configure % methodology', _perm, _d
    USING ERRCODE = '42501';
END $function$;

-- Resolve the domain from the TARGET methodology; never from the caller.
CREATE OR REPLACE FUNCTION public.supervisory_methodology_require_manage(_methodology_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _d text;
BEGIN
  SELECT domain_code INTO _d FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _d IS NULL THEN RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023'; END IF;
  RETURN public.supervisory_domain_require_manage(_d);
END $function$;

-- Regulator substantive approval authority. Deliberately NO super-admin bypass:
-- technical privilege is not the regulator's methodology approval authority.
CREATE OR REPLACE FUNCTION public.supervisory_methodology_require_regulator_approval(_methodology_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid := auth.uid(); _d text; _perm text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;
  SELECT m.domain_code, a.regulator_approval_permission INTO _d, _perm
    FROM public.supervisory_methodology m
    LEFT JOIN public.supervisory_domain_authority a ON a.domain_code = m.domain_code
   WHERE m.id = _methodology_id;
  IF _d IS NULL THEN RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023'; END IF;
  IF _perm IS NULL THEN
    RAISE EXCEPTION 'not_authorized: no regulator approval permission is registered for domain %', _d
      USING ERRCODE = '42501'; END IF;
  IF public.has_permission(_uid, split_part(_perm,'.',1), split_part(_perm,'.',2)) THEN
    RETURN _uid; END IF;
  RAISE EXCEPTION 'not_authorized: % is the regulator methodology approval authority for %', _perm, _d
    USING ERRCODE = '42501';
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_domain_require_manage(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_methodology_require_manage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.supervisory_methodology_require_regulator_approval(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_domain_require_manage(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_require_manage(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_require_regulator_approval(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Methodology origin + hard activation guard for reference templates
-- ---------------------------------------------------------------------
ALTER TABLE public.supervisory_methodology
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'REGULATOR_AUTHORED',
  ADD COLUMN IF NOT EXISTS adopted_from_id uuid REFERENCES public.supervisory_methodology(id);

ALTER TABLE public.supervisory_methodology DROP CONSTRAINT IF EXISTS sm_origin_chk;
ALTER TABLE public.supervisory_methodology ADD CONSTRAINT sm_origin_chk
  CHECK (origin IN ('REGULATOR_AUTHORED','MIPL_REFERENCE','REGULATOR_ADOPTED'));

UPDATE public.supervisory_methodology
   SET origin = 'MIPL_REFERENCE', updated_at = now()
 WHERE code = 'AML-CFT-RBA' AND domain_code = 'AML_CFT' AND version = '1.1'
   AND origin <> 'MIPL_REFERENCE';

-- A MIPL reference template can never carry a regulator operational status.
ALTER TABLE public.supervisory_methodology DROP CONSTRAINT IF EXISTS sm_reference_never_operational_chk;
ALTER TABLE public.supervisory_methodology ADD CONSTRAINT sm_reference_never_operational_chk
  CHECK (origin <> 'MIPL_REFERENCE' OR status IN ('DRAFT','REVIEW','SUPERSEDED','RETIRED'));

-- ---------------------------------------------------------------------
-- 3. Regulator approval register
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supervisory_methodology_regulator_approval (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  methodology_id uuid NOT NULL REFERENCES public.supervisory_methodology(id) ON DELETE CASCADE,
  regulator_id  uuid REFERENCES public.regulators(id),
  decision      text NOT NULL CHECK (decision IN ('APPROVED','REVOKED')),
  authority_permission text,
  submitted_by  uuid REFERENCES auth.users(id),
  decided_by    uuid NOT NULL REFERENCES auth.users(id),
  rationale     text NOT NULL,
  is_current    boolean NOT NULL DEFAULT true,
  decided_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS smra_current_uniq
  ON public.supervisory_methodology_regulator_approval(methodology_id) WHERE is_current;

GRANT SELECT ON public.supervisory_methodology_regulator_approval TO authenticated;
GRANT ALL    ON public.supervisory_methodology_regulator_approval TO service_role;
ALTER TABLE public.supervisory_methodology_regulator_approval ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS smra_read ON public.supervisory_methodology_regulator_approval;
CREATE POLICY smra_read ON public.supervisory_methodology_regulator_approval
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------
-- 4. Reference decision target integrity
-- ---------------------------------------------------------------------
ALTER TABLE public.supervisory_methodology_reference_decision
  ADD COLUMN IF NOT EXISTS methodology_id uuid REFERENCES public.supervisory_methodology(id) ON DELETE RESTRICT;

UPDATE public.supervisory_methodology_reference_decision d
   SET methodology_id = m.id
  FROM public.supervisory_methodology m
 WHERE d.methodology_id IS NULL
   AND m.code = d.methodology_code
   AND m.version = d.methodology_version
   AND m.domain_code = d.domain_code;

CREATE OR REPLACE FUNCTION public.supervisory_methodology_reference_decision_target_chk()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE _m public.supervisory_methodology;
BEGIN
  IF NEW.methodology_id IS NULL THEN
    RAISE EXCEPTION 'a reference decision must target a real methodology version' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _m FROM public.supervisory_methodology WHERE id = NEW.methodology_id;
  IF _m.id IS NULL THEN
    RAISE EXCEPTION 'not_found: methodology %', NEW.methodology_id USING ERRCODE = '22023'; END IF;
  IF _m.domain_code <> upper(COALESCE(NEW.domain_code,''))
     OR _m.code <> COALESCE(NEW.methodology_code,'')
     OR _m.version <> COALESCE(NEW.methodology_version,'') THEN
    RAISE EXCEPTION 'reference decision target mismatch: register says %/%/% but the methodology is %/%/%',
      NEW.domain_code, NEW.methodology_code, NEW.methodology_version,
      _m.domain_code, _m.code, _m.version USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS smrd_target_chk ON public.supervisory_methodology_reference_decision;
CREATE TRIGGER smrd_target_chk BEFORE INSERT OR UPDATE
  ON public.supervisory_methodology_reference_decision
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_methodology_reference_decision_target_chk();

ALTER TABLE public.supervisory_methodology_reference_decision
  ALTER COLUMN methodology_id SET NOT NULL;

-- ---------------------------------------------------------------------
-- 5. Version-stable response semantics
-- ---------------------------------------------------------------------
ALTER TABLE public.supervisory_methodology_semantic_profile
  ADD COLUMN IF NOT EXISTS methodology_id uuid REFERENCES public.supervisory_methodology(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS profile_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.supervisory_methodology_semantic_profile
  DROP CONSTRAINT IF EXISTS supervisory_methodology_semantic__domain_code_semantic_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS smsp_methodology_semantic_uniq
  ON public.supervisory_methodology_semantic_profile(methodology_id, semantic_code)
  WHERE methodology_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS smsp_domain_semantic_uniq
  ON public.supervisory_methodology_semantic_profile(domain_code, semantic_code)
  WHERE methodology_id IS NULL;

ALTER TABLE public.supervisory_methodology_question
  ADD COLUMN IF NOT EXISTS response_semantics_profile_id uuid
    REFERENCES public.supervisory_methodology_semantic_profile(id);

-- Snapshot the five AML_CFT domain-global profiles as the immutable v1.1 set.
INSERT INTO public.supervisory_methodology_semantic_profile
  (methodology_id, domain_code, semantic_code, label, description, response_meaning, active, profile_version, provenance)
SELECT v.id, p.domain_code, p.semantic_code, p.label, p.description, p.response_meaning, p.active, 1,
       COALESCE(p.provenance,'{}'::jsonb) || jsonb_build_object(
         'snapshot_of_domain_profile', p.id,
         'snapshot_reason', 'version-stable semantics: v1.1 owns its approved response meanings')
  FROM public.supervisory_methodology_semantic_profile p
  CROSS JOIN (SELECT id FROM public.supervisory_methodology
               WHERE code='AML-CFT-RBA' AND domain_code='AML_CFT' AND version='1.1') v
 WHERE p.methodology_id IS NULL AND p.domain_code = 'AML_CFT'
ON CONFLICT DO NOTHING;

UPDATE public.supervisory_methodology_question q
   SET response_semantics_profile_id = p.id, updated_at = now()
  FROM public.supervisory_methodology_semantic_profile p
 WHERE p.methodology_id = q.methodology_id
   AND p.semantic_code = q.response_semantics_code
   AND q.response_semantics_profile_id IS NULL;

-- A question may only reference a profile owned by its own methodology version.
CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_semantic_scope_chk()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE _owner uuid;
BEGIN
  IF NEW.response_semantics_profile_id IS NULL THEN RETURN NEW; END IF;
  SELECT methodology_id INTO _owner FROM public.supervisory_methodology_semantic_profile
   WHERE id = NEW.response_semantics_profile_id;
  IF _owner IS DISTINCT FROM NEW.methodology_id THEN
    RAISE EXCEPTION 'semantic profile % does not belong to methodology version %',
      NEW.response_semantics_profile_id, NEW.methodology_id USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS smq_semantic_scope_chk ON public.supervisory_methodology_question;
CREATE TRIGGER smq_semantic_scope_chk BEFORE INSERT OR UPDATE
  ON public.supervisory_methodology_question
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_methodology_question_semantic_scope_chk();

-- Once a version leaves DRAFT/REVIEW its semantic meanings are frozen for ever.
CREATE OR REPLACE FUNCTION public.supervisory_methodology_semantic_profile_freeze()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE _mid uuid; _status text;
BEGIN
  _mid := COALESCE(OLD.methodology_id, NEW.methodology_id);
  IF _mid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT status INTO _status FROM public.supervisory_methodology WHERE id = _mid;
  IF _status IS NOT NULL AND _status NOT IN ('DRAFT','REVIEW') THEN
    RAISE EXCEPTION 'semantic_profile_immutable: methodology version status % is frozen; author a new version instead', _status
      USING ERRCODE = '22023';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;

DROP TRIGGER IF EXISTS smsp_freeze ON public.supervisory_methodology_semantic_profile;
CREATE TRIGGER smsp_freeze BEFORE UPDATE OR DELETE
  ON public.supervisory_methodology_semantic_profile
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_methodology_semantic_profile_freeze();

-- ---------------------------------------------------------------------
-- 6. Axis normalisation (no wording, class or count change)
-- ---------------------------------------------------------------------
UPDATE public.supervisory_methodology_question
   SET axis = 'CONTROL_EFFECTIVENESS', updated_at = now()
 WHERE axis IN ('DESIGN','OPERATING','DESIGN_AND_OPERATING');

ALTER TABLE public.supervisory_methodology_question DROP CONSTRAINT IF EXISTS smq_axis_chk;
ALTER TABLE public.supervisory_methodology_question ADD CONSTRAINT smq_axis_chk
  CHECK (axis IS NULL OR axis IN ('INHERENT_EXPOSURE','CONTROL_EFFECTIVENESS'));

ALTER TABLE public.supervisory_methodology_question DROP CONSTRAINT IF EXISTS smq_axis_focus_coherence_chk;
ALTER TABLE public.supervisory_methodology_question ADD CONSTRAINT smq_axis_focus_coherence_chk
  CHECK (
    axis IS NULL
    OR (axis = 'INHERENT_EXPOSURE'      AND COALESCE(effectiveness_focus,'INHERENT_EXPOSURE') = 'INHERENT_EXPOSURE')
    OR (axis = 'CONTROL_EFFECTIVENESS'  AND COALESCE(effectiveness_focus,'DESIGN') IN ('DESIGN','OPERATING','DESIGN_AND_OPERATING'))
  );

-- ---------------------------------------------------------------------
-- 7. Rewire every generic writer onto domain-scoped authority
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_methodology_parameter_set(_methodology_id uuid, _payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid; _status text; _n integer := 0; r jsonb;
BEGIN
  _uid := public.supervisory_methodology_require_manage(_methodology_id);
  SELECT status INTO _status FROM public.supervisory_methodology WHERE id = _methodology_id;
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

-- Semantic profiles become methodology-version-scoped.
DROP FUNCTION IF EXISTS public.supervisory_methodology_semantic_profile_set(text, jsonb);

CREATE OR REPLACE FUNCTION public.supervisory_methodology_semantic_profile_set(_methodology_id uuid, _payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid; _m public.supervisory_methodology; _n integer := 0; r jsonb;
BEGIN
  _uid := public.supervisory_methodology_require_manage(_methodology_id);
  SELECT * INTO _m FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _m.status NOT IN ('DRAFT','REVIEW') THEN
    RAISE EXCEPTION 'methodology_immutable: version status % is structurally frozen', _m.status
      USING ERRCODE = '22023'; END IF;
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'array' THEN
    RAISE EXCEPTION 'payload must be an array' USING ERRCODE = '22023'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(_payload) LOOP
    INSERT INTO public.supervisory_methodology_semantic_profile(
      methodology_id, domain_code, semantic_code, label, description, response_meaning, provenance)
    VALUES (_methodology_id, _m.domain_code, upper(r->>'semantic_code'),
            COALESCE(r->>'label', r->>'semantic_code'), r->>'description',
            COALESCE(r->'response_meaning','{}'::jsonb), r->'provenance')
    ON CONFLICT (methodology_id, semantic_code) DO UPDATE SET
      label = EXCLUDED.label, description = EXCLUDED.description,
      response_meaning = EXCLUDED.response_meaning, provenance = EXCLUDED.provenance,
      active = true, updated_at = now();
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_methodology_reference_decision_record(_payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid; _n integer := 0; r jsonb; _m public.supervisory_methodology;
BEGIN
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'array' THEN
    RAISE EXCEPTION 'payload must be an array' USING ERRCODE = '22023'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(_payload) LOOP
    IF COALESCE(upper(r->>'approval_scope'),'MIPL_REFERENCE_APPROVAL') <> 'MIPL_REFERENCE_APPROVAL' THEN
      RAISE EXCEPTION 'this operation records reference approvals only; regulator or customer policy approval is a separate governed decision'
        USING ERRCODE = '22023'; END IF;
    IF length(btrim(COALESCE(r->>'rationale',''))) < 10 THEN
      RAISE EXCEPTION 'a rationale of at least 10 characters is required for %', r->>'decision_code'
        USING ERRCODE = '22023'; END IF;

    -- Target integrity: the methodology version must exist and match on all three values.
    SELECT * INTO _m FROM public.supervisory_methodology
     WHERE code = r->>'methodology_code' AND version = r->>'methodology_version';
    IF _m.id IS NULL THEN
      RAISE EXCEPTION 'not_found: methodology % version %', r->>'methodology_code', r->>'methodology_version'
        USING ERRCODE = '22023'; END IF;
    IF _m.domain_code <> upper(COALESCE(r->>'domain_code','')) THEN
      RAISE EXCEPTION 'domain mismatch: % % belongs to domain %, not %',
        _m.code, _m.version, _m.domain_code, r->>'domain_code' USING ERRCODE = '22023'; END IF;

    -- Authority is derived from the TARGET methodology's domain.
    _uid := public.supervisory_methodology_require_manage(_m.id);

    INSERT INTO public.supervisory_methodology_reference_decision(
      methodology_id, domain_code, methodology_code, methodology_version, decision_code,
      title, decision_text, approval_scope, decision_source, status, rationale, provenance, recorded_by)
    VALUES (_m.id, _m.domain_code, _m.code, _m.version, upper(r->>'decision_code'),
            r->>'title', r->>'decision_text',
            'MIPL_REFERENCE_APPROVAL', 'MIPL_REFERENCE_DESIGN', 'REFERENCE_APPROVED',
            btrim(r->>'rationale'), r->'provenance', _uid)
    ON CONFLICT (methodology_code, methodology_version, decision_code, approval_scope)
      DO UPDATE SET methodology_id = EXCLUDED.methodology_id, title = EXCLUDED.title,
        decision_text = EXCLUDED.decision_text, rationale = EXCLUDED.rationale,
        provenance = EXCLUDED.provenance, recorded_by = EXCLUDED.recorded_by, recorded_at = now();
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_methodology_fact_requirement_set(_methodology_id uuid, _payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid; _status text; _n integer := 0; r jsonb;
BEGIN
  _uid := public.supervisory_methodology_require_manage(_methodology_id);
  SELECT status INTO _status FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _status NOT IN ('DRAFT','REVIEW') THEN
    RAISE EXCEPTION 'methodology_immutable: version status % is structurally frozen', _status
      USING ERRCODE = '22023'; END IF;
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'array' THEN
    RAISE EXCEPTION 'payload must be an array' USING ERRCODE = '22023'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(_payload) LOOP
    INSERT INTO public.supervisory_methodology_fact_requirement(
      methodology_id, fact_code, label, data_type, unit, period_expectation,
      source_type_expectation, materiality_parameter_code, is_required,
      auto_prefill_allowed, officer_edit_allowed, attribute_source, definition_status, provenance)
    VALUES (_methodology_id, upper(r->>'fact_code'), r->>'label', r->>'data_type', r->>'unit',
            r->>'period_expectation',
            CASE WHEN r ? 'source_type_expectation'
              THEN ARRAY(SELECT jsonb_array_elements_text(r->'source_type_expectation')) END,
            NULLIF(upper(COALESCE(r->>'materiality_parameter_code','')),''),
            COALESCE((r->>'is_required')::boolean, true),
            COALESCE((r->>'auto_prefill_allowed')::boolean, false),
            COALESCE((r->>'officer_edit_allowed')::boolean, true),
            COALESCE(r->>'attribute_source','DECLARED'),
            COALESCE(r->>'definition_status','ATTRIBUTES_PENDING'), r->'provenance')
    ON CONFLICT (methodology_id, fact_code) DO UPDATE SET
      label = EXCLUDED.label, data_type = EXCLUDED.data_type, unit = EXCLUDED.unit,
      period_expectation = EXCLUDED.period_expectation,
      source_type_expectation = EXCLUDED.source_type_expectation,
      materiality_parameter_code = EXCLUDED.materiality_parameter_code,
      is_required = EXCLUDED.is_required, auto_prefill_allowed = EXCLUDED.auto_prefill_allowed,
      officer_edit_allowed = EXCLUDED.officer_edit_allowed,
      attribute_source = EXCLUDED.attribute_source,
      definition_status = EXCLUDED.definition_status,
      provenance = EXCLUDED.provenance, updated_at = now();
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_attributes_set(_methodology_id uuid, _payload jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid; _status text; _n integer := 0; r jsonb; _qid uuid; _fact text;
        _axis text; _focus text; _sem text; _semid uuid;
BEGIN
  _uid := public.supervisory_methodology_require_manage(_methodology_id);
  SELECT status INTO _status FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _status NOT IN ('DRAFT','REVIEW') THEN
    RAISE EXCEPTION 'methodology_immutable: version status % is structurally frozen', _status
      USING ERRCODE = '22023'; END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(_payload) LOOP
    SELECT id INTO _qid FROM public.supervisory_methodology_question
     WHERE methodology_id = _methodology_id AND question_code = upper(r->>'question_code');
    IF _qid IS NULL THEN
      RAISE EXCEPTION 'not_found: question % in this methodology version', r->>'question_code'
        USING ERRCODE = '22023'; END IF;

    -- Axis is normalised at the boundary: only the two analytical axes are stored,
    -- and how a control is looked at stays in effectiveness_focus.
    _focus := r->>'effectiveness_focus';
    _axis  := upper(COALESCE(r->>'axis',''));
    IF _axis IN ('DESIGN','OPERATING','DESIGN_AND_OPERATING','CONTROL_EFFECTIVENESS') THEN
      IF _focus IS NULL AND _axis <> 'CONTROL_EFFECTIVENESS' THEN _focus := _axis; END IF;
      _axis := 'CONTROL_EFFECTIVENESS';
    ELSIF _axis IN ('INHERENT_EXPOSURE','CONTEXT') THEN
      _axis := 'INHERENT_EXPOSURE';
      _focus := COALESCE(_focus, 'INHERENT_EXPOSURE');
    ELSIF _axis = '' THEN
      _axis := NULL;
    ELSE
      RAISE EXCEPTION 'unsupported axis % for question %', r->>'axis', r->>'question_code'
        USING ERRCODE = '22023';
    END IF;

    _sem := NULLIF(upper(COALESCE(r->>'response_semantics_code','')),'');
    _semid := NULL;
    IF _sem IS NOT NULL THEN
      SELECT id INTO _semid FROM public.supervisory_methodology_semantic_profile
       WHERE methodology_id = _methodology_id AND semantic_code = _sem;
      IF _semid IS NULL THEN
        RAISE EXCEPTION 'not_found: semantic profile % is not defined for this methodology version; define it before attaching questions', _sem
          USING ERRCODE = '22023'; END IF;
    END IF;

    UPDATE public.supervisory_methodology_question SET
      axis = _axis,
      effectiveness_focus = _focus,
      question_class = r->>'question_class',
      response_semantics_code = _sem,
      response_semantics_profile_id = _semid,
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

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, rationale, actor_id, detail)
  VALUES (_methodology_id, 'QUESTION_ATTRIBUTES_SET', 'Reference attribute set applied', _uid,
          jsonb_build_object('questions', _n));
  RETURN _n;
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_methodology_question_purge(_methodology_id uuid, _rationale text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid; _status text; _n integer := 0; _responses integer := 0;
BEGIN
  _uid := public.supervisory_methodology_require_manage(_methodology_id);
  SELECT status INTO _status FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _status <> 'DRAFT' THEN
    RAISE EXCEPTION 'methodology_immutable: questions may only be purged on a DRAFT version (status %)', _status
      USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;

  SELECT count(*) INTO _responses
    FROM public.supervisory_assessment_response r
    JOIN public.supervisory_methodology_question q ON q.id = r.methodology_question_id
   WHERE q.methodology_id = _methodology_id;
  IF _responses > 0 THEN
    RAISE EXCEPTION 'refused: % recorded responses reference this version''s questions', _responses
      USING ERRCODE = '22023'; END IF;

  WITH del AS (
    DELETE FROM public.supervisory_methodology_question WHERE methodology_id = _methodology_id RETURNING 1)
  SELECT count(*) INTO _n FROM del;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, rationale, actor_id, detail)
  VALUES (_methodology_id, 'QUESTION_PURGE', btrim(_rationale), _uid, jsonb_build_object('removed', _n));
  RETURN _n;
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_methodology_new_version(_methodology_id uuid, _new_version text, _rationale text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid; _src public.supervisory_methodology; _new_id uuid;
BEGIN
  _uid := public.supervisory_methodology_require_manage(_methodology_id);
  SELECT * INTO _src FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.supervisory_methodology(
    code, domain_code, name, title, version, status, sector_id, regulator_id,
    definition, assessment_frequency_months, applicable_entity_types, applicable_sector_ids,
    scoring_scale, override_threshold, approval_required, next_review_rule,
    calculation_guidance, supersedes_id, origin, created_by)
  VALUES (_src.code, _src.domain_code, _src.name, _src.title, _new_version, 'DRAFT',
    _src.sector_id, _src.regulator_id, _src.definition, _src.assessment_frequency_months,
    _src.applicable_entity_types, _src.applicable_sector_ids, _src.scoring_scale,
    _src.override_threshold, _src.approval_required, _src.next_review_rule,
    _src.calculation_guidance, _src.id, _src.origin, _uid)
  RETURNING id INTO _new_id;

  INSERT INTO public.supervisory_methodology_dimension(
    methodology_id, dimension_code, dimension_group, dimension_kind, label, description,
    weight, evidence_required, sort_order, active, scoring_guidance, mandatory_questions,
    data_sources, evidence_requirements, min_evidence_count)
  SELECT _new_id, dimension_code, dimension_group, dimension_kind, label, description,
         weight, evidence_required, sort_order, active, scoring_guidance, mandatory_questions,
         data_sources, evidence_requirements, min_evidence_count
    FROM public.supervisory_methodology_dimension WHERE methodology_id = _methodology_id;

  -- Semantic profiles are version-scoped, so the new draft receives its own copy.
  INSERT INTO public.supervisory_methodology_semantic_profile(
    methodology_id, domain_code, semantic_code, label, description, response_meaning, active, profile_version, provenance)
  SELECT _new_id, domain_code, semantic_code, label, description, response_meaning, active,
         profile_version, COALESCE(provenance,'{}'::jsonb) || jsonb_build_object('carried_from_version', _src.version)
    FROM public.supervisory_methodology_semantic_profile WHERE methodology_id = _methodology_id;

  INSERT INTO public.supervisory_methodology_question(
    methodology_id, methodology_dimension_id, question_code, prompt, guidance,
    response_options, mandatory, requires_observation, requires_evidence,
    min_evidence_count, allow_not_applicable, na_requires_rationale,
    question_version, sort_order, active,
    axis, effectiveness_focus, question_class, response_semantics_code, response_semantics_profile_id,
    calculation_participation, trigger_condition, applicability_rule, supervisory_intent,
    na_conditions, minimum_evidence_note, evidence_basis_types,
    supervisory_judgement_required, factual_auto_prefill_possible,
    standards_reference, standards_reference_strength, standards_reference_review,
    sector_classification, sector_notes, sector_applicability,
    change_classification, predecessor_mapping, provenance)
  SELECT _new_id, nd.id, q.question_code, q.prompt, q.guidance,
         q.response_options, q.mandatory, q.requires_observation, q.requires_evidence,
         q.min_evidence_count, q.allow_not_applicable, q.na_requires_rationale,
         q.question_version, q.sort_order, q.active,
         q.axis, q.effectiveness_focus, q.question_class, q.response_semantics_code, np.id,
         q.calculation_participation, q.trigger_condition, q.applicability_rule, q.supervisory_intent,
         q.na_conditions, q.minimum_evidence_note, q.evidence_basis_types,
         q.supervisory_judgement_required, q.factual_auto_prefill_possible,
         q.standards_reference, q.standards_reference_strength, q.standards_reference_review,
         q.sector_classification, q.sector_notes, q.sector_applicability,
         q.change_classification, q.predecessor_mapping, q.provenance
    FROM public.supervisory_methodology_question q
    JOIN public.supervisory_methodology_dimension od ON od.id = q.methodology_dimension_id
    JOIN public.supervisory_methodology_dimension nd
      ON nd.methodology_id = _new_id AND nd.dimension_code = od.dimension_code
    LEFT JOIN public.supervisory_methodology_semantic_profile np
      ON np.methodology_id = _new_id AND np.semantic_code = q.response_semantics_code
   WHERE q.methodology_id = _methodology_id
  ON CONFLICT (methodology_dimension_id, question_code) DO NOTHING;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, to_status, rationale, actor_id, detail)
  VALUES (_new_id, 'VERSION_CREATED', 'DRAFT', btrim(_rationale), _uid,
          jsonb_build_object('supersedes_id', _methodology_id, 'version', _new_version));

  RETURN _new_id;
END $function$;

-- ---------------------------------------------------------------------
-- 8. Lifecycle: reference / regulator approval boundary + maker-checker
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_methodology_lifecycle(_methodology_id uuid, _to_status text, _rationale text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid; _row public.supervisory_methodology; _allowed boolean; _to text; _perm text; _approval uuid;
BEGIN
  _to := upper(COALESCE(_to_status,''));
  SELECT * INTO _row FROM public.supervisory_methodology WHERE id = _methodology_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023'; END IF;

  _uid := public.supervisory_methodology_require_manage(_methodology_id);

  _allowed := CASE _row.status
    WHEN 'DRAFT'    THEN _to = 'REVIEW'
    WHEN 'REVIEW'   THEN _to IN ('APPROVED','DRAFT')
    WHEN 'APPROVED' THEN _to = 'ACTIVE'
    WHEN 'ACTIVE'   THEN _to = 'RETIRED'
    ELSE false END;
  IF NOT _allowed THEN
    RAISE EXCEPTION 'transition_not_permitted: % -> %', _row.status, _to USING ERRCODE = '22023'; END IF;

  IF _to IN ('APPROVED','RETIRED') AND length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;

  -- A MIPL reference template is never regulator policy. It may be reference-reviewed
  -- (DRAFT -> REVIEW) but can never be approved or activated; a regulator must adopt it.
  IF _to IN ('APPROVED','ACTIVE') AND _row.origin = 'MIPL_REFERENCE' THEN
    RAISE EXCEPTION 'reference_template_not_adoptable_in_place: % % is a MIPL reference template; a regulator must adopt it through supervisory_methodology_adopt_reference before it can be approved or activated',
      _row.code, _row.version USING ERRCODE = '42501';
  END IF;

  IF _to = 'APPROVED' THEN
    -- Substantive regulator approval authority. Technical privilege is not enough.
    PERFORM public.supervisory_methodology_require_regulator_approval(_methodology_id);
    SELECT regulator_approval_permission INTO _perm
      FROM public.supervisory_domain_authority WHERE domain_code = _row.domain_code;
    -- Maker / checker, with no super-admin escape.
    IF _row.created_by = _uid THEN
      RAISE EXCEPTION 'not_authorized: the author of a methodology version cannot approve it'
        USING ERRCODE = '42501'; END IF;
    IF _row.reviewed_by IS NOT NULL AND _row.reviewed_by = _uid THEN
      RAISE EXCEPTION 'not_authorized: the reviewer who submitted this version cannot also approve it'
        USING ERRCODE = '42501'; END IF;

    UPDATE public.supervisory_methodology_regulator_approval
       SET is_current = false, updated_at = now()
     WHERE methodology_id = _methodology_id AND is_current;

    INSERT INTO public.supervisory_methodology_regulator_approval(
      methodology_id, regulator_id, decision, authority_permission,
      submitted_by, decided_by, rationale, is_current)
    VALUES (_methodology_id, _row.regulator_id, 'APPROVED', _perm,
            _row.reviewed_by, _uid, btrim(_rationale), true)
    RETURNING id INTO _approval;
  END IF;

  IF _to = 'ACTIVE' THEN
    SELECT id INTO _approval FROM public.supervisory_methodology_regulator_approval
     WHERE methodology_id = _methodology_id AND is_current AND decision = 'APPROVED';
    IF _approval IS NULL THEN
      RAISE EXCEPTION 'activation_refused: no current regulator approval is recorded for % %',
        _row.code, _row.version USING ERRCODE = '42501'; END IF;

    UPDATE public.supervisory_methodology
       SET status = 'SUPERSEDED', effective_to = COALESCE(effective_to, current_date), updated_at = now()
     WHERE domain_code = _row.domain_code
       AND COALESCE(sector_id::text,'*') = COALESCE(_row.sector_id::text,'*')
       AND COALESCE(regulator_id::text,'*') = COALESCE(_row.regulator_id::text,'*')
       AND status = 'ACTIVE' AND id <> _methodology_id;
  END IF;

  UPDATE public.supervisory_methodology SET
    status = _to,
    reviewed_by  = CASE WHEN _to = 'REVIEW'   THEN _uid ELSE reviewed_by END,
    reviewed_at  = CASE WHEN _to = 'REVIEW'   THEN now() ELSE reviewed_at END,
    approved_by  = CASE WHEN _to = 'APPROVED' THEN _uid ELSE approved_by END,
    approved_at  = CASE WHEN _to = 'APPROVED' THEN now() ELSE approved_at END,
    activated_at = CASE WHEN _to = 'ACTIVE'   THEN now() ELSE activated_at END,
    retired_at   = CASE WHEN _to = 'RETIRED'  THEN now() ELSE retired_at END,
    effective_from = CASE WHEN _to = 'ACTIVE' THEN COALESCE(effective_from, current_date) ELSE effective_from END,
    updated_at = now()
  WHERE id = _methodology_id;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, from_status, to_status, rationale, actor_id, detail)
  VALUES (_methodology_id, 'STATUS_CHANGE', _row.status, _to, btrim(COALESCE(_rationale,'')), _uid,
          jsonb_build_object('origin', _row.origin, 'regulator_approval_id', _approval));

  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION', 'supervisory_methodology', _methodology_id,
    jsonb_build_object('status', _row.status), jsonb_build_object('status', _to),
    'Methodology ' || _row.code || ' ' || _row.version || ': ' || _row.status || ' -> ' || _to);

  RETURN jsonb_build_object('id', _methodology_id, 'from_status', _row.status, 'to_status', _to,
                            'regulator_approval_id', _approval);
END $function$;

-- ---------------------------------------------------------------------
-- 9. Governed regulator adoption of a MIPL reference template
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.supervisory_methodology_adopt_reference(
  _reference_methodology_id uuid, _regulator_id uuid, _rationale text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _uid uuid; _src public.supervisory_methodology; _new_id uuid; _reg_code text; _ver text;
BEGIN
  _uid := public.supervisory_methodology_require_manage(_reference_methodology_id);
  SELECT * INTO _src FROM public.supervisory_methodology WHERE id = _reference_methodology_id;
  IF _src.origin <> 'MIPL_REFERENCE' THEN
    RAISE EXCEPTION 'not_a_reference_template: % % has origin %', _src.code, _src.version, _src.origin
      USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;
  SELECT code INTO _reg_code FROM public.regulators WHERE id = _regulator_id;
  IF _reg_code IS NULL THEN
    RAISE EXCEPTION 'not_found: regulator' USING ERRCODE = '22023'; END IF;

  _ver := _src.version || '+' || _reg_code;
  IF EXISTS (SELECT 1 FROM public.supervisory_methodology WHERE code = _src.code AND version = _ver) THEN
    RAISE EXCEPTION 'already_adopted: % % is already adopted by %', _src.code, _src.version, _reg_code
      USING ERRCODE = '22023'; END IF;

  INSERT INTO public.supervisory_methodology(
    code, domain_code, name, title, version, status, sector_id, regulator_id,
    definition, assessment_frequency_months, applicable_entity_types, applicable_sector_ids,
    scoring_scale, override_threshold, approval_required, next_review_rule,
    calculation_guidance, origin, adopted_from_id, created_by)
  VALUES (_src.code, _src.domain_code, _src.name, _src.title, _ver, 'DRAFT',
    _src.sector_id, _regulator_id, _src.definition, _src.assessment_frequency_months,
    _src.applicable_entity_types, _src.applicable_sector_ids, _src.scoring_scale,
    _src.override_threshold, _src.approval_required, _src.next_review_rule,
    _src.calculation_guidance, 'REGULATOR_ADOPTED', _src.id, _uid)
  RETURNING id INTO _new_id;

  INSERT INTO public.supervisory_methodology_dimension(
    methodology_id, dimension_code, dimension_group, dimension_kind, label, description,
    weight, evidence_required, sort_order, active, scoring_guidance, mandatory_questions,
    data_sources, evidence_requirements, min_evidence_count, provenance)
  SELECT _new_id, dimension_code, dimension_group, dimension_kind, label, description,
         weight, evidence_required, sort_order, active, scoring_guidance, mandatory_questions,
         data_sources, evidence_requirements, min_evidence_count,
         COALESCE(provenance,'{}'::jsonb) || jsonb_build_object('adopted_from', _src.id)
    FROM public.supervisory_methodology_dimension WHERE methodology_id = _reference_methodology_id;

  -- The approved semantic snapshot travels with the adoption.
  INSERT INTO public.supervisory_methodology_semantic_profile(
    methodology_id, domain_code, semantic_code, label, description, response_meaning, active, profile_version, provenance)
  SELECT _new_id, domain_code, semantic_code, label, description, response_meaning, active, profile_version,
         COALESCE(provenance,'{}'::jsonb) || jsonb_build_object(
           'adopted_from_methodology', _src.id, 'adopted_from_version', _src.version)
    FROM public.supervisory_methodology_semantic_profile WHERE methodology_id = _reference_methodology_id;

  INSERT INTO public.supervisory_methodology_fact_requirement(
    methodology_id, fact_code, label, data_type, unit, numerator_basis, denominator_basis,
    period_expectation, source_type_expectation, materiality_parameter_code, is_required,
    auto_prefill_allowed, officer_edit_allowed, attribute_source, definition_status, provenance)
  SELECT _new_id, fact_code, label, data_type, unit, numerator_basis, denominator_basis,
         period_expectation, source_type_expectation, materiality_parameter_code, is_required,
         auto_prefill_allowed, officer_edit_allowed, attribute_source, definition_status,
         COALESCE(provenance,'{}'::jsonb) || jsonb_build_object('adopted_from_methodology', _src.id)
    FROM public.supervisory_methodology_fact_requirement WHERE methodology_id = _reference_methodology_id;

  -- Parameter DEFINITIONS only; the adopting regulator calibrates the values.
  INSERT INTO public.supervisory_methodology_parameter(
    methodology_id, parameter_code, parameter_kind, label, data_type, unit, approval_status, provenance)
  SELECT _new_id, parameter_code, parameter_kind, label, data_type, unit, 'UNAPPROVED',
         COALESCE(provenance,'{}'::jsonb) || jsonb_build_object(
           'adopted_from_methodology', _src.id, 'value_carried', false)
    FROM public.supervisory_methodology_parameter WHERE methodology_id = _reference_methodology_id;

  INSERT INTO public.supervisory_methodology_question(
    methodology_id, methodology_dimension_id, question_code, prompt, guidance,
    response_options, mandatory, requires_observation, requires_evidence,
    min_evidence_count, allow_not_applicable, na_requires_rationale,
    question_version, sort_order, active,
    axis, effectiveness_focus, question_class, response_semantics_code, response_semantics_profile_id,
    calculation_participation, trigger_condition, applicability_rule, supervisory_intent,
    na_conditions, minimum_evidence_note, evidence_basis_types,
    supervisory_judgement_required, factual_auto_prefill_possible,
    standards_reference, standards_reference_strength, standards_reference_review,
    sector_classification, sector_notes, sector_applicability,
    change_classification, predecessor_mapping, provenance)
  SELECT _new_id, nd.id, q.question_code, q.prompt, q.guidance,
         q.response_options, q.mandatory, q.requires_observation, q.requires_evidence,
         q.min_evidence_count, q.allow_not_applicable, q.na_requires_rationale,
         q.question_version, q.sort_order, q.active,
         q.axis, q.effectiveness_focus, q.question_class, q.response_semantics_code, np.id,
         q.calculation_participation, q.trigger_condition, q.applicability_rule, q.supervisory_intent,
         q.na_conditions, q.minimum_evidence_note, q.evidence_basis_types,
         q.supervisory_judgement_required, q.factual_auto_prefill_possible,
         q.standards_reference, q.standards_reference_strength, q.standards_reference_review,
         q.sector_classification, q.sector_notes, q.sector_applicability,
         q.change_classification, q.predecessor_mapping,
         COALESCE(q.provenance,'{}'::jsonb) || jsonb_build_object(
           'adopted_from_methodology', _src.id, 'adopted_from_version', _src.version)
    FROM public.supervisory_methodology_question q
    JOIN public.supervisory_methodology_dimension od ON od.id = q.methodology_dimension_id
    JOIN public.supervisory_methodology_dimension nd
      ON nd.methodology_id = _new_id AND nd.dimension_code = od.dimension_code
    LEFT JOIN public.supervisory_methodology_semantic_profile np
      ON np.methodology_id = _new_id AND np.semantic_code = q.response_semantics_code
   WHERE q.methodology_id = _reference_methodology_id;

  INSERT INTO public.supervisory_methodology_question_fact(question_id, fact_requirement_id, is_required)
  SELECT nq.id, nf.id, qf.is_required
    FROM public.supervisory_methodology_question_fact qf
    JOIN public.supervisory_methodology_question oq ON oq.id = qf.question_id
    JOIN public.supervisory_methodology_fact_requirement of ON of.id = qf.fact_requirement_id
    JOIN public.supervisory_methodology_question nq
      ON nq.methodology_id = _new_id AND nq.question_code = oq.question_code
    JOIN public.supervisory_methodology_fact_requirement nf
      ON nf.methodology_id = _new_id AND nf.fact_code = of.fact_code
   WHERE oq.methodology_id = _reference_methodology_id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.supervisory_methodology_event(methodology_id, event_type, to_status, rationale, actor_id, detail)
  VALUES (_new_id, 'REFERENCE_ADOPTED', 'DRAFT', btrim(_rationale), _uid,
          jsonb_build_object(
            'reference_methodology_id', _src.id,
            'reference_version', _src.version,
            'regulator_id', _regulator_id,
            'reference_decisions', (SELECT COALESCE(jsonb_agg(decision_code ORDER BY decision_code),'[]'::jsonb)
                                      FROM public.supervisory_methodology_reference_decision
                                     WHERE methodology_id = _src.id),
            'parameter_values_carried', false,
            'evidence_or_documents_copied', false));

  RETURN _new_id;
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_methodology_adopt_reference(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_adopt_reference(uuid, uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.supervisory_methodology_semantic_profile_set(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_semantic_profile_set(uuid, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 10. Domain-scoped authority for the remaining generic writers
-- ---------------------------------------------------------------------
DO $do$
DECLARE _def text;
BEGIN
  FOR _def IN
    SELECT pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('supervisory_methodology_dimension_save','supervisory_methodology_save',
                         'supervisory_methodology_question_sync')
       AND pg_get_functiondef(p.oid) LIKE '%supervisory_spine.manage_config%'
  LOOP
    -- Replace the domain-agnostic permission array with the target-derived check.
    _def := replace(_def,
      'public.supervisory_spine_require(ARRAY[''aml_supervision.manage_config'',
            ''supervisory_spine.manage_config'',''prudential_supervision.manage_config''])',
      'public.supervisory_methodology_require_manage(_methodology_id)');
    EXECUTE _def;
  END LOOP;
END $do$;