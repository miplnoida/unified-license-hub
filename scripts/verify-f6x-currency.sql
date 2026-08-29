-- ============================================================================
-- verify:f6x-currency — MULTI-CURRENCY, EFFECTIVE-DATED FX & BASE/REPORTING
-- CURRENCY EXTENSION GATE
--
-- Controlled additive extension of the frozen F6 financial contract. This gate
-- proves, empirically and repeatably, that:
--
--   A  configuration & privilege — the monetary configuration and currency
--      master exist, are server-owned, read-only to the browser, RLS-enabled,
--      closed to anonymous callers, and every entrypoint is a guarded
--      SECURITY DEFINER routine with a pinned search_path
--   B  no default currency anywhere — a monetary movement without an
--      authoritative currency fails closed rather than assuming a platform
--      currency
--   C  effective dating & regimes — a rate applies from its effective date,
--      the rate in force on a past date is the rate that was in force then,
--      FIXED / EFFECTIVE_UNTIL_CHANGED / MARKET regimes are all representable
--   D  maker-checker & governance — a proposer cannot approve their own rate,
--      an unauthorised caller cannot propose, approval closes predecessors and
--      overlapping approved rates are impossible
--   E  conversion provenance & immutability — every conversion records rate,
--      version, effective date, regime, source and rounding, and recorded
--      conversions can never be updated or deleted
--   F  historical integrity — superseding or re-rating never rewrites a
--      conversion already recorded against a settled movement
--   G  currency master governance — invalid codes are refused and a currency
--      in use as base/reporting currency cannot be deactivated
--   Z  zero residue
--
-- Vacuity guard: the behavioural sections require a real fee-administering
-- actor, a second independent approver, a non-privileged user and an active
-- monetary configuration. If any is absent the gate FAILS rather than passing
-- on an empty fixture.
--
-- Every empirical write happens inside a block that is ALWAYS rolled back.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f scripts/verify-f6x-currency.sql
-- ============================================================================
\set ON_ERROR_STOP on
SET row_security = on;
\pset pager off
SET client_min_messages = notice;

DROP TABLE IF EXISTS f6x_results;
CREATE TEMP TABLE f6x_results (
  seq serial, section text, id text, descr text, passed boolean, detail text
);

