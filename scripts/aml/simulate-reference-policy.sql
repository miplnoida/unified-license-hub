-- =====================================================================
-- AML/CFT CALIBRATION SIMULATION — CANDIDATE REFERENCE POLICY
--
-- MIPL REFERENCE PROPOSAL / CALIBRATION CANDIDATE — NOT REGULATOR-APPROVED
-- POLICY. Nothing here is authored into supervisory_calculation_config, no
-- calculation outcome is materialised, and no assessment rating is touched.
--
-- The whole script runs inside one transaction that ends in ROLLBACK, and the
-- simulation entry point public.supervisory_calc_simulate is declared STABLE so
-- the database itself refuses any write reached from it.
--
-- Usage: psql "$SUPABASE_DB_URL" -f scripts/aml/simulate-reference-policy.sql
-- =====================================================================

BEGIN;

CREATE TEMP TABLE sim_run(variant text, payload jsonb) ON COMMIT DROP;
GRANT INSERT ON sim_run TO authenticated;

DO $outer$
DECLARE
  _uid uuid;
  _scores jsonb := jsonb_build_array(
    jsonb_build_object('response_code','YES','score',100,'excluded_from_denominator',false),
    jsonb_build_object('response_code','PARTIALLY','score',50,'excluded_from_denominator',false),
    jsonb_build_object('response_code','NO','score',0,'excluded_from_denominator',false),
    jsonb_build_object('response_code','NOT_APPLICABLE','score',NULL,'excluded_from_denominator',true));

  -- CALIBRATION CANDIDATE bands. Inherent uses the published risk scale; control
  -- uses the v1.1 candidate control-effectiveness vocabulary.
  _bands jsonb := jsonb_build_object(
    'INHERENT', jsonb_build_array(
      jsonb_build_object('band_code','LOW','min_score',0,'max_score',20),
      jsonb_build_object('band_code','MODERATE','min_score',20,'max_score',40),
      jsonb_build_object('band_code','MEDIUM_HIGH','min_score',40,'max_score',60),
      jsonb_build_object('band_code','HIGH','min_score',60,'max_score',80),
      jsonb_build_object('band_code','SEVERE','min_score',80,'max_score',100)),
    'CONTROL', jsonb_build_array(
      jsonb_build_object('band_code','INEFFECTIVE','min_score',0,'max_score',20),
      jsonb_build_object('band_code','WEAK','min_score',20,'max_score',40),
      jsonb_build_object('band_code','ADEQUATE','min_score',40,'max_score',60),
      jsonb_build_object('band_code','STRONG','min_score',60,'max_score',80),
      jsonb_build_object('band_code','ROBUST','min_score',80,'max_score',100)));

  -- Bands shifted by +5 / -5 points for the sensitivity pass.
  _bands_up jsonb; _bands_dn jsonb;

  -- CALIBRATION CANDIDATE residual matrix: complete and monotonic 5 x 5.
  _matrix jsonb := jsonb_build_array(
    jsonb_build_object('inherent_band','LOW','control_band','INEFFECTIVE','residual_rating','MODERATE'),
    jsonb_build_object('inherent_band','LOW','control_band','WEAK','residual_rating','MODERATE'),
    jsonb_build_object('inherent_band','LOW','control_band','ADEQUATE','residual_rating','LOW'),
    jsonb_build_object('inherent_band','LOW','control_band','STRONG','residual_rating','LOW'),
    jsonb_build_object('inherent_band','LOW','control_band','ROBUST','residual_rating','LOW'),
    jsonb_build_object('inherent_band','MODERATE','control_band','INEFFECTIVE','residual_rating','MEDIUM_HIGH'),
    jsonb_build_object('inherent_band','MODERATE','control_band','WEAK','residual_rating','MODERATE'),
    jsonb_build_object('inherent_band','MODERATE','control_band','ADEQUATE','residual_rating','MODERATE'),
    jsonb_build_object('inherent_band','MODERATE','control_band','STRONG','residual_rating','MODERATE'),
    jsonb_build_object('inherent_band','MODERATE','control_band','ROBUST','residual_rating','LOW'),
    jsonb_build_object('inherent_band','MEDIUM_HIGH','control_band','INEFFECTIVE','residual_rating','HIGH'),
    jsonb_build_object('inherent_band','MEDIUM_HIGH','control_band','WEAK','residual_rating','MEDIUM_HIGH'),
    jsonb_build_object('inherent_band','MEDIUM_HIGH','control_band','ADEQUATE','residual_rating','MEDIUM_HIGH'),
    jsonb_build_object('inherent_band','MEDIUM_HIGH','control_band','STRONG','residual_rating','MODERATE'),
    jsonb_build_object('inherent_band','MEDIUM_HIGH','control_band','ROBUST','residual_rating','MODERATE'),
    jsonb_build_object('inherent_band','HIGH','control_band','INEFFECTIVE','residual_rating','SEVERE'),
    jsonb_build_object('inherent_band','HIGH','control_band','WEAK','residual_rating','HIGH'),
    jsonb_build_object('inherent_band','HIGH','control_band','ADEQUATE','residual_rating','HIGH'),
    jsonb_build_object('inherent_band','HIGH','control_band','STRONG','residual_rating','MEDIUM_HIGH'),
    jsonb_build_object('inherent_band','HIGH','control_band','ROBUST','residual_rating','MODERATE'),
    jsonb_build_object('inherent_band','SEVERE','control_band','INEFFECTIVE','residual_rating','SEVERE'),
    jsonb_build_object('inherent_band','SEVERE','control_band','WEAK','residual_rating','SEVERE'),
    jsonb_build_object('inherent_band','SEVERE','control_band','ADEQUATE','residual_rating','SEVERE'),
    jsonb_build_object('inherent_band','SEVERE','control_band','STRONG','residual_rating','HIGH'),
    jsonb_build_object('inherent_band','SEVERE','control_band','ROBUST','residual_rating','MEDIUM_HIGH'));

  _base jsonb;
