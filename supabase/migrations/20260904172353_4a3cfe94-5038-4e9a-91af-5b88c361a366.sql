CREATE OR REPLACE FUNCTION public.supervisory_methodology_review_readiness(_methodology_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
DECLARE
  _m record;
  _dims int; _qs int; _profiles int;
  _facts int; _facts_pending int;
  _params int; _params_unapproved int; _params_valued int;
  _decisions int; _decisions_approved int; _decisions_reg_approved int;
  _adoptions int;
  _approval record;
  _calc_total int; _calc_active int; _calc_scores int; _calc_bands int; _calc_matrix int;
  _legacy int; _legacy_decision text; _legacy_state text; _legacy_headline text;
  _layers jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _m FROM supervisory_methodology WHERE id = _methodology_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Methodology not found or not visible' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO _dims FROM supervisory_methodology_dimension WHERE methodology_id = _m.id;
  SELECT count(*) INTO _qs FROM supervisory_methodology_question WHERE methodology_id = _m.id AND active;
  SELECT count(*) INTO _profiles FROM supervisory_methodology_semantic_profile WHERE methodology_id = _m.id;

  SELECT count(*), count(*) FILTER (WHERE definition_status <> 'COMPLETE')
    INTO _facts, _facts_pending
    FROM supervisory_methodology_fact_requirement WHERE methodology_id = _m.id;

  SELECT count(*),
         count(*) FILTER (WHERE COALESCE(approval_status, 'UNAPPROVED') <> 'APPROVED'),
         count(*) FILTER (WHERE value_numeric IS NOT NULL OR value_text IS NOT NULL)
    INTO _params, _params_unapproved, _params_valued
    FROM supervisory_methodology_parameter WHERE methodology_id = _m.id;

  SELECT count(*),
         count(*) FILTER (WHERE status = 'REFERENCE_APPROVED'),
         count(*) FILTER (WHERE regulator_approval_recorded)
    INTO _decisions, _decisions_approved, _decisions_reg_approved
    FROM supervisory_methodology_reference_decision WHERE methodology_id = _m.id;

  SELECT count(*) INTO _adoptions FROM supervisory_methodology WHERE adopted_from_id = _m.id;

  SELECT * INTO _approval FROM supervisory_methodology_regulator_approval
   WHERE methodology_id = _m.id AND is_current;

  SELECT count(*), count(*) FILTER (WHERE status = 'ACTIVE')
    INTO _calc_total, _calc_active
    FROM supervisory_calculation_config WHERE methodology_id = _m.id;
  SELECT count(*) INTO _calc_scores FROM supervisory_calculation_response_score s
    WHERE s.config_id IN (SELECT id FROM supervisory_calculation_config WHERE methodology_id = _m.id);
  SELECT count(*) INTO _calc_bands FROM supervisory_calculation_band b
    WHERE b.config_id IN (SELECT id FROM supervisory_calculation_config WHERE methodology_id = _m.id);
  SELECT count(*) INTO _calc_matrix FROM supervisory_calculation_matrix_cell c
    WHERE c.config_id IN (SELECT id FROM supervisory_calculation_config WHERE methodology_id = _m.id);

  _legacy := supervisory_methodology_legacy_str_row_count();
  SELECT status INTO _legacy_decision FROM supervisory_methodology_reference_decision
   WHERE methodology_id = _m.id AND decision_code = 'AML-METH-08';

  -- Decision EXISTENCE is never equated with decision APPROVAL.
  _legacy_state := CASE
    WHEN _legacy_decision IS NULL THEN 'NOT_APPLICABLE'
    WHEN _legacy_decision = 'REFERENCE_APPROVED' AND _legacy > 0 THEN 'APPROVED_NOT_EXECUTED'
    WHEN _legacy_decision = 'REFERENCE_APPROVED' THEN 'EXECUTED'
    WHEN _legacy_decision = 'AWAITING_SUPERVISORY_APPROVAL' THEN 'DECISION_PENDING'
    WHEN _legacy_decision = 'WITHDRAWN' THEN 'WITHDRAWN'
    WHEN _legacy_decision = 'SUPERSEDED' THEN 'SUPERSEDED'
    ELSE 'NOT_APPROVED' END;

  _legacy_headline := CASE _legacy_state
    WHEN 'NOT_APPLICABLE' THEN 'No legacy repair decision recorded for this version'
    WHEN 'APPROVED_NOT_EXECUTED' THEN _legacy || ' STR_SAR_GOVERNANCE rows remain; the relink is approved as a reference decision and has not been executed'
    WHEN 'EXECUTED' THEN 'Approved and no STR_SAR_GOVERNANCE rows remain'
    WHEN 'DECISION_PENDING' THEN _legacy || ' STR_SAR_GOVERNANCE rows remain; the repair decision is awaiting supervisory approval and is NOT approved'
    WHEN 'WITHDRAWN' THEN _legacy || ' STR_SAR_GOVERNANCE rows remain; the repair decision was withdrawn and is not approved'
    WHEN 'SUPERSEDED' THEN _legacy || ' STR_SAR_GOVERNANCE rows remain; this repair decision is superseded and is not the current decision'
    ELSE _legacy || ' STR_SAR_GOVERNANCE rows remain; the repair decision is not approved'
    END;

  _layers := jsonb_build_array(
    jsonb_build_object(
      'key', 'CONTENT', 'label', 'Methodology content',
      'state', CASE WHEN _dims > 0 AND _qs > 0 THEN 'COMPLETE' ELSE 'INCOMPLETE' END,
      'headline', CASE WHEN _dims > 0 AND _qs > 0
                       THEN _dims || ' dimensions, ' || _qs || ' questions, ' || _profiles || ' response semantic profiles'
                       ELSE 'Content not populated' END,
      'metrics', jsonb_build_object('dimensions', _dims, 'questions', _qs, 'semantic_profiles', _profiles)),

    jsonb_build_object(
      'key', 'REFERENCE_GOVERNANCE', 'label', 'MIPL reference approval',
      'state', CASE WHEN _decisions > 0 AND _decisions_approved = _decisions THEN 'COMPLETE'
                    WHEN _decisions > 0 THEN 'PARTIAL' ELSE 'NOT_APPLICABLE' END,
      'headline', CASE WHEN _decisions = 0 THEN 'No reference decision recorded'
                       ELSE _decisions_approved || ' of ' || _decisions || ' reference decisions approved' END,
      'metrics', jsonb_build_object('decisions', _decisions, 'reference_approved', _decisions_approved,
                                    'regulator_approved', _decisions_reg_approved)),

    jsonb_build_object(
      'key', 'REGULATOR_ADOPTION', 'label', 'Regulator adoption',
      'state', CASE WHEN _m.origin = 'REGULATOR_ADOPTED' THEN 'COMPLETE'
                    WHEN _m.origin = 'MIPL_REFERENCE' AND _adoptions > 0 THEN 'COMPLETE'
                    WHEN _m.origin = 'MIPL_REFERENCE' THEN 'NOT_DONE'
                    ELSE 'NOT_APPLICABLE' END,
      'headline', CASE WHEN _m.origin = 'REGULATOR_ADOPTED' THEN 'This version is a regulator adoption'
                       WHEN _m.origin = 'MIPL_REFERENCE' AND _adoptions > 0 THEN _adoptions || ' regulator adoption(s) recorded'
                       WHEN _m.origin = 'MIPL_REFERENCE' THEN 'No regulator has adopted this reference'
                       ELSE 'Regulator-authored version' END,
      'metrics', jsonb_build_object('adoptions', _adoptions, 'origin', _m.origin)),

    jsonb_build_object(
      'key', 'REGULATOR_APPROVAL', 'label', 'Regulator methodology approval',
      'state', CASE WHEN _m.origin = 'MIPL_REFERENCE' THEN 'NOT_APPLICABLE'
                    WHEN _approval.id IS NULL THEN 'NOT_RECORDED'
                    WHEN _approval.decision = 'APPROVED' THEN 'COMPLETE'
                    ELSE 'REVOKED' END,
      'headline', CASE WHEN _m.origin = 'MIPL_REFERENCE'
                        THEN 'A reference template can never carry a regulator approval'
                       WHEN _approval.id IS NULL THEN 'No regulator decision recorded'
                       ELSE _approval.decision || ' on ' || to_char(_approval.decided_at, 'DD Mon YYYY') END,
      'metrics', jsonb_build_object('decision', _approval.decision, 'decided_at', _approval.decided_at)),

    jsonb_build_object(
      'key', 'FACT_DEFINITIONS', 'label', 'Fact definitions',
      'state', CASE WHEN _facts = 0 THEN 'NOT_APPLICABLE'
                    WHEN _facts_pending = 0 THEN 'COMPLETE' ELSE 'PENDING' END,
      'headline', CASE WHEN _facts = 0 THEN 'No fact requirement recorded'
                       ELSE _facts_pending || ' of ' || _facts || ' fact definitions pending attributes' END,
      'blocks_approval', false,
      'metrics', jsonb_build_object('facts', _facts, 'pending', _facts_pending)),

    jsonb_build_object(
      'key', 'MATERIALITY_POLICY', 'label', 'Materiality parameter policy',
      'state', CASE WHEN _params = 0 THEN 'NOT_APPLICABLE'
                    WHEN _params_unapproved = 0 AND _params_valued = _params THEN 'COMPLETE'
                    ELSE 'NOT_APPROVED' END,
      'headline', CASE WHEN _params = 0 THEN 'No materiality parameter defined'
                       ELSE _params_unapproved || ' unapproved, ' || (_params - _params_valued) || ' without a value, of ' || _params END,
      'blocks_approval', false,
      'metrics', jsonb_build_object('parameters', _params, 'unapproved', _params_unapproved, 'valued', _params_valued)),

    jsonb_build_object(
      'key', 'CALCULATION_POLICY', 'label', 'Calculation policy',
      'state', CASE WHEN _calc_active > 0 THEN 'ACTIVE'
                    WHEN _calc_total > 0 THEN 'NOT_ACTIVE' ELSE 'NOT_CONFIGURED' END,
      'headline', CASE WHEN _calc_active > 0 THEN 'An approved calculation configuration is active'
                       WHEN _calc_total > 0 THEN _calc_total || ' configuration(s), none active or approved'
                       ELSE 'No calculation configuration, scores, bands or residual matrix' END,
      'metrics', jsonb_build_object('configs', _calc_total, 'active', _calc_active,
                                    'response_scores', _calc_scores, 'bands', _calc_bands,
                                    'matrix_cells', _calc_matrix)),

    jsonb_build_object(
      'key', 'LEGACY_DATA_REPAIR', 'label', 'Legacy data repair',
      'state', _legacy_state,
      'headline', _legacy_headline,
      'metrics', jsonb_build_object('legacy_rows', _legacy,
                                    'reference_decision_status', _legacy_decision,
                                    'decision_approved', _legacy_decision = 'REFERENCE_APPROVED',
                                    'repair_executed', _legacy_decision IS NOT NULL AND _legacy = 0)),

    jsonb_build_object(
      'key', 'ASSESSMENT_ELIGIBILITY', 'label', 'Assessment eligibility',
      'state', CASE WHEN _m.origin = 'MIPL_REFERENCE' THEN 'NOT_ELIGIBLE'
                    WHEN _m.status = 'ACTIVE' THEN 'ELIGIBLE' ELSE 'NOT_ELIGIBLE' END,
      'headline', CASE WHEN _m.origin = 'MIPL_REFERENCE'
                        THEN 'No — reference draft; a regulator must adopt it first'
                       WHEN _m.status = 'ACTIVE' THEN 'Yes — active version'
                       ELSE 'No — status is ' || _m.status END,
      'metrics', jsonb_build_object('status', _m.status, 'origin', _m.origin)),

    jsonb_build_object(
      'key', 'CERTIFICATION', 'label', 'Module certification',
      'state', 'NOT_CERTIFIED',
      'headline', 'Not certified — certification is a separate governance outcome and is not recorded against a methodology version',
      'metrics', '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'methodology_id', _m.id,
    'generated_at', now(),
    'layers', _layers,
    'note', 'Readiness is layered. A layer marked pending is not automatically a blocker on another layer.'
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.supervisory_methodology_review_readiness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_review_readiness(uuid) TO authenticated;