-- =====================================================================
-- PCOMP-R2G — RISK HISTORY SEMANTICS : CERTIFICATION (ROLLBACK ONLY)
-- =====================================================================
-- Proves the AML-07 ownership split on the REAL operational path:
--
--   CALCULATED RESULT  !=  APPROVED ASSESSMENT RESULT  !=  PUBLISHED RISK-OF-RECORD
--
--   * approval records an approved result and does NOT create an operative
--     canonical risk movement
--   * publication creates EXACTLY ONE canonical risk movement
--   * repeated publication creates ZERO additional movements
--   * retried / concurrent publication cannot duplicate a movement
--   * a genuinely distinct later assessment may still record the SAME rating
--     (identity is the governed publication event, never the rating text)
--   * previous risk history is intact and correctly superseded
--   * downstream readers consume the published risk of record
--
-- Everything this script creates is rolled back. The retained live FSRA
-- package, the retained governed assessment SUP-AML_CFT-2026-00830, its
-- publication, its rating and all historical movements are never modified;
-- the preservation gates re-check them after the rollback.
--
-- Run: psql -X -q -f scripts/verify-pcomp-r2g-risk-history.sql
-- =====================================================================

\set ON_ERROR_STOP off
\set QUIET 1
\pset pager off
SET row_security = on;
SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', false);

SELECT (SELECT count(*)::text FROM public.entity_risk_state_movement)                    AS pre_movements,
       (SELECT count(*)::text FROM public.supervisory_assessment)                        AS pre_assessments,
       (SELECT count(*)::text FROM public.supervisory_assessment_risk_publication)       AS pre_publications,
       (SELECT md5(string_agg(m.id::text||':'||COALESCE(m.new_rating,'-')||':'||m.trigger_kind,
                   '|' ORDER BY m.id))
          FROM public.entity_risk_state_movement m)                                      AS pre_movement_digest,
       (SELECT md5(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'),
                   '|' ORDER BY r.entity_id, r.domain_code))
          FROM public.entity_risk_state r)                                               AS pre_risk_digest,
       (SELECT status FROM public.supervisory_assessment
         WHERE reference = 'SUP-AML_CFT-2026-00830')                                     AS pre_r2f_status
\gset

RESET ROLE;
SET ROLE authenticated;

BEGIN;

CREATE TEMP TABLE r2g(gate text PRIMARY KEY, ok boolean, detail text) ON COMMIT DROP;
CREATE TEMP TABLE r2g_id(k text PRIMARY KEY, v uuid) ON COMMIT DROP;
CREATE TEMP TABLE r2g_t(k text PRIMARY KEY, t text) ON COMMIT DROP;
GRANT ALL ON r2g TO authenticated;
GRANT ALL ON r2g_id TO authenticated;
GRANT ALL ON r2g_t TO authenticated;

DO $$
BEGIN
  IF public.is_production_environment() THEN
    RAISE EXCEPTION 'PCOMP-R2G verification refused: production environment';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Structural gate: the backstop identity is the governed publication
-- event for an assessment, not the rating text.
-- ---------------------------------------------------------------------
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_indexdef(i.indexrelid) INTO d
    FROM pg_index i
   WHERE i.indexrelid = 'public.entity_risk_state_movement_publication_identity_uq'::regclass;
  INSERT INTO r2g VALUES ('R2G-00-IDENTITY-IS-THE-PUBLICATION-EVENT',
    d IS NOT NULL AND d LIKE '%new_assessment_id%' AND d LIKE '%domain_code%'
      AND d NOT LIKE '%new_rating%',
    COALESCE(d,'index absent'));
EXCEPTION WHEN undefined_table THEN
  INSERT INTO r2g VALUES ('R2G-00-IDENTITY-IS-THE-PUBLICATION-EVENT', false, 'index absent');
END $$;

