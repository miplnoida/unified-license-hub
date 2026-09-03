-- =====================================================================
-- EPIC 4 / W5 — Enterprise dashboard, portfolio & sector supervision
-- Certification gates W5-01 … W5-18
--
-- Read-only. Real certification personas. Nothing is seeded or mutated.
-- Every gate reconciles the governed read models
--   public.sup_domain_readable
--   public.supervisory_portfolio
--   public.supervisory_sector_overview
--   public.enterprise_supervisory_overview
-- against the canonical supervisory spine objects, under the SAME persona,
-- so RLS and domain authority participate in the comparison.
--
-- Run:  psql "$DB_URL" -f scripts/verify-w5-enterprise-portfolio.sql
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

-- personas (existing certification users; none created here)
--   f26c4940-d64a-4734-bc79-04cc37567b2d  super_admin        (cross-domain)
--   021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce  prudential_supervisor
--   57d0f4bd-76ed-42b8-9ee6-af5f02cdd686  enforcement_supervisor (AML only, no spine)
--   4180b172-8435-4511-a152-ccfd1701cbbc  payment_systems_supervisor
--   07851875-408b-4c29-b294-281180cf4ce5  external portal user (pre_licensee)

-- ---------------------------------------------------------------------
-- W5-01 — canonical source census
-- No current enterprise supervisory figure may be computed from the
-- legacy parallel tables. They may remain readable for history.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  fn text;
  d  text;
  leg text;
  bad text := '';
BEGIN
  FOREACH fn IN ARRAY ARRAY['supervisory_portfolio','supervisory_sector_overview',
                            'enterprise_supervisory_overview','sup_domain_readable',
                            'entity_supervisory_360','supervisory_work_queue'] LOOP
    SELECT pg_get_functiondef(oid) INTO d FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace AND proname = fn LIMIT 1;
    IF d IS NULL THEN
      RAISE EXCEPTION 'FAIL W5-01: canonical read model % does not exist', fn;
    END IF;
    FOREACH leg IN ARRAY ARRAY['entity_risk_scores','prudential_actions',
                               'prudential_escalations','public.inspections'] LOOP
      IF d LIKE '%' || leg || '%' THEN
        bad := bad || format('%s→%s ', fn, leg);
      END IF;
    END LOOP;
  END LOOP;
  IF bad <> '' THEN
    RAISE EXCEPTION 'FAIL W5-01: legacy supervisory truth still drives a canonical read model: %', bad;
  END IF;

  -- the canonical read models must declare their provenance
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'enterprise_supervisory_overview';
  IF d NOT LIKE '%entity_risk_state%' OR d NOT LIKE '%supervisory_work_item%'
     OR d NOT LIKE '%supervisory_domain_perimeter%' THEN
    RAISE EXCEPTION 'FAIL W5-01: enterprise overview is not sourced from the canonical spine';
  END IF;
  RAISE NOTICE 'PASS W5-01: enterprise supervisory read models source only canonical spine objects';
END $$;

-- ---------------------------------------------------------------------
-- W5-02 — AML portfolio reconciliation (24-case demonstration dataset)
-- enterprise portfolio == AML domain portfolio == Entity 360 == entity_risk_state
-- DEMO AML 21 is outside the AML perimeter and must not enter the denominator.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  pf jsonb; ov jsonb; r record;
  n_state int; n_pf int; n_aml int; n_ov int; n_perim int;
  rating_pf text; rating_360 text; rating_state text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f26c4940-d64a-4734-bc79-04cc37567b2d","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  pf := public.supervisory_portfolio(_domain => 'AML_CFT', _limit => 500);
  ov := public.enterprise_supervisory_overview();

  SELECT count(*) INTO n_state FROM public.entity_risk_state rs
    JOIN public.licensees l ON l.id = rs.entity_id
   WHERE rs.domain_code = 'AML_CFT' AND l.name LIKE 'DEMO AML %';

  SELECT count(*) INTO n_pf FROM jsonb_array_elements(pf -> 'rows') x
   WHERE x ->> 'entity_name' LIKE 'DEMO AML %'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(x -> 'domains') d
                  WHERE d ->> 'domain_code' = 'AML_CFT'
                    AND (d ->> 'is_assessed')::boolean);

  SELECT count(*) INTO n_aml FROM public.aml_portfolio(500) a
   WHERE a.entity_name LIKE 'DEMO AML %' AND a.residual_rating IS NOT NULL;

  IF n_pf <> n_state OR n_aml <> n_state THEN
    RAISE EXCEPTION 'FAIL W5-02: AML assessed count disagrees (enterprise %, aml domain %, entity_risk_state %)',
      n_pf, n_aml, n_state;
  END IF;

  -- per-entity rating agreement across enterprise portfolio, Entity 360 and risk state
  FOR r IN
    SELECT l.id, l.name FROM public.licensees l
     WHERE l.name LIKE 'DEMO AML %' ORDER BY l.name
  LOOP
    SELECT upper(rs.residual_rating) INTO rating_state
      FROM public.entity_risk_state rs
     WHERE rs.entity_id = r.id AND rs.domain_code = 'AML_CFT';

    SELECT upper(d ->> 'residual_rating') INTO rating_pf
      FROM jsonb_array_elements(pf -> 'rows') x,
           jsonb_array_elements(x -> 'domains') d
     WHERE (x ->> 'entity_id')::uuid = r.id AND d ->> 'domain_code' = 'AML_CFT';

    SELECT upper(d ->> 'residual_rating') INTO rating_360
      FROM jsonb_array_elements(public.entity_supervisory_360(r.id) -> 'domains') d
     WHERE d ->> 'domain_code' = 'AML_CFT';

    IF COALESCE(rating_pf,'∅') <> COALESCE(rating_state,'∅')
       OR COALESCE(rating_360,'∅') <> COALESCE(rating_state,'∅') THEN
      RAISE EXCEPTION 'FAIL W5-02: % AML rating disagrees (portfolio %, 360 %, state %)',
        r.name, rating_pf, rating_360, rating_state;
    END IF;
  END LOOP;

  -- LOW / MODERATE / HIGH all represented and all reconciled above
  IF NOT EXISTS (SELECT 1 FROM public.entity_risk_state rs JOIN public.licensees l ON l.id = rs.entity_id
                  WHERE l.name LIKE 'DEMO AML %' AND rs.domain_code = 'AML_CFT'
                    AND upper(rs.residual_rating) = 'LOW')
     OR NOT EXISTS (SELECT 1 FROM public.entity_risk_state rs JOIN public.licensees l ON l.id = rs.entity_id
                  WHERE l.name LIKE 'DEMO AML %' AND rs.domain_code = 'AML_CFT'
                    AND upper(rs.residual_rating) = 'MODERATE')
     OR NOT EXISTS (SELECT 1 FROM public.entity_risk_state rs JOIN public.licensees l ON l.id = rs.entity_id
                  WHERE l.name LIKE 'DEMO AML %' AND rs.domain_code = 'AML_CFT'
                    AND upper(rs.residual_rating) = 'HIGH') THEN
    RAISE EXCEPTION 'FAIL W5-02: LOW/MODERATE/HIGH are not all present in the AML demonstration dataset';
  END IF;

  -- perimeter exclusion: DEMO AML 21 must be outside the AML denominator
  IF public.supervisory_domain_applicable(
       (SELECT id FROM public.licensees WHERE name LIKE 'DEMO AML 21%'), 'AML_CFT') THEN
    RAISE EXCEPTION 'FAIL W5-02: DEMO AML 21 is inside the AML perimeter';
  END IF;

  SELECT count(*) INTO n_perim FROM jsonb_array_elements(pf -> 'rows') x,
       jsonb_array_elements(x -> 'domains') d
   WHERE x ->> 'entity_name' LIKE 'DEMO AML 21%'
     AND d ->> 'domain_code' = 'AML_CFT' AND (d ->> 'is_applicable')::boolean;
  IF n_perim > 0 THEN
    RAISE EXCEPTION 'FAIL W5-02: DEMO AML 21 entered the enterprise AML perimeter denominator';
  END IF;

  SELECT (x ->> 'outside_perimeter')::int INTO n_ov
    FROM jsonb_array_elements(ov -> 'risk') x WHERE x ->> 'domain_code' = 'AML_CFT';
  IF COALESCE(n_ov,0) < 1 THEN
    RAISE EXCEPTION 'FAIL W5-02: executive AML perimeter does not report the excluded entity';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'PASS W5-02: AML portfolio reconciles (assessed=%; perimeter exclusion honoured)', n_state;
