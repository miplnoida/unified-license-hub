-- MC-09 BACKEND TESTS — Cross-Entity Supervisory Intelligence & Emerging Risk.
-- Covers: register shape, browser write lockdown, no anonymous access,
-- deterministic cross-entity facts, governed lifecycle, written basis,
-- record linking, entity counting and auditor read-only behaviour.
BEGIN;
SELECT plan(16);

-- 1 registers exist
SELECT ok(
  (SELECT count(*) FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname IN ('conduct_emerging_risks','conduct_emerging_risk_records','conduct_emerging_risk_events')) = 3,
  'the emerging risk registers are present');

-- 2 no browser writes
SELECT ok(
  NOT has_table_privilege('authenticated','public.conduct_emerging_risks','INSERT')
  AND NOT has_table_privilege('authenticated','public.conduct_emerging_risks','UPDATE')
  AND NOT has_table_privilege('authenticated','public.conduct_emerging_risk_records','INSERT')
  AND NOT has_table_privilege('authenticated','public.conduct_emerging_risk_events','INSERT')
  AND has_table_privilege('authenticated','public.conduct_emerging_risks','SELECT'),
  'the emerging risk register is read-only from a browser session');

-- 3 no anonymous access
SELECT ok(
  NOT has_table_privilege('anon','public.conduct_emerging_risks','SELECT')
  AND NOT has_function_privilege('anon','public.conduct_emerging_risk_create(jsonb)','EXECUTE')
  AND NOT has_function_privilege('anon','public.conduct_cross_entity_snapshot(uuid,integer,uuid)','EXECUTE'),
  'anonymous users can neither read nor operate cross-entity intelligence');

-- 4 row level security is on
SELECT ok(
  (SELECT bool_and(relrowsecurity) FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname IN ('conduct_emerging_risks','conduct_emerging_risk_records','conduct_emerging_risk_events')),
  'row level security is enabled on every emerging risk register');

CREATE TEMP TABLE mc09 (name text primary key, pass boolean, detail text);

DO $$
DECLARE
  _super uuid; _analyst uuid; _auditor uuid; _sector uuid;
  _risk uuid; _res jsonb; _snap jsonb; _snap2 jsonb; _complaint uuid; _signal uuid; _lic uuid;