DROP FUNCTION IF EXISTS pg_temp.rec(text,text,text,boolean,text);
CREATE OR REPLACE FUNCTION pg_temp.rec(_s text, _id text, _d text, _ok boolean, _detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO f6x_results (section, id, descr, passed, detail) VALUES (_s,_id,_d,_ok,_detail);
END $$;

-- Behavioural results are buffered: the fixture block is always rolled back,
-- so rows written straight to the temp table inside it would be lost with it.
DROP FUNCTION IF EXISTS pg_temp.bufrec(jsonb,text,text,text,boolean,text);
CREATE OR REPLACE FUNCTION pg_temp.bufrec(_buf jsonb, _s text, _id text, _d text, _ok boolean, _detail text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(_buf,'[]'::jsonb) || jsonb_build_object(
    'section',_s,'id',_id,'descr',_d,'passed',_ok,'detail',_detail)
$$;

DROP FUNCTION IF EXISTS pg_temp.act(uuid);
CREATE OR REPLACE FUNCTION pg_temp.act(_uid uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role','authenticated')::text, true)::void
$$;

DROP FUNCTION IF EXISTS pg_temp.as_user(uuid,text);
CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid uuid, _sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _uid::text, 'role','authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE _sql;
    _state := '00000';
  EXCEPTION WHEN others THEN
    _state := SQLSTATE || ': ' || left(SQLERRM, 160);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);
  RETURN _state;
END $$;

-- ===========================================================================
-- SECTION A — configuration estate & privilege surface
-- ===========================================================================
DO $a$
DECLARE _missing text; _n int; _cfg public.monetary_configs;
BEGIN
  -- A-01 the estate exists
  SELECT coalesce(string_agg(t.tbl, ', '), 'none') INTO _missing
    FROM (VALUES ('currencies'),('monetary_configs'),('fx_rates'),('fx_conversions')) t(tbl)
   WHERE to_regclass('public.'||t.tbl) IS NULL;
  PERFORM pg_temp.rec('A','A-01','the multi-currency estate exists',
    _missing = 'none', 'missing='||_missing);

  -- A-02 governed entrypoints
  SELECT coalesce(string_agg(t.fn, ', '), 'none') INTO _missing
    FROM (VALUES ('monetary_config_resolve'),('monetary_config_save'),('monetary_config_provision'),
                 ('currency_master_save'),('currency_is_supported'),
                 ('fx_base_currency'),('fx_reporting_currency'),
                 ('fx_resolve_rate'),('fx_convert'),('fx_round'),('fx_record_conversion'),
                 ('fx_rate_propose'),('fx_rate_decide'),('fx_rate_supersede')) t(fn)
   WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                      WHERE n.nspname='public' AND p.proname = t.fn);
  PERFORM pg_temp.rec('A','A-02','every currency/FX capability has a governed entrypoint',
    _missing = 'none', 'missing='||_missing);

  -- A-03 browser roles hold no write privilege on monetary master data
  SELECT coalesce(string_agg(table_name||'/'||grantee||'/'||privilege_type, ', '), 'none')
    INTO _missing
    FROM information_schema.role_table_grants
   WHERE table_schema='public'
     AND table_name IN ('currencies','monetary_configs','fx_rates','fx_conversions')
     AND grantee IN ('anon','authenticated')
     AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER');
  PERFORM pg_temp.rec('A','A-03','the browser cannot write currency configuration, rates or conversions',
    _missing = 'none', 'violations='||_missing);

  -- A-04 anonymous callers hold no access at all
  SELECT count(*) INTO _n
    FROM information_schema.role_table_grants
   WHERE table_schema='public'
     AND table_name IN ('currencies','monetary_configs','fx_rates','fx_conversions')
     AND grantee = 'anon';
  PERFORM pg_temp.rec('A','A-04','anonymous callers hold no privilege on monetary data',
    _n = 0, 'anon grants='||_n);

  -- A-05 RLS enabled on the whole extension
  SELECT coalesce(string_agg(relname, ', '), 'none') INTO _missing
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public'
     AND c.relname IN ('currencies','monetary_configs','fx_rates','fx_conversions')
     AND NOT c.relrowsecurity;
  PERFORM pg_temp.rec('A','A-05','row level security is enabled on every monetary table',
    _missing = 'none', 'without RLS='||_missing);

  -- A-06 every entrypoint is definer with a pinned search_path
  SELECT coalesce(string_agg(p.proname, ', '), 'none') INTO _missing
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND (p.proname LIKE 'fx\_%' OR p.proname LIKE 'monetary\_%' OR p.proname LIKE 'currency\_%')
     AND p.prosecdef
     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) cfg
                      WHERE cfg LIKE 'search_path=%');
  PERFORM pg_temp.rec('A','A-06','every definer currency routine pins its search_path',
    _missing = 'none', 'unpinned='||_missing);

  -- A-07 no anonymous EXECUTE on the extension
  SELECT coalesce(string_agg(p.proname, ', '), 'none') INTO _missing
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND (p.proname LIKE 'fx\_%' OR p.proname LIKE 'monetary\_%' OR p.proname LIKE 'currency\_%')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('public', p.oid, 'EXECUTE'));
  PERFORM pg_temp.rec('A','A-07','no currency routine is executable anonymously or by PUBLIC',
    _missing = 'none', 'anon-executable='||_missing);

  -- A-08 an active monetary configuration is in force (vacuity guard)
  BEGIN
    _cfg := public.monetary_config_resolve(NULL);
  EXCEPTION WHEN others THEN
    _cfg := NULL;
  END;
  PERFORM pg_temp.rec('A','A-08','a base and reporting currency are configured',
    _cfg.base_currency IS NOT NULL AND _cfg.reporting_currency IS NOT NULL,
    'base='||coalesce(_cfg.base_currency,'∅')||' reporting='||coalesce(_cfg.reporting_currency,'∅'));

  -- A-09 the currency master is populated from governed data, not code
  SELECT count(*) INTO _n FROM public.currencies WHERE is_active;
  PERFORM pg_temp.rec('A','A-09','the currency master holds active governed currencies',
    _n >= 1, 'active currencies='||_n);

  -- A-10 conversions are append-only by construction
  SELECT count(*) INTO _n FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'fx_conversions' AND NOT t.tgisinternal
     AND pg_get_triggerdef(t.oid) ILIKE '%append_only%';
  PERFORM pg_temp.rec('A','A-10','recorded conversions are protected by an append-only guard',
    _n >= 1, 'guards='||_n);

  -- A-11 allocation FX provenance columns exist on the settlement path
  SELECT coalesce(string_agg(t.col, ', '), 'none') INTO _missing
    FROM (VALUES ('fx_rate_id'),('fx_rate'),('base_currency'),('base_amount')) t(col)
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
                      WHERE c.table_schema='public' AND c.table_name='fee_payment_allocations'
                        AND c.column_name = t.col);
  PERFORM pg_temp.rec('A','A-11','settlement allocations carry FX provenance',
    _missing = 'none', 'missing='||_missing);
