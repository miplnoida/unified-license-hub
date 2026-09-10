-- =============================================================================
-- AML/CFT DEMONSTRATION DATASET — ADDITIVE CURRENT-WORKFLOW ASSESSMENTS
--
-- Adds NEW assessments created through the CURRENT governed AML workflow
-- (AML-03 programme -> AML-04 question plan -> responses/evidence ->
--  AML-07 submission, return, resubmission), so that the demonstration contains
-- genuine question-plan snapshots, responses, evidence and review history.
--
-- What this script deliberately does NOT do
-- -----------------------------------------
-- It does not approve or publish a risk-of-record. Under the current
-- architecture the approved rating comes from (a) a calculation run, or
-- (b) an approved calculation override — and the override operation itself
-- refuses without a calculation run ('no_calculation'). No live AML/CFT
-- calculation policy is published (DEC-01…DEC-08 unsigned), so an approval
-- would publish a NULL rating and corrupt the risk of record. That is a policy
-- blocker, not a seeding problem: see
-- docs/aml/AML-demo-data-integrity-report.md.
--
-- Nothing existing is deleted or modified: historical demo assessments, risk
-- states, movements and audit events are left exactly as they are.
--
-- Idempotent: each scenario carries a stable fixture key in its summary
-- ('DEMO AML CURRENT SCEN-nn'); an existing scenario is skipped, never
-- duplicated.
--
-- Non-production only.
--
-- Run: psql "$SUPABASE_DB_URL" -X -q -f scripts/demo/seed-aml-demo-current-workflow.sql
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off
SET row_security = on;

BEGIN;
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  IF public.is_production_environment() THEN
    RAISE EXCEPTION 'DEMO AML additive seed refused: production environment';
  END IF;
END $$;

DO $$
DECLARE
  claim_off text := '{"sub":"b8eaf680-fe66-4d49-b816-1c087f511235","role":"authenticated"}';
  claim_sup text := '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}';
  prog uuid;
  scen record;
  ent uuid;
  aid uuid;
  res jsonb;
  q record;
  answered int;
  created int := 0;
  skipped int := 0;