BEGIN
  SELECT id INTO _super   FROM public.profiles WHERE email = 'super_admin@mishainfotech.com';
  SELECT id INTO _auditor FROM public.profiles WHERE email = 'auditor@mishainfotech.com';
  SELECT id INTO _analyst FROM public.profiles WHERE email = 'conduct_analyst@mishainfotech.com';

  PERFORM set_config('request.jwt.claims', json_build_object('sub',_super,'role','authenticated')::text, true);

  SELECT l.sector_id, c.licensee_id, c.id INTO _sector, _lic, _complaint
    FROM public.complaints c JOIN public.licensees l ON l.id = c.licensee_id
   WHERE l.sector_id IS NOT NULL
   ORDER BY c.created_at DESC LIMIT 1;

  -- A. cross-entity facts are deterministic and explain their own method
  _snap := public.conduct_cross_entity_snapshot(_sector, 365, NULL);
  _snap2 := public.conduct_cross_entity_snapshot(_sector, 365, NULL);
  INSERT INTO mc09 VALUES ('facts_deterministic',
    (_snap - 'generated_at') = (_snap2 - 'generated_at')
    AND _snap ? 'by_entity' AND _snap ? 'by_theme' AND _snap ? 'cross_entity_themes'
    AND (_snap->>'method') LIKE 'Deterministic%',
    (_snap->'totals')::text);

  -- B. an unsupported observation window is refused
  BEGIN
    PERFORM public.conduct_cross_entity_snapshot(_sector, 5000, NULL);
    INSERT INTO mc09 VALUES ('window_bounded', false, 'an out-of-range window was accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc09 VALUES ('window_bounded', SQLERRM LIKE 'unsupported_window%', SQLERRM);
  END;

  -- C. a written basis is mandatory
  BEGIN
    PERFORM public.conduct_emerging_risk_create(jsonb_build_object(
      'title','Cross-entity fee disclosure concerns','sector_id',_sector,'basis','short'));
    INSERT INTO mc09 VALUES ('basis_required', false, 'a risk was recorded without a basis');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc09 VALUES ('basis_required', SQLERRM LIKE 'A written basis%', SQLERRM);
  END;

  -- D. recording an emerging risk
  _res := public.conduct_emerging_risk_create(jsonb_build_object(
    'title','Cross-entity fee disclosure concerns',
    'summary','Comparable complaint themes observed at more than one entity in the sector.',
    'sector_id',_sector,
    'severity','high',
    'systemic_potential','moderate',
    'window_start',(current_date - 180),
    'window_end',current_date,
    'driver_metrics', jsonb_build_object('theme','fees','entity_count',2),
    'fact_basis', _snap->'totals',
    'basis','Recorded from the deterministic cross-entity view for the stated window.'));
  _risk := (_res->>'id')::uuid;
  INSERT INTO mc09 VALUES ('risk_recorded',
    _risk IS NOT NULL AND (_res->>'reference') LIKE 'ER-%' AND (_res->>'status') = 'IDENTIFIED',
    _res::text);

  -- E. contributing records are linked and entity coverage is derived, not typed
  PERFORM public.conduct_emerging_risk_link_record(_risk, 'complaint', _complaint, NULL, 'first contributing complaint');
  SELECT id INTO _signal FROM public.conduct_signals ORDER BY created_at DESC LIMIT 1;
  IF _signal IS NOT NULL THEN
    PERFORM public.conduct_emerging_risk_link_record(_risk, 'signal', _signal, NULL, 'related conduct signal');
  END IF;
  INSERT INTO mc09 VALUES ('records_linked',
    (SELECT count(*) FROM public.conduct_emerging_risk_records WHERE risk_id = _risk) >= 1
    AND (SELECT entity_count FROM public.conduct_emerging_risks WHERE id = _risk) >= 1,
    (SELECT count(*)::text FROM public.conduct_emerging_risk_records WHERE risk_id = _risk));

  -- F. linking the same record twice is idempotent
  _res := public.conduct_emerging_risk_link_record(_risk, 'complaint', _complaint, NULL, 'duplicate attempt');
  INSERT INTO mc09 VALUES ('link_idempotent', (_res->>'already_linked') = 'true', _res::text);

  -- G. lifecycle is governed
  BEGIN
    PERFORM public.conduct_emerging_risk_transition(_risk, 'CLOSED', 'attempt to close straight from identification');
    INSERT INTO mc09 VALUES ('lifecycle_governed', false, 'an ungoverned status jump was accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc09 VALUES ('lifecycle_governed', SQLERRM LIKE 'transition_not_permitted%', SQLERRM);
  END;

  -- H. every status change requires a rationale
  BEGIN
    PERFORM public.conduct_emerging_risk_transition(_risk, 'ASSESSING', 'too short');
    INSERT INTO mc09 VALUES ('rationale_required', false, 'a status change was accepted without a rationale');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc09 VALUES ('rationale_required', SQLERRM LIKE 'A rationale%', SQLERRM);
  END;

  -- I. the governed path works and is logged
  _res := public.conduct_emerging_risk_transition(_risk, 'ASSESSING',
            'Assessment opened to test whether the theme is systemic across the sector.');
  PERFORM public.conduct_emerging_risk_transition(_risk, 'CONFIRMED',
            'Comparable conduct failures confirmed at more than one entity from recorded evidence.');
  INSERT INTO mc09 VALUES ('lifecycle_progresses_and_logs',
    (SELECT status FROM public.conduct_emerging_risks WHERE id = _risk) = 'CONFIRMED'
    AND (SELECT count(*) FROM public.conduct_emerging_risk_events
          WHERE risk_id = _risk AND event_type = 'STATUS_CHANGE') = 2,
    _res::text);

  -- J. a concluded risk cannot be amended
  PERFORM public.conduct_emerging_risk_transition(_risk, 'CLOSED',
            'Closed after the supervisory response was recorded.');
  BEGIN
    PERFORM public.conduct_emerging_risk_link_record(_risk, 'complaint', _complaint, NULL, 'post-closure edit');
    INSERT INTO mc09 VALUES ('closed_risk_final', false, 'a concluded risk was amended');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc09 VALUES ('closed_risk_final', SQLERRM LIKE 'emerging_risk_closed%', SQLERRM);
  END;

  -- K. auditor is read-only
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_auditor,'role','authenticated')::text, true);
  BEGIN
    PERFORM public.conduct_emerging_risk_create(jsonb_build_object(
      'title','Auditor attempt','sector_id',_sector,'basis','auditors must not be able to record risks'));
    INSERT INTO mc09 VALUES ('auditor_read_only', false, 'the auditor recorded an emerging risk');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc09 VALUES ('auditor_read_only', SQLERRM LIKE 'not_authorized%', SQLERRM);
  END;

  -- L. no anonymous operation
  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN
    PERFORM public.conduct_cross_entity_snapshot(_sector, 90, NULL);
    INSERT INTO mc09 VALUES ('no_anonymous_operation', false, 'anonymous access to cross-entity facts succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc09 VALUES ('no_anonymous_operation', SQLERRM LIKE 'Authentication required%', SQLERRM);
  END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',_super,'role','authenticated')::text, true);
END $$;

SELECT ok(COALESCE(pass,false), 'cross-entity facts are deterministic and explain their own method'
  || COALESCE(' :: ' || detail,'')) FROM mc09 WHERE name = 'facts_deterministic';
SELECT ok(COALESCE(pass,false), 'the observation window is bounded'
  || COALESCE(' :: ' || detail,'')) FROM mc09 WHERE name = 'window_bounded';
SELECT ok(COALESCE(pass,false), 'an emerging risk requires a written basis'
  || COALESCE(' :: ' || detail,'')) FROM mc09 WHERE name = 'basis_required';
SELECT ok(COALESCE(pass,false), 'an emerging risk is recorded with a reference and an initial status'
  || COALESCE(' :: ' || detail,'')) FROM mc09 WHERE name = 'risk_recorded';
SELECT ok(COALESCE(pass,false), 'contributing records are linked and entity coverage is derived from them'
  || COALESCE(' :: ' || detail,'')) FROM mc09 WHERE name = 'records_linked';
SELECT ok(COALESCE(pass,false), 'linking the same record twice changes nothing'
  || COALESCE(' :: ' || detail,'')) FROM mc09 WHERE name = 'link_idempotent';
SELECT ok(COALESCE(pass,false), 'the emerging risk lifecycle is governed'
  || COALESCE(' :: ' || detail,'')) FROM mc09 WHERE name = 'lifecycle_governed';
SELECT ok(COALESCE(pass,false), 'every status change requires a rationale'
  || COALESCE(' :: ' || detail,'')) FROM mc09 WHERE name = 'rationale_required';
SELECT ok(COALESCE(pass,false), 'the governed lifecycle progresses and every step is logged'
  || COALESCE(' :: ' || detail,'')) FROM mc09 WHERE name = 'lifecycle_progresses_and_logs';
SELECT ok(COALESCE(pass,false), 'a concluded risk cannot be amended'
  || COALESCE(' :: ' || detail,'')) FROM mc09 WHERE name = 'closed_risk_final';
SELECT ok(COALESCE(pass,false), 'an auditor can read cross-entity intelligence but cannot record it'
  || COALESCE(' :: ' || detail,'')) FROM mc09 WHERE name = 'auditor_read_only';
SELECT ok(COALESCE(pass,false), 'anonymous users cannot operate cross-entity intelligence'
  || COALESCE(' :: ' || detail,'')) FROM mc09 WHERE name = 'no_anonymous_operation';

SELECT * FROM finish();
ROLLBACK;