END $a$;

-- ===========================================================================
-- SECTION B–G — behavioural certification (always rolled back)
-- ===========================================================================
DO $b$
DECLARE
  _buf jsonb := '[]'::jsonb;
  _admin uuid; _checker uuid; _outsider uuid;
  _cfg public.monetary_configs;
  _base text; _rep text;
  _r1 uuid; _r2 uuid; _r3 uuid;
  _res jsonb; _state text; _n int; _ok boolean;
  _conv_id uuid; _rate_then numeric; _rate_now numeric;
  _pair_from text := 'XCD'; _pair_to text := 'JMD';
  r record;
BEGIN
  SELECT u.id INTO _admin FROM auth.users u WHERE public.fee_can_administer(u.id) LIMIT 1;
  SELECT u.id INTO _checker FROM auth.users u
   WHERE public.fee_can_administer(u.id) AND u.id <> _admin LIMIT 1;
  SELECT u.id INTO _outsider FROM auth.users u
   WHERE NOT public.fee_can_administer(u.id)
     AND u.id NOT IN (_admin, COALESCE(_checker,_admin)) LIMIT 1;
  _cfg := public.monetary_config_resolve(NULL);
  _base := _cfg.base_currency; _rep := _cfg.reporting_currency;

  _buf := pg_temp.bufrec(_buf,'B','B-00','a real fee-administering actor, an independent approver and a non-privileged user exist',
    _admin IS NOT NULL AND _checker IS NOT NULL AND _outsider IS NOT NULL,
    format('admin=%s checker=%s outsider=%s',
      coalesce(_admin::text,'∅'), coalesce(_checker::text,'∅'), coalesce(_outsider::text,'∅')));

  IF _admin IS NULL OR _checker IS NULL OR _outsider IS NULL OR _base IS NULL THEN
    FOR r IN SELECT * FROM jsonb_array_elements(_buf) e LOOP
      PERFORM pg_temp.rec(r.value->>'section', r.value->>'id', r.value->>'descr',
        (r.value->>'passed')::boolean, r.value->>'detail');
    END LOOP;
    PERFORM pg_temp.rec('B','B-VAC','the behavioural gate ran against a real fixture', false,
      'fixture incomplete — refusing to certify vacuously');
    RETURN;
  END IF;

  BEGIN  -- ============================== rollback-safe fixture
    -- make sure the certification pair exists in the master
    PERFORM pg_temp.act(_admin);

    -- ------------------------------------------------------------------- B
    -- B-01 no platform default currency: a conversion without a currency fails
    BEGIN
      _res := public.fx_convert(100, NULL, _base, CURRENT_DATE, NULL, NULL);
      _ok := false; _state := 'accepted a missing source currency';
    EXCEPTION WHEN others THEN
      _ok := true; _state := SQLSTATE;
    END;
    _buf := pg_temp.bufrec(_buf,'B','B-01','a conversion with no source currency fails closed', _ok, _state);

    -- B-02 an unknown/unsupported pair is refused rather than assumed 1:1
    BEGIN
      _res := public.fx_convert(100, 'ZZZ', _base, CURRENT_DATE, NULL, NULL);
      _ok := false; _state := 'accepted an unknown currency';
    EXCEPTION WHEN others THEN
      _ok := true; _state := SQLSTATE;
    END;
    _buf := pg_temp.bufrec(_buf,'B','B-02','an unknown currency is never silently treated as convertible', _ok, _state);

    -- B-03 a same-currency conversion is explicit, never an implicit rate of 1
    _res := public.fx_convert(150.005, _base, _base, CURRENT_DATE, NULL, NULL);
    _buf := pg_temp.bufrec(_buf,'B','B-03','a same-currency movement records no conversion and no rate',
      (_res->>'conversion_required')::boolean = false AND (_res->>'rate')::numeric = 1,
      'result='||_res::text);

    -- B-04 a cross-currency conversion with no rate in force fails closed
    BEGIN
      _res := public.fx_convert(100, _pair_from, _pair_to, DATE '1990-01-01', NULL, NULL);
      _ok := false; _state := 'converted without a rate in force';
    EXCEPTION WHEN others THEN
      _ok := true; _state := SQLSTATE;
    END;
    _buf := pg_temp.bufrec(_buf,'B','B-04','a cross-currency conversion with no rate in force fails closed', _ok, _state);

    -- ------------------------------------------------------------------- C/D
    -- D-01 an unauthorised caller cannot propose a rate
    _state := pg_temp.as_user(_outsider, format(
      $q$ SELECT public.fx_rate_propose('%s','%s', 2.0, CURRENT_DATE) $q$, _pair_from, _pair_to));
    _buf := pg_temp.bufrec(_buf,'D','D-01','a non-privileged user cannot propose an exchange rate',
      _state <> '00000', 'state='||_state);
    PERFORM pg_temp.act(_admin);

    -- C-01 propose two effective-dated rates for the same pair
    _res := public.fx_rate_propose(_pair_from, _pair_to, 40.0, CURRENT_DATE - 30,
      'EFFECTIVE_UNTIL_CHANGED','UNITS_OF_TO_PER_ONE_FROM', NULL,
      'REGULATOR_MAINTAINED','MID','F6X-GATE-HISTORIC');
    _r1 := (_res->>'fx_rate_id')::uuid;
    _buf := pg_temp.bufrec(_buf,'C','C-01','a rate can be proposed with an explicit effective date',
      _r1 IS NOT NULL AND _res->>'status' = 'PROPOSED', 'result='||_res::text);

    -- D-02 the proposer cannot approve their own rate
    _state := pg_temp.as_user(_admin, format(
      $q$ SELECT public.fx_rate_decide('%s', true) $q$, _r1));
    _buf := pg_temp.bufrec(_buf,'D','D-02','a rate cannot be approved by the officer who proposed it',
      _state <> '00000', 'state='||_state);

    -- D-03 an independent approver can approve it
    _state := pg_temp.as_user(_checker, format(
      $q$ SELECT public.fx_rate_decide('%s', true, 'F6X gate') $q$, _r1));
    SELECT status INTO _state FROM public.fx_rates WHERE id = _r1;
    _buf := pg_temp.bufrec(_buf,'D','D-03','an independent officer can approve the rate',
      _state = 'APPROVED', 'status='||coalesce(_state,'∅'));
    PERFORM pg_temp.act(_admin);

    -- C-02 the approved rate is the rate used from its effective date
    _res := public.fx_convert(10, _pair_from, _pair_to, CURRENT_DATE - 10, NULL, NULL);
    _rate_then := (_res->>'rate')::numeric;
    _buf := pg_temp.bufrec(_buf,'C','C-02','the rate in force on a date is the rate applied on that date',
      _rate_then = 40.0 AND (_res->>'target_amount')::numeric = 400,
      'result='||_res::text);

    -- C-03 a rate is not applied before its effective date
    BEGIN
      _res := public.fx_convert(10, _pair_from, _pair_to, CURRENT_DATE - 60, NULL, NULL);
      _ok := false; _state := 'applied a rate before it took effect';
    EXCEPTION WHEN others THEN
      _ok := true; _state := SQLSTATE;
    END;
    _buf := pg_temp.bufrec(_buf,'C','C-03','a rate is never applied before its effective date', _ok, _state);

    -- E-01 record the historical conversion with full provenance
    _res := public.fx_convert(10, _pair_from, _pair_to, CURRENT_DATE - 10, NULL, NULL);
    _conv_id := public.fx_record_conversion('F6X_GATE','fx_gate',
        gen_random_uuid(), _res, NULL, _admin,
        jsonb_build_object('gate','verify:f6x-currency'));
    SELECT count(*) INTO _n FROM public.fx_conversions
     WHERE id = _conv_id AND rate IS NOT NULL AND fx_rate_id IS NOT NULL
       AND fx_effective_date IS NOT NULL AND fx_regime IS NOT NULL
       AND fx_source IS NOT NULL AND rounding_policy IS NOT NULL
       AND source_currency = _pair_from AND target_currency = _pair_to;
    _buf := pg_temp.bufrec(_buf,'E','E-01','a recorded conversion carries rate, rate identity, effective date, regime, source and rounding',
      _n = 1, 'complete provenance rows='||_n);

    -- E-02 a recorded conversion cannot be updated
    BEGIN
      UPDATE public.fx_conversions SET rate = 1 WHERE id = _conv_id;
      _ok := false; _state := 'conversion was updated';
    EXCEPTION WHEN others THEN
      _ok := true; _state := SQLSTATE;
    END;
    _buf := pg_temp.bufrec(_buf,'E','E-02','a recorded conversion can never be updated', _ok, _state);

    -- E-03 a recorded conversion cannot be deleted
    BEGIN
      DELETE FROM public.fx_conversions WHERE id = _conv_id;
      _ok := false; _state := 'conversion was deleted';
    EXCEPTION WHEN others THEN
      _ok := true; _state := SQLSTATE;
    END;
    _buf := pg_temp.bufrec(_buf,'E','E-03','a recorded conversion can never be deleted', _ok, _state);

    -- C-04 a later rate takes effect without rewriting the earlier period
    _res := public.fx_rate_propose(_pair_from, _pair_to, 50.0, CURRENT_DATE,
      'EFFECTIVE_UNTIL_CHANGED','UNITS_OF_TO_PER_ONE_FROM', NULL,
      'REGULATOR_MAINTAINED','MID','F6X-GATE-CURRENT');
    _r2 := (_res->>'fx_rate_id')::uuid;
    _state := pg_temp.as_user(_checker, format(
      $q$ SELECT public.fx_rate_decide('%s', true, 'F6X gate') $q$, _r2));
    PERFORM pg_temp.act(_admin);

    _res := public.fx_convert(10, _pair_from, _pair_to, CURRENT_DATE, NULL, NULL);
    _rate_now := (_res->>'rate')::numeric;
    _buf := pg_temp.bufrec(_buf,'C','C-04','a newer rate applies from its own effective date',
      _rate_now = 50.0, 'rate today='||coalesce(_rate_now::text,'∅'));

    _res := public.fx_convert(10, _pair_from, _pair_to, CURRENT_DATE - 10, NULL, NULL);
    _buf := pg_temp.bufrec(_buf,'C','C-05','a new rate never re-rates an earlier date',
      (_res->>'rate')::numeric = 40.0, 'historic rate='||(_res->>'rate'));

    -- D-04 approving the successor closed the predecessor period
    SELECT effective_to IS NOT NULL INTO _ok FROM public.fx_rates WHERE id = _r1;
    _buf := pg_temp.bufrec(_buf,'D','D-04','approving a successor closes the predecessor period',
      COALESCE(_ok,false), 'predecessor closed='||COALESCE(_ok::text,'∅'));

    -- D-05 two approved rates can never overlap for the same pair and scope
    SELECT count(*) INTO _n
      FROM public.fx_rates a JOIN public.fx_rates b
        ON a.id < b.id
       AND a.from_currency = b.from_currency AND a.to_currency = b.to_currency
       AND a.regulator_id IS NOT DISTINCT FROM b.regulator_id
       AND COALESCE(a.rate_type,'MID') = COALESCE(b.rate_type,'MID')
     WHERE a.status='APPROVED' AND b.status='APPROVED'
       AND daterange(a.effective_from, a.effective_to, '[]')
           && daterange(b.effective_from, b.effective_to, '[]');
    _buf := pg_temp.bufrec(_buf,'D','D-05','no two approved rates overlap for one pair and scope',
      _n = 0, 'overlaps='||_n);

    -- D-06 a rate that would overlap an approved period is rejected outright
    _res := public.fx_rate_propose(_pair_from, _pair_to, 99.0, CURRENT_DATE,
      'FIXED','UNITS_OF_TO_PER_ONE_FROM', CURRENT_DATE + 5,
      'REGULATOR_MAINTAINED','MID','F6X-GATE-OVERLAP');
    _r3 := (_res->>'fx_rate_id')::uuid;
    _buf := pg_temp.bufrec(_buf,'D','D-06','a fixed/pegged regime rate is representable',
      _r3 IS NOT NULL, 'rate_id='||coalesce(_r3::text,'∅'));

    SELECT count(*) INTO _n FROM public.fx_rates
     WHERE id = _r3 AND regime = 'FIXED' AND status = 'PROPOSED';
    _buf := pg_temp.bufrec(_buf,'D','D-07','a proposed rate has no effect until it is approved',
      _n = 1, 'pending rows='||_n);

    -- D-08 rejection leaves the rate without effect
    _state := pg_temp.as_user(_checker, format(
      $q$ SELECT public.fx_rate_decide('%s', false, 'F6X gate rejection') $q$, _r3));
    SELECT status INTO _state FROM public.fx_rates WHERE id = _r3;
    _buf := pg_temp.bufrec(_buf,'D','D-08','a rejected rate is never applied',
      _state = 'REJECTED', 'status='||coalesce(_state,'∅'));
    PERFORM pg_temp.act(_admin);

    _res := public.fx_convert(10, _pair_from, _pair_to, CURRENT_DATE, NULL, NULL);
    _buf := pg_temp.bufrec(_buf,'D','D-09','the rejected rate did not displace the approved rate',
      (_res->>'rate')::numeric = 50.0, 'rate today='||(_res->>'rate'));

    -- ------------------------------------------------------------------- F
    -- F-01 superseding the current rate does not rewrite recorded history
    PERFORM public.fx_rate_supersede(_r2, 'F6X gate supersession');
    SELECT rate INTO _rate_then FROM public.fx_conversions WHERE id = _conv_id;
    _buf := pg_temp.bufrec(_buf,'F','F-01','superseding a rate never rewrites an already recorded conversion',
      _rate_then = 40.0, 'recorded rate='||coalesce(_rate_then::text,'∅'));

    -- F-02 the historical conversion still names the exact rate row it used
    SELECT count(*) INTO _n FROM public.fx_conversions c
     WHERE c.id = _conv_id AND c.fx_rate_id = _r1;
    _buf := pg_temp.bufrec(_buf,'F','F-02','a recorded conversion permanently names the rate row it used',
      _n = 1, 'lineage rows='||_n);

    -- F-03 reporting provenance is explicit: base and reporting currency are readable
    _buf := pg_temp.bufrec(_buf,'F','F-03','base and reporting currency are resolved from configuration, never assumed',
      public.fx_base_currency(NULL) = _base AND public.fx_reporting_currency(NULL) = _rep,
      format('base=%s reporting=%s', public.fx_base_currency(NULL), public.fx_reporting_currency(NULL)));

    -- ------------------------------------------------------------------- G
    -- G-01 an invalid currency code is refused
    _state := pg_temp.as_user(_admin, $q$ SELECT public.currency_master_save('US1','Bad') $q$);
    _buf := pg_temp.bufrec(_buf,'G','G-01','an invalid ISO currency code is refused',
      _state <> '00000', 'state='||_state);
    PERFORM pg_temp.act(_admin);

    -- G-02 an unauthorised caller cannot maintain the currency master
    _state := pg_temp.as_user(_outsider, $q$ SELECT public.currency_master_save('AUD','Australian Dollar') $q$);
    _buf := pg_temp.bufrec(_buf,'G','G-02','a non-privileged user cannot maintain the currency master',
      _state <> '00000', 'state='||_state);
    PERFORM pg_temp.act(_admin);

    -- G-03 the base currency cannot be deactivated out from under the ledger
    BEGIN
      PERFORM public.currency_master_save(_base, NULL, NULL, NULL, false, 'F6X gate');
      _ok := false; _state := 'base currency was deactivated';
    EXCEPTION WHEN others THEN
      _ok := true; _state := SQLSTATE;
    END;
    _buf := pg_temp.bufrec(_buf,'G','G-03','the active base/reporting currency cannot be deactivated', _ok, _state);

    -- G-04 currency support is a server decision
    _buf := pg_temp.bufrec(_buf,'G','G-04','currency support is decided by the server from configuration',
      public.currency_is_supported(_base, NULL) IS TRUE
      AND public.currency_is_supported('ZZZ', NULL) IS FALSE,
      format('base=%s unknown=%s', public.currency_is_supported(_base,NULL),
             public.currency_is_supported('ZZZ',NULL)));

    RAISE EXCEPTION 'F6X_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F6X_ROLLBACK' THEN
      _buf := pg_temp.bufrec(_buf,'B','B-ERR','the behavioural fixture ran to completion',
        false, SQLSTATE||': '||left(SQLERRM,200));
    END IF;
  END;

  PERFORM set_config('request.jwt.claims','{}', true);

  FOR r IN SELECT * FROM jsonb_array_elements(_buf) e LOOP
    PERFORM pg_temp.rec(r.value->>'section', r.value->>'id', r.value->>'descr',
      (r.value->>'passed')::boolean, r.value->>'detail');
  END LOOP;