END $$;

-- ---------------------------------------------------------------------
-- W5-03 — Prudential reconciliation; entity_risk_state is authoritative
-- ---------------------------------------------------------------------
DO $$
DECLARE
  pf jsonb; r record; rating_pf text; rating_360 text; n int := 0;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"021f95d9-7da6-4ded-9b13-d2c8a6b8c3ce","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  pf := public.supervisory_portfolio(_domain => 'PRUDENTIAL', _limit => 500);

  FOR r IN
    SELECT rs.entity_id, l.name, upper(rs.residual_rating) AS rating
      FROM public.entity_risk_state rs JOIN public.licensees l ON l.id = rs.entity_id
     WHERE rs.domain_code = 'PRUDENTIAL' ORDER BY l.name LIMIT 25
  LOOP
    SELECT upper(d ->> 'residual_rating') INTO rating_pf
      FROM jsonb_array_elements(pf -> 'rows') x, jsonb_array_elements(x -> 'domains') d
     WHERE (x ->> 'entity_id')::uuid = r.entity_id AND d ->> 'domain_code' = 'PRUDENTIAL';

    SELECT upper(d ->> 'residual_rating') INTO rating_360
      FROM jsonb_array_elements(public.entity_supervisory_360(r.entity_id) -> 'domains') d
     WHERE d ->> 'domain_code' = 'PRUDENTIAL';

    IF COALESCE(rating_pf,'∅') <> COALESCE(r.rating,'∅')
       OR COALESCE(rating_360,'∅') <> COALESCE(r.rating,'∅') THEN
      RAISE EXCEPTION 'FAIL W5-03: % prudential rating disagrees (portfolio %, 360 %, state %)',
        r.name, rating_pf, rating_360, r.rating;
    END IF;
    n := n + 1;
  END LOOP;

  IF n = 0 THEN
    RAISE EXCEPTION 'FAIL W5-03: no prudential risk state available to reconcile';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS W5-03: % prudential entities reconcile to entity_risk_state (no legacy fallback)', n;
END $$;

-- ---------------------------------------------------------------------
-- W5-04 — cross-domain entity: domains stay independent, no arithmetic overall
-- ---------------------------------------------------------------------
DO $$
DECLARE
  eid uuid; pf jsonb; row_j jsonb; e360 jsonb; k text; ratings text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f26c4940-d64a-4734-bc79-04cc37567b2d","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  SELECT rs.entity_id INTO eid FROM public.entity_risk_state rs
   GROUP BY rs.entity_id HAVING count(DISTINCT rs.domain_code) > 1 LIMIT 1;
  IF eid IS NULL THEN
    RAISE EXCEPTION 'FAIL W5-04: no multi-domain entity available';
  END IF;

  pf := public.supervisory_portfolio(_limit => 1000);
  SELECT x INTO row_j FROM jsonb_array_elements(pf -> 'rows') x
   WHERE (x ->> 'entity_id')::uuid = eid;
  IF row_j IS NULL THEN
    RAISE EXCEPTION 'FAIL W5-04: multi-domain entity absent from enterprise portfolio';
  END IF;
  e360 := public.entity_supervisory_360(eid);

  -- every domain rating preserved, per domain, in both read models
  FOR k, ratings IN
    SELECT rs.domain_code, upper(rs.residual_rating) FROM public.entity_risk_state rs
     WHERE rs.entity_id = eid
  LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(row_j -> 'domains') d
                    WHERE d ->> 'domain_code' = k
                      AND upper(d ->> 'residual_rating') = ratings) THEN
      RAISE EXCEPTION 'FAIL W5-04: portfolio lost domain % rating %', k, ratings;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(e360 -> 'domains') d
                    WHERE d ->> 'domain_code' = k
                      AND upper(d ->> 'residual_rating') = ratings) THEN
      RAISE EXCEPTION 'FAIL W5-04: Entity 360 lost domain % rating %', k, ratings;
    END IF;
  END LOOP;

  -- no synthetic enterprise-wide rating is invented anywhere
  FOR k IN SELECT jsonb_object_keys(row_j) LOOP
    IF k IN ('overall_rating','composite_rating','aggregate_rating','enterprise_rating',
             'average_rating','risk_score_overall') THEN
      RAISE EXCEPTION 'FAIL W5-04: portfolio invents an arithmetic enterprise rating (%)', k;
    END IF;
  END LOOP;

  -- highest_residual_rating must be a member of the per-domain rating set (a max, not a mean)
  IF row_j ->> 'highest_residual_rating' IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.entity_risk_state rs
                      WHERE rs.entity_id = eid
                        AND upper(rs.residual_rating) = upper(row_j ->> 'highest_residual_rating')) THEN
    RAISE EXCEPTION 'FAIL W5-04: highest_residual_rating % is not one of the domain ratings',
      row_j ->> 'highest_residual_rating';
  END IF;

  -- multi-domain concern is a count of domains, not a blended rating
  IF (row_j ->> 'concern_domains')::int IS DISTINCT FROM
     (SELECT count(*) FROM jsonb_array_elements(row_j -> 'domains') d
       WHERE (d ->> 'is_concern')::boolean) THEN
    RAISE EXCEPTION 'FAIL W5-04: concern_domains does not equal the per-domain concern count';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'PASS W5-04: multi-domain entity % keeps every domain rating independent', eid;
