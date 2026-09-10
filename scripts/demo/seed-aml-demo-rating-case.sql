-- =============================================================================
-- AML/CFT DEMONSTRATION — ONE CALCULATED, APPROVED AND PUBLISHED RATING
--
-- Adds a single NEW assessment (fixture key 'DEMO AML CURRENT SCEN-06') that
-- travels the complete governed rating lifecycle now that a calculation policy
-- is in force:
--
--   programmed creation -> question plan -> answers -> submit for review
--   -> server-side calculation -> independent approval -> publication of the
--      risk of record
--
-- Nothing existing is touched. No rating is written by this script: the rating
-- comes from supervisory_assessment_calculate, and publication is performed by
-- supervisory_assessment_approve under the reviewing identity. The maker answers
-- and submits; the checker calculates, approves and publishes.
--
-- The assessed period ends today, so the domain's PERIOD_END rule resolves the
-- newly activated calculation policy. Earlier assessments resolve no policy and
-- are unaffected.
--
-- Idempotent: the scenario is skipped if it already exists.
-- Non-production only.
--
-- Run: psql "$SUPABASE_DB_URL" -X -q -f scripts/demo/seed-aml-demo-rating-case.sql
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off
SET row_security = on;

BEGIN;
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  IF public.is_production_environment() THEN
    RAISE EXCEPTION 'AML demonstration rating case refused: production environment';
  END IF;
END $$;

DO $$
DECLARE
  claim_off text := '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
  claim_sup text := '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}';
  prog uuid; ent uuid; aid uuid; res jsonb; q record; n int := 0; calc jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', claim_sup, true);

  SELECT p.id INTO prog
    FROM public.supervisory_assessment_programme p
    JOIN public.supervisory_assessment_programme_set s ON s.id = p.programme_set_id
   WHERE s.domain_code = 'AML_CFT' AND p.assessment_type = 'PERIODIC' AND p.is_active
   ORDER BY p.sort_order, p.created_at LIMIT 1;
  IF prog IS NULL THEN
    RAISE EXCEPTION 'no active AML/CFT PERIODIC assessment programme';
  END IF;

  SELECT id INTO ent FROM public.licensees WHERE name LIKE 'DEMO AML 06%' LIMIT 1;
  IF ent IS NULL THEN RAISE EXCEPTION 'demonstration entity DEMO AML 06 not found'; END IF;

  PERFORM 1 FROM public.supervisory_assessment
   WHERE entity_id = ent AND summary LIKE '%DEMO AML CURRENT SCEN-06%';
  IF FOUND THEN
    RAISE NOTICE 'SCEN-06 already present — nothing to do';
    RETURN;
  END IF;

  -- ------------------------------------------------------------- creation ----
  PERFORM set_config('request.jwt.claims', claim_off, true);
  res := public.supervisory_assessment_create_programmed(
    ent, 'AML_CFT', prog, 'PERIODIC',
    date_trunc('year', current_date)::date, current_date,
    'DEMO AML CURRENT SCEN-06 — periodic AML/CFT risk assessment carried through calculation, approval and publication of the risk of record.',
    NULL);
  aid := (res->>'id')::uuid;

  -- --------------------------------------------------------------- answers ---
  FOR q IN
    SELECT p.question_id, mq.requires_evidence, mq.response_options
      FROM public.supervisory_assessment_question_plan p
      JOIN public.supervisory_methodology_question mq ON mq.id = p.question_id
     WHERE p.assessment_id = aid AND p.plan_state LIKE 'INCLUDED%'
     ORDER BY mq.question_code
  LOOP
    PERFORM public.supervisory_assessment_question_upsert(
      aid, q.question_id,
      -- a mixed but defensible file: mostly met, a recurring partial finding
      CASE WHEN n % 4 = 3 AND 'PARTIALLY' = ANY (q.response_options) THEN 'PARTIALLY'
           WHEN 'YES' = ANY (q.response_options) THEN 'YES'
           ELSE (SELECT o FROM unnest(q.response_options) o WHERE o <> 'NOT_APPLICABLE' ORDER BY o LIMIT 1) END,
      'Supervisory conclusion recorded from the file review, control walkthroughs and sample testing performed for the assessed period.',
      CASE WHEN q.requires_evidence THEN
        jsonb_build_array(jsonb_build_object('kind','WORKPAPER','label','Assessment workpaper and sample testing record'))
      END);
    n := n + 1;
  END LOOP;

  -- ------------------------------------------------------------ calculation --
  -- Mechanical calculation precedes submission, in two governed steps that the
  -- product itself separates: _calculate writes the per-dimension result and its
  -- trace onto the assessment, and _calculation_run_record registers the run the
  -- submission is bound to. The server refuses a submission with no successful
  -- run. Neither step is approval.
  PERFORM public.supervisory_assessment_calculate(aid);
  calc := public.supervisory_assessment_calculation_run_record(aid, 'MANUAL_RUN');
  RAISE NOTICE 'SCEN-06 calculation outcome: %', COALESCE(calc->'result'->>'status', calc->>'status');

  PERFORM public.supervisory_assessment_submit_for_review(
    aid, 'Submitted for independent supervisory review with a complete question plan, a completed calculation run and supporting workpapers.',
    (calc->>'run_id')::uuid, calc->>'result_hash', NULL);

  -- -------------------------------------------------- independent judgement --
  PERFORM set_config('request.jwt.claims', claim_sup, true);
  PERFORM public.supervisory_assessment_approve(
    aid,
    'Approved after independent review: the calculated recommendation is supported by the answers, workpapers and sample testing on file, and is adopted as the entity risk of record.',
    current_date, NULL, true);

  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'SCEN-06 assessment % for entity % — % questions answered, calculated, approved and published', aid, ent, n;
END $$;

COMMIT;
