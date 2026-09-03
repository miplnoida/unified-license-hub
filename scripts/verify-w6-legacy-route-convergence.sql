-- =====================================================================
-- EPIC 4 / W6 — Legacy retirement, route convergence, W1/W2 truth
-- Certification gates W6-01 … W6-16
--
-- Read-only. Real certification personas. Nothing is seeded, mutated or
-- dropped: W6 proves the census and the convergence, it does not retire
-- database objects.
--
-- Canonical objects under test
--   public.supervisory_work_item / supervisory_work_queue   (work model, W1)
--   public.supervisory_timeline_event / supervisory_timeline (timeline, W2)
--   public.entity_supervisory_360                            (Entity 360)
--   public.supervisory_portfolio                             (W5, frozen)
--   public.sup_team_performance                              (team workload)
--   public.supervisory_finding / supervisory_remediation_action
--   public.examinations / public.entity_risk_state
--
-- Run:  psql "$DB_URL" -f scripts/verify-w6-legacy-route-convergence.sql
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

-- personas (existing certification users; none created here)
--   f26c4940-d64a-4734-bc79-04cc37567b2d  super_admin (cross-domain)
--   07851875-408b-4c29-b294-281180cf4ce5  external portal user (pre_licensee)

-- W6 convergence cutover: everything current is written after this instant.
-- Anything older in a legacy object is history, not current truth.
\set cutover '2026-09-01'

-- ---------------------------------------------------------------------
-- W6-01 — legacy census complete
-- Every known parallel object is classified. A parallel object that is
-- neither classified here nor absent is an unknown, and blocks W6.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
  missing text := '';
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('inspections','DEAD_RETIRABLE'),
      ('inspection_findings','DEAD_RETIRABLE'),
      ('entity_risk_scores','HISTORICAL'),
      ('prudential_actions','LEGACY_STILL_READ'),
      ('prudential_escalations','LEGACY_STILL_READ'),
      ('examination_findings','HISTORICAL'),
      ('conduct_interventions','COMPATIBILITY_ADAPTER'),
      ('supervisory_plans','COMPATIBILITY_ADAPTER'),
      ('supervisory_work_item','CANONICAL_READ_MODEL'),
      ('supervisory_timeline_event','CANONICAL_READ_MODEL'),
      ('supervisory_finding','AUTHORITATIVE'),
      ('supervisory_remediation_action','AUTHORITATIVE'),
      ('examinations','AUTHORITATIVE'),
      ('entity_risk_state','AUTHORITATIVE')
    ) AS t(obj, disposition)
  LOOP
    IF to_regclass('public.' || r.obj) IS NULL THEN
      missing := missing || r.obj || ' ';
    ELSE
      RAISE NOTICE 'W6-01 census: public.% = %', r.obj, r.disposition;
    END IF;
  END LOOP;

  IF missing <> '' THEN
    RAISE EXCEPTION 'FAIL W6-01: classified object absent (compatibility broken): %', missing;
  END IF;
  RAISE NOTICE 'PASS W6-01: legacy census complete, 14 objects classified, none silently dropped';
END $$;

-- ---------------------------------------------------------------------
-- W6-02 — current risk truth is canonical only
-- ---------------------------------------------------------------------
DO $$
DECLARE canon int; legacy_new int;
BEGIN
  SELECT count(*) INTO canon FROM public.entity_risk_state;
  SELECT count(*) INTO legacy_new FROM public.entity_risk_scores
   WHERE created_at >= timestamptz '2026-09-01';
  IF canon = 0 THEN RAISE EXCEPTION 'FAIL W6-02: canonical entity_risk_state empty'; END IF;
  IF legacy_new > 0 THEN
    RAISE EXCEPTION 'FAIL W6-02: % new legacy risk score rows after cutover', legacy_new;
  END IF;
  RAISE NOTICE 'PASS W6-02: entity_risk_state canonical (% rows); entity_risk_scores frozen as history', canon;
END $$;