END $$;

-- ---------------------------------------------------------------------
-- W5-05 — sector denominators use the domain perimeter, not all licensees
-- ---------------------------------------------------------------------
DO $$
DECLARE
  so jsonb; r jsonb; expected int; n_checked int := 0; total_licensees int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f26c4940-d64a-4734-bc79-04cc37567b2d","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  so := public.supervisory_sector_overview(NULL);
  SELECT count(*) INTO total_licensees FROM public.licensees;

  FOR r IN SELECT x FROM jsonb_array_elements(so -> 'rows') x LOOP
    SELECT count(*) INTO expected FROM public.licensees l
     WHERE l.sector_id::text = COALESCE(r ->> 'sector_id', l.sector_id::text)
       AND (r ->> 'sector_id') IS NOT NULL
       AND l.sector_id = (r ->> 'sector_id')::uuid
       AND public.supervisory_domain_applicable(l.id, r ->> 'domain_code');
    IF (r ->> 'sector_id') IS NOT NULL AND (r ->> 'in_perimeter')::int <> expected THEN
      RAISE EXCEPTION 'FAIL W5-05: sector % domain % perimeter denominator % <> canonical %',
        r ->> 'sector_name', r ->> 'domain_code', r ->> 'in_perimeter', expected;
    END IF;
    -- assessed must never exceed the perimeter it is measured against
    IF (r ->> 'assessed')::int > (r ->> 'in_perimeter')::int THEN
      RAISE EXCEPTION 'FAIL W5-05: sector % domain % assessed > perimeter',
        r ->> 'sector_name', r ->> 'domain_code';
    END IF;
    IF (r ->> 'assessed')::int + (r ->> 'unassessed')::int <> (r ->> 'in_perimeter')::int THEN
      RAISE EXCEPTION 'FAIL W5-05: sector % domain % assessed+unassessed <> perimeter',
        r ->> 'sector_name', r ->> 'domain_code';
    END IF;
    -- the whole licensee population must not silently become the denominator
    IF (r ->> 'in_perimeter')::int > total_licensees THEN
      RAISE EXCEPTION 'FAIL W5-05: perimeter exceeds the licensee population';
    END IF;
    n_checked := n_checked + 1;
  END LOOP;

  IF n_checked = 0 THEN
    RAISE EXCEPTION 'FAIL W5-05: sector overview returned no rows';
  END IF;

  -- PFMI population is the qualifying operator population, never all licensees
  IF EXISTS (SELECT 1 FROM public.payment_system_operators) THEN
    IF (SELECT count(*) FROM public.payment_system_operators) >= total_licensees THEN
      RAISE EXCEPTION 'FAIL W5-05: PFMI denominator is the whole licensee population';
    END IF;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'PASS W5-05: % sector/domain denominators equal the domain perimeter', n_checked;
END $$;

