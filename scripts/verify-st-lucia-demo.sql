-- =====================================================================
-- DEMO SMOKE GATE: DEMO_SLU_FSRA_2026 (Saint Lucia FSRA demonstration)
-- Run:  npm run verify:st-lucia-demo
--
-- Proves the demonstration dataset is present, coherent, canonical and
-- truthful. It does NOT create data and makes no changes: it runs inside
-- a transaction that is rolled back.
-- =====================================================================

BEGIN;

DO $$
DECLARE
  n int; v numeric; v2 numeric; ok boolean;
BEGIN
  -- G01 demo entities present
  SELECT count(*) INTO n FROM public.licensees WHERE id::text LIKE '5c1a%' AND status = 'active';
  IF n <> 10 THEN RAISE EXCEPTION 'G01 FAIL: expected 10 active demo licensees, found %', n; END IF;

  -- G02 every demo entity resolves to a canonical party + organization
  SELECT count(*) INTO n
    FROM public.licensees l
    JOIN public.parties p ON p.id = l.party_id
    JOIN public.organizations o ON o.party_id = p.id
   WHERE l.id::text LIKE '5c1a%';
  IF n <> 10 THEN RAISE EXCEPTION 'G02 FAIL: only % demo entities have canonical party+organization', n; END IF;

  -- G03 demo persons present and 1:1 with parties
  SELECT count(*) INTO n FROM public.persons WHERE party_id::text LIKE '5c1c%';
  IF n < 6 THEN RAISE EXCEPTION 'G03 FAIL: expected >=6 demo persons, found %', n; END IF;

  -- G04 governed appointments exist for the demo entities
  SELECT count(*) INTO n FROM public.entity_appointments WHERE entity_id::text LIKE '5c1a%';
  IF n < 6 THEN RAISE EXCEPTION 'G04 FAIL: expected >=6 demo appointments, found %', n; END IF;

  -- G05 ownership interests exist and always carry the canonical owned party
  SELECT count(*) INTO n FROM public.ownership_interests WHERE id::text LIKE '5c1f%';
  IF n < 10 THEN RAISE EXCEPTION 'G05 FAIL: expected >=10 demo ownership rows, found %', n; END IF;
  SELECT count(*) INTO n FROM public.ownership_interests
   WHERE id::text LIKE '5c1f%' AND owned_party_id IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'G05 FAIL: % demo ownership rows lack owned_party_id', n; END IF;

  -- G06 financial group with members
  SELECT count(*) INTO n FROM public.financial_group_members WHERE group_id::text LIKE '5c21%';
  IF n < 3 THEN RAISE EXCEPTION 'G06 FAIL: demo financial group has only % members', n; END IF;

  -- G07 canonical addresses are linked through address_usages (not free text)
  SELECT count(*) INTO n FROM public.address_usages WHERE subject_id::text LIKE '5c1%';
  IF n < 3 THEN RAISE EXCEPTION 'G07 FAIL: expected >=3 demo address usages, found %', n; END IF;

  -- G08 hero filing is ACCEPTED
  SELECT count(*) INTO n FROM public.return_filings
   WHERE id = 'e124d2dc-f08c-4b17-a92f-0db411a8b985' AND status = 'ACCEPTED';
  IF n <> 1 THEN RAISE EXCEPTION 'G08 FAIL: hero filing CV2-E02-2025-Q3 is not ACCEPTED'; END IF;

  -- G09 hero filing metric values present in the single canonical store
  SELECT count(*) INTO n FROM public.return_metric_values
   WHERE return_filing_version_id = '5568551b-5574-48b8-aa9a-5f1ac283751f';
  IF n < 18 THEN RAISE EXCEPTION 'G09 FAIL: hero filing has only % canonical metric values', n; END IF;

  -- G10 ratios on screen are arithmetically true against the reported inputs
  SELECT mv.value_numeric INTO v FROM public.return_metric_values mv
    JOIN public.regulatory_metrics m ON m.id = mv.regulatory_metric_id
   WHERE mv.return_filing_version_id = '5568551b-5574-48b8-aa9a-5f1ac283751f' AND m.code = 'CAPITAL_ADEQUACY_RATIO';
  SELECT round((a.value_numeric / b.value_numeric) * 100, 2) INTO v2
    FROM (SELECT mv.value_numeric FROM public.return_metric_values mv
            JOIN public.regulatory_metrics m ON m.id = mv.regulatory_metric_id
           WHERE mv.return_filing_version_id = '5568551b-5574-48b8-aa9a-5f1ac283751f'
             AND m.code = 'TOTAL_CAPITAL') a,
         (SELECT mv.value_numeric FROM public.return_metric_values mv
            JOIN public.regulatory_metrics m ON m.id = mv.regulatory_metric_id
           WHERE mv.return_filing_version_id = '5568551b-5574-48b8-aa9a-5f1ac283751f'
             AND m.code = 'RWA') b;

  IF round(v, 2) <> v2 THEN
    RAISE EXCEPTION 'G10 FAIL: reported CAR % does not equal capital/RWA %', v, v2;
  END IF;

  -- G11 no second ratio store is used (canonical truth only)
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'return_calculated_ratios';
  IF n = 1 THEN
    SELECT count(*) INTO n FROM public.return_calculated_ratios;
    IF n <> 0 THEN RAISE EXCEPTION 'G11 FAIL: retired ratio store contains % rows', n; END IF;
  END IF;

  -- G12 three demo breaches exist with observed values matching canonical metrics
  SELECT count(*) INTO n FROM public.return_threshold_breaches b
    JOIN public.return_metric_values mv
      ON mv.return_filing_version_id = b.return_filing_version_id
     AND mv.regulatory_metric_id = b.regulatory_metric_id
     AND round(mv.value_numeric, 4) = round(b.value, 4)
   WHERE b.id::text LIKE '5c30001%';
  IF n <> 3 THEN
    RAISE EXCEPTION 'G12 FAIL: only % of 3 demo breaches match a canonical metric value', n;
  END IF;

  -- G13 breach levels are consistent with the configured active thresholds
  SELECT count(*) INTO n FROM public.return_threshold_breaches
   WHERE id::text LIKE '5c30001%'
     AND ((metric_key = 'LIQUIDITY_RATIO'   AND level = 'breach' AND value < threshold_value)
       OR (metric_key = 'COST_INCOME_RATIO' AND level = 'warn'   AND value > threshold_value)
       OR (metric_key = 'NPL_RATIO'         AND level = 'warn'   AND value > threshold_value));
  IF n <> 3 THEN RAISE EXCEPTION 'G13 FAIL: only % of 3 demo breaches are threshold-consistent', n; END IF;

  -- G14 the NPL warning is acknowledged with actor, time and rationale
  SELECT count(*) INTO n FROM public.return_threshold_breach_acknowledgements
   WHERE breach_id = '5c300012-0000-4000-8000-000000000012'
     AND acknowledged_by IS NOT NULL
     AND acknowledged_at IS NOT NULL
     AND length(coalesce(note, '')) >= 10;
  IF n <> 1 THEN RAISE EXCEPTION 'G14 FAIL: NPL warning acknowledgement is incomplete'; END IF;

  -- G15 the liquidity BREACH is reserved (unacknowledged) for the live demo click
  SELECT count(*) INTO n FROM public.return_threshold_breach_acknowledgements
   WHERE breach_id = '5c300011-0000-4000-8000-000000000011';
  IF n <> 0 THEN
    RAISE EXCEPTION 'G15 FAIL: the live-demo breach is already acknowledged; reseed before the demonstration';
  END IF;

  -- G16 acknowledgement produced canonical audit evidence
  SELECT count(*) INTO n FROM public.audit_logs
   WHERE entity_id = '5c300012-0000-4000-8000-000000000012' AND user_id IS NOT NULL AND created_at IS NOT NULL;
  IF n = 0 THEN RAISE EXCEPTION 'G16 FAIL: no audit evidence for the breach acknowledgement'; END IF;

  -- G17 an open and a closed prudential action both exist and are linked to breaches
  SELECT count(*) INTO n FROM public.prudential_actions
   WHERE id::text LIKE '5c31001%' AND source_type = 'return_breach'
     AND source_id IN (SELECT id FROM public.return_threshold_breaches WHERE id::text LIKE '5c30001%');
  IF n <> 2 THEN RAISE EXCEPTION 'G17 FAIL: expected 2 linked demo prudential actions, found %', n; END IF;

  SELECT count(*) INTO n FROM public.prudential_actions
   WHERE id = '5c310011-0000-4000-8000-000000000011' AND status = 'in_progress' AND progress_percent BETWEEN 1 AND 99;
  IF n <> 1 THEN RAISE EXCEPTION 'G17 FAIL: the in-flight demo action is not mid-lifecycle'; END IF;

  -- G18 closure is fully represented (status, closure time, closer, review)
  SELECT count(*) INTO n FROM public.prudential_actions
   WHERE id = '5c310012-0000-4000-8000-000000000012'
     AND status = 'completed' AND progress_percent = 100
     AND closed_at IS NOT NULL AND closed_by IS NOT NULL
     AND review_status = 'accepted' AND reviewed_at IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'G18 FAIL: closed demo action lacks complete closure evidence'; END IF;

  -- G19 RLS remains enabled on every table the demo touches
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public'
     AND c.relname IN ('licensees','parties','organizations','persons','ownership_interests',
                       'entity_appointments','financial_groups','financial_group_members',
                       'return_filings','return_metric_values','return_threshold_breaches',
                       'return_threshold_breach_acknowledgements','prudential_actions')
     AND c.relrowsecurity IS FALSE;
  IF n <> 0 THEN RAISE EXCEPTION 'G19 FAIL: % demo-relevant tables have RLS disabled', n; END IF;

  -- G20 anonymous callers cannot read demo supervisory records
  -- (either the grant is absent, or RLS returns zero rows — both are a pass)
  BEGIN
    SET LOCAL ROLE anon;
    SELECT count(*) INTO n FROM public.return_threshold_breaches WHERE id::text LIKE '5c30001%';
    RESET ROLE;
    IF n <> 0 THEN RAISE EXCEPTION 'G20 FAIL: anonymous role can read % demo breach rows', n; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;


  -- G21 demo environment guard is in place
  IF public.is_production_environment() THEN
    RAISE EXCEPTION 'G21 FAIL: this is a production environment — demo data must not be present';
  END IF;

  RAISE NOTICE 'DEMO_SLU_FSRA_2026 SMOKE: 21/21 GATES PASSED';
END $$;

ROLLBACK;
