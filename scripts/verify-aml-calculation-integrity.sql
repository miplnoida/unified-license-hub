-- AML/CFT H2B — methodology calculation integrity verifier (CALC gates).
--
-- Every gate is provable from the database alone: schema contracts, the source
-- of the governed operations, and the stored data. Nothing here needs a driven
-- browser session, and no result is claimed for anything not executed.
--
-- Usage: psql "$SUPABASE_DB_URL" -f scripts/verify-aml-calculation-integrity.sql
-- The script is read-only and ends in ROLLBACK.

BEGIN;

CREATE TEMP TABLE calc_gate(id text, name text, result text, detail text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.gate(_id text, _name text, _ok boolean, _detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO calc_gate VALUES (_id, _name, CASE WHEN _ok THEN 'PASS' ELSE 'FAIL' END, _detail);
$$;

DO $$
DECLARE n bigint; m bigint; src text; cfgs bigint; a record; r1 jsonb; r2 jsonb; drift bigint := 0;
BEGIN
  -- CALC-01 the server-side engine exists and configuration is governed.
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('supervisory_calc_compute','supervisory_assessment_calculate',
                       'supervisory_calculation_config_upsert','supervisory_calculation_config_lifecycle',
                       'supervisory_calculation_config_validate','supervisory_calculation_response_scores_set',
                       'supervisory_calculation_bands_set','supervisory_calculation_matrix_set',
                       'supervisory_domain_calculation_rule_set','supervisory_methodology_as_of');
  SELECT count(*) INTO m FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('supervisory_calculation_config','supervisory_calculation_response_score',
                        'supervisory_calculation_band','supervisory_calculation_matrix_cell',
                        'supervisory_calculation_event','supervisory_domain_calculation_rule',
                        'supervisory_assessment_calculation');
  PERFORM pg_temp.gate('CALC-01','server-side engine present', n = 10 AND m = 7,
    format('governed operations = %s/10, configuration stores = %s/7', n, m));

  -- CALC-02 the caller has no authority over calculated_*: the governed write
  -- neither stores the caller's values nor skips the server recalculation.
  SELECT pg_get_functiondef(p.oid) INTO src FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'supervisory_assessment_dimension_upsert';
  PERFORM pg_temp.gate('CALC-02','no caller authority over calculated ratings',
    src IS NOT NULL
      AND src LIKE '%supervisory_assessment_calculate(_assessment_id)%'
      AND src NOT LIKE '%calculated_residual_rating = EXCLUDED.calculated_residual_rating%'
      AND src NOT LIKE '%_calculated_residual_rating, _calculated_score%',
    'the governed dimension write recalculates server-side and stores no caller-supplied calculated value');

  -- CALC-03 no override is recorded where the judgement equals the calculation.
  SELECT count(*) INTO n FROM public.supervisory_assessment_dimension d
   WHERE d.is_overridden
     AND COALESCE(upper(d.calculated_residual_rating),'') = COALESCE(upper(d.residual_rating),'')
     AND COALESCE(upper(d.calculated_inherent_rating),'') = COALESCE(upper(d.inherent_rating),'')
     AND COALESCE(upper(d.calculated_control_rating),'') = COALESCE(upper(d.control_rating),'');
  PERFORM pg_temp.gate('CALC-03','judged equals calculated implies no override', n = 0,
    format('dimensions flagged as overridden with no divergence = %s', n));

  -- CALC-04 every override carries a rationale, an actor and a timestamp.
  SELECT count(*) INTO n FROM public.supervisory_assessment_dimension d
   WHERE d.is_overridden
     AND (length(btrim(COALESCE(d.override_reason,''))) < 10
          OR d.overridden_by IS NULL OR d.overridden_at IS NULL);
  PERFORM pg_temp.gate('CALC-04','override discipline complete', n = 0,
    format('overrides without a 10+ character reason, actor and timestamp = %s', n));

  -- CALC-05 the calculation is deterministic: two consecutive computations of
  -- the same assessment produce the same result.
  SELECT count(*) INTO cfgs FROM public.supervisory_calculation_config WHERE status = 'ACTIVE';
  IF cfgs = 0 THEN
    PERFORM pg_temp.gate('CALC-05','deterministic calculation', false,
      'no ACTIVE calculation configuration is published, so determinism cannot be evidenced');
  ELSE
    FOR a IN SELECT s.id FROM public.supervisory_assessment s
              WHERE public.supervisory_calc_config_for(s.id) IS NOT NULL LIMIT 25 LOOP
      r1 := public.supervisory_calc_compute(a.id);
      r2 := public.supervisory_calc_compute(a.id);
      IF r1 IS DISTINCT FROM r2 THEN drift := drift + 1; END IF;
    END LOOP;
    PERFORM pg_temp.gate('CALC-05','deterministic calculation', drift = 0,
      format('assessments whose recomputation differed = %s', drift));
  END IF;

  -- CALC-06 stored calculated values match a fresh server recomputation, so no
  -- persisted result can have been forged by a caller.
  IF cfgs = 0 THEN
    PERFORM pg_temp.gate('CALC-06','stored results match a fresh recomputation', false,
      'no ACTIVE calculation configuration is published, so stored results cannot be reconciled');
  ELSE
    drift := 0;
    FOR a IN SELECT s.id FROM public.supervisory_assessment s
              WHERE public.supervisory_calc_config_for(s.id) IS NOT NULL LIMIT 50 LOOP
      r1 := public.supervisory_calc_compute(a.id);
      SELECT count(*) INTO n
        FROM jsonb_array_elements(r1->'dimensions') d
        JOIN public.supervisory_assessment_dimension sad
          ON sad.id = (d->>'assessment_dimension_id')::uuid
       WHERE COALESCE(upper(sad.calculated_residual_rating),'~') <> COALESCE(upper(d->>'residual_rating'),'~');
      drift := drift + n;
    END LOOP;
    PERFORM pg_temp.gate('CALC-06','stored results match a fresh recomputation', drift = 0,
      format('dimensions whose stored calculated residual differs from a recomputation = %s', drift));
  END IF;

  -- CALC-07 temporal consistency: the configuration used belongs to the
  -- assessment's own methodology version and was in force on the resolved
  -- as-of date given the approved effective-date rule.
  SELECT count(*) INTO n FROM public.supervisory_assessment_calculation c
    JOIN public.supervisory_assessment a ON a.id = c.assessment_id
    LEFT JOIN public.supervisory_calculation_config cc ON cc.id = c.config_id
   WHERE c.status = 'CALCULATED'
     AND (cc.id IS NULL
          OR cc.methodology_id <> a.methodology_id
          OR c.methodology_version IS DISTINCT FROM a.methodology_version
          OR (cc.effective_from IS NOT NULL AND c.as_of < cc.effective_from)
          OR (cc.effective_to IS NOT NULL AND c.as_of > cc.effective_to));
  PERFORM pg_temp.gate('CALC-07','configuration/version temporal consistency', n = 0,
    format('calculations using a configuration outside the assessment methodology or its window = %s', n));

  -- CALC-08 the methodology binding of an approved assessment is frozen.
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'public.supervisory_assessment'::regclass
     AND tgname = 'supervisory_assessment_methodology_freeze_trg' AND NOT tgisinternal;
  PERFORM pg_temp.gate('CALC-08','methodology frozen after approval', n = 1,
    format('freeze trigger present = %s', n));

  -- CALC-09 the effective-date rule is a recorded supervisory decision, not an
  -- implicit default in code.
  SELECT count(*) INTO n FROM public.supervisory_domain_calculation_rule
   WHERE domain_code = 'AML_CFT' AND length(btrim(COALESCE(rationale,''))) >= 10;
  PERFORM pg_temp.gate('CALC-09','effective-date rule decided and recorded', n = 1,
    format('recorded AML/CFT effective-date rule decisions = %s', n));

  -- CALC-10 maker/checker on the calculation configuration itself.
  SELECT count(*) INTO n FROM public.supervisory_calculation_config
   WHERE status IN ('APPROVED','ACTIVE','SUPERSEDED')
     AND (approved_by IS NULL OR approved_by = COALESCE(submitted_by, created_by));
  PERFORM pg_temp.gate('CALC-10','configuration maker/checker', n = 0,
    format('approved configurations without an independent approver = %s', n));

  -- CALC-11 an active configuration is complete: responses scored, bands
  -- covering the published vocabularies, and every residual matrix cell.
  IF cfgs = 0 THEN
    PERFORM pg_temp.gate('CALC-11','active configuration complete', false,
      'no ACTIVE calculation configuration is published');
  ELSE
    SELECT count(*) INTO n FROM public.supervisory_calculation_config c
     WHERE c.status = 'ACTIVE'
       AND NOT (public.supervisory_calculation_config_validate(c.id)->>'ok')::boolean;
    PERFORM pg_temp.gate('CALC-11','active configuration complete', n = 0,
      format('active configurations failing completeness validation = %s', n));
  END IF;
END $$;

SELECT id, name, result, detail FROM calc_gate ORDER BY id;
SELECT count(*) FILTER (WHERE result = 'PASS') AS pass,
       count(*) FILTER (WHERE result = 'FAIL') AS fail,
       count(*) AS total FROM calc_gate;

ROLLBACK;