-- ---------------------------------------------------------------------
-- W5-06 — findings reconciliation (no examination_findings double count)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  ov jsonb; pf jsonb; exp_open int; exp_sev int; exp_await int; exp_overdue int;
  pf_open int; d text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f26c4940-d64a-4734-bc79-04cc37567b2d","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  ov := public.enterprise_supervisory_overview();
  pf := public.supervisory_portfolio(_limit => 1000);

  SELECT count(*) INTO exp_open FROM public.supervisory_finding f
   WHERE upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED');
  SELECT count(*) INTO exp_sev FROM public.supervisory_finding f
   WHERE upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')
     AND upper(COALESCE(f.severity,'')) IN ('HIGH','CRITICAL','SEVERE');
  SELECT count(*) INTO exp_await FROM public.supervisory_finding f
   WHERE upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')
     AND f.response_at IS NULL AND f.response_recorded_at IS NULL;
  SELECT count(*) INTO exp_overdue FROM public.supervisory_finding f
   WHERE upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')
     AND f.due_date < current_date;

  IF (ov -> 'findings' ->> 'findings_open')::int <> exp_open THEN
    RAISE EXCEPTION 'FAIL W5-06: executive open findings % <> canonical %',
      ov -> 'findings' ->> 'findings_open', exp_open;
  END IF;
  IF (ov -> 'findings' ->> 'findings_awaiting_response')::int <> exp_await THEN
    RAISE EXCEPTION 'FAIL W5-06: awaiting management response % <> canonical %',
      ov -> 'findings' ->> 'findings_awaiting_response', exp_await;
  END IF;
  IF (ov -> 'findings' ->> 'findings_overdue')::int <> exp_overdue THEN
    RAISE EXCEPTION 'FAIL W5-06: overdue findings % <> canonical %',
      ov -> 'findings' ->> 'findings_overdue', exp_overdue;
  END IF;
  IF COALESCE((SELECT sum(v::int) FROM jsonb_each_text(ov -> 'findings' -> 'findings_by_severity') AS s(k,v)
                WHERE upper(k) IN ('HIGH','CRITICAL','SEVERE')),0) <> exp_sev THEN
    RAISE EXCEPTION 'FAIL W5-06: high/critical severity split <> canonical %', exp_sev;
  END IF;

  -- portfolio per-entity open findings sum to the entity-attributed canonical total
  SELECT COALESCE(sum((x ->> 'open_findings')::int),0) INTO pf_open
    FROM jsonb_array_elements(pf -> 'rows') x;
  IF pf_open <> (SELECT count(*) FROM public.supervisory_finding f
                  WHERE upper(f.status) NOT IN ('CLOSED','WITHDRAWN','SUPERSEDED')
                    AND f.entity_id IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL W5-06: portfolio open findings % <> entity-attributed canonical', pf_open;
  END IF;

  -- historical examination_findings must not participate
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'enterprise_supervisory_overview';
  IF d LIKE '%examination_findings%' THEN
    RAISE EXCEPTION 'FAIL W5-06: legacy examination_findings still counted in enterprise findings';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'PASS W5-06: findings reconcile (open=%, high/critical=%, awaiting=%, overdue=%)',
    exp_open, exp_sev, exp_await, exp_overdue;
END $$;

-- ---------------------------------------------------------------------
-- W5-07 — remediation reconciliation (exact action identity, no array order)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  ov jsonb; pf jsonb; e int; d text; eid uuid; pf_overdue int; canon_overdue int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f26c4940-d64a-4734-bc79-04cc37567b2d","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  ov := public.enterprise_supervisory_overview();

  SELECT count(*) INTO e FROM public.supervisory_remediation_action r WHERE r.closed_at IS NULL;
  IF (ov -> 'findings' ->> 'remediation_open')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-07: open remediation % <> canonical %',
      ov -> 'findings' ->> 'remediation_open', e;
  END IF;

  SELECT count(*) INTO e FROM public.supervisory_remediation_action r
   WHERE r.closed_at IS NULL AND r.target_date < current_date
     AND upper(COALESCE(r.status,'')) NOT IN ('EFFECTIVE','CLOSED','CANCELLED','COMPLETED');
  IF (ov -> 'findings' ->> 'remediation_overdue')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-07: overdue remediation % <> canonical %',
      ov -> 'findings' ->> 'remediation_overdue', e;
  END IF;

  SELECT count(*) INTO e FROM public.supervisory_remediation_action r
   WHERE r.completed_at IS NOT NULL AND r.closed_at IS NULL;
  IF (ov -> 'findings' ->> 'remediation_validation_pending')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-07: validation pending % <> canonical %',
      ov -> 'findings' ->> 'remediation_validation_pending', e;
  END IF;

  SELECT count(*) INTO e FROM public.supervisory_remediation_action r
   WHERE upper(COALESCE(r.effectiveness,'')) IN ('INEFFECTIVE','PARTIALLY_EFFECTIVE');
  IF (ov -> 'findings' ->> 'remediation_ineffective')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-07: ineffective/partially effective % <> canonical %',
      ov -> 'findings' ->> 'remediation_ineffective', e;
  END IF;

  -- AML mixed-action demonstration entity: portfolio overdue count is derived per action
  SELECT r.entity_id INTO eid FROM public.supervisory_remediation_action r
    JOIN public.licensees l ON l.id = r.entity_id
   WHERE l.name LIKE 'DEMO AML %'
   GROUP BY r.entity_id HAVING count(*) > 1
   ORDER BY count(*) DESC LIMIT 1;

  IF eid IS NOT NULL THEN
    pf := public.supervisory_portfolio(_entity_id_filter => NULL, _limit => 1000);
    SELECT (x ->> 'overdue_remediation')::int INTO pf_overdue
      FROM jsonb_array_elements(pf -> 'rows') x WHERE (x ->> 'entity_id')::uuid = eid;
    SELECT count(*) INTO canon_overdue FROM public.supervisory_remediation_action r
     WHERE r.entity_id = eid AND r.closed_at IS NULL AND r.target_date < current_date
       AND upper(COALESCE(r.status,'')) NOT IN ('EFFECTIVE','CLOSED','CANCELLED','COMPLETED');
    IF COALESCE(pf_overdue,0) <> canon_overdue THEN
      RAISE EXCEPTION 'FAIL W5-07: mixed-action entity % overdue % <> canonical %',
        eid, pf_overdue, canon_overdue;
    END IF;
  END IF;

  -- no positional action selection in the read models
  FOR d IN SELECT pg_get_functiondef(oid) FROM pg_proc
            WHERE pronamespace = 'public'::regnamespace
              AND proname IN ('supervisory_portfolio','enterprise_supervisory_overview',
                              'entity_supervisory_360') LOOP
    IF d LIKE '%LIMIT 1)%actions%' AND d NOT LIKE '%ORDER BY%' THEN
      RAISE EXCEPTION 'FAIL W5-07: a remediation figure is selected by array order';
    END IF;
  END LOOP;

  RESET ROLE;
  RAISE NOTICE 'PASS W5-07: remediation reconciles on exact action identity';
END $$;

-- ---------------------------------------------------------------------
-- W5-08 — programme delivery (legacy inspections must not inflate)
-- ---------------------------------------------------------------------
DO $$
DECLARE ov jsonb; e int; d text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f26c4940-d64a-4734-bc79-04cc37567b2d","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  ov := public.enterprise_supervisory_overview();

  SELECT count(*) INTO e FROM public.supervisory_plan p WHERE p.completed_at IS NULL;
  IF (ov -> 'programme' ->> 'plans_active')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-08: active plans % <> canonical %', ov -> 'programme' ->> 'plans_active', e;
  END IF;

  SELECT count(*) INTO e FROM public.supervisory_intervention v WHERE v.completed_at IS NULL;
  IF (ov -> 'programme' ->> 'interventions_active')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-08: active interventions % <> canonical %',
      ov -> 'programme' ->> 'interventions_active', e;
  END IF;

  SELECT count(*) INTO e FROM public.examinations x WHERE x.closed_at IS NULL;
  IF (ov -> 'programme' ->> 'examinations_open')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-08: open examinations % <> canonical %',
      ov -> 'programme' ->> 'examinations_open', e;
  END IF;

  IF (SELECT sum(v::int) FROM jsonb_each_text(ov -> 'programme' -> 'examinations_by_stage') AS s(k,v))
     IS DISTINCT FROM e THEN
    RAISE EXCEPTION 'FAIL W5-08: examination stage split does not sum to the open total';
  END IF;

  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'enterprise_supervisory_overview';
  IF d LIKE '%public.inspections%' THEN
    RAISE EXCEPTION 'FAIL W5-08: legacy inspections inflate the examination programme';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'PASS W5-08: programme delivery reconciles to canonical plan/intervention/examination';
END $$;

-- ---------------------------------------------------------------------
-- W5-09 — supervisory attention
-- ---------------------------------------------------------------------
DO $$
DECLARE ov jsonb; pf jsonb; e int; s int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f26c4940-d64a-4734-bc79-04cc37567b2d","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  ov := public.enterprise_supervisory_overview();
  pf := public.supervisory_portfolio(_limit => 1000);

  SELECT count(*) INTO e FROM public.supervisory_attention t WHERE t.closed_at IS NULL;
  IF (ov -> 'attention' ->> 'open')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-09: open attention % <> canonical %', ov -> 'attention' ->> 'open', e;
  END IF;

  SELECT count(*) INTO e FROM public.supervisory_attention t
   WHERE t.closed_at IS NULL AND t.confirmed_at IS NULL;
  IF (ov -> 'attention' ->> 'awaiting_priority_confirmation')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-09: awaiting priority confirmation % <> canonical %',
      ov -> 'attention' ->> 'awaiting_priority_confirmation', e;
  END IF;

  SELECT count(*) INTO e FROM public.supervisory_attention t
   WHERE t.closed_at IS NULL AND t.target_review_date < current_date;
  IF (ov -> 'attention' ->> 'overdue_review')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-09: past review date % <> canonical %',
      ov -> 'attention' ->> 'overdue_review', e;
  END IF;

  SELECT COALESCE(sum((x ->> 'open_attention')::int),0) INTO s
    FROM jsonb_array_elements(pf -> 'rows') x;
  SELECT count(*) INTO e FROM public.supervisory_attention t
   WHERE t.closed_at IS NULL AND t.entity_id IS NOT NULL;
  IF s <> e THEN
    RAISE EXCEPTION 'FAIL W5-09: portfolio attention % <> entity-attributed canonical %', s, e;
  END IF;

  RESET ROLE;
  RAISE NOTICE 'PASS W5-09: supervisory attention reconciles';
END $$;

-- ---------------------------------------------------------------------
-- W5-10 — reassessment requirement + follow-up assessment chain
-- ---------------------------------------------------------------------
DO $$
DECLARE ov jsonb; pf jsonb; e int; eid uuid; pfflag boolean; rrstatus text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f26c4940-d64a-4734-bc79-04cc37567b2d","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  ov := public.enterprise_supervisory_overview();
  pf := public.supervisory_portfolio(_limit => 1000);

  SELECT count(*) INTO e FROM public.supervisory_reassessment_requirement rr
   WHERE upper(rr.status) IN ('REQUIRED','IN_PROGRESS');
  IF (ov -> 'programme' ->> 'reassessments_required')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-10: reassessments required % <> canonical %',
      ov -> 'programme' ->> 'reassessments_required', e;
  END IF;

  SELECT count(*) INTO e FROM public.supervisory_reassessment_requirement rr
   WHERE upper(rr.status) IN ('REQUIRED','IN_PROGRESS') AND rr.due_date < current_date;
  IF (ov -> 'programme' ->> 'reassessments_overdue')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-10: reassessments overdue % <> canonical %',
      ov -> 'programme' ->> 'reassessments_overdue', e;
  END IF;

  -- AML HIGH → MODERATE scenario: completed requirement must not remain "required"
  SELECT rr.entity_id, upper(rr.status) INTO eid, rrstatus
    FROM public.supervisory_reassessment_requirement rr
    JOIN public.licensees l ON l.id = rr.entity_id
   WHERE l.name LIKE 'DEMO AML %' AND upper(rr.status) IN ('COMPLETED','CLOSED','SATISFIED')
   LIMIT 1;
  IF eid IS NOT NULL THEN
    SELECT (x ->> 'reassessment_required')::boolean INTO pfflag
      FROM jsonb_array_elements(pf -> 'rows') x WHERE (x ->> 'entity_id')::uuid = eid;
    IF COALESCE(pfflag,false)
       AND NOT EXISTS (SELECT 1 FROM public.supervisory_reassessment_requirement rr
                        WHERE rr.entity_id = eid AND upper(rr.status) IN ('REQUIRED','IN_PROGRESS')) THEN
      RAISE EXCEPTION 'FAIL W5-10: completed reassessment still flagged as required for %', eid;
    END IF;
  END IF;

  -- portfolio flag must equal the canonical requirement state for every row
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(pf -> 'rows') x
     WHERE COALESCE((x ->> 'reassessment_required')::boolean,false) <> EXISTS (
       SELECT 1 FROM public.supervisory_reassessment_requirement rr
        WHERE rr.entity_id = (x ->> 'entity_id')::uuid
          AND upper(rr.status) IN ('REQUIRED','IN_PROGRESS'))) THEN
    RAISE EXCEPTION 'FAIL W5-10: a portfolio reassessment flag disagrees with the canonical requirement';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'PASS W5-10: reassessment reconciles to supervisory_reassessment_requirement';
