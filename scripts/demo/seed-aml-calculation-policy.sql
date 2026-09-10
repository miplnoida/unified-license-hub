-- =============================================================================
-- AML/CFT CALCULATION POLICY — DEMONSTRATION CONFIGURATION, AUTHORED THROUGH THE
-- GOVERNED WORKFLOW
--
-- Purpose
-- -------
-- The AML/CFT methodology publishes dimensions, questions and rating scales, but
-- no calculation policy has ever been approved, so the engine correctly reports
-- every rating as NOT_CALCULABLE. This script authors a *demonstration*
-- calculation policy for a NEW methodology version (v1.2) and takes it through
-- the real maker/checker lifecycle:
--
--   DRAFT -> (validate) -> REVIEW -> APPROVED -> ACTIVE
--
-- Nothing is inserted directly. Every value below is written through the
-- governed operations (supervisory_calculation_config_upsert,
-- _response_scores_set, _question_weights_set, _dimension_weights_set,
-- _bands_set, _matrix_set, _config_validate, _config_lifecycle,
-- supervisory_domain_calculation_rule_set, supervisory_methodology_new_version,
-- supervisory_methodology_lifecycle), under two distinct identities:
--
--   maker   = AML/CFT Methodology Configuration Officer  (manage_config only)
--   checker = Head of AML/CFT                            (methodology_approve)
--
-- The server refuses self-approval, so both identities are genuinely required.
--
-- What this script does NOT do
-- ----------------------------
--  * It does not touch v1.0 (ACTIVE, REGULATOR_AUTHORED) content or v1.1
--    (DRAFT, MIPL_REFERENCE). v1.0 is superseded by the activation of v1.2 with
--    effective_from = today, so every historical assessment continues to resolve
--    and reproduce under v1.0.
--  * It does not modify any existing assessment, rating, risk state or movement.
--  * It does not claim to be regulator policy. The parameter values are
--    DEMONSTRATION values authorised for the demonstration environment; the real
--    decisions DEC-01…DEC-08 remain a supervisory matter and are documented in
--    docs/aml/AML-calculation-policy-decision-register.md.
--
-- Values authored (all recorded, none hard-coded in the engine)
-- ------------------------------------------------------------
--  DEC-01 effective-date rule ......... PERIOD_END
--  DEC-02 response scoring ............ YES 100 / PARTIALLY 50 / NO 0,
--                                       NOT_APPLICABLE excluded from denominator
--  DEC-03 weighting ................... every scored question weight 1;
--                                       dimensions carry their methodology weight
--  DEC-04 aggregation ................. UNWEIGHTED_MEAN, ALL_MANDATORY_APPLICABLE,
--                                       NOT_APPLICABLE EXCLUDE, evidence FLAG_ONLY,
--                                       critical NONE, HALF_UP to 2 decimals,
--                                       inherent direction INVERTED
--  DEC-05 bands ....................... inherent 0/20/40/60/80; control 0/40/60/80
--  DEC-06 residual matrix ............. inherent adjusted by control strength:
--                                       STRONG -1, SATISFACTORY 0,
--                                       NEEDS_IMPROVEMENT +1, WEAK +2 (clamped)
--  DEC-07 recommendation policy ....... HIGHEST_DIMENSION (worst residual dimension)
--  DEC-08 override threshold .......... MEDIUM_HIGH
--
-- Idempotent: an existing v1.2 with an ACTIVE configuration is left untouched.
-- Non-production only.
--
-- Run: psql "$SUPABASE_DB_URL" -X -q -f scripts/demo/seed-aml-calculation-policy.sql
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off
SET row_security = on;

BEGIN;
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  IF public.is_production_environment() THEN
    RAISE EXCEPTION 'AML calculation policy demonstration seed refused: production environment';
  END IF;
END $$;

DO $$
DECLARE
  claim_maker   text := '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
  claim_checker text := '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}';
  v10  uuid;
  v12  uuid;
  cfg  uuid;
  risk text[];
  ctrl text[];
  cells jsonb := '[]'::jsonb;
  val  jsonb;
  i int; j int; shift int; target int;
  eff  date := current_date;