-- ---------------------------------------------------------------------
-- A reusable governed chain, so a genuinely distinct SECOND assessment can
-- be driven through exactly the same operational path as the first.
-- Returns the assessment id, left in state 'submitted' and ready for an
-- independent approval decision.
-- ---------------------------------------------------------------------
CREATE FUNCTION pg_temp.r2g_prepare(_ent uuid, _tag text, _target text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  maker   text := '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
  checker text := '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}';
  prog uuid; a uuid; jv jsonb; jw jsonb; q record; fid uuid; exc uuid; run uuid;
  ovr uuid; sdim uuid; qany uuid; n int := 0; calcr text;
BEGIN
  PERFORM set_config('request.jwt.claims', maker, true);

  jv := public.supervisory_assessment_programme_options_for_entity(_ent,'AML_CFT');
  SELECT (p->>'programme_id')::uuid INTO prog
    FROM jsonb_array_elements(jv->'programmes') p
   WHERE p->>'assessment_type' = 'PERIODIC' LIMIT 1;
  IF prog IS NULL THEN RAISE EXCEPTION 'no periodic programme offered for the entity'; END IF;

  jv := public.supervisory_assessment_create_programmed(
    _ent,'AML_CFT', prog,'PERIODIC', NULL, NULL,
    _tag||' — periodic AML/CFT risk assessment driven through the governed policy chain for risk-history certification.');
  a := (jv->>'id')::uuid;

  FOR q IN
    SELECT p.question_id, mq.requires_evidence, mq.response_options, d.dimension_group
      FROM public.supervisory_assessment_question_plan p
      JOIN public.supervisory_methodology_question mq ON mq.id = p.question_id
      JOIN public.supervisory_methodology_dimension d ON d.id = mq.methodology_dimension_id
     WHERE p.assessment_id = a AND p.plan_state LIKE 'INCLUDED%'
     ORDER BY d.dimension_code, mq.question_code
  LOOP
    PERFORM public.supervisory_assessment_question_upsert(
      a, q.question_id,
      CASE WHEN q.dimension_group = 'INHERENT_RISK' THEN 'NO'
           WHEN n % 3 = 2 AND 'PARTIALLY' = ANY (q.response_options) THEN 'PARTIALLY'
           ELSE 'YES' END,
      'Supervisory conclusion recorded from the file review, control walkthrough and sample testing performed for the assessed period.',
      CASE WHEN q.requires_evidence THEN
        jsonb_build_array(jsonb_build_object('kind','WORKPAPER','label','Assessment workpaper and sample testing record'))
      END);
    n := n + 1;
  END LOOP;

  fid := public.supervisory_finding_create(jsonb_build_object(
    'entity_id', _ent,'domain_code','AML_CFT','assessment_id', a,
    'severity','HIGH','title','Customer due diligence refresh backlog',
    'observation','A backlog of periodic customer due diligence refreshes was identified during the assessed period.',
    'required_action','Clear the customer due diligence refresh backlog and report completion to the supervisor.'));

  SELECT p.question_id INTO qany
    FROM public.supervisory_assessment_question_plan p
    JOIN public.supervisory_methodology_question mq ON mq.id = p.question_id
    JOIN public.supervisory_methodology_dimension d ON d.id = mq.methodology_dimension_id
   WHERE p.assessment_id = a AND p.plan_state LIKE 'INCLUDED%' AND d.dimension_code = 'CDD_KYC'
   ORDER BY mq.question_code LIMIT 1;

  PERFORM public.supervisory_assessment_evidence_link(a, jsonb_build_object(
    'evidence_type','FINDING','source_object_id', fid,
    'methodology_question_id', qany,
    'relevance_note','The recorded finding evidences the assessment-level requirement of the governing evidence policy.'));

  SELECT DISTINCT d.id INTO sdim
    FROM public.supervisory_assessment_question_plan p
    JOIN public.supervisory_methodology_question mq ON mq.id = p.question_id
    JOIN public.supervisory_methodology_dimension d ON d.id = mq.methodology_dimension_id
   WHERE p.assessment_id = a AND d.dimension_code = 'SANCTIONS_CONTROLS';

  jw := public.supervisory_assessment_evidence_exception_request(jsonb_build_object(
    'assessment_id', a,'rule_code','FSRA-AML-EV-SANCTIONS','scope_type','DIMENSION',
    'dimension_id', sdim,
    'rationale','The sanctions screening control testing evidence is held in the prior examination file and cannot be relinked to this assessment.'));
  exc := (jw->>'exception_id')::uuid;

  PERFORM set_config('request.jwt.claims', checker, true);
  PERFORM public.supervisory_assessment_evidence_exception_decide(exc,'APPROVED',
    'The deficiency is accepted: the sanctions control testing was performed and evidenced in the prior examination file.');
  PERFORM set_config('request.jwt.claims', maker, true);

  PERFORM public.supervisory_assessment_calculate(a);
  jw := public.supervisory_assessment_calculation_run_record(a,'MANUAL_RUN');
  run := (jw->>'run_id')::uuid;
  SELECT recommended_rating INTO calcr
    FROM public.supervisory_assessment_calculation_run WHERE id = run;

  IF _target IS NOT NULL AND _target <> calcr THEN
    ovr := public.supervisory_calculation_override_propose(a, _target,
      'Supervisory judgement is applied because the sanctions control testing evidence is accepted under an approved exception and the finding backlog is not yet cleared.');
    PERFORM set_config('request.jwt.claims', checker, true);
    PERFORM public.supervisory_calculation_override_decide(ovr,'APPROVED',
      'The departure is approved independently on the recorded supervisory rationale.');
    PERFORM set_config('request.jwt.claims', maker, true);
  END IF;

  PERFORM public.supervisory_assessment_submit_for_review(
    a,'Submitted for independent supervisory review with a complete question plan, a registered calculation run, an approved evidence exception and supporting workpapers.',
    run, jw->>'result_hash', NULL);

  RETURN a;
END $$;

-- =====================================================================
-- THE SEMANTICS
-- =====================================================================
DO $$
DECLARE
  maker   text := '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
  checker text := '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}';
  ent uuid; a1 uuid; a2 uuid; jv jsonb; jw jsonb;
  before_n int; after_n int; rating1 text; rating2 text; ent_hist_digest text;
  prev_driver uuid; mv record; i int;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', maker, true);

  SELECT id INTO ent FROM public.licensees WHERE name LIKE 'DEMO AML 20%' LIMIT 1;
  IF ent IS NULL THEN RAISE EXCEPTION 'demonstration entity DEMO AML 20 not found'; END IF;
  INSERT INTO r2g_id(k,v) VALUES ('entity', ent);

  SELECT md5(COALESCE(string_agg(m.id::text,'|' ORDER BY m.id),'')) INTO ent_hist_digest
    FROM public.entity_risk_state_movement m
   WHERE m.entity_id = ent AND m.domain_code = 'AML_CFT';
  INSERT INTO r2g_t(k,t) VALUES ('ent_hist_digest', ent_hist_digest);

  SELECT driving_assessment_id INTO prev_driver FROM public.entity_risk_state
   WHERE entity_id = ent AND domain_code = 'AML_CFT';

  -- ---- first governed assessment, approved WITHOUT publication ------------
  a1 := pg_temp.r2g_prepare(ent,'PCOMP-R2G CASE ONE', NULL);
  INSERT INTO r2g_id(k,v) VALUES ('a1', a1);

  SELECT count(*) INTO before_n FROM public.entity_risk_state_movement
   WHERE entity_id = ent AND domain_code='AML_CFT';

  PERFORM set_config('request.jwt.claims', checker, true);
  jv := public.supervisory_assessment_approve(
    a1,'Independently reviewed and approved on the registered calculation run and the recorded supervisory judgement.',
    current_date, NULL, false);
  PERFORM set_config('request.jwt.claims', maker, true);

  SELECT count(*) INTO after_n FROM public.entity_risk_state_movement
   WHERE entity_id = ent AND domain_code='AML_CFT';

  INSERT INTO r2g VALUES ('R2G-01-APPROVAL-BINDS-RESULT-ONLY',
    (SELECT status = 'approved' AND approval_decision_id IS NOT NULL
       FROM public.supervisory_assessment WHERE id = a1)
    AND after_n = before_n
    AND NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_risk_publication
                     WHERE assessment_id = a1),
    format('approved with decision %s, %s canonical movement(s) created by approval, %s publication(s)',
      jv->>'decision_id', after_n - before_n,
      (SELECT count(*) FROM public.supervisory_assessment_risk_publication WHERE assessment_id = a1)));

  -- ---- publication creates exactly one canonical movement ----------------
  PERFORM set_config('request.jwt.claims', checker, true);
  jv := public.supervisory_assessment_publish_risk_of_record(a1,
    'The approved AML/CFT assessment result is published as the entity risk of record.');
  PERFORM set_config('request.jwt.claims', maker, true);

  SELECT count(*) INTO after_n FROM public.entity_risk_state_movement
   WHERE entity_id = ent AND domain_code='AML_CFT';
  SELECT residual_rating INTO rating1 FROM public.entity_risk_state
   WHERE entity_id = ent AND domain_code='AML_CFT';
  INSERT INTO r2g_t(k,t) VALUES ('rating1', COALESCE(rating1,'-'));

  INSERT INTO r2g VALUES ('R2G-02-PUBLICATION-CREATES-EXACTLY-ONE-MOVEMENT',
    after_n - before_n = 1
    AND (SELECT count(*) FROM public.entity_risk_state_movement
          WHERE new_assessment_id = a1 AND domain_code='AML_CFT') = 1
    AND (SELECT count(*) FROM public.supervisory_assessment_risk_publication
          WHERE assessment_id = a1) = 1,
    format('%s movement(s) on publication, operative rating %s', after_n - before_n, rating1));

  INSERT INTO r2g VALUES ('R2G-03-MOVEMENT-IS-THE-PUBLICATION-EVENT',
    (SELECT m.trigger_kind = 'ASSESSMENT_APPROVAL' AND m.new_rating = rating1
       FROM public.entity_risk_state_movement m WHERE m.new_assessment_id = a1),
    (SELECT format('trigger %s, %s -> %s', m.trigger_kind,
                   COALESCE(m.previous_rating,'none'), m.new_rating)
       FROM public.entity_risk_state_movement m WHERE m.new_assessment_id = a1));

  -- ---- repeated publication is idempotent --------------------------------
  before_n := after_n;
  PERFORM set_config('request.jwt.claims', checker, true);
  jv := public.supervisory_assessment_publish_risk_of_record(a1,
    'A repeat publication of the same approved result.');
  PERFORM set_config('request.jwt.claims', maker, true);

  SELECT count(*) INTO after_n FROM public.entity_risk_state_movement
   WHERE entity_id = ent AND domain_code='AML_CFT';
  INSERT INTO r2g VALUES ('R2G-04-REPEAT-PUBLICATION-ADDS-NOTHING',
    after_n = before_n
    AND (SELECT count(*) FROM public.supervisory_assessment_risk_publication
          WHERE assessment_id = a1) = 1
    AND COALESCE((jv->>'already_published')::boolean, false),
    format('%s additional movement(s), already_published=%s, publication reused',
      after_n - before_n, jv->>'already_published'));

  -- ---- retried / concurrent publication cannot duplicate -----------------
  PERFORM set_config('request.jwt.claims', checker, true);
  FOR i IN 1..4 LOOP
    BEGIN
      PERFORM public.supervisory_assessment_publish_risk_of_record(a1,
        format('Retry %s of the publication, as a retried or concurrent caller would issue it.', i));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  PERFORM set_config('request.jwt.claims', maker, true);

  SELECT count(*) INTO after_n FROM public.entity_risk_state_movement
   WHERE entity_id = ent AND domain_code='AML_CFT';
  INSERT INTO r2g VALUES ('R2G-05-RETRIED-PUBLICATION-CANNOT-DUPLICATE',
    after_n = before_n
    AND (SELECT count(*) FROM public.entity_risk_state_movement
          WHERE new_assessment_id = a1) = 1,
    format('after 4 retries: %s movement(s) for the assessment, %s total for the entity',
      (SELECT count(*) FROM public.entity_risk_state_movement WHERE new_assessment_id = a1),
      after_n));

  -- ---- supersession and operative ownership ------------------------------
  INSERT INTO r2g VALUES ('R2G-06-PUBLICATION-SUPERSEDES-PREVIOUS-OPERATIVE',
    (SELECT driving_assessment_id = a1 FROM public.entity_risk_state
      WHERE entity_id = ent AND domain_code='AML_CFT')
    AND (SELECT COALESCE(m.previous_assessment_id::text,'-') = COALESCE(prev_driver::text,'-')
           FROM public.entity_risk_state_movement m WHERE m.new_assessment_id = a1),
    format('operative risk now driven by the published assessment, superseding %s',
      COALESCE(prev_driver::text,'no previous assessment')));

  -- ---- downstream readers consume the published risk of record -----------
  jw := public.supervisory_consequence_response_policy_view(ent,'AML_CFT', a1);
  INSERT INTO r2g VALUES ('R2G-07-DOWNSTREAM-CONSUMES-PUBLISHED-RISK',
    ((jw->'evaluation')->>'source_rating') = rating1,
    format('response policy reads the operative rating %s', (jw->'evaluation')->>'source_rating'));

  jw := public.supervisory_assessment_policy_trace(a1);
  INSERT INTO r2g VALUES ('R2G-08-POLICY-TRACE-READS-PUBLISHED-RISK',
    (jw->'rating'->>'operative_rating') = rating1,
    format('policy trace operative rating %s', jw->'rating'->>'operative_rating'));

  -- ---- a genuinely distinct later assessment may repeat the rating -------
  a2 := pg_temp.r2g_prepare(ent,'PCOMP-R2G CASE TWO', rating1);
  INSERT INTO r2g_id(k,v) VALUES ('a2', a2);

  before_n := after_n;
  PERFORM set_config('request.jwt.claims', checker, true);
  PERFORM public.supervisory_assessment_approve(
    a2,'Independently reviewed and approved as a genuinely distinct later supervisory decision.',
    current_date, NULL, true);
  PERFORM set_config('request.jwt.claims', maker, true);

  SELECT count(*) INTO after_n FROM public.entity_risk_state_movement
   WHERE entity_id = ent AND domain_code='AML_CFT';
  SELECT residual_rating INTO rating2 FROM public.entity_risk_state
   WHERE entity_id = ent AND domain_code='AML_CFT';
  INSERT INTO r2g_t(k,t) VALUES ('rating2', COALESCE(rating2,'-'));

  INSERT INTO r2g VALUES ('R2G-09-SAME-RATING-NEW-DECISION-STILL-RECORDED',
    rating2 = rating1
    AND after_n - before_n = 1
    AND (SELECT count(*) FROM public.entity_risk_state_movement WHERE new_assessment_id = a2) = 1,
    format('a distinct later assessment published the same rating %s and recorded %s new movement(s)',
      rating2, after_n - before_n));

  INSERT INTO r2g VALUES ('R2G-10-ATOMIC-APPROVAL-PATH-ALSO-SINGLE-MOVEMENT',
    (SELECT count(*) FROM public.entity_risk_state_movement WHERE new_assessment_id = a2) = 1
    AND (SELECT count(*) FROM public.supervisory_assessment_risk_publication
          WHERE assessment_id = a2) = 1,
    format('approval-with-publication produced %s movement(s) and %s publication(s)',
      (SELECT count(*) FROM public.entity_risk_state_movement WHERE new_assessment_id = a2),
      (SELECT count(*) FROM public.supervisory_assessment_risk_publication WHERE assessment_id = a2)));

  -- ---- pre-existing history for this entity is untouched -----------------
  INSERT INTO r2g VALUES ('R2G-11-PREVIOUS-HISTORY-INTACT',
    (SELECT md5(COALESCE(string_agg(m.id::text,'|' ORDER BY m.id),''))
       FROM public.entity_risk_state_movement m
      WHERE m.entity_id = ent AND m.domain_code='AML_CFT'
        AND m.new_assessment_id NOT IN (a1, a2)) = ent_hist_digest,
    'the entity''s earlier movement rows are unchanged and none were collapsed');

  -- ---- the retained R2F case is untouched by this work -------------------
  INSERT INTO r2g VALUES ('R2G-12-RETAINED-R2F-CASE-UNTOUCHED',
    (SELECT status='approved' FROM public.supervisory_assessment
      WHERE reference='SUP-AML_CFT-2026-00830')
    AND (SELECT count(*) FROM public.entity_risk_state_movement
          WHERE new_assessment_id = (SELECT id FROM public.supervisory_assessment
                                      WHERE reference='SUP-AML_CFT-2026-00830')) = 2,
    'SUP-AML_CFT-2026-00830 keeps its approved status and its two immutable historical movements');

  RESET ROLE;