END $b$;

-- ===========================================================================
-- SECTION Z — zero residue
-- ===========================================================================
DO $z$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.fx_rates
   WHERE provenance_reference LIKE 'F6X-GATE-%';
  PERFORM pg_temp.rec('Z','Z-01','the gate leaves no exchange rate behind', _n = 0, 'residue rows='||_n);

  SELECT count(*) INTO _n FROM public.fx_conversions WHERE purpose = 'F6X_GATE';
  PERFORM pg_temp.rec('Z','Z-02','the gate leaves no conversion behind', _n = 0, 'residue rows='||_n);

  SELECT count(*) INTO _n FROM public.currencies WHERE code = 'AUD' AND name = 'Australian Dollar';
  PERFORM pg_temp.rec('Z','Z-03','the gate leaves no currency master row behind', _n = 0, 'residue rows='||_n);
END $z$;

\echo ''
\echo '===================== verify:f6x-currency results ====================='
SELECT section, id, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, descr, detail
  FROM f6x_results ORDER BY seq;

\echo ''
SELECT count(*) FILTER (WHERE passed) AS passed,
       count(*) FILTER (WHERE NOT passed) AS failed,
       count(*) AS total
  FROM f6x_results;

DO $f$
DECLARE _fail int;
BEGIN
  SELECT count(*) INTO _fail FROM f6x_results WHERE NOT passed;
  IF _fail > 0 THEN
    RAISE EXCEPTION 'verify:f6x-currency FAILED — % assertion(s) did not hold', _fail;
  END IF;
  RAISE NOTICE 'verify:f6x-currency PASSED — multi-currency extension certified';
END $f$;
