-- ============================================================
-- 1. Dedicated methodology-policy approval permissions
-- ============================================================
INSERT INTO public.sec_permissions(module_id, key, label, description, is_sensitive, is_enforced, is_system, is_active)
SELECT m.id, 'methodology_approve',
       'Approve supervisory methodology policy',
       'Substantive regulator authority to approve a supervisory methodology VERSION as policy. Distinct from approving an individual assessment (approve).',
       true, true, true, true
  FROM public.sec_modules m
 WHERE m.key IN ('aml_supervision','prudential_supervision')
   AND NOT EXISTS (SELECT 1 FROM public.sec_permissions p WHERE p.module_id = m.id AND p.key = 'methodology_approve');

-- Role template principle: the Head of AML/CFT is the designated methodology authority.
-- The AML/CFT Supervision Supervisor keeps assessment approval and gains nothing here.
INSERT INTO public.sec_role_template_permissions(template_id, permission_id)
SELECT t.id, p.id
  FROM public.sec_role_templates t
  JOIN public.sec_permissions p ON p.key = 'methodology_approve'
  JOIN public.sec_modules m ON m.id = p.module_id AND m.key = 'aml_supervision'
 WHERE t.key = 'aml_head'
   AND NOT EXISTS (SELECT 1 FROM public.sec_role_template_permissions x WHERE x.template_id = t.id AND x.permission_id = p.id);

INSERT INTO public.sec_role_permissions(role_id, permission_id)
SELECT r.id, p.id
  FROM public.sec_roles r
  JOIN public.sec_permissions p ON p.key = 'methodology_approve'
  JOIN public.sec_modules m ON m.id = p.module_id AND m.key = 'aml_supervision'
 WHERE r.key = 'aml_head'
   AND NOT EXISTS (SELECT 1 FROM public.sec_role_permissions x WHERE x.role_id = r.id AND x.permission_id = p.id);

-- ============================================================
-- 2. Domain authority: methodology approval is its own permission
-- ============================================================
ALTER TABLE public.supervisory_domain_authority
  RENAME COLUMN regulator_approval_permission TO methodology_approval_permission;

ALTER TABLE public.supervisory_domain_authority
  ADD COLUMN IF NOT EXISTS assessment_approval_permission text;

COMMENT ON COLUMN public.supervisory_domain_authority.methodology_approval_permission IS
  'Substantive regulator authority to approve a methodology VERSION as policy. Never an assessment approval permission.';
COMMENT ON COLUMN public.supervisory_domain_authority.assessment_approval_permission IS
  'Recorded for contrast only: approves individual assessments. NEVER consulted for methodology policy approval.';

UPDATE public.supervisory_domain_authority SET
  methodology_approval_permission = 'aml_supervision.methodology_approve',
  assessment_approval_permission  = 'aml_supervision.approve',
  notes = 'AML/CFT configuration authority plus a dedicated methodology-policy approval permission. Assessment approval never authorises methodology policy.',
  updated_at = now()
 WHERE domain_code = 'AML_CFT';

UPDATE public.supervisory_domain_authority SET
  methodology_approval_permission = 'prudential_supervision.methodology_approve',
  assessment_approval_permission  = 'supervisory_spine.approve',
  notes = 'Prudential configuration authority plus a dedicated methodology-policy approval permission.',
  updated_at = now()
 WHERE domain_code = 'PRUDENTIAL';

UPDATE public.supervisory_domain_authority SET
  methodology_approval_permission = NULL,
  assessment_approval_permission  = 'supervisory_spine.approve',
  notes = 'GAP (platform backlog): market conduct has neither market_conduct.manage_config nor a methodology-policy approval permission. Methodology configuration is super-administrator-only and methodology approval is refused outright. Does not block AML/CFT.',
  updated_at = now()
 WHERE domain_code = 'MARKET_CONDUCT';