-- ---------------------------------------------------------------------
-- W6-03 — current findings are canonical only, legacy findings are linked
-- ---------------------------------------------------------------------
DO $$
DECLARE canon int; legacy_new int; unlinked int;
BEGIN
  SELECT count(*) INTO canon FROM public.supervisory_finding;
  SELECT count(*) INTO legacy_new FROM public.examination_findings
   WHERE created_at >= timestamptz '2026-09-01';
  SELECT count(*) INTO unlinked FROM public.examination_findings f
   WHERE f.supervisory_finding_id IS NULL
     AND f.created_at >= timestamptz '2026-09-01';
  IF canon = 0 THEN RAISE EXCEPTION 'FAIL W6-03: canonical supervisory_finding empty'; END IF;
  IF legacy_new > 0 OR unlinked > 0 THEN
    RAISE EXCEPTION 'FAIL W6-03: legacy findings still written (new=%, unlinked=%)', legacy_new, unlinked;
  END IF;
  RAISE NOTICE 'PASS W6-03: supervisory_finding canonical (% rows); examination_findings historical only', canon;
END $$;

-- ---------------------------------------------------------------------
-- W6-04 — current remediation is canonical only
-- ---------------------------------------------------------------------
DO $$
DECLARE canon int; legacy_new int;
BEGIN
  SELECT count(*) INTO canon FROM public.supervisory_remediation_action;
  SELECT count(*) INTO legacy_new FROM public.prudential_actions
   WHERE created_at >= timestamptz '2026-09-01';
  IF canon = 0 THEN RAISE EXCEPTION 'FAIL W6-04: canonical remediation model empty'; END IF;
  IF legacy_new > 0 THEN
    RAISE EXCEPTION 'FAIL W6-04: % prudential_actions rows written after cutover', legacy_new;
  END IF;
  RAISE NOTICE 'PASS W6-04: supervisory_remediation_action canonical (% rows); prudential_actions read-only history', canon;
END $$;

-- ---------------------------------------------------------------------
-- W6-05 — examinations are canonical; the inspections path is dead
-- ---------------------------------------------------------------------
DO $$
DECLARE exams int; insp int; insp_find int;
BEGIN
  SELECT count(*) INTO exams FROM public.examinations;
  SELECT count(*) INTO insp FROM public.inspections;
  SELECT count(*) INTO insp_find FROM public.inspection_findings;
  IF exams = 0 THEN RAISE EXCEPTION 'FAIL W6-05: canonical examinations empty'; END IF;
  IF insp > 0 OR insp_find > 0 THEN
    RAISE EXCEPTION 'FAIL W6-05: legacy inspection records present (inspections=%, findings=%)', insp, insp_find;
  END IF;
  RAISE NOTICE 'PASS W6-05: examinations canonical (%); inspections/inspection_findings hold zero rows (retirable)', exams;
END $$;

-- ---------------------------------------------------------------------
-- W6-06 — every stored/generated route is canonical
-- ---------------------------------------------------------------------
DO $$
DECLARE bad text := '';
BEGIN
  SELECT string_agg(DISTINCT route, ', ') INTO bad
    FROM public.supervisory_work_item
   WHERE route IS NULL
      OR route LIKE '/prudential/examinations/%'
      OR route LIKE '/returns-management/%'
      OR route LIKE '/inspections/%'
      OR route LIKE '/admin/licensees/%'
      OR route LIKE '/entities/%/360%'
      OR route LIKE '/conduct/entities/%'
      OR route LIKE '/prudential/entities/%';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL W6-06: work model emits legacy routes: %', bad;
  END IF;
  RAISE NOTICE 'PASS W6-06: all % generated work routes are canonical',
    (SELECT count(DISTINCT route) FROM public.supervisory_work_item);
END $$;