END $$;

SELECT gate, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail FROM r2g ORDER BY gate;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) AS total FROM r2g;

CREATE TEMP TABLE r2g_result AS SELECT count(*) FILTER (WHERE ok) p, count(*) t FROM r2g;

ROLLBACK;

-- =====================================================================
-- PRESERVATION — after the rollback nothing of the live state moved
-- =====================================================================
SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}', false);

SELECT 'R2G-P1-MOVEMENTS-PRESERVED' AS gate,
       CASE WHEN (SELECT count(*) FROM public.entity_risk_state_movement) = :'pre_movements'::int
                 AND (SELECT md5(string_agg(m.id::text||':'||COALESCE(m.new_rating,'-')||':'||m.trigger_kind,
                                 '|' ORDER BY m.id))
                        FROM public.entity_risk_state_movement m) = :'pre_movement_digest'
            THEN 'PASS' ELSE 'FAIL' END AS result,
       (SELECT count(*)::text FROM public.entity_risk_state_movement) AS detail
UNION ALL
SELECT 'R2G-P2-RISK-STATE-PRESERVED',
       CASE WHEN (SELECT md5(string_agg(r.entity_id::text||':'||COALESCE(r.residual_rating,'-'),
                             '|' ORDER BY r.entity_id, r.domain_code))
                    FROM public.entity_risk_state r) = :'pre_risk_digest'
            THEN 'PASS' ELSE 'FAIL' END,
       'operative risk of record unchanged for every entity'
UNION ALL
SELECT 'R2G-P3-ASSESSMENTS-AND-PUBLICATIONS-PRESERVED',
       CASE WHEN (SELECT count(*) FROM public.supervisory_assessment) = :'pre_assessments'::int
                 AND (SELECT count(*) FROM public.supervisory_assessment_risk_publication) = :'pre_publications'::int
                 AND (SELECT status FROM public.supervisory_assessment
                       WHERE reference='SUP-AML_CFT-2026-00830') = :'pre_r2f_status'
            THEN 'PASS' ELSE 'FAIL' END,
       'no assessment or publication was created, removed or restated'
UNION ALL
SELECT 'R2G-P4-LIVE-POLICY-PACKAGE-PRESERVED',
       CASE WHEN EXISTS (SELECT 1 FROM public.supervisory_policy_profile
                          WHERE code='FSRA-AML-CFT-POLICY' AND profile_version='1.0'
                            AND status='ACTIVE' AND origin='REGULATOR_AUTHORED')
            THEN 'PASS' ELSE 'FAIL' END,
       'FSRA-AML-CFT-POLICY v1.0 remains ACTIVE and regulator-authored';

RESET ROLE;