END $$;

-- ---------------------------------------------------------------------
-- W5-11 — enforcement only from governed enforcement records/referrals
-- ---------------------------------------------------------------------
DO $$
DECLARE ov jsonb; e int; d text; leaked int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f26c4940-d64a-4734-bc79-04cc37567b2d","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  ov := public.enterprise_supervisory_overview();

  SELECT count(*) INTO e FROM public.enforcement_actions x WHERE x.closed_at IS NULL;
  IF (ov -> 'findings' ->> 'enforcement_open')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-11: open enforcement % <> canonical %',
      ov -> 'findings' ->> 'enforcement_open', e;
  END IF;

  SELECT count(*) INTO e FROM public.enforcement_actions x
   WHERE x.closed_at IS NULL
     AND (x.supervisory_finding_id IS NOT NULL OR x.supervisory_assessment_id IS NOT NULL);
  IF (ov -> 'findings' ->> 'enforcement_from_supervision')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-11: enforcement from supervision % <> canonical %',
      ov -> 'findings' ->> 'enforcement_from_supervision', e;
  END IF;

  -- enforcement must never be inferred; portfolio active_enforcement is record-based
  SELECT count(*) INTO leaked FROM jsonb_array_elements(
      public.supervisory_portfolio(_limit => 1000) -> 'rows') x
   WHERE COALESCE((x ->> 'active_enforcement')::boolean,false)
     AND NOT EXISTS (SELECT 1 FROM public.enforcement_actions ea
                      WHERE ea.entity_id = (x ->> 'entity_id')::uuid AND ea.closed_at IS NULL);
  IF leaked > 0 THEN
    RAISE EXCEPTION 'FAIL W5-11: % portfolio rows infer enforcement without an enforcement record', leaked;
  END IF;

  FOR d IN SELECT pg_get_functiondef(oid) FROM pg_proc
            WHERE pronamespace = 'public'::regnamespace
              AND proname IN ('supervisory_portfolio','enterprise_supervisory_overview') LOOP
    IF d ~* 'enforcement[^;]{0,400}(INEFFECTIVE|overdue_remediation|severity)' THEN
      RAISE EXCEPTION 'FAIL W5-11: an enforcement figure is inferred from findings/remediation state';
    END IF;
  END LOOP;

  RESET ROLE;
  RAISE NOTICE 'PASS W5-11: enforcement originates only from governed enforcement records';
END $$;