-- ============================================================
-- 3. Canonical actor -> regulator authority (strict, fail-closed)
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_regulator_scope_for(_user_id uuid, _module text, _action text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _qualified boolean := false;
  _all boolean := false;
  _unscoped boolean := false;
  _regs uuid[] := '{}';
  rec record;
  vals uuid[];
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('qualified',false,'all',false,'unscoped',false,'regulators','[]'::jsonb);
  END IF;

  FOR rec IN
    SELECT st.key AS scope_key, rs.id AS role_scope_id
      FROM public.sec_user_roles ur
      JOIN public.sec_roles r ON r.id = ur.role_id
      JOIN public.sec_role_permissions rp ON rp.role_id = r.id
      JOIN public.sec_permissions p ON p.id = rp.permission_id
      JOIN public.sec_modules m ON m.id = p.module_id
      LEFT JOIN public.sec_role_scopes rs ON rs.role_id = r.id AND rs.module_id = m.id
      LEFT JOIN public.sec_scope_types st ON st.id = rs.scope_type_id
     WHERE ur.user_id = _user_id
       AND COALESCE(ur.status,'active') = 'active'
       AND (ur.effective_from IS NULL OR ur.effective_from <= now())
       AND (ur.effective_until IS NULL OR ur.effective_until >= now())
       AND COALESCE(r.status,'active') = 'active'
       AND COALESCE(p.is_active,true)
       AND lower(m.key) = lower(regexp_replace(COALESCE(_module,''),'\s+','_','g'))
       AND lower(p.key) = lower(COALESCE(_action,''))
  LOOP
    _qualified := true;
    IF rec.role_scope_id IS NULL THEN
      -- no explicit scope decision on this role for this module
      _unscoped := true;
    ELSIF rec.scope_key = 'all' THEN
      _all := true;
    ELSIF rec.scope_key = 'regulator' THEN
      SELECT COALESCE(array_agg(v.value_id) FILTER (WHERE v.value_id IS NOT NULL),'{}')
        INTO vals FROM public.sec_role_scope_values v WHERE v.role_scope_id = rec.role_scope_id;
      _regs := _regs || vals;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'qualified', _qualified, 'all', _all, 'unscoped', _unscoped,
    'regulators', to_jsonb(_regs));
END $function$;

COMMENT ON FUNCTION public.user_regulator_scope_for(uuid,text,text) IS
  'Strict regulator scope of a permission grant. No super-administrator short-circuit and no implicit widening: a grant carrying no explicit scope decision is reported as unscoped, never as all regulators.';

CREATE OR REPLACE FUNCTION public.user_has_regulator_authority(_user_id uuid, _module text, _action text, _regulator_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE g jsonb;
BEGIN
  IF _user_id IS NULL OR COALESCE(btrim(_module),'') = '' THEN RETURN false; END IF;
  g := public.user_regulator_scope_for(_user_id, _module, _action);
  IF NOT COALESCE((g->>'qualified')::boolean,false) THEN RETURN false; END IF;
  IF COALESCE((g->>'all')::boolean,false) THEN RETURN true; END IF;
  IF _regulator_id IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(g->'regulators') x WHERE x::uuid = _regulator_id);
END $function$;

COMMENT ON FUNCTION public.user_has_regulator_authority(uuid,text,text,uuid) IS
  'True only when the user holds <module>.<action> AND an explicit scope decision covers the target regulator (scope all, or that regulator listed). Fail-closed: unscoped grants and NULL regulator without an all scope return false.';