BEGIN
  SELECT u.id INTO _uid FROM auth.users u
   WHERE public.has_permission(u.id,'aml_supervision','manage_config') ORDER BY u.email LIMIT 1;
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'no identity holds aml_supervision.manage_config, so the simulation cannot be authorised';
  END IF;

  SELECT jsonb_build_object('INHERENT',
           (SELECT jsonb_agg(jsonb_build_object('band_code',b->>'band_code',
              'min_score', least(100,(b->>'min_score')::numeric + CASE WHEN (b->>'min_score')::numeric = 0 THEN 0 ELSE 5 END),
              'max_score', least(100,(b->>'max_score')::numeric + CASE WHEN (b->>'max_score')::numeric = 100 THEN 0 ELSE 5 END)))
              FROM jsonb_array_elements(_bands->'INHERENT') b),
           'CONTROL',
           (SELECT jsonb_agg(jsonb_build_object('band_code',b->>'band_code',
              'min_score', least(100,(b->>'min_score')::numeric + CASE WHEN (b->>'min_score')::numeric = 0 THEN 0 ELSE 5 END),
              'max_score', least(100,(b->>'max_score')::numeric + CASE WHEN (b->>'max_score')::numeric = 100 THEN 0 ELSE 5 END)))
              FROM jsonb_array_elements(_bands->'CONTROL') b))
    INTO _bands_up;

  SELECT jsonb_build_object('INHERENT',
           (SELECT jsonb_agg(jsonb_build_object('band_code',b->>'band_code',
              'min_score', greatest(0,(b->>'min_score')::numeric - CASE WHEN (b->>'min_score')::numeric = 0 THEN 0 ELSE 5 END),
              'max_score', greatest(0,(b->>'max_score')::numeric - CASE WHEN (b->>'max_score')::numeric = 100 THEN 0 ELSE 5 END)))
              FROM jsonb_array_elements(_bands->'INHERENT') b),
           'CONTROL',
           (SELECT jsonb_agg(jsonb_build_object('band_code',b->>'band_code',
              'min_score', greatest(0,(b->>'min_score')::numeric - CASE WHEN (b->>'min_score')::numeric = 0 THEN 0 ELSE 5 END),
              'max_score', greatest(0,(b->>'max_score')::numeric - CASE WHEN (b->>'max_score')::numeric = 100 THEN 0 ELSE 5 END)))
              FROM jsonb_array_elements(_bands->'CONTROL') b))
    INTO _bands_dn;

  _base := jsonb_build_object(
    'label','MIPL REFERENCE PROPOSAL / CALIBRATION CANDIDATE - NOT APPROVED POLICY',
    'effective_date_rule','EXPLICIT_AS_OF',
    'aggregation_method','UNWEIGHTED_MEAN',
    'completeness_mode','ALL_MANDATORY_APPLICABLE',
    'na_denominator_handling','EXCLUDE',
    'evidence_insufficiency_handling','NOT_CALCULABLE',
    'critical_question_handling','NONE',
    'rounding_mode','HALF_UP','rounding_decimals',2,
    'inherent_direction','DIRECT',
    'recommendation_policy','WEIGHTED_SCORE',
    'dimension_weight_mode','METHODOLOGY',
    'response_scores',_scores,'bands',_bands,'matrix',_matrix);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_uid::text,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO sim_run VALUES
    ('CANDIDATE',        public.supervisory_calc_simulate('AML_CFT', _base)),
    ('BANDS_PLUS_5',     public.supervisory_calc_simulate('AML_CFT', _base || jsonb_build_object('bands',_bands_up))),
    ('BANDS_MINUS_5',    public.supervisory_calc_simulate('AML_CFT', _base || jsonb_build_object('bands',_bands_dn))),
    ('WORST_RESPONSE',   public.supervisory_calc_simulate('AML_CFT', _base || jsonb_build_object('aggregation_method','WORST_RESPONSE'))),
    ('EQUAL_DIM_WEIGHTS',public.supervisory_calc_simulate('AML_CFT', _base || jsonb_build_object('dimension_weight_mode','EQUAL'))),
    ('MIN_ANSWERED_1',   public.supervisory_calc_simulate('AML_CFT', _base || jsonb_build_object('completeness_mode','MIN_ANSWERED','min_answered_questions',1))),
    -- Isolating the recorded-evidence gap from the policy choice: FLAG_ONLY and
    -- CAP_AT_MIDPOINT let a dimension score despite insufficient evidence, so the
    -- remaining variants show what the candidate parameters would actually produce.
    ('EVIDENCE_FLAG_ONLY',   public.supervisory_calc_simulate('AML_CFT', _base || jsonb_build_object('evidence_insufficiency_handling','FLAG_ONLY','completeness_mode','MIN_ANSWERED','min_answered_questions',1))),
    ('EVIDENCE_CAP_MIDPOINT',public.supervisory_calc_simulate('AML_CFT', _base || jsonb_build_object('evidence_insufficiency_handling','CAP_AT_MIDPOINT','completeness_mode','MIN_ANSWERED','min_answered_questions',1))),
    ('INHERENT_INVERTED',    public.supervisory_calc_simulate('AML_CFT', _base || jsonb_build_object('evidence_insufficiency_handling','FLAG_ONLY','completeness_mode','MIN_ANSWERED','min_answered_questions',1,'inherent_direction','INVERTED'))),
    ('HIGHEST_DIMENSION',    public.supervisory_calc_simulate('AML_CFT', _base || jsonb_build_object('evidence_insufficiency_handling','FLAG_ONLY','completeness_mode','MIN_ANSWERED','min_answered_questions',1,'recommendation_policy','HIGHEST_DIMENSION')));

  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{}', true);
END $outer$;

-- Proof that the simulation persisted nothing.
SELECT 'PRODUCTION_WRITES' AS check,
       (SELECT count(*) FROM public.supervisory_calculation_config) AS configs,
       (SELECT count(*) FROM public.supervisory_calculation_band) AS bands,
       (SELECT count(*) FROM public.supervisory_calculation_matrix_cell) AS matrix_cells,
       (SELECT count(*) FROM public.supervisory_assessment_calculation) AS calculation_outcomes,
       (SELECT count(*) FROM public.supervisory_assessment_dimension
         WHERE calculation_status IS NOT NULL) AS dimensions_with_status;

\pset format unaligned
\pset tuples_only on
\o /tmp/aml-simulation.json
SELECT jsonb_pretty(jsonb_object_agg(variant, payload)) FROM sim_run;
\o
\pset tuples_only off
\pset format aligned

ROLLBACK;