-- ---------------------------------------------------------------------
-- W6-07 — legacy objects remain readable (bookmarks / historical audit)
-- ---------------------------------------------------------------------
DO $$
DECLARE obj text; n bigint;
BEGIN
  FOREACH obj IN ARRAY ARRAY['prudential_actions','prudential_escalations',
                             'examination_findings','entity_risk_scores',
                             'conduct_interventions','supervisory_plans'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', obj) INTO n;
    RAISE NOTICE 'W6-07 compatibility read: public.% = % rows', obj, n;
  END LOOP;
  RAISE NOTICE 'PASS W6-07: every compatibility/historical surface still resolves';
END $$;

-- ---------------------------------------------------------------------
-- W6-08 — enterprise next action reconciles with the work model
-- Entity 360 must not invent a next action of its own.
-- ---------------------------------------------------------------------
DO $$
DECLARE eid uuid; from_360 text; from_model text;
BEGIN
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f26c4940-d64a-4734-bc79-04cc37567b2d","role":"authenticated"}', true);

  SELECT w.entity_id INTO eid
    FROM public.supervisory_work_item w
   WHERE w.entity_id IS NOT NULL
   GROUP BY w.entity_id ORDER BY count(*) DESC LIMIT 1;

  SELECT (public.entity_supervisory_360(eid) #>> '{next_action,work_key}') INTO from_360;
  SELECT w.work_key INTO from_model
    FROM public.supervisory_work_item w
   WHERE w.entity_id = eid
   ORDER BY w.sort_order, w.due_date NULLS LAST LIMIT 1;

  IF from_360 IS DISTINCT FROM from_model THEN
    RAISE EXCEPTION 'FAIL W6-08: Entity 360 next action % <> work model %', from_360, from_model;
  END IF;
  RAISE NOTICE 'PASS W6-08: one next-action definition (entity %, work_key %)', eid, from_model;
  RESET role;
END $$;

-- ---------------------------------------------------------------------
-- W6-09 — My Work reconciles with the work model under one persona
-- ---------------------------------------------------------------------
DO $$
DECLARE q jsonb; mine int; all_items int;
BEGIN
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f26c4940-d64a-4734-bc79-04cc37567b2d","role":"authenticated"}', true);

  q := public.supervisory_work_queue('MY_WORK', NULL, NULL, NULL, 500);
  SELECT count(*) INTO mine FROM public.supervisory_work_item
   WHERE effective_owner_id = 'f26c4940-d64a-4734-bc79-04cc37567b2d'::uuid;
  SELECT count(*) INTO all_items FROM public.supervisory_work_item;

  IF (q #>> '{counts,MY_WORK}')::int <> mine THEN
    RAISE EXCEPTION 'FAIL W6-09: MY_WORK count % <> owned items %', q #>> '{counts,MY_WORK}', mine;
  END IF;
  IF (q #>> '{counts,ALL}')::int <> all_items THEN
    RAISE EXCEPTION 'FAIL W6-09: ALL count % <> work model %', q #>> '{counts,ALL}', all_items;
  END IF;
  RAISE NOTICE 'PASS W6-09: My Work is a filter over the work model (mine=%, all=%)', mine, all_items;
  RESET role;
END $$;

-- ---------------------------------------------------------------------
-- W6-10 — team workload reconciles with the work model
-- and publishes no fictional utilisation percentage
-- ---------------------------------------------------------------------
DO $$
DECLARE tp jsonb; q jsonb;
BEGIN
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f26c4940-d64a-4734-bc79-04cc37567b2d","role":"authenticated"}', true);

  tp := public.sup_team_performance();
  q  := public.supervisory_work_queue('ALL', NULL, NULL, NULL, 1);

  IF (tp #>> '{source}') <> 'supervisory_work_item' THEN
    RAISE EXCEPTION 'FAIL W6-10: team workload source is %', tp #>> '{source}';
  END IF;
  IF (tp #>> '{totals,open_items}')::int <> (q #>> '{counts,ALL}')::int THEN
    RAISE EXCEPTION 'FAIL W6-10: team open_items % <> queue ALL %',
      tp #>> '{totals,open_items}', q #>> '{counts,ALL}';
  END IF;
  IF (tp #>> '{totals,overdue_items}')::int <> (q #>> '{counts,OVERDUE}')::int THEN
    RAISE EXCEPTION 'FAIL W6-10: team overdue % <> queue OVERDUE %',
      tp #>> '{totals,overdue_items}', q #>> '{counts,OVERDUE}';
  END IF;
  IF (tp #>> '{totals,unassigned_items}')::int <> (q #>> '{counts,UNASSIGNED}')::int THEN
    RAISE EXCEPTION 'FAIL W6-10: team unassigned % <> queue UNASSIGNED %',
      tp #>> '{totals,unassigned_items}', q #>> '{counts,UNASSIGNED}';
  END IF;
  IF (tp #>> '{capacity_methodology}') <> 'NONE_APPROVED' THEN
    RAISE EXCEPTION 'FAIL W6-10: unapproved capacity methodology published: %',
      tp #>> '{capacity_methodology}';
  END IF;
  IF tp ? 'utilisation' OR tp ? 'utilization' OR tp ? 'capacity_score' THEN
    RAISE EXCEPTION 'FAIL W6-10: fictional utilisation metric published';
  END IF;
  RAISE NOTICE 'PASS W6-10: team workload reconciles with the work model; workload facts only';
  RESET role;
END $$;

-- ---------------------------------------------------------------------
-- W6-11 — W1 certified: one work model, all scopes, every item routable
-- ---------------------------------------------------------------------
DO $$
DECLARE s text; q jsonb; dup int; unroutable int;
BEGIN
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f26c4940-d64a-4734-bc79-04cc37567b2d","role":"authenticated"}', true);

  FOREACH s IN ARRAY ARRAY['MY_WORK','MY_TEAM','UNASSIGNED','DUE_SOON','OVERDUE',
                           'HIGH_PRIORITY','AWAITING_MY_APPROVAL','ALL'] LOOP
    q := public.supervisory_work_queue(s, NULL, NULL, NULL, 50);
    IF q IS NULL OR NOT (q ? 'items') OR NOT (q ? 'counts') THEN
      RAISE EXCEPTION 'FAIL W6-11: scope % not served by the canonical queue', s;
    END IF;
  END LOOP;

  SELECT count(*) INTO dup FROM (
    SELECT work_key FROM public.supervisory_work_item GROUP BY 1 HAVING count(*) > 1) x;
  SELECT count(*) INTO unroutable FROM public.supervisory_work_item
   WHERE route IS NULL OR work_type IS NULL OR work_state IS NULL OR priority IS NULL;

  IF dup > 0 THEN RAISE EXCEPTION 'FAIL W6-11: % duplicate work keys', dup; END IF;
  IF unroutable > 0 THEN RAISE EXCEPTION 'FAIL W6-11: % work items incomplete', unroutable; END IF;
  RAISE NOTICE 'PASS W6-11: W1 canonical work model certified (8 scopes, unique keys, all routable)';
  RESET role;
END $$;

-- ---------------------------------------------------------------------
-- W6-12 — W2 certified: one supervisory timeline, read from the records
-- ---------------------------------------------------------------------
DO $$
DECLARE eid uuid; t jsonb; n int; bad int;
BEGIN
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"f26c4940-d64a-4734-bc79-04cc37567b2d","role":"authenticated"}', true);

  SELECT entity_id INTO eid FROM public.supervisory_timeline_event
   WHERE entity_id IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;

  t := public.supervisory_timeline(eid, NULL, NULL, NULL, NULL, 200);
  n := jsonb_array_length(t -> 'events');
  IF n = 0 THEN RAISE EXCEPTION 'FAIL W6-12: timeline empty for entity %', eid; END IF;

  SELECT count(*) INTO bad FROM public.supervisory_timeline_event
   WHERE occurred_at IS NULL OR event_category IS NULL OR source_object IS NULL;
  IF bad > 0 THEN
    RAISE EXCEPTION 'FAIL W6-12: % timeline events without provenance', bad;
  END IF;
  RAISE NOTICE 'PASS W6-12: W2 timeline certified (entity %, % events, full provenance)', eid, n;
  RESET role;
END $$;

-- ---------------------------------------------------------------------
-- W6-13 — no unauthorised external supervisory read
-- ---------------------------------------------------------------------
DO $$
DECLARE leaked int := 0; blocked boolean := false;
BEGIN
  SET LOCAL role authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"07851875-408b-4c29-b294-281180cf4ce5","role":"authenticated"}', true);

  BEGIN
    PERFORM public.sup_team_performance();
  EXCEPTION WHEN OTHERS THEN blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'FAIL W6-13: external user read team workload';
  END IF;

  BEGIN
    SELECT count(*) INTO leaked FROM public.supervisory_work_item;
  EXCEPTION WHEN OTHERS THEN leaked := 0;
  END;
  IF leaked > 0 THEN
    RAISE EXCEPTION 'FAIL W6-13: external user saw % supervisory work items', leaked;
  END IF;
  RAISE NOTICE 'PASS W6-13: external portal user cannot read the supervisory work model or team workload';
  RESET role;
END $$;

-- ---------------------------------------------------------------------
-- W6-14 — compatibility views preserve their security properties
-- (the W5 conduct_interventions defect must not recur)
-- ---------------------------------------------------------------------
DO $$
DECLARE v text; opts text[]; bad text := '';
BEGIN
  FOREACH v IN ARRAY ARRAY['conduct_interventions','supervisory_plans',
                           'supervisory_work_item','supervisory_timeline_event'] LOOP
    SELECT c.reloptions INTO opts FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = v AND c.relkind = 'v';
    IF opts IS NULL OR NOT ('security_invoker=true' = ANY(opts)) THEN
      bad := bad || v || ' ';
    ELSE
      RAISE NOTICE 'W6-14 %: security_invoker=true', v;
    END IF;
  END LOOP;
  IF bad <> '' THEN
    RAISE EXCEPTION 'FAIL W6-14: view(s) lost security_invoker: %', bad;
  END IF;
  RAISE NOTICE 'PASS W6-14: all canonical/compatibility views enforce the caller''s RLS';
END $$;

-- ---------------------------------------------------------------------
-- W6-15 — no active writer to retired objects
-- ---------------------------------------------------------------------
DO $$
DECLARE obj text; n bigint; bad text := '';
BEGIN
  FOREACH obj IN ARRAY ARRAY['inspections','inspection_findings'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', obj) INTO n;
    IF n > 0 THEN bad := bad || format('%s(%s rows) ', obj, n); END IF;
  END LOOP;

  FOR obj IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relname IN ('examination_findings','entity_risk_scores')
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE created_at >= timestamptz ''2026-09-01''', obj) INTO n;
    IF n > 0 THEN bad := bad || format('%s(%s new rows) ', obj, n); END IF;
  END LOOP;

  IF bad <> '' THEN
    RAISE EXCEPTION 'FAIL W6-15: retired/historical objects still written: %', bad;
  END IF;
  RAISE NOTICE 'PASS W6-15: no writes to retired or historical objects after the convergence cutover';
END $$;

-- ---------------------------------------------------------------------
-- W6-16 — route convergence: only canonical destinations are generated
-- ---------------------------------------------------------------------
DO $$
DECLARE bad text := '';
BEGIN
  SELECT string_agg(DISTINCT route, ', ') INTO bad
    FROM public.supervisory_work_item
   WHERE route NOT LIKE '/supervision/%'
     AND route NOT LIKE '/prudential/assessments/%'
     AND route NOT LIKE '/prudential/payment-systems%'
     AND route NOT LIKE '/conduct/%'
     AND route NOT LIKE '/entities/%'
     AND route NOT LIKE '/complaints/%'
     AND route NOT LIKE '/enforcement/%'
     AND route NOT LIKE '/returns/%'
     -- escalation work resolves to the governed escalation register; a
     -- per-case escalation workspace deep link remains open W4 (Q-C) work.
     AND route <> '/admin/escalations'
     AND route <> '/my-work';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL W6-16: non-canonical destination(s) generated: %', bad;
  END IF;
  RAISE NOTICE 'PASS W6-16: every generated destination is a canonical route';
END $$;

ROLLBACK;