REVOKE EXECUTE ON FUNCTION public.user_regulator_scope_for(uuid,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_has_regulator_authority(uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_regulator_scope_for(uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_regulator_authority(uuid,text,text,uuid) TO authenticated, service_role;

-- ============================================================
-- 4. Domain configuration authority for a target regulator
-- ============================================================
CREATE OR REPLACE FUNCTION public.supervisory_domain_require_manage_for_regulator(_domain_code text, _regulator_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _d text; _perm text; _reg text;
BEGIN
  _d := upper(btrim(COALESCE(_domain_code,'')));
  _uid := public.supervisory_domain_require_manage(_d);   -- authentication + domain permission

  SELECT code INTO _reg FROM public.regulators WHERE id = _regulator_id;
  IF _reg IS NULL THEN
    RAISE EXCEPTION 'not_found: regulator' USING ERRCODE = '22023'; END IF;

  -- Platform administration may operate for any regulator (technical authority only).
  IF public.is_super_admin(_uid) THEN RETURN _uid; END IF;

  SELECT manage_config_permission INTO _perm
    FROM public.supervisory_domain_authority WHERE domain_code = _d;

  IF public.user_has_regulator_authority(_uid, split_part(_perm,'.',1), split_part(_perm,'.',2), _regulator_id) THEN
    RETURN _uid; END IF;

  RAISE EXCEPTION 'not_authorized: % is held without authority to act for regulator %; the caller-supplied regulator is a target, not authority', _perm, _reg
    USING ERRCODE = '42501';
END $function$;

REVOKE EXECUTE ON FUNCTION public.supervisory_domain_require_manage_for_regulator(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_domain_require_manage_for_regulator(text,uuid) TO authenticated, service_role;

-- ============================================================
-- 5. Methodology approval authority: dedicated permission + regulator scope
-- ============================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_require_regulator_approval(_methodology_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _d text; _perm text; _reg uuid; _regcode text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;

  SELECT m.domain_code, m.regulator_id, a.methodology_approval_permission
    INTO _d, _reg, _perm
    FROM public.supervisory_methodology m
    LEFT JOIN public.supervisory_domain_authority a ON a.domain_code = m.domain_code
   WHERE m.id = _methodology_id;
  IF _d IS NULL THEN RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023'; END IF;

  IF _perm IS NULL THEN
    RAISE EXCEPTION 'not_authorized: no dedicated methodology approval permission is registered for domain %; methodology policy cannot be approved', _d
      USING ERRCODE = '42501'; END IF;

  SELECT code INTO _regcode FROM public.regulators WHERE id = _reg;

  -- No super-administrator escape: technical administration is not substantive
  -- regulator methodology approval authority.
  IF public.user_has_regulator_authority(_uid, split_part(_perm,'.',1), split_part(_perm,'.',2), _reg) THEN
    RETURN _uid; END IF;

  RAISE EXCEPTION 'not_authorized: % within the scope of regulator % is the methodology approval authority for %; assessment approval and platform administration do not substitute',
    _perm, COALESCE(_regcode,'(global)'), _d USING ERRCODE = '42501';
END $function$;

-- lifecycle: record the dedicated permission on the register row
CREATE OR REPLACE FUNCTION public.supervisory_methodology_lifecycle(_methodology_id uuid, _to_status text, _rationale text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF _to IN ('APPROVED','ACTIVE') AND _row.origin = 'MIPL_REFERENCE' THEN
    RAISE EXCEPTION 'reference_template_not_adoptable_in_place: % % is a MIPL reference template; a regulator must adopt it through supervisory_methodology_adopt_reference before it can be approved or activated',
      _row.code, _row.version USING ERRCODE = '42501';
  END IF;

  IF _to = 'APPROVED' THEN
    -- Substantive regulator approval authority, scoped to the version's regulator.
    PERFORM public.supervisory_methodology_require_regulator_approval(_methodology_id);
    SELECT methodology_approval_permission INTO _perm
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
  VALUES (_methodology_id, 'LIFECYCLE', _row.status, _to, btrim(_rationale), _uid,
          jsonb_build_object('regulator_approval_id', _approval, 'authority_permission', _perm));

  RETURN jsonb_build_object('id', _methodology_id, 'status', _to, 'regulator_approval_id', _approval);
END $function$;

-- ============================================================
-- 6. Adoption is regulator-scoped
-- ============================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_adopt_reference(_reference_methodology_id uuid, _regulator_id uuid, _rationale text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _src public.supervisory_methodology; _new_id uuid; _reg_code text; _ver text;
BEGIN
  SELECT * INTO _src FROM public.supervisory_methodology WHERE id = _reference_methodology_id;
  IF _src.id IS NULL THEN RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023'; END IF;
  IF _src.origin <> 'MIPL_REFERENCE' THEN
    RAISE EXCEPTION 'not_a_reference_template: % % has origin %', _src.code, _src.version, _src.origin
      USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;

  -- actor + target domain + target regulator, all proven server-side
  _uid := public.supervisory_domain_require_manage_for_regulator(_src.domain_code, _regulator_id);

  SELECT code INTO _reg_code FROM public.regulators WHERE id = _regulator_id;

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

-- ============================================================
-- 7. Approval register integrity, enforced in the database
-- ============================================================
CREATE OR REPLACE FUNCTION public.smra_integrity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _m public.supervisory_methodology; _perm text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.methodology_id <> OLD.methodology_id
       OR COALESCE(NEW.regulator_id::text,'*') <> COALESCE(OLD.regulator_id::text,'*')
       OR NEW.decision <> OLD.decision
       OR COALESCE(NEW.decided_by::text,'') <> COALESCE(OLD.decided_by::text,'')
       OR COALESCE(NEW.submitted_by::text,'') <> COALESCE(OLD.submitted_by::text,'')
       OR COALESCE(NEW.rationale,'') <> COALESCE(OLD.rationale,'') THEN
      RAISE EXCEPTION 'approval_record_immutable: a recorded methodology approval decision cannot be rewritten; record a new decision instead'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO _m FROM public.supervisory_methodology WHERE id = NEW.methodology_id;
  IF _m.id IS NULL THEN
    RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023'; END IF;

  IF _m.origin = 'MIPL_REFERENCE' THEN
    RAISE EXCEPTION 'reference_template_cannot_carry_regulator_approval: % % is a MIPL reference template',
      _m.code, _m.version USING ERRCODE = '42501'; END IF;

  IF _m.origin NOT IN ('REGULATOR_ADOPTED','REGULATOR_AUTHORED') THEN
    RAISE EXCEPTION 'approval_origin_invalid: origin % cannot carry a regulator approval', _m.origin
      USING ERRCODE = '42501'; END IF;

  IF COALESCE(NEW.regulator_id::text,'*') <> COALESCE(_m.regulator_id::text,'*') THEN
    RAISE EXCEPTION 'approval_regulator_mismatch: approval regulator does not match the methodology regulator'
      USING ERRCODE = '42501'; END IF;

  IF NEW.decided_by IS NULL THEN
    RAISE EXCEPTION 'approval_decider_required' USING ERRCODE = '42501'; END IF;

  IF NEW.submitted_by IS NOT NULL AND NEW.submitted_by = NEW.decided_by THEN
    RAISE EXCEPTION 'maker_checker_violation: the submitter of a methodology version cannot be its approver'
      USING ERRCODE = '42501'; END IF;

  SELECT methodology_approval_permission INTO _perm
    FROM public.supervisory_domain_authority WHERE domain_code = _m.domain_code;
  IF _perm IS NULL THEN
    RAISE EXCEPTION 'not_authorized: no dedicated methodology approval permission is registered for domain %', _m.domain_code
      USING ERRCODE = '42501'; END IF;

  IF NOT public.user_has_regulator_authority(
        NEW.decided_by, split_part(_perm,'.',1), split_part(_perm,'.',2), NEW.regulator_id) THEN
    RAISE EXCEPTION 'approval_decider_not_regulator_authorised: the recorded decider does not hold % within the regulator scope of this methodology', _perm
      USING ERRCODE = '42501'; END IF;

  NEW.authority_permission := _perm;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS smra_integrity ON public.supervisory_methodology_regulator_approval;
CREATE TRIGGER smra_integrity
  BEFORE INSERT OR UPDATE ON public.supervisory_methodology_regulator_approval
  FOR EACH ROW EXECUTE FUNCTION public.smra_integrity_guard();

-- ============================================================
-- 8. Approval register + methodology read visibility
-- ============================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_oversight_reader(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND public.has_any_permission(_user_id,
    ARRAY['audit_management.view','executive_oversight.view_cross_module_audit']);
$function$;

CREATE OR REPLACE FUNCTION public.supervisory_methodology_regulator_scope_readable(_domain_code text, _regulator_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _mod text; _perm text;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_uid) THEN RETURN true; END IF;              -- platform administration
  IF public.supervisory_methodology_oversight_reader(_uid) THEN RETURN true; END IF;  -- enterprise oversight

  SELECT split_part(manage_config_permission,'.',1), methodology_approval_permission
    INTO _mod, _perm
    FROM public.supervisory_domain_authority WHERE domain_code = _domain_code;

  IF _mod IS NOT NULL AND public.user_has_regulator_authority(_uid, _mod, 'view', _regulator_id) THEN
    RETURN true; END IF;
  IF _perm IS NOT NULL AND public.user_has_regulator_authority(
       _uid, split_part(_perm,'.',1), split_part(_perm,'.',2), _regulator_id) THEN
    RETURN true; END IF;

  RETURN false;
END $function$;

REVOKE EXECUTE ON FUNCTION public.supervisory_methodology_oversight_reader(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supervisory_methodology_regulator_scope_readable(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_oversight_reader(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_regulator_scope_readable(text,uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS smra_read ON public.supervisory_methodology_regulator_approval;
CREATE POLICY smra_read ON public.supervisory_methodology_regulator_approval
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.supervisory_methodology m
     WHERE m.id = supervisory_methodology_regulator_approval.methodology_id
       AND public.supervisory_methodology_regulator_scope_readable(m.domain_code, supervisory_methodology_regulator_approval.regulator_id)
  ));

-- Regulator-specific methodology versions obey regulator visibility; domain-neutral
-- reference templates and global versions stay visible to domain viewers.
DROP POLICY IF EXISTS supervisory_methodology_read ON public.supervisory_methodology;
CREATE POLICY supervisory_methodology_read ON public.supervisory_methodology
  FOR SELECT TO authenticated
  USING (
    (
      regulator_id IS NULL
      AND (
        public.is_super_admin(auth.uid())
        OR public.has_any_permission(auth.uid(), ARRAY[
             'supervisory_spine.view','prudential_supervision.view',
             'market_conduct.run_conduct_analytics','aml_supervision.view'])
      )
    )
    OR (
      regulator_id IS NOT NULL
      AND public.supervisory_methodology_regulator_scope_readable(domain_code, regulator_id)
    )
  );