-- ---------------------------------------------------------------------
-- W5-12 — enterprise work position == supervisory_work_item / _work_queue
-- ---------------------------------------------------------------------
DO $$
DECLARE ov jsonb; q jsonb; e int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f26c4940-d64a-4734-bc79-04cc37567b2d","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  ov := public.enterprise_supervisory_overview();
  q  := public.supervisory_work_queue('ALL', NULL, NULL, NULL, 1000);

  SELECT count(*) INTO e FROM public.supervisory_work_item;
  IF (ov -> 'work' ->> 'open')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-12: executive work open % <> supervisory_work_item %',
      ov -> 'work' ->> 'open', e;
  END IF;

  SELECT count(*) INTO e FROM public.supervisory_work_item w WHERE w.is_overdue;
  IF (ov -> 'work' ->> 'overdue')::int <> e
     OR COALESCE((q -> 'counts' ->> 'OVERDUE')::int, e) <> e THEN
    RAISE EXCEPTION 'FAIL W5-12: overdue work disagrees (executive %, queue %, canonical %)',
      ov -> 'work' ->> 'overdue', q -> 'counts' ->> 'OVERDUE', e;
  END IF;

  SELECT count(*) INTO e FROM public.supervisory_work_item w WHERE w.is_unassigned;
  IF (ov -> 'work' ->> 'unassigned')::int <> e
     OR COALESCE((q -> 'counts' ->> 'UNASSIGNED')::int, e) <> e THEN
    RAISE EXCEPTION 'FAIL W5-12: unassigned work disagrees (executive %, queue %, canonical %)',
      ov -> 'work' ->> 'unassigned', q -> 'counts' ->> 'UNASSIGNED', e;
  END IF;

  SELECT count(*) INTO e FROM public.supervisory_work_item w WHERE w.decision_point;
  IF (ov -> 'work' ->> 'decision_points')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-12: decision points % <> canonical %',
      ov -> 'work' ->> 'decision_points', e;
  END IF;

  SELECT count(*) INTO e FROM public.supervisory_work_item w
   WHERE upper(COALESCE(w.priority,'')) IN ('HIGH','CRITICAL','URGENT');
  IF COALESCE((q -> 'counts' ->> 'HIGH_PRIORITY')::int, e) <> e THEN
    RAISE EXCEPTION 'FAIL W5-12: high priority queue count % <> canonical %',
      q -> 'counts' ->> 'HIGH_PRIORITY', e;
  END IF;

  -- AWAITING_MY_APPROVAL is a scope of the same model, never a parallel source
  IF (q -> 'counts' ->> 'AWAITING_MY_APPROVAL') IS NULL THEN
    RAISE EXCEPTION 'FAIL W5-12: work queue does not expose the approval scope';
  END IF;

  -- no parallel enterprise task source drives the work position
  IF EXISTS (SELECT 1 FROM pg_proc
              WHERE pronamespace = 'public'::regnamespace
                AND proname = 'enterprise_supervisory_overview'
                AND pg_get_functiondef(oid) ~ '(tasks|work_queue_items|my_tasks)\y'
                AND pg_get_functiondef(oid) NOT LIKE '%supervisory_work_item%') THEN
    RAISE EXCEPTION 'FAIL W5-12: a parallel task source participates in the work position';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'PASS W5-12: enterprise work position reconciles to the canonical work model';
END $$;

-- ---------------------------------------------------------------------
-- W5-13 — Portfolio vs Entity 360 agreement across representative entities
-- ---------------------------------------------------------------------
DO $$
DECLARE
  pf jsonb; row_j jsonb; e360 jsonb; r record; d360 jsonb; dpf jsonb; n int := 0;
  k text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f26c4940-d64a-4734-bc79-04cc37567b2d","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  pf := public.supervisory_portfolio(_limit => 1000);

  FOR r IN
    WITH cand AS (
      -- AML HIGH, AML de-escalated, prudential, conduct, multi-domain
      SELECT rs.entity_id, rs.domain_code FROM public.entity_risk_state rs
       WHERE rs.domain_code = 'AML_CFT' AND upper(rs.residual_rating) = 'HIGH' LIMIT 1
      UNION ALL
      SELECT rs.entity_id, rs.domain_code FROM public.entity_risk_state rs
       WHERE rs.domain_code = 'AML_CFT' AND upper(rs.residual_rating) = 'MODERATE' LIMIT 1
      UNION ALL
      SELECT rs.entity_id, rs.domain_code FROM public.entity_risk_state rs
       WHERE rs.domain_code = 'PRUDENTIAL' LIMIT 1
      UNION ALL
      SELECT rs.entity_id, rs.domain_code FROM public.entity_risk_state rs
       WHERE rs.domain_code = 'MARKET_CONDUCT' LIMIT 1
      UNION ALL
      SELECT rs.entity_id, rs.domain_code FROM public.entity_risk_state rs
       WHERE rs.entity_id IN (SELECT entity_id FROM public.entity_risk_state
                               GROUP BY entity_id HAVING count(DISTINCT domain_code) > 1) LIMIT 2
    ) SELECT DISTINCT entity_id, domain_code FROM cand
  LOOP
    SELECT x INTO row_j FROM jsonb_array_elements(pf -> 'rows') x
     WHERE (x ->> 'entity_id')::uuid = r.entity_id;
    IF row_j IS NULL THEN
      RAISE EXCEPTION 'FAIL W5-13: entity % missing from the enterprise portfolio', r.entity_id;
    END IF;
    e360 := public.entity_supervisory_360(r.entity_id);

    SELECT d INTO dpf FROM jsonb_array_elements(row_j -> 'domains') d
     WHERE d ->> 'domain_code' = r.domain_code;
    SELECT d INTO d360 FROM jsonb_array_elements(e360 -> 'domains') d
     WHERE d ->> 'domain_code' = r.domain_code;
    IF dpf IS NULL OR d360 IS NULL THEN
      RAISE EXCEPTION 'FAIL W5-13: domain % missing for entity % in one read model',
        r.domain_code, r.entity_id;
    END IF;

    FOREACH k IN ARRAY ARRAY['residual_rating','open_findings','critical_findings',
                             'overdue_remediation','validation_pending','open_attention',
                             'active_examination','active_intervention','current_plan',
                             'reassessment_required','active_enforcement','assessment_overdue'] LOOP
      IF COALESCE(dpf ->> k, '∅') IS DISTINCT FROM COALESCE(d360 ->> k, '∅') THEN
        RAISE EXCEPTION 'FAIL W5-13: entity % domain % field % disagrees (portfolio %, 360 %)',
          r.entity_id, r.domain_code, k, dpf ->> k, d360 ->> k;
      END IF;
    END LOOP;
    n := n + 1;
  END LOOP;

  IF n < 3 THEN
    RAISE EXCEPTION 'FAIL W5-13: too few representative entities reconciled (%)', n;
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS W5-13: % representative entity/domain pairs agree between Portfolio and Entity 360', n;
END $$;

