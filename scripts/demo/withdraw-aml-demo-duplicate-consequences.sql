-- =============================================================================
-- AML/CFT DEMONSTRATION — WITHDRAW DUPLICATE DS-01 CONSEQUENCE DECISIONS
--
-- Certification finding (golden demo certification wave): once SCEN-06 published
-- a new risk of record for DEMO AML 06, the DS-01 idempotency keys in
-- scripts/demo/seed-aml-demo-downstream.sql resolved against the new publication
-- and a second run recorded a duplicate supervisory plan and reassessment
-- requirement for the same institution.
--
-- The duplicates are removed the only legitimate way: the governed withdrawal
-- operation, which appends withdrawal history and never deletes the decision.
-- The oldest DS-01 plan and reassessment for DEMO AML 06 are kept, because the
-- demonstration script and route manifest reference them by id.
--
-- Convergent: nothing to withdraw on a clean dataset. Non-production only.
--
-- Run: psql -X -q -f scripts/demo/withdraw-aml-demo-duplicate-consequences.sql
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off
SET row_security = on;

BEGIN;
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  IF public.is_production_environment() THEN
    RAISE EXCEPTION 'DEMO AML duplicate withdrawal refused: production environment';
  END IF;
END $$;

DO $$
DECLARE
  claim_sup text := '{"sub":"0b522724-adcb-48bf-b21d-175339479616","role":"authenticated"}';
  e06 uuid;
  d record;
  withdrawn int := 0;
BEGIN
  PERFORM set_config('request.jwt.claims', claim_sup, true);
  SELECT id INTO e06 FROM public.licensees WHERE name LIKE 'DEMO AML 06%' LIMIT 1;
  IF e06 IS NULL THEN
    RAISE EXCEPTION 'DEMO AML 06 missing: run scripts/demo/seed-aml-demo-dataset.sql first';
  END IF;

  FOR d IN
    SELECT id, action_type
      FROM (
        SELECT id, action_type,
               row_number() OVER (PARTITION BY action_type ORDER BY decided_at, id) AS rn
          FROM public.supervisory_consequence_decision
         WHERE entity_id = e06
           AND domain_code = 'AML_CFT'
           AND action_type IN ('OPEN_SUPERVISORY_PLAN','REQUIRE_REASSESSMENT')
           AND withdrawn_at IS NULL
      ) ranked
     WHERE rn > 1
     ORDER BY action_type
  LOOP
    PERFORM public.supervisory_consequence_withdraw(d.id,
      'Withdrawn during golden demo certification: a duplicate DEMO AML 06 ' ||
      d.action_type || ' decision was recorded when the demonstration seed was re-run ' ||
      'after the risk of record was republished. The original decision remains operative.');
    withdrawn := withdrawn + 1;
  END LOOP;

  RAISE NOTICE 'DEMO AML 06 duplicate consequence decisions withdrawn: %', withdrawn;
END $$;

COMMIT;