BEGIN
  PERFORM set_config('request.jwt.claims', claim_sup, true);

  -- the governed programme the server itself offers for these demo entities
  SELECT p.id INTO prog
    FROM public.supervisory_assessment_programme p
    JOIN public.supervisory_assessment_programme_set s ON s.id = p.programme_set_id
   WHERE s.domain_code = 'AML_CFT' AND p.assessment_type = 'PERIODIC' AND p.is_active
   ORDER BY p.sort_order, p.created_at LIMIT 1;
  IF prog IS NULL THEN
    RAISE EXCEPTION 'no active AML/CFT PERIODIC assessment programme: additive demo assessments cannot be created through the governed path';
  END IF;

  FOR scen IN
    SELECT * FROM (VALUES
      ('SCEN-01','DEMO AML 01%','PLAN_ONLY'),
      ('SCEN-02','DEMO AML 02%','SUBMITTED'),
      ('SCEN-03','DEMO AML 03%','RETURNED'),
      ('SCEN-04','DEMO AML 04%','RESUBMITTED'),
      ('SCEN-05','DEMO AML 05%','IN_PROGRESS')
    ) AS s(key, ent_like, target)
  LOOP
    SELECT id INTO ent FROM public.licensees WHERE name LIKE scen.ent_like LIMIT 1;
    IF ent IS NULL THEN
      RAISE NOTICE 'scenario %: no demo entity matching % — skipped', scen.key, scen.ent_like;
      CONTINUE;
    END IF;

    PERFORM 1 FROM public.supervisory_assessment
      WHERE entity_id = ent AND summary LIKE '%DEMO AML CURRENT ' || scen.key || '%';
    IF FOUND THEN skipped := skipped + 1; CONTINUE; END IF;

    -- ---- creation through the governed programme (materialises the plan) ----
    PERFORM set_config('request.jwt.claims', claim_off, true);
    res := public.supervisory_assessment_create_programmed(
      ent, 'AML_CFT', prog, 'PERIODIC', NULL, NULL,
      'DEMO AML CURRENT ' || scen.key ||
      ' — periodic AML/CFT risk assessment prepared through the current governed workflow.',
      NULL);
    aid := (res->>'id')::uuid;

    IF scen.target <> 'PLAN_ONLY' THEN
      answered := 0;
      FOR q IN
        SELECT p.question_id, mq.requires_evidence, mq.allow_not_applicable, mq.na_requires_rationale,
               -- only responses the methodology itself permits are ever recorded
               (SELECT o FROM unnest(mq.response_options) o
                 WHERE o <> 'NOT_APPLICABLE' ORDER BY o LIMIT 1) AS first_option,
               (SELECT o FROM unnest(mq.response_options) o
                 WHERE o <> 'NOT_APPLICABLE' ORDER BY o DESC LIMIT 1) AS last_option
          FROM public.supervisory_assessment_question_plan p
          JOIN public.supervisory_methodology_question mq ON mq.id = p.question_id
         WHERE p.assessment_id = aid AND p.plan_state LIKE 'INCLUDED%'
         ORDER BY mq.question_code
      LOOP
        -- a partly-worked file for the in-progress scenario
        IF scen.target = 'IN_PROGRESS' AND answered >= 12 THEN EXIT; END IF;

        IF scen.target <> 'IN_PROGRESS' AND answered = 3 AND q.allow_not_applicable THEN
          PERFORM public.supervisory_assessment_question_upsert(
            aid, q.question_id, 'NOT_APPLICABLE',
            'Not applicable: the institution does not offer this product line in the assessed period, confirmed against the licence scope and the product register.',
            CASE WHEN q.requires_evidence THEN
              jsonb_build_array(jsonb_build_object('kind','WORKPAPER','label','Product register extract'))
            END);
        ELSE
          PERFORM public.supervisory_assessment_question_upsert(
            aid, q.question_id,
            CASE WHEN answered % 5 = 0 THEN q.last_option ELSE q.first_option END,
            'Supervisory conclusion recorded from the file review, walkthroughs and sample testing performed for the assessed period.',
            CASE WHEN q.requires_evidence THEN
              jsonb_build_array(jsonb_build_object('kind','WORKPAPER','label','Assessment workpaper and sample testing record'))
            END);
        END IF;
        answered := answered + 1;
      END LOOP;
    END IF;

    -- ---- lifecycle through the AML-07 review operations --------------------
    IF scen.target IN ('SUBMITTED','RETURNED','RESUBMITTED') THEN
      PERFORM public.supervisory_assessment_submit_for_review(
        aid, 'Submitted for independent supervisory review with the completed question plan and workpapers.',
        NULL, NULL, NULL);
    END IF;

    IF scen.target IN ('RETURNED','RESUBMITTED') THEN
      PERFORM set_config('request.jwt.claims', claim_sup, true);
      PERFORM public.supervisory_assessment_review_return(
        aid, 'Returned for revision: the transaction monitoring sampling evidence does not support the recorded conclusion and must be extended.');
    END IF;

    IF scen.target = 'RESUBMITTED' THEN
      PERFORM set_config('request.jwt.claims', claim_off, true);
      PERFORM public.supervisory_assessment_submit_for_review(
        aid, 'Resubmitted after extending the transaction monitoring sample and re-performing the alert testing.',
        NULL, NULL, 'Extended the monitoring sample from ten to thirty alerts and re-performed the testing.');
    END IF;

    created := created + 1;
    RAISE NOTICE 'scenario % (%): assessment % created for entity %', scen.key, scen.target, aid, ent;
  END LOOP;

  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'additive current-workflow scenarios: % created, % already present', created, skipped;
END $$;

COMMIT;