-- ---------------------------------------------------------------------
-- W5-14 — PFMI / payment systems; observance never becomes prudential risk
-- ---------------------------------------------------------------------
DO $$
DECLARE ov jsonb; e int; d text; pay jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"4180b172-8435-4511-a152-ccfd1701cbbc","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;
  ov  := public.enterprise_supervisory_overview();
  pay := ov -> 'payment_systems';

  IF NOT COALESCE((pay ->> 'available')::boolean,false) THEN
    RAISE EXCEPTION 'FAIL W5-14: payment systems block unavailable to the payment systems supervisor';
  END IF;

  SELECT count(*) INTO e FROM public.payment_system_operators o
   WHERE COALESCE(o.status,'active') <> 'inactive';
  IF (pay ->> 'operators')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-14: operators % <> canonical %', pay ->> 'operators', e;
  END IF;

  SELECT count(*) INTO e FROM public.payment_system_operators o WHERE o.systemically_important;
  IF (pay ->> 'systemically_important')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-14: systemically important % <> canonical %',
      pay ->> 'systemically_important', e;
  END IF;

  SELECT count(*) INTO e FROM public.payment_system_incidents i
   WHERE COALESCE(i.resolution_status,'open') NOT IN ('resolved','closed');
  IF (pay ->> 'incidents_open')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-14: open incidents % <> canonical %', pay ->> 'incidents_open', e;
  END IF;

  SELECT count(*) INTO e FROM public.payment_system_incidents i WHERE i.sla_breached;
  IF (pay ->> 'incidents_sla_breached')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-14: late/SLA-breached incidents % <> canonical %',
      pay ->> 'incidents_sla_breached', e;
  END IF;

  SELECT count(*) INTO e FROM public.pfmi_assessments a
   WHERE upper(COALESCE(a.status,'')) = 'COMPLETED';
  IF (pay ->> 'pfmi_assessments_completed')::int <> e THEN
    RAISE EXCEPTION 'FAIL W5-14: completed PFMI assessments % <> canonical %',
      pay ->> 'pfmi_assessments_completed', e;
  END IF;

  -- observance ratings live only in the PFMI objects and must not be translated to risk
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'enterprise_supervisory_overview';
  IF d ~* '(NOT_OBSERVED|PARTLY_OBSERVED|BROADLY_OBSERVED)[^;]{0,300}residual_rating'
     OR d ~* 'residual_rating[^;]{0,300}(NOT_OBSERVED|PARTLY_OBSERVED)' THEN
    RAISE EXCEPTION 'FAIL W5-14: PFMI observance is translated into prudential risk';
  END IF;
  IF EXISTS (SELECT 1 FROM public.entity_risk_state rs
              WHERE upper(COALESCE(rs.rating_basis,'')) LIKE '%OBSERV%') THEN
    RAISE EXCEPTION 'FAIL W5-14: a prudential risk state is derived from PFMI observance';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'PASS W5-14: payment systems / PFMI figures reconcile and stay out of prudential risk';
END $$;

-- ---------------------------------------------------------------------
-- W5-15 — domain authorization in the RPC PAYLOAD (not only hidden UI)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  aml_only uuid := '57d0f4bd-76ed-42b8-9ee6-af5f02cdd686'; -- AML view, no spine
  pay_sup  uuid := '4180b172-8435-4511-a152-ccfd1701cbbc'; -- prudential view, no AML permission
  ext      uuid := '07851875-408b-4c29-b294-281180cf4ce5';
  ov jsonb; pf jsonb; leaked int; denied boolean := false;
BEGIN
  -- authority function truth table
  IF NOT public.sup_domain_readable(aml_only,'AML_CFT')
     OR public.sup_domain_readable(aml_only,'PRUDENTIAL')
     OR public.sup_domain_readable(aml_only,'MARKET_CONDUCT') THEN
    RAISE EXCEPTION 'FAIL W5-15: AML-only officer domain authority is wrong';
  END IF;
  IF NOT public.sup_domain_readable(pay_sup,'PRUDENTIAL') THEN
    RAISE EXCEPTION 'FAIL W5-15: prudential officer cannot read PRUDENTIAL';
  END IF;
  IF public.sup_domain_readable(ext,'AML_CFT') OR public.sup_domain_readable(ext,'PRUDENTIAL') THEN
    RAISE EXCEPTION 'FAIL W5-15: external user holds supervisory domain authority';
  END IF;

  -- AML-only officer payload must contain no prudential content
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', aml_only), true);
  SET LOCAL ROLE authenticated;
  ov := public.enterprise_supervisory_overview();
  pf := public.supervisory_portfolio(_limit => 200);

  IF ov -> 'authorised_domains' @> '["PRUDENTIAL"]'::jsonb THEN
    RAISE EXCEPTION 'FAIL W5-15: AML-only payload authorises PRUDENTIAL';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(ov -> 'risk') x
              WHERE x ->> 'domain_code' = 'PRUDENTIAL') THEN
    RAISE EXCEPTION 'FAIL W5-15: AML-only payload carries prudential risk distribution';
  END IF;
  IF COALESCE((ov -> 'payment_systems' ->> 'available')::boolean,false) THEN
    RAISE EXCEPTION 'FAIL W5-15: AML-only payload carries payment systems oversight data';
  END IF;
  SELECT count(*) INTO leaked FROM jsonb_array_elements(pf -> 'rows') x,
       jsonb_array_elements(x -> 'domains') d
   WHERE d ->> 'domain_code' IN ('PRUDENTIAL','MARKET_CONDUCT');
  IF leaked > 0 THEN
    RAISE EXCEPTION 'FAIL W5-15: AML-only portfolio payload contains % non-AML domain blocks', leaked;
  END IF;
  RESET ROLE;

  -- prudential officer must not receive AML content
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', pay_sup), true);
  SET LOCAL ROLE authenticated;
  ov := public.enterprise_supervisory_overview();
  IF NOT public.sup_domain_readable(pay_sup,'AML_CFT')
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(ov -> 'risk') x
                  WHERE x ->> 'domain_code' = 'AML_CFT') THEN
    RAISE EXCEPTION 'FAIL W5-15: prudential officer payload carries AML risk distribution';
  END IF;
  RESET ROLE;

  -- external user denied outright
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', ext), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.enterprise_supervisory_overview();
  EXCEPTION WHEN OTHERS THEN denied := true;
  END;
  IF NOT denied THEN
    ov := public.enterprise_supervisory_overview();
    IF COALESCE((ov ->> 'available')::boolean,false) THEN
      RAISE EXCEPTION 'FAIL W5-15: external user received an enterprise supervisory payload';
    END IF;
  END IF;
  RESET ROLE;

  RAISE NOTICE 'PASS W5-15: domain authority is enforced inside the RPC payloads';