BEGIN
  -- ---------------------------------------------------------------- baseline --
  -- Read as the maker: row-level security applies to this session exactly as it
  -- does to the officer using the screen.
  PERFORM set_config('request.jwt.claims', claim_maker, true);

  SELECT id INTO v10 FROM public.supervisory_methodology
   WHERE code = 'AML-CFT-RBA' AND version = '1.0' AND status = 'ACTIVE';
  IF v10 IS NULL THEN
    RAISE EXCEPTION 'the ACTIVE AML-CFT-RBA v1.0 methodology was not found: refusing to author a calculation policy against an unknown baseline';
  END IF;

  SELECT id INTO v12 FROM public.supervisory_methodology
   WHERE code = 'AML-CFT-RBA' AND version = '1.2';

  IF v12 IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.supervisory_calculation_config
     WHERE methodology_id = v12 AND status = 'ACTIVE') THEN
    RAISE NOTICE 'AML-CFT-RBA v1.2 already carries an ACTIVE calculation configuration — nothing to do';
    RETURN;
  END IF;

  -- ------------------------------------------- DEC-01: effective-date rule ---
  PERFORM set_config('request.jwt.claims', claim_maker, true);
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_domain_calculation_rule
                  WHERE upper(domain_code) = 'AML_CFT') THEN
    PERFORM public.supervisory_domain_calculation_rule_set('AML_CFT', 'PERIOD_END',
      'Demonstration decision DEC-01: the methodology and calculation policy in force are resolved as at the end of the assessed period, so a supervisory conclusion is always measured against the policy that applied to the period under assessment.');
  END IF;

  -- ------------------------------------------------- new methodology version --
  IF v12 IS NULL THEN
    v12 := public.supervisory_methodology_new_version(v10, '1.2',
      'Demonstration version carrying the first complete AML/CFT calculation policy. Content is unchanged from v1.0; the change is the addition of an approved calculation configuration.');
    PERFORM public.supervisory_methodology_metadata_save(v12, jsonb_build_object(
      'effective_from', eff::text,
      'change_summary', 'Adds a complete calculation policy (response scoring, weighting, bands, residual matrix, aggregation and recommendation policy). Dimensions and questions are identical to v1.0.',
      'rationale', 'Version dated from today so that every assessment of an earlier period continues to resolve and reproduce under v1.0.'));
  END IF;

  SELECT array_agg(x->>'code' ORDER BY (x->>'ordinal')::int)
    INTO risk FROM public.supervisory_methodology m,
    jsonb_array_elements(m.scoring_scale) x WHERE m.id = v12;
  SELECT array_agg(v) INTO ctrl FROM public.supervisory_methodology m,
    jsonb_array_elements_text(COALESCE(m.definition->'control_scale','[]'::jsonb)) v WHERE m.id = v12;
  IF risk IS NULL OR ctrl IS NULL THEN
    RAISE EXCEPTION 'the methodology publishes no risk or control scale: a calculation policy cannot be authored';
  END IF;

  -- --------------------------------------------------- draft configuration ---
  SELECT id INTO cfg FROM public.supervisory_calculation_config
   WHERE methodology_id = v12 AND status = 'DRAFT' ORDER BY config_version DESC LIMIT 1;

  -- DEC-04, DEC-07, DEC-08 — parameters
  cfg := public.supervisory_calculation_config_upsert(v12, jsonb_build_object(
    'effective_from', eff::text,
    'aggregation_method', 'UNWEIGHTED_MEAN',
    'completeness_mode', 'ALL_MANDATORY_APPLICABLE',
    'na_denominator_handling', 'EXCLUDE',
    'evidence_insufficiency_handling', 'FLAG_ONLY',
    'critical_question_handling', 'NONE',
    'rounding_mode', 'HALF_UP',
    'rounding_decimals', 2,
    'inherent_direction', 'INVERTED',
    'recommendation_policy', 'HIGHEST_DIMENSION',
    'override_threshold', 'MEDIUM_HIGH',
    'notes', 'DEMONSTRATION calculation policy for AML-CFT-RBA v1.2. Every value here is a demonstration decision authorised for the demonstration environment, not a regulator determination. Inherent questions are assurance statements, so the inherent score is inverted: weak assurance produces high inherent risk. Not-applicable answers leave the denominator. A dimension is rated only when every mandatory applicable question is answered.'
  ), cfg);

  -- DEC-02 — response scoring
  PERFORM public.supervisory_calculation_response_scores_set(cfg, jsonb_build_array(
    jsonb_build_object('response_code','YES','score',100,'sort_order',1,
      'meaning','The requirement is fully met and evidenced.'),
    jsonb_build_object('response_code','PARTIALLY','score',50,'sort_order',2,
      'meaning','The requirement is partly met: the control exists but is incomplete, inconsistently applied or insufficiently evidenced.'),
    jsonb_build_object('response_code','NO','score',0,'sort_order',3,
      'meaning','The requirement is not met.'),
    jsonb_build_object('response_code','NOT_APPLICABLE','sort_order',4,
      'excluded_from_denominator', true,
      'meaning','The requirement does not apply to this institution in the assessed period; it carries no score and leaves the denominator.')
  ));

  -- DEC-03 — question participation. The decision is that every active question
  -- participates with equal weight, which is exactly the engine's stated default
  -- for a configuration with no per-question row (SCORED, weight 1). No row is
  -- written, because writing "weight 1" for every question would assert a
  -- weighting decision that this policy deliberately does not make.
  --
  -- A per-question weighting policy is not expressible for this methodology
  -- today: the governed operation keys on question_code, and AML-CFT-RBA reuses
  -- codes such as Q1 across dimensions. That is recorded as a product defect in
  -- docs/aml/AML-calculation-policy-decision-register.md; it does not affect an
  -- unweighted policy.

  -- DEC-03 — dimension policy: a dimension contributes to the side its kind
  -- declares, carrying the weight the methodology itself publishes. A dimension
  -- with no active question is recorded as EXCLUDED rather than silently ignored.
  PERFORM public.supervisory_calculation_dimension_weights_set(cfg, (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'dimension_code', d.dimension_code,
             'contributes_to', CASE
               WHEN NOT EXISTS (SELECT 1 FROM public.supervisory_methodology_question q
                                 WHERE q.methodology_dimension_id = d.id AND q.active)
                 THEN 'EXCLUDED'
               WHEN upper(COALESCE(d.dimension_kind,'')) LIKE '%CONTROL%' THEN 'CONTROL'
               ELSE 'INHERENT' END,
             'weight', COALESCE(d.weight, 1),
             'aggregation_method', 'UNWEIGHTED_MEAN')), '[]'::jsonb)
      FROM public.supervisory_methodology_dimension d
     WHERE d.methodology_id = v12 AND d.active));

  -- DEC-05 — bands. Inherent: the inverted score rises with risk, so the lowest
  -- interval is the lowest risk. Control: the score rises with control strength.
  PERFORM public.supervisory_calculation_bands_set(cfg, 'INHERENT', (
    SELECT jsonb_agg(jsonb_build_object(
             'band_code', risk[i2],
             'min_score', (i2 - 1) * (100.0 / array_length(risk,1)),
             'max_score', i2 * (100.0 / array_length(risk,1)),
             'sort_order', i2)
             ORDER BY i2)
      FROM generate_series(1, array_length(risk,1)) i2));

  PERFORM public.supervisory_calculation_bands_set(cfg, 'CONTROL', jsonb_build_array(
    jsonb_build_object('band_code','WEAK','min_score',0,'max_score',40,'sort_order',1),
    jsonb_build_object('band_code','NEEDS_IMPROVEMENT','min_score',40,'max_score',60,'sort_order',2),
    jsonb_build_object('band_code','SATISFACTORY','min_score',60,'max_score',80,'sort_order',3),
    jsonb_build_object('band_code','STRONG','min_score',80,'max_score',100,'sort_order',4)
  ));

  -- DEC-06 — residual matrix. Explicit cell per combination, produced from the
  -- stated rule so that no cell is arbitrary and none is missing.
  FOR i IN 1 .. array_length(risk,1) LOOP
    FOR j IN 1 .. array_length(ctrl,1) LOOP
      shift := CASE ctrl[j]
                 WHEN 'STRONG' THEN -1
                 WHEN 'SATISFACTORY' THEN 0
                 WHEN 'NEEDS_IMPROVEMENT' THEN 1
                 WHEN 'WEAK' THEN 2
                 ELSE 0 END;
      target := least(greatest(i + shift, 1), array_length(risk,1));
      cells := cells || jsonb_build_array(jsonb_build_object(
        'inherent_band', risk[i], 'control_band', ctrl[j], 'residual_rating', risk[target]));
    END LOOP;
  END LOOP;
  PERFORM public.supervisory_calculation_matrix_set(cfg, cells);

  -- ------------------------------------------------------------ validation ---
  val := public.supervisory_calculation_config_validate(cfg);
  IF NOT (val->>'ok')::boolean THEN
    RAISE EXCEPTION 'the demonstration configuration is incomplete, so it is not submitted: %', val->'problems';
  END IF;

  -- ------------------------------------------------ maker/checker lifecycle --
  PERFORM public.supervisory_calculation_config_lifecycle(cfg, 'REVIEW',
    'Submitted for independent approval: the demonstration calculation policy is complete and validated against the published scales and question set.');

  PERFORM set_config('request.jwt.claims', claim_checker, true);
  PERFORM public.supervisory_calculation_config_lifecycle(cfg, 'APPROVED',
    'Approved as the demonstration calculation policy for AML-CFT-RBA v1.2: scoring, weighting, bands, residual matrix and recommendation policy are internally consistent with the published risk and control scales.');
  PERFORM public.supervisory_calculation_config_lifecycle(cfg, 'ACTIVE',
    'Activated with effect from today. Assessments of earlier periods continue to resolve the policy that applied to their period.');

  -- --------------------------------------------- methodology version lifecycle
  PERFORM set_config('request.jwt.claims', claim_maker, true);
  IF (SELECT status FROM public.supervisory_methodology WHERE id = v12) = 'DRAFT' THEN
    PERFORM public.supervisory_methodology_lifecycle(v12, 'REVIEW',
      'Submitted for approval with a complete, approved calculation configuration attached.');
  END IF;

  PERFORM set_config('request.jwt.claims', claim_checker, true);
  IF (SELECT status FROM public.supervisory_methodology WHERE id = v12) = 'REVIEW' THEN
    PERFORM public.supervisory_methodology_lifecycle(v12, 'APPROVED',
      'Approved: content is carried unchanged from v1.0 and the attached calculation policy has itself been independently approved.');
  END IF;
  IF (SELECT status FROM public.supervisory_methodology WHERE id = v12) = 'APPROVED' THEN
    PERFORM public.supervisory_methodology_lifecycle(v12, 'ACTIVE',
      'Activated from today so that AML/CFT assessments of current periods can produce a calculated rating.');
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'AML-CFT-RBA v1.2 methodology % with calculation configuration % is active from %', v12, cfg, eff;
END $$;

COMMIT;
