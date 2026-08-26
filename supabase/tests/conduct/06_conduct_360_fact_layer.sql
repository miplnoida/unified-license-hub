-- MC-07.1 — Conduct 360 FACT read model (facts only, deterministic, scope-enforced).
BEGIN;
SELECT plan(12);

-- ---------------------------------------------------------------------------
-- 1 canonical read model exists
-- ---------------------------------------------------------------------------
SELECT has_function('public', 'conduct_360_snapshot',
  ARRAY['uuid','date','date'], 'conduct_360_snapshot read model exists');

-- ---------------------------------------------------------------------------
-- 2 governed: SECURITY DEFINER, pinned search_path, declared read-only
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT p.prosecdef
            AND p.provolatile = 's'
            AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c
                         WHERE c LIKE 'search_path=%')
     FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'conduct_360_snapshot'),
  'read model is SECURITY DEFINER, pins search_path and is declared read-only'
);

-- ---------------------------------------------------------------------------
-- 3 no anonymous access; signed-in staff may call it
-- ---------------------------------------------------------------------------
SELECT ok(
  NOT has_function_privilege('anon', 'public.conduct_360_snapshot(uuid,date,date)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.conduct_360_snapshot(uuid,date,date)', 'EXECUTE'),
  'anon cannot call the read model; authenticated can'
);

-- ---------------------------------------------------------------------------
-- 4 read model contains no write statement against any conduct fact table
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT p.prosrc !~* '(insert into|update\s+public\.|delete\s+from)'
     FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'conduct_360_snapshot'),
  'read model performs no writes (auditor-safe by construction)'
);

-- ---------------------------------------------------------------------------
-- runtime checks with real personas and real certified data
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE mc071 (name text primary key, pass boolean, detail text);

DO $$
DECLARE
  _super uuid;
  _officer uuid;
  _auditor uuid;
  _busy_entity uuid;
  _in_scope uuid;
  _out_scope uuid;
  _auditor_entity uuid;
  _snap jsonb;
  _snap2 jsonb;
  _txt text;
  _n bigint;
  _sections text[] := ARRAY['generated_at','window','entity','posture','complaints','redress','signals',
                            'patterns','alerts','product_channel','risk_indicators','trends',
                            'open_items','recent_activity','provenance'];