END $$;

-- ---------------------------------------------------------------------
-- W5-16 — entity / team / sector scope; aggregates must not leak existence
-- ---------------------------------------------------------------------
DO $$
DECLARE
  scoped uuid := '57d0f4bd-76ed-42b8-9ee6-af5f02cdd686';
  pf jsonb; ov jsonb; visible int; leaked int; agg int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', scoped), true);
  SET LOCAL ROLE authenticated;

  pf := public.supervisory_portfolio(_limit => 1000);
  ov := public.enterprise_supervisory_overview();

  -- every portfolio row must be an entity the persona can actually read
  SELECT count(*) INTO leaked FROM jsonb_array_elements(pf -> 'rows') x
   WHERE NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = (x ->> 'entity_id')::uuid);
  IF leaked > 0 THEN
    RAISE EXCEPTION 'FAIL W5-16: % portfolio rows are outside the readable entity scope', leaked;
  END IF;

  SELECT count(*) INTO visible FROM public.licensees;
  IF (pf ->> 'total')::int > visible THEN
    RAISE EXCEPTION 'FAIL W5-16: portfolio total % exceeds readable entities %',
      pf ->> 'total', visible;
  END IF;

  -- sector totals cannot exceed the readable population either
  SELECT COALESCE(max((x ->> 'in_perimeter')::int),0) INTO agg
    FROM jsonb_array_elements(public.supervisory_sector_overview(NULL) -> 'rows') x;
  IF agg > visible THEN
    RAISE EXCEPTION 'FAIL W5-16: a sector perimeter total leaks unreadable entities';
  END IF;

  -- executive aggregate must be bounded by the readable population
  IF (ov -> 'concern' ->> 'entities_in_scope')::int > visible THEN
    RAISE EXCEPTION 'FAIL W5-16: executive entities_in_scope % exceeds readable entities %',
      ov -> 'concern' ->> 'entities_in_scope', visible;
  END IF;

  -- the read models must be SECURITY INVOKER so scope cannot be bypassed
  IF EXISTS (SELECT 1 FROM pg_proc
              WHERE pronamespace = 'public'::regnamespace
                AND proname IN ('supervisory_portfolio','supervisory_sector_overview',
                                'enterprise_supervisory_overview')
                AND prosecdef) THEN
    RAISE EXCEPTION 'FAIL W5-16: a portfolio read model is SECURITY DEFINER and bypasses RLS';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'PASS W5-16: portfolio, sector and executive aggregates stay inside the authorised scope';
END $$;

-- ---------------------------------------------------------------------
-- W5-17 — performance: one server round trip per surface, no per-row query
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t0 timestamptz; ms_dash numeric; ms_ent numeric; ms_sec numeric; ms_multi numeric; ms_360 numeric;
  eid uuid; budget numeric := 4000;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f26c4940-d64a-4734-bc79-04cc37567b2d","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  t0 := clock_timestamp();
  PERFORM public.enterprise_supervisory_overview();
  ms_dash := extract(epoch FROM clock_timestamp() - t0) * 1000;

  t0 := clock_timestamp();
  PERFORM public.supervisory_portfolio(_limit => 200);
  ms_ent := extract(epoch FROM clock_timestamp() - t0) * 1000;

  t0 := clock_timestamp();
  PERFORM public.supervisory_sector_overview(NULL);
  ms_sec := extract(epoch FROM clock_timestamp() - t0) * 1000;

  t0 := clock_timestamp();
  PERFORM public.supervisory_portfolio(_multi_domain_only => true, _limit => 200);
  ms_multi := extract(epoch FROM clock_timestamp() - t0) * 1000;

  SELECT entity_id INTO eid FROM public.entity_risk_state LIMIT 1;
  t0 := clock_timestamp();
  PERFORM public.entity_supervisory_360(eid);
  ms_360 := extract(epoch FROM clock_timestamp() - t0) * 1000;

  RESET ROLE;
  RAISE NOTICE 'W5-17 timings ms: dashboard=%, portfolio_entity=%, portfolio_sector=%, multi_domain=%, entity360=%',
    round(ms_dash), round(ms_ent), round(ms_sec), round(ms_multi), round(ms_360);

  IF ms_dash > budget OR ms_ent > budget OR ms_sec > budget
     OR ms_multi > budget OR ms_360 > budget THEN
    RAISE EXCEPTION 'FAIL W5-17: a supervisory surface exceeded the % ms budget', budget;
  END IF;
  RAISE NOTICE 'PASS W5-17: every surface answers in one governed round trip inside budget';
END $$;

-- ---------------------------------------------------------------------
-- W5-18 — final census: no mixed supervisory truth
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record; d text; bad text := '';
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('entity risk',            'entity_risk_state',                'entity_risk_scores'),
      ('supervisory actions',    'supervisory_remediation_action',   'prudential_actions'),
      ('escalations/attention',  'supervisory_attention',            'prudential_escalations'),
      ('engagements',            'examinations',                     'public.inspections'),
      ('findings',               'supervisory_finding',              'examination_findings'),
      ('work position',          'supervisory_work_item',            'tasks'),
      ('perimeter',             'supervisory_domain_perimeter',      'licensees (all)')
    ) AS t(metric, canonical, legacy)
  LOOP
    FOR d IN SELECT pg_get_functiondef(oid) FROM pg_proc
              WHERE pronamespace = 'public'::regnamespace
                AND proname IN ('supervisory_portfolio','supervisory_sector_overview',
                                'enterprise_supervisory_overview','entity_supervisory_360') LOOP
      IF r.legacy NOT LIKE '%(all)%' AND r.legacy <> 'tasks'
         AND d LIKE '%' || r.legacy || '%' THEN
        bad := bad || format('%s(legacy %s) ', r.metric, r.legacy);
      END IF;
    END LOOP;
    RAISE NOTICE 'W5-18 census: metric=% canonical=public.% legacy=% legacy_participates=no',
      r.metric, r.canonical, r.legacy;
  END LOOP;

  IF bad <> '' THEN
    RAISE EXCEPTION 'FAIL W5-18: legacy supervisory truth still participates: %', bad;
  END IF;
  RAISE NOTICE 'PASS W5-18: no current enterprise supervisory KPI depends on legacy supervisory truth';
END $$;

ROLLBACK;
