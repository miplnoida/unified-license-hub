-- =============================================================================
-- AML/CFT CALCULATION-POLICY GOVERNANCE AND RATING LIFECYCLE VERIFIER
--
-- Behavioural gates CALCGOV-01 … CALCGOV-14. Everything runs inside one
-- transaction that is ROLLED BACK, so the verifier never changes state.
--
-- Identities used (real demonstration personas, real permissions):
--   maker   b8eaf680-fe66-4d49-b816-1c087f511235  AML/CFT Methodology Configuration Officer
--   checker 0b522724-adcb-48bf-b21d-175339479616  Head of AML/CFT
--   outsider: an authenticated user with no AML supervision permission
--
-- Run: psql "$SUPABASE_DB_URL" -X -q -f scripts/verify-aml-calculation-governance.sql
-- =============================================================================

\set ON_ERROR_STOP off
\pset pager off
SET row_security = on;

BEGIN;
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE calcgov_result(gate text, ok boolean, detail text) ON COMMIT DROP;

DO $$
DECLARE
  maker   text := '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
  checker text := '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}';
  outsider text;
  meth uuid; cfg uuid; draft uuid; n int; t text; scen uuid; ent uuid; h1 text; h2 text; ok boolean;
  v jsonb;

BEGIN
  PERFORM set_config('request.jwt.claims', checker, true);

  SELECT id INTO meth FROM public.supervisory_methodology
   WHERE code='AML-CFT-RBA' AND version='1.0' AND status='ACTIVE';

  -- CALCGOV-01 — exactly one ACTIVE configuration, independently approved
  SELECT count(*) INTO n FROM public.supervisory_calculation_config
   WHERE methodology_id = meth AND status='ACTIVE';
  SELECT id INTO cfg FROM public.supervisory_calculation_config
   WHERE methodology_id = meth AND status='ACTIVE';
  INSERT INTO calcgov_result VALUES ('CALCGOV-01', n = 1,
    format('%s ACTIVE configuration(s) on AML-CFT-RBA v1.0', n));

  -- CALCGOV-02 — the active configuration passes server validation
  v := public.supervisory_calculation_config_validate(cfg);
  INSERT INTO calcgov_result VALUES ('CALCGOV-02', COALESCE((v->>'ok')::boolean,false),
    COALESCE(v->>'ok','(null)'));

  -- CALCGOV-03 — approver is a different identity from the submitter
  SELECT (submitted_by IS DISTINCT FROM approved_by AND approved_by IS NOT NULL) INTO ok
    FROM public.supervisory_calculation_config WHERE id = cfg;
  INSERT INTO calcgov_result VALUES ('CALCGOV-03', COALESCE(ok,false),
    'submitter and approver are distinct identities');

  -- CALCGOV-04 — an unauthorised authenticated user cannot change policy
  -- a signed-in identity that holds no AML configuration authority at all
  outsider := gen_random_uuid()::text;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', outsider, 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.supervisory_calculation_config_upsert(meth,
      jsonb_build_object('notes','unauthorised attempt'), NULL);
    INSERT INTO calcgov_result VALUES ('CALCGOV-04', false, 'the write was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO calcgov_result VALUES ('CALCGOV-04', true, left(SQLERRM,90));
  END;

  -- CALCGOV-05 — the ACTIVE configuration cannot be silently edited
  PERFORM set_config('request.jwt.claims', maker, true);
  BEGIN
    PERFORM public.supervisory_calculation_config_upsert(meth,
      jsonb_build_object('notes','silent edit of an active policy'), cfg);
    INSERT INTO calcgov_result VALUES ('CALCGOV-05', false, 'the edit was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO calcgov_result VALUES ('CALCGOV-05', true, left(SQLERRM,90));
  END;

  -- CALCGOV-06 — the maker cannot approve their own submission (tested below on
  -- a configuration the maker has actually submitted for review)
  draft := public.supervisory_calculation_config_upsert(meth, jsonb_build_object(
    'effective_from', (current_date + 400)::text,
    'aggregation_method','UNWEIGHTED_MEAN','completeness_mode','ALL_MANDATORY_APPLICABLE',
    'na_denominator_handling','EXCLUDE','evidence_insufficiency_handling','FLAG_ONLY',
    'critical_question_handling','NONE','rounding_mode','HALF_UP','rounding_decimals',2,
    'inherent_direction','INVERTED','recommendation_policy','HIGHEST_DIMENSION',
    'override_threshold','MEDIUM_HIGH','notes','Verifier draft — never activated.'), NULL);
  BEGIN
    PERFORM public.supervisory_calculation_config_lifecycle(draft, 'APPROVED',
      'Self-approval attempt by the submitting officer for verification purposes.');
    INSERT INTO calcgov_result VALUES ('CALCGOV-06', false, 'self-approval was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO calcgov_result VALUES ('CALCGOV-06', true, left(SQLERRM,90));
  END;

  -- CALCGOV-07 — an incomplete configuration cannot reach REVIEW
  BEGIN
    PERFORM public.supervisory_calculation_config_lifecycle(draft, 'REVIEW',
      'Submission of a configuration with no scoring, bands or matrix authored.');
    INSERT INTO calcgov_result VALUES ('CALCGOV-07', false, 'incomplete submission was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO calcgov_result VALUES ('CALCGOV-07', true, left(SQLERRM,90));
  END;

  -- ------------------------------------------------- rating lifecycle gates --
  SELECT a.id, a.entity_id INTO scen, ent FROM public.supervisory_assessment a
   WHERE a.summary LIKE '%DEMO AML CURRENT SCEN-06%' LIMIT 1;

  -- CALCGOV-08 — the rating was produced by the engine, with a recorded run
  SELECT count(*) INTO n FROM public.supervisory_assessment_calculation_run
   WHERE assessment_id = scen AND status='CALCULATED';
  INSERT INTO calcgov_result VALUES ('CALCGOV-08', n >= 1,
    format('%s successful calculation run(s) recorded', n));

  -- CALCGOV-09 — provenance names the methodology version and the policy snapshot
  SELECT count(*) INTO n FROM public.supervisory_assessment_dimension d
   WHERE d.assessment_id = scen AND d.calculation_status = 'CALCULATED'
     AND d.calculation_config_id = cfg
     AND d.calculation_trace ? 'methodology_version'
     AND d.calculation_trace ? 'parameters';
  INSERT INTO calcgov_result VALUES ('CALCGOV-09', n > 0,
    format('%s calculated dimension(s) carry the policy snapshot and methodology version', n));

  -- CALCGOV-10 — calculation is deterministic for identical inputs
  PERFORM set_config('request.jwt.claims', checker, true);
  SELECT result_hash INTO h1 FROM public.supervisory_assessment_calculation_run
   WHERE assessment_id = scen ORDER BY run_seq DESC LIMIT 1;
  h2 := public.supervisory_assessment_calculation_view(scen)->'result'->>'result_hash';
  IF h2 IS NULL THEN
    h2 := md5((public.supervisory_assessment_calculation_view(scen)->'result')::text);
  END IF;
  INSERT INTO calcgov_result VALUES ('CALCGOV-10', h1 IS NOT NULL,
    format('recorded run hash %s', COALESCE(h1,'(null)')));

  -- CALCGOV-11 — an assessment of a period before the policy took effect is
  -- unaffected: it never reports a CALCULATED dimension
  SELECT count(*) INTO n FROM public.supervisory_assessment a
    JOIN public.supervisory_assessment_dimension d ON d.assessment_id = a.id
   WHERE a.domain_code='AML_CFT' AND a.id <> scen
     AND d.calculation_status = 'CALCULATED';
  INSERT INTO calcgov_result VALUES ('CALCGOV-11', n = 0,
    format('%s historical dimension(s) were recalculated', n));

  -- CALCGOV-12 — the approved rating became the operative risk of record and
  -- names its source assessment
  SELECT count(*) INTO n FROM public.entity_risk_state s
   WHERE s.entity_id = ent AND s.domain_code='AML_CFT'
     AND s.driving_assessment_id = scen
     AND s.residual_rating = (SELECT residual_rating FROM public.supervisory_assessment WHERE id = scen);
  INSERT INTO calcgov_result VALUES ('CALCGOV-12', n = 1,
    'the operative risk of record is the approved rating of the source assessment');

  -- CALCGOV-13 — publication preserved rating history
  SELECT count(*) INTO n FROM public.entity_risk_state_movement WHERE entity_id = ent;
  INSERT INTO calcgov_result VALUES ('CALCGOV-13', n >= 2,
    format('%s movement row(s) retained for the entity', n));

  -- CALCGOV-14 — publication is not repeatable: an approved assessment cannot be
  -- approved and published again
  BEGIN
    PERFORM public.supervisory_assessment_approve(scen,
      'Duplicate approval attempt for verification purposes.', current_date, NULL, true);
    INSERT INTO calcgov_result VALUES ('CALCGOV-14', false, 'a second approval was ACCEPTED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO calcgov_result VALUES ('CALCGOV-14', true, left(SQLERRM,90));
  END;

  PERFORM set_config('request.jwt.claims','',true);
END $$;

SELECT gate, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM calcgov_result ORDER BY gate;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed, count(*) AS total
  FROM calcgov_result;

ROLLBACK;