BEGIN
  SELECT id INTO _super FROM public.profiles WHERE email = 'super_admin@mishainfotech.com';
  SELECT id INTO _officer FROM public.profiles WHERE email = 'conduct_supervisor@mishainfotech.com';
  SELECT id INTO _auditor FROM public.profiles WHERE email = 'auditor@mishainfotech.com';

  SELECT c.licensee_id INTO _busy_entity
    FROM public.complaints c WHERE c.licensee_id IS NOT NULL
   GROUP BY c.licensee_id ORDER BY count(*) DESC, c.licensee_id LIMIT 1;

  SELECT l.id INTO _in_scope FROM public.licensees l
   WHERE public.regulatory_scope_allows(_officer, 'market_conduct', 'view',
           l.lead_regulator_id, l.sector_id, NULL, l.id, _officer)
   ORDER BY l.id LIMIT 1;

  SELECT l.id INTO _out_scope FROM public.licensees l
   WHERE NOT public.regulatory_scope_allows(_officer, 'market_conduct', 'view',
           l.lead_regulator_id, l.sector_id, NULL, l.id, _officer)
   ORDER BY l.id LIMIT 1;

  SELECT l.id INTO _auditor_entity FROM public.licensees l
   WHERE public.regulatory_scope_allows(_auditor, 'market_conduct', 'view',
           l.lead_regulator_id, l.sector_id, NULL, l.id, _auditor)
   ORDER BY l.id LIMIT 1;

  -- 5 authorised in-scope officer read returns the full contracted payload
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _officer, 'role', 'authenticated')::text, true);
  BEGIN
    _snap := public.conduct_360_snapshot(_in_scope);
    INSERT INTO mc071 VALUES ('officer_in_scope_read',
      _snap IS NOT NULL AND (SELECT bool_and(_snap ? s) FROM unnest(_sections) s), NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc071 VALUES ('officer_in_scope_read', false, SQLERRM);
  END;

  -- 6 out-of-scope entity is denied outright
  BEGIN
    PERFORM public.conduct_360_snapshot(_out_scope);
    INSERT INTO mc071 VALUES ('out_of_scope_denied', false, 'read succeeded');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO mc071 VALUES ('out_of_scope_denied', true, NULL);
  WHEN OTHERS THEN
    INSERT INTO mc071 VALUES ('out_of_scope_denied', false, SQLERRM);
  END;

  -- 7 auditor can read in scope
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _auditor, 'role', 'authenticated')::text, true);
  BEGIN
    _snap := public.conduct_360_snapshot(_auditor_entity);
    INSERT INTO mc071 VALUES ('auditor_read',
      _snap IS NOT NULL AND (_snap -> 'entity' ? 'name'), NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO mc071 VALUES ('auditor_read', false, SQLERRM);
  END;

  -- deterministic behaviour checked on the entity with real conduct history
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _super, 'role', 'authenticated')::text, true);
  _snap := public.conduct_360_snapshot(_busy_entity, '2000-01-01', '2100-01-01');
  _snap2 := public.conduct_360_snapshot(_busy_entity, '2000-01-01', '2100-01-01');

  -- 8 server-calculated counts equal direct counts over the same window
  SELECT count(*) INTO _n FROM public.complaints c WHERE c.licensee_id = _busy_entity;
  INSERT INTO mc071 VALUES ('deterministic_counts',
    (_snap -> 'posture' -> 'measures' ->> 'complaints_received_in_window')::bigint = _n
    AND (_snap -> 'complaints' -> 'measures' ->> 'total')::bigint = _n
    AND jsonb_array_length(_snap -> 'complaints' -> 'items') = _n
    AND (_snap -> 'trends' -> 'measures' -> 'complaints_received' ->> 'current')::bigint = _n,
    NULL);

  -- 9 repeated reads are identical apart from the generation timestamp
  INSERT INTO mc071 VALUES ('reproducible',
    (_snap #- '{generated_at}') #- '{provenance,calculated_at}'
    = (_snap2 #- '{generated_at}') #- '{provenance,calculated_at}',
    NULL);

  -- 10 every listed record carries a business reference and a drill-down link
  INSERT INTO mc071 VALUES ('source_references',
    NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(_snap -> 'complaints' -> 'items') i
       WHERE COALESCE(i ->> 'reference','') = '' OR COALESCE(i ->> 'href','') = '')
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(_snap -> 'patterns' -> 'items') i
       WHERE COALESCE(i ->> 'reference','') = '' OR COALESCE(i ->> 'href','') = ''
         OR COALESCE(i ->> 'rule','') = '' OR i ->> 'threshold_value' IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(_snap -> 'signals' -> 'items') i
       WHERE COALESCE(i ->> 'reference','') = '' OR COALESCE(i ->> 'href','') = ''),
    NULL);

  -- 11 fact payload carries no AI-generated content
  _txt := lower(_snap::text);
  INSERT INTO mc071 VALUES ('no_ai_fields',
    (_snap -> 'provenance' ->> 'ai_content') = 'false'
    AND (_snap -> 'provenance' ->> 'content_class') = 'fact'
    AND _txt NOT LIKE '%"advisory%' AND _txt NOT LIKE '%ai_insight%'
    AND _txt NOT LIKE '%"model_%' AND _txt NOT LIKE '%prompt%'
    AND _txt NOT LIKE '%"narrative%' AND _txt NOT LIKE '%confidence%'
    AND _txt NOT LIKE '%"recommendation%' AND _txt NOT LIKE '%llm%',
    NULL);

  -- 12 unauthenticated callers are refused
  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN
    PERFORM public.conduct_360_snapshot(_busy_entity);
    INSERT INTO mc071 VALUES ('anonymous_denied', false, 'read succeeded');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO mc071 VALUES ('anonymous_denied', true, NULL);
  WHEN OTHERS THEN
    INSERT INTO mc071 VALUES ('anonymous_denied', false, SQLERRM);
  END;
END $$;

SELECT ok(COALESCE(pass, false), 'authorised in-scope supervisor read returns every fact section'
                                 || COALESCE(' :: ' || detail, ''))
  FROM mc071 WHERE name = 'officer_in_scope_read';
SELECT ok(COALESCE(pass, false), 'out-of-scope entity read is denied' || COALESCE(' :: ' || detail, ''))
  FROM mc071 WHERE name = 'out_of_scope_denied';
SELECT ok(COALESCE(pass, false), 'auditor can read an in-scope entity' || COALESCE(' :: ' || detail, ''))
  FROM mc071 WHERE name = 'auditor_read';
SELECT ok(COALESCE(pass, false), 'counts are server-calculated and match the underlying records')
  FROM mc071 WHERE name = 'deterministic_counts';
SELECT ok(COALESCE(pass, false), 'repeated reads of the same window are identical')
  FROM mc071 WHERE name = 'reproducible';
SELECT ok(COALESCE(pass, false), 'every listed record exposes a business reference and drill-down link')
  FROM mc071 WHERE name = 'source_references';
SELECT ok(COALESCE(pass, false), 'fact payload contains no AI-generated fields')
  FROM mc071 WHERE name = 'no_ai_fields';
SELECT ok(COALESCE(pass, false), 'unauthenticated read is denied' || COALESCE(' :: ' || detail, ''))
  FROM mc071 WHERE name = 'anonymous_denied';

SELECT * FROM finish();
ROLLBACK;
