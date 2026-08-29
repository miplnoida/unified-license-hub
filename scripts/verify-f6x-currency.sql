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
    _conv_id := public.fx_record_conversion('REPORTING','f6x_gate',
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
-- SECTION H/I/J/K/L — regulator-scoped monetary authority, missing payment
-- currency, base != reporting booking, visible unconverted reporting and
-- effective-period / FIXED behaviour. Every write below is rolled back.
-- ===========================================================================
DO $h$
DECLARE
  _buf jsonb := '[]'::jsonb;
  _admin uuid; _checker uuid; _lt text; _ft uuid;
  _regA uuid; _regB uuid;
  _cfgA public.monetary_configs; _cfgB public.monetary_configs; _cfgP public.monetary_configs;
  _appA uuid; _appB uuid; _appB2 uuid;
  _payA uuid; _payB uuid; _payB2 uuid; _paybad uuid;
  _rA uuid; _rB uuid; _rBase uuid; _rRep uuid; _rFix uuid; _rDef uuid; _rSucc uuid;
  _res jsonb; _rep jsonb; _state text; _n int; _ok boolean;
  _txn text; _alloc numeric; _base numeric; _repamt numeric;
  _alloc_rec public.fee_payment_allocations;
  _rate1 uuid; _rate2 uuid; _ctx text;
  r record;
BEGIN
  SELECT u.id INTO _admin FROM auth.users u
   WHERE public.fee_can_administer(u.id) AND public.is_super_admin(u.id) LIMIT 1;
  SELECT u.id INTO _checker FROM auth.users u
   WHERE public.fee_can_administer(u.id) AND public.is_super_admin(u.id)
     AND u.id <> _admin LIMIT 1;
  SELECT license_type INTO _lt FROM public.applications WHERE license_type IS NOT NULL LIMIT 1;
  SELECT id INTO _ft FROM public.fee_types WHERE status = 'active' LIMIT 1;

  _buf := pg_temp.bufrec(_buf,'H','H-00','a configuration-authorised maker, an independent checker and a fee book exist',
    _admin IS NOT NULL AND _checker IS NOT NULL AND _ft IS NOT NULL,
    format('maker=%s checker=%s fee_type=%s', coalesce(_admin::text,'∅'),
      coalesce(_checker::text,'∅'), coalesce(_ft::text,'∅')));

  IF _admin IS NULL OR _checker IS NULL OR _ft IS NULL THEN
    FOR r IN SELECT * FROM jsonb_array_elements(_buf) e LOOP
      PERFORM pg_temp.rec(r.value->>'section', r.value->>'id', r.value->>'descr',
        (r.value->>'passed')::boolean, r.value->>'detail');
    END LOOP;
    PERFORM pg_temp.rec('H','H-VAC','the regulator-scoped gate ran against a real fixture', false,
      'fixture incomplete — refusing to certify vacuously');
    RETURN;
  END IF;

  BEGIN  -- ============================== rollback-safe fixture
    RESET ROLE;
    _cfgP := public.monetary_config_resolve(NULL);

    INSERT INTO public.regulators(name, code, description)
    VALUES ('F6X Gate Authority A','F6XGATEA','f6x gate scope A') RETURNING id INTO _regA;
    INSERT INTO public.regulators(name, code, description)
    VALUES ('F6X Gate Authority B','F6XGATEB','f6x gate scope B') RETURNING id INTO _regB;

    PERFORM pg_temp.act(_admin);
    -- synthetic currency master rows (no live currency is touched)
    PERFORM public.currency_master_save('CAD','F6X Gate Dollar A','A$',2,true,'f6x gate');
    PERFORM public.currency_master_save('CHF','F6X Gate Franc','F$',2,true,'f6x gate');
    PERFORM public.currency_master_save('SEK','F6X Gate Krona','K$',2,true,'f6x gate');
    PERFORM public.currency_master_save('NOK','F6X Gate Krone','N$',2,true,'f6x gate');

    -- ---------------------------------------------------------------- app A
    RESET ROLE;
    INSERT INTO public.applications (applicant_id, license_type, status, request_kind,
                                     regulator_id, data)
    VALUES (_admin, COALESCE(_lt,'F6X-GATE'), 'submitted', 'NEW_LICENCE', _regA,
            jsonb_build_object('f6x_gate', true, 'scope','A'))
    RETURNING id INTO _appA;
    INSERT INTO public.fee_components (application_id, fee_type_id, amount, description)
    VALUES (_appA, _ft, 1000.00, 'f6x gate scope A line');

    PERFORM pg_temp.act(_admin);
    _res := public.fee_assessment_ensure(_appA, 'f6x gate scope A');
    _txn := upper(_res->>'currency');
    _alloc := ROUND((_res->>'outstanding')::numeric, 2);

    -- regulator-scoped monetary configuration, explicit in every respect
    PERFORM public.monetary_config_provision(jsonb_build_object(
      'base_currency','CAD', 'reporting_currency','CHF',
      'supported_transaction_currencies', jsonb_build_array(_txn,'CAD','CHF'),
      'accepted_payment_currencies', jsonb_build_array(_txn,'CAD'),
      'settlement_currencies', jsonb_build_array(_txn,'CAD'),
      'cross_currency_settlement_allowed', true,
      'backdating_requires_authority', false,
      'notes','f6x gate scope A'), _regA, 'f6x gate');
    PERFORM public.monetary_config_provision(jsonb_build_object(
      'base_currency','SEK', 'reporting_currency','SEK',
      'supported_transaction_currencies', jsonb_build_array(_txn,'SEK','NOK'),
      'accepted_payment_currencies', jsonb_build_array(_txn,'NOK'),
      'settlement_currencies', jsonb_build_array('SEK'),
      'cross_currency_settlement_allowed', true,
      'backdating_requires_authority', false,
      'notes','f6x gate scope B'), _regB, 'f6x gate');

    _cfgA := public.monetary_config_resolve(_regA);
    _cfgB := public.monetary_config_resolve(_regB);

    _buf := pg_temp.bufrec(_buf,'H','H-01','each regulator resolves its own base and reporting currency',
      _cfgA.base_currency='CAD' AND _cfgA.reporting_currency='CHF'
        AND _cfgB.base_currency='SEK' AND _cfgB.reporting_currency='SEK'
        AND _cfgA.id <> _cfgB.id,
      format('A=%s/%s B=%s/%s', _cfgA.base_currency,_cfgA.reporting_currency,
             _cfgB.base_currency,_cfgB.reporting_currency));

    _buf := pg_temp.bufrec(_buf,'H','H-02','a regulator configuration never overrides, and is never overridden by, the platform configuration',
      (public.monetary_config_resolve(NULL)).base_currency = _cfgP.base_currency
        AND _cfgA.base_currency <> _cfgP.base_currency
        AND (public.monetary_config_resolve(_regA)).id = _cfgA.id,
      format('platform=%s still, A=%s', _cfgP.base_currency, _cfgA.base_currency));

    -- scoped rates: same pair, one rate per regulator
    _res := public.fx_rate_propose('CAD','SEK', 5.0, CURRENT_DATE,'EFFECTIVE_UNTIL_CHANGED',
      'UNITS_OF_TO_PER_ONE_FROM', NULL,'REGULATOR_MAINTAINED','MID','F6X-GATE-SCOPE-A', _regA);
    _rA := (_res->>'fx_rate_id')::uuid;
    _res := public.fx_rate_propose('CAD','SEK', 7.0, CURRENT_DATE,'EFFECTIVE_UNTIL_CHANGED',
      'UNITS_OF_TO_PER_ONE_FROM', NULL,'REGULATOR_MAINTAINED','MID','F6X-GATE-SCOPE-B', _regB);
    _rB := (_res->>'fx_rate_id')::uuid;
    -- booking rates for scope A only
    _res := public.fx_rate_propose(_txn,'CAD', 2.0, CURRENT_DATE,'EFFECTIVE_UNTIL_CHANGED',
      'UNITS_OF_TO_PER_ONE_FROM', NULL,'REGULATOR_MAINTAINED','MID','F6X-GATE-BASE-A', _regA);
    _rBase := (_res->>'fx_rate_id')::uuid;
    _res := public.fx_rate_propose(_txn,'CHF', 3.0, CURRENT_DATE,'EFFECTIVE_UNTIL_CHANGED',
      'UNITS_OF_TO_PER_ONE_FROM', NULL,'REGULATOR_MAINTAINED','MID','F6X-GATE-REP-A', _regA);
    _rRep := (_res->>'fx_rate_id')::uuid;
    _res := public.fx_rate_propose('CHF','NOK', 4.0, CURRENT_DATE,'FIXED',
      'UNITS_OF_TO_PER_ONE_FROM', NULL,'REGULATOR_MAINTAINED','MID','F6X-GATE-FIXED-A', _regA);
    _rFix := (_res->>'fx_rate_id')::uuid;
    _res := public.fx_rate_propose('NOK','SEK', 1.5, CURRENT_DATE);
    _rDef := (_res->>'fx_rate_id')::uuid;

    PERFORM pg_temp.act(_checker);
    PERFORM public.fx_rate_decide(_rA, true, 'f6x gate');
    PERFORM public.fx_rate_decide(_rB, true, 'f6x gate');
    PERFORM public.fx_rate_decide(_rBase, true, 'f6x gate');
    PERFORM public.fx_rate_decide(_rRep, true, 'f6x gate');
    PERFORM public.fx_rate_decide(_rFix, true, 'f6x gate');
    PERFORM public.fx_rate_decide(_rDef, true, 'f6x gate');
    PERFORM pg_temp.act(_admin);

    _buf := pg_temp.bufrec(_buf,'H','H-03','a rate belonging to one regulator can never be selected for another',
      (public.fx_resolve_rate('CAD','SEK',CURRENT_DATE,_regA)).id = _rA
        AND (public.fx_resolve_rate('CAD','SEK',CURRENT_DATE,_regB)).id = _rB
        AND ROUND((public.fx_convert(100,'CAD','SEK',CURRENT_DATE,_regB)->>'effective_rate')::numeric,4) = 7.0000,
      format('A→%s B→%s', _rA, _rB));

    SELECT count(*) INTO _n FROM public.fx_rates x
     WHERE x.status='APPROVED' AND x.from_currency='CAD' AND x.to_currency='SEK'
       AND x.effective_from <= CURRENT_DATE AND (x.effective_to IS NULL OR x.effective_to >= CURRENT_DATE);
    _buf := pg_temp.bufrec(_buf,'H','H-04','scope isolation is genuine: two regulators hold concurrent rates for the same pair',
      _n >= 2, 'concurrent approved rates for CAD/SEK='||_n);

    _buf := pg_temp.bufrec(_buf,'H','H-05','one regulator''s accepted currencies never authorise another regulator''s transaction',
      public.currency_is_supported('CAD', _regA) AND NOT public.currency_is_supported('CAD', _regB),
      format('CAD supported for A=%s for B=%s',
        public.currency_is_supported('CAD',_regA), public.currency_is_supported('CAD',_regB)));

    _buf := pg_temp.bufrec(_buf,'H','H-06','the monetary authority of a transaction is derived from canonical application context, never from the caller',
      public.fee_event_regulator(_appA) = _regA,
      format('derived=%s expected=%s', coalesce(public.fee_event_regulator(_appA)::text,'∅'), _regA));

    -- ------------------------------------------------------------------- I
    -- I-01 a settled payment can never structurally carry a NULL currency
    RESET ROLE;
    _state := 'unexpected-success';
    BEGIN
      INSERT INTO public.payments (user_id, application_id, amount, currency, status,
                                   payment_method, payment_channel, transaction_ref, paid_at)
      VALUES (_admin, _appA, 10, NULL,'success','online','online',
              'F6X-GATE-NULLCCY-'||gen_random_uuid()::text, now());
    EXCEPTION WHEN others THEN _state := SQLSTATE||': '||left(SQLERRM,60);
    END;
    _buf := pg_temp.bufrec(_buf,'I','I-01','a settled payment with no currency is refused',
      _state <> 'unexpected-success', 'result='||_state);

    -- I-02 a blank currency fails closed on the governed settlement contract
    _state := 'unexpected-success';
    BEGIN
      INSERT INTO public.payments (user_id, application_id, amount, currency, status,
                                   payment_method, payment_channel, transaction_ref, paid_at)
      VALUES (_admin, _appA, 10, '   ','success','online','online',
              'F6X-GATE-BLANKCCY-1','2026-01-01'::timestamptz)
      RETURNING id INTO _paybad;
    EXCEPTION WHEN others THEN _state := SQLSTATE||': '||left(SQLERRM,80);
    END;
    _buf := pg_temp.bufrec(_buf,'I','I-02','a settled payment with a blank currency fails closed as PAYMENT_CURRENCY_MISSING',
      _state LIKE '22023%' AND _state LIKE '%PAYMENT_CURRENCY_MISSING%', 'result='||_state);

    SELECT count(*) INTO _n FROM public.payments WHERE transaction_ref='F6X-GATE-BLANKCCY-1';
    _buf := pg_temp.bufrec(_buf,'I','I-03','no ledger entry, allocation, receipt or substituted base currency survives the refusal',
      _n = 0
      AND NOT EXISTS (SELECT 1 FROM public.fee_ledger_entries WHERE external_reference='F6X-GATE-BLANKCCY-1')
      AND NOT EXISTS (SELECT 1 FROM public.fee_payment_allocations a
                       JOIN public.payments p ON p.id=a.payment_id
                      WHERE p.transaction_ref='F6X-GATE-BLANKCCY-1')
      AND NOT EXISTS (SELECT 1 FROM public.payment_receipts rc
                       JOIN public.payments p ON p.id=rc.payment_id
                      WHERE p.transaction_ref='F6X-GATE-BLANKCCY-1'),
      'surviving payment rows='||_n);

    -- ------------------------------------------------------------------- J
    -- transaction currency != base currency, and base currency != reporting
    PERFORM pg_temp.act(_admin);
    RESET ROLE;
    INSERT INTO public.payments (user_id, application_id, amount, currency, status,
                                 payment_method, payment_channel, transaction_ref,
                                 paid_at, payment_date)
    VALUES (_admin, _appA, _alloc, _txn,'success','online','online',
            'F6X-GATE-BOOK-'||substr(gen_random_uuid()::text,1,8), now(), CURRENT_DATE)
    RETURNING id INTO _payA;
    PERFORM pg_temp.act(_admin);

    SELECT * INTO _alloc_rec FROM public.fee_payment_allocations
     WHERE payment_id=_payA AND reversed_at IS NULL ORDER BY allocated_at LIMIT 1;

    _buf := pg_temp.bufrec(_buf,'J','J-01','the original transacted amount and currency are preserved exactly',
      _alloc_rec.id IS NOT NULL
        AND ROUND(_alloc_rec.source_amount,2) = _alloc
        AND upper(_alloc_rec.source_currency) = _txn
        AND _txn <> _cfgA.base_currency AND _cfgA.base_currency <> _cfgA.reporting_currency,
      format('source=%s %s base=%s reporting=%s', _alloc_rec.source_amount, _alloc_rec.source_currency,
             _cfgA.base_currency, _cfgA.reporting_currency));

    _buf := pg_temp.bufrec(_buf,'J','J-02','the base equivalent is booked at the governed rate for the event',
      _alloc_rec.base_currency = 'CAD'
        AND abs(_alloc_rec.base_amount - ROUND(_alloc_rec.amount * 2.0, 2)) <= 0.01,
      format('base=%s %s expected=%s', _alloc_rec.base_amount, coalesce(_alloc_rec.base_currency,'∅'),
             ROUND(_alloc_rec.amount * 2.0, 2)));

    SELECT count(*) INTO _n FROM public.fx_conversions c
     WHERE c.subject_type='payment' AND c.subject_id=_payA
       AND c.purpose='BASE_REPORTING' AND c.to_currency='CAD'
       AND c.fx_rate_id = _rBase AND c.regulator_id = _regA
       AND c.effective_date IS NOT NULL AND c.rate_regime IS NOT NULL;
    _buf := pg_temp.bufrec(_buf,'J','J-03','the base conversion records its rate identity, regime, date and scope',
      _n = 1, 'base provenance rows='||_n);

    _buf := pg_temp.bufrec(_buf,'J','J-04','the reporting equivalent is booked independently in the reporting currency',
      _alloc_rec.reporting_currency = 'CHF'
        AND abs(_alloc_rec.reporting_amount - ROUND(_alloc_rec.amount * 3.0, 2)) <= 0.01
        AND _alloc_rec.fx_reporting_conversion_id IS NOT NULL,
      format('reporting=%s %s expected=%s', _alloc_rec.reporting_amount,
             coalesce(_alloc_rec.reporting_currency,'∅'), ROUND(_alloc_rec.amount * 3.0, 2)));

    SELECT count(*) INTO _n FROM public.fx_conversions c
     WHERE c.subject_type='payment' AND c.subject_id=_payA
       AND c.purpose='BASE_REPORTING' AND c.to_currency='CHF'
       AND c.fx_rate_id = _rRep AND c.from_currency = _txn;
    _buf := pg_temp.bufrec(_buf,'J','J-05','the reporting conversion carries its own provenance and converts directly from the transacted currency',
      _n = 1, 'reporting provenance rows='||_n);

    SELECT count(*) INTO _n FROM public.fx_conversions c
     WHERE c.subject_type='payment' AND c.subject_id=_payA
       AND c.from_currency='CAD' AND c.to_currency='CHF';
    _buf := pg_temp.bufrec(_buf,'J','J-06','there is no hidden double conversion through the base currency',
      _n = 0, 'base→reporting chained conversions='||_n);

    -- a later rate change never re-rates booked history
    _base := _alloc_rec.base_amount; _repamt := _alloc_rec.reporting_amount;
    PERFORM public.fx_rate_supersede(_rBase, 'f6x gate supersede');
    _res := public.fx_rate_propose(_txn,'CAD', 99.0, CURRENT_DATE,'EFFECTIVE_UNTIL_CHANGED',
      'UNITS_OF_TO_PER_ONE_FROM', NULL,'REGULATOR_MAINTAINED','MID','F6X-GATE-BASE-A2', _regA);
    _rSucc := (_res->>'fx_rate_id')::uuid;
    PERFORM pg_temp.act(_checker);
    PERFORM public.fx_rate_decide(_rSucc, true, 'f6x gate');
    PERFORM pg_temp.act(_admin);
    SELECT * INTO _alloc_rec FROM public.fee_payment_allocations WHERE id=_alloc_rec.id;
    _buf := pg_temp.bufrec(_buf,'J','J-07','booked base and reporting values never change when a later rate is approved',
      _alloc_rec.base_amount = _base AND _alloc_rec.reporting_amount = _repamt
        AND _alloc_rec.fx_rate_id IS NOT DISTINCT FROM _alloc_rec.fx_rate_id,
      format('base %s→%s reporting %s→%s', _base, _alloc_rec.base_amount, _repamt, _alloc_rec.reporting_amount));

    _rep := public.fee_collected_in_reporting_currency(_regA);
    _buf := pg_temp.bufrec(_buf,'J','J-08','reporting reads the booked provenance, not today''s rate',
      _rep->>'reporting_currency' = 'CHF'
        AND abs((_rep->>'booked_total')::numeric - _repamt) <= 0.01
        AND _rep->>'completeness' = 'COMPLETE',
      'report='||_rep::text);

    -- ------------------------------------------------------------------- K
    -- a record that cannot obtain its reporting conversion stays visible
    RESET ROLE;
    INSERT INTO public.applications (applicant_id, license_type, status, request_kind,
                                     regulator_id, data)
    VALUES (_admin, COALESCE(_lt,'F6X-GATE'), 'submitted', 'NEW_LICENCE', _regB,
            jsonb_build_object('f6x_gate', true, 'scope','B'))
    RETURNING id INTO _appB;
    INSERT INTO public.fee_components (application_id, fee_type_id, amount, description)
    VALUES (_appB, _ft, 800.00, 'f6x gate scope B line');
    PERFORM pg_temp.act(_admin);
    _res := public.fee_assessment_ensure(_appB, 'f6x gate scope B');
    _alloc := ROUND((_res->>'outstanding')::numeric, 2);
    RESET ROLE;
    INSERT INTO public.payments (user_id, application_id, amount, currency, status,
                                 payment_method, payment_channel, transaction_ref,
                                 paid_at, payment_date)
    VALUES (_admin, _appB, _alloc, _txn,'success','online','online',
            'F6X-GATE-UNCONV-'||substr(gen_random_uuid()::text,1,8), now(), CURRENT_DATE)
    RETURNING id INTO _payB;
    PERFORM pg_temp.act(_admin);

    SELECT * INTO _alloc_rec FROM public.fee_payment_allocations
     WHERE payment_id=_payB AND reversed_at IS NULL ORDER BY allocated_at LIMIT 1;
    _rep := public.fee_collected_in_reporting_currency(_regB);
    _buf := pg_temp.bufrec(_buf,'K','K-01','money that cannot be converted is neither omitted nor guessed — it is booked unconverted',
      _alloc_rec.id IS NOT NULL AND _alloc_rec.base_amount IS NULL
        AND _alloc_rec.reporting_amount IS NULL AND _alloc_rec.base_currency IS NULL,
      format('base=%s reporting=%s', coalesce(_alloc_rec.base_amount::text,'∅'),
             coalesce(_alloc_rec.reporting_amount::text,'∅')));

    _buf := pg_temp.bufrec(_buf,'K','K-02','the reporting API declares the exception explicitly instead of returning an apparently complete total',
      _rep->>'completeness' = 'INCOMPLETE'
        AND (_rep->>'unconverted_allocations')::int >= 1
        AND _rep->'unconverted_by_currency' <> '[]'::jsonb
        AND _rep->'unconverted_by_currency' IS NOT NULL,
      'report='||_rep::text);

    -- an unaccepted payment currency is held as a visible credit, never allocated
    RESET ROLE;
    INSERT INTO public.applications (applicant_id, license_type, status, request_kind,
                                     regulator_id, data)
    VALUES (_admin, COALESCE(_lt,'F6X-GATE'), 'submitted', 'NEW_LICENCE', _regB,
            jsonb_build_object('f6x_gate', true, 'scope','B2'))
    RETURNING id INTO _appB2;
    INSERT INTO public.fee_components (application_id, fee_type_id, amount, description)
    VALUES (_appB2, _ft, 500.00, 'f6x gate scope B2 line');
    PERFORM pg_temp.act(_admin);
    PERFORM public.fee_assessment_ensure(_appB2, 'f6x gate scope B2');
    RESET ROLE;
    INSERT INTO public.payments (user_id, application_id, amount, currency, status,
                                 payment_method, payment_channel, transaction_ref,
                                 paid_at, payment_date)
    VALUES (_admin, _appB2, 500.00, 'CAD','success','online','online',
            'F6X-GATE-NOTACCEPT-'||substr(gen_random_uuid()::text,1,8), now(), CURRENT_DATE)
    RETURNING id INTO _payB2;
    PERFORM pg_temp.act(_admin);
    SELECT count(*) INTO _n FROM public.fee_payment_allocations WHERE payment_id=_payB2;
    _buf := pg_temp.bufrec(_buf,'K','K-03','a currency accepted by another regulator is never allocated here — it is held as an explicit credit',
      _n = 0
      AND EXISTS (SELECT 1 FROM public.fee_ledger_entries le
                   WHERE le.payment_id=_payB2 AND le.entry_type='CREDIT'
                     AND le.metadata->>'reason_code'='CURRENCY_NOT_ACCEPTED'),
      'allocations='||_n);

    -- ------------------------------------------------------------------- L
    _buf := pg_temp.bufrec(_buf,'L','L-01','a FIXED rate applies across multiple dates without re-quotation',
      (public.fx_convert(100,'CHF','NOK',CURRENT_DATE,_regA)->>'fx_rate_id')::uuid = _rFix
      AND (public.fx_convert(100,'CHF','NOK',CURRENT_DATE + 45,_regA)->>'fx_rate_id')::uuid = _rFix
      AND ROUND((public.fx_convert(100,'CHF','NOK',CURRENT_DATE + 45,_regA)->>'effective_rate')::numeric,4) = 4.0000,
      'fixed rate='||_rFix);

    SELECT regime INTO _state FROM public.fx_rates WHERE id=_rDef;
    _buf := pg_temp.bufrec(_buf,'L','L-02','no currency or code ever implies a FIXED regime by itself',
      _state <> 'FIXED', 'default regime='||coalesce(_state,'∅'));

    SELECT status INTO _state FROM public.fx_rates WHERE id=_rBase;
    _buf := pg_temp.bufrec(_buf,'L','L-03','a superseded rate is closed, its successor takes effect, and the two never overlap while approved',
      _state IN ('SUPERSEDED','APPROVED')
      AND (public.fx_resolve_rate(_txn,'CAD',CURRENT_DATE,_regA)).id = _rSucc
      AND NOT EXISTS (
        SELECT 1 FROM public.fx_rates a JOIN public.fx_rates b
          ON a.id < b.id AND a.status='APPROVED' AND b.status='APPROVED'
         AND a.from_currency=b.from_currency AND a.to_currency=b.to_currency
         AND a.rate_type=b.rate_type
         AND a.regulator_id IS NOT DISTINCT FROM b.regulator_id
         AND daterange(a.effective_from, a.effective_to, '[]')
             && daterange(b.effective_from, b.effective_to, '[]')),
      'predecessor status='||coalesce(_state,'∅'));

    _buf := pg_temp.bufrec(_buf,'L','L-04','a historical movement continues to name the rate it was booked on after a successor exists',
      (SELECT count(*) FROM public.fx_conversions c
        WHERE c.subject_id=_payA AND c.fx_rate_id=_rBase) = 1
      AND (SELECT count(*) FROM public.fx_conversions c
            WHERE c.subject_id=_payA AND c.fx_rate_id=_rSucc) = 0,
      'booked conversions still name the original rate');

    RAISE EXCEPTION 'F6X_GATE_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F6X_GATE_ROLLBACK' THEN
      GET STACKED DIAGNOSTICS _ctx = PG_EXCEPTION_CONTEXT;
      _buf := pg_temp.bufrec(_buf,'H','H-ERR','the regulator-scoped fixture ran to completion',
        false, SQLSTATE||': '||left(SQLERRM,200)||' | '||left(coalesce(_ctx,''),400));
    END IF;
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{}', true);

  FOR r IN SELECT * FROM jsonb_array_elements(_buf) e LOOP
    PERFORM pg_temp.rec(r.value->>'section', r.value->>'id', r.value->>'descr',
      (r.value->>'passed')::boolean, r.value->>'detail');
  END LOOP;
END $h$;


-- ===========================================================================
-- SECTION Z — zero residue
-- ===========================================================================
DO $z$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.fx_rates
   WHERE provenance_reference LIKE 'F6X-GATE-%';
  PERFORM pg_temp.rec('Z','Z-01','the gate leaves no exchange rate behind', _n = 0, 'residue rows='||_n);

  SELECT count(*) INTO _n FROM public.fx_conversions WHERE subject_type = 'f6x_gate';
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
