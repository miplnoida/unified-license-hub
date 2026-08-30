-- ============================================================================
-- verify:enforcement-currency — ENFORCEMENT PENALTY CURRENCY INTEGRITY GATE
--
-- Proves that the currency of a monetary enforcement sanction is a
-- server-authoritative monetary decision, not browser input:
--
--   A  authority surface — the resolver, the override routine and the write
--      trigger exist, are SECURITY DEFINER with a pinned search_path, and are
--      closed to anonymous callers
--   B  business configuration — the penalty currency policy lives in the
--      regulator monetary configuration, is constrained, and no currency code
--      is hard-coded as a column default
--   C  resolution — the applicable regulator body's base currency is the
--      penalty currency; an unresolvable entity or a regulator without a
--      monetary configuration fails closed
--   D  browser cannot denominate — an omitted currency still yields the
--      governed currency; a submitted foreign currency is refused unless the
--      regulator policy explicitly allows it and a reason is recorded
--   E  isolation — officer assignment fields and the entity reporting-currency
--      override cannot change the penalty currency
--   F  immutability — a fixed sanction currency survives a later base-currency
--      configuration change, and settlement in another tender currency never
--      rewrites the sanction
--   G  presentation — the penalties surface reads the stored currency and
--      unlike currencies are never aggregated (verified structurally by the
--      per-currency totals in src/pages/billing/Penalties.tsx and the absence
--      of any runtime currency default in active source)
--   H  historical estate — every positive penalty carries an authoritative
--      currency with provenance
--   Z  zero residue
--
-- Every empirical write happens inside a block that is ALWAYS rolled back.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f scripts/verify-enforcement-penalty-currency.sql
-- ============================================================================
\set ON_ERROR_STOP on
SET row_security = on;
\pset pager off
SET client_min_messages = notice;

DROP TABLE IF EXISTS epc_results;
CREATE TEMP TABLE epc_results (
  seq serial, section text, id text, descr text, passed boolean, detail text
);

DROP FUNCTION IF EXISTS pg_temp.rec(text,text,text,boolean,text);
CREATE OR REPLACE FUNCTION pg_temp.rec(_s text, _id text, _d text, _ok boolean, _detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO epc_results (section, id, descr, passed, detail) VALUES (_s,_id,_d,_ok,_detail);
END $$;

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

-- ---------------------------------------------------------------------------
-- A — authority surface
-- ---------------------------------------------------------------------------
DO $a$
DECLARE _n int; _f text;
BEGIN
  FOREACH _f IN ARRAY ARRAY['enforcement_penalty_currency_resolve',
                            'enforcement_penalty_currency_override',
                            'tg_enforcement_penalty_currency_authority',
                            'tg_enforcement_penalty_payment_currency'] LOOP
    SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=_f AND p.prosecdef
       AND array_to_string(COALESCE(p.proconfig,'{}'),',') LIKE '%search_path=%';
    PERFORM pg_temp.rec('A','A-01:'||_f,
      'the routine exists as SECURITY DEFINER with a pinned search_path', _n >= 1, 'count='||_n);
  END LOOP;

  SELECT count(*) INTO _n FROM pg_trigger t
   WHERE t.tgrelid = 'public.enforcement_actions'::regclass
     AND NOT t.tgisinternal
     AND t.tgname = 'tg_enforcement_penalty_currency_authority';
  PERFORM pg_temp.rec('A','A-02','every write to a penalty passes the currency authority trigger',
    _n = 1, 'triggers='||_n);

  SELECT count(*) INTO _n FROM pg_trigger t
   WHERE t.tgrelid = 'public.enforcement_penalty_payments'::regclass
     AND NOT t.tgisinternal
     AND t.tgname = 'tg_enforcement_penalty_payment_currency';
  PERFORM pg_temp.rec('A','A-03','every settlement passes the tender currency trigger',
    _n = 1, 'triggers='||_n);

  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('enforcement_penalty_currency_resolve','enforcement_penalty_currency_override')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  PERFORM pg_temp.rec('A','A-04','the penalty currency routines are closed to anonymous callers',
    _n = 0, 'anon_executable='||_n);
END $a$;

-- ---------------------------------------------------------------------------
-- B — business configuration, not code
-- ---------------------------------------------------------------------------
DO $b$
DECLARE _n int; _def text;
BEGIN
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='monetary_configs'
     AND column_name IN ('enforcement_penalty_currency_policy','enforcement_penalty_allowed_currencies');
  PERFORM pg_temp.rec('B','B-01','the penalty currency policy is regulator business configuration',
    _n = 2, 'columns='||_n);

  SELECT count(*) INTO _n FROM pg_constraint
   WHERE conrelid='public.monetary_configs'::regclass
     AND conname='monetary_configs_enf_penalty_policy_chk';
  PERFORM pg_temp.rec('B','B-02','the policy is constrained to the governed values', _n = 1, 'constraints='||_n);

  SELECT column_default INTO _def FROM information_schema.columns
   WHERE table_schema='public' AND table_name='enforcement_actions' AND column_name='penalty_currency';
  PERFORM pg_temp.rec('B','B-03','no currency code is hard-coded as the penalty column default',
    _def IS NULL, 'default='||COALESCE(_def,'∅'));

  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='enforcement_actions'
     AND column_name IN ('penalty_regulator_id','penalty_monetary_config_id',
                         'penalty_currency_source','penalty_currency_policy',
                         'penalty_currency_reason','penalty_currency_set_at');
  PERFORM pg_temp.rec('B','B-04','the sanction records its currency provenance', _n = 6, 'columns='||_n);
END $b$;

-- ---------------------------------------------------------------------------
-- C–F — behavioural proof (always rolled back)
-- ---------------------------------------------------------------------------
DO $beh$
DECLARE
  _buf jsonb := '[]'::jsonb;
  _entity uuid; _reg uuid; _cfg public.monetary_configs; _base text; _alt text;
  _decider uuid; _case uuid; _res jsonb; _ok boolean; _msg text; _cur text; _n int;
BEGIN
  SELECT e.entity_id INTO _entity
    FROM public.enforcement_actions e
   WHERE e.entity_id IS NOT NULL
   ORDER BY e.created_at LIMIT 1;

  IF _entity IS NULL THEN
    SELECT l.id INTO _entity FROM public.licensees l ORDER BY l.created_at LIMIT 1;
  END IF;

  IF _entity IS NOT NULL THEN
    BEGIN
      _reg := (public.entity_regulator_body_resolve(_entity)->>'regulator_id')::uuid;
      _cfg := public.monetary_config_resolve_strict(_reg);
      _base := _cfg.base_currency;
    EXCEPTION WHEN OTHERS THEN _base := NULL;
    END;
  END IF;

  SELECT code INTO _alt FROM public.currencies
   WHERE is_active AND code <> COALESCE(_base,'') ORDER BY code LIMIT 1;

  SELECT p.id INTO _decider FROM public.profiles p
   WHERE public.is_super_admin(p.id) OR public.has_permission(p.id,'enforcement_management','decide')
   ORDER BY p.created_at LIMIT 1;

  IF _entity IS NULL OR _base IS NULL OR _alt IS NULL OR _decider IS NULL THEN
    PERFORM pg_temp.rec('C','C-00',
      'vacuity guard: an entity resolvable to a regulator body with a monetary configuration, a second currency and an enforcement decision maker all exist',
      false, format('entity=%s base=%s alt=%s decider=%s', _entity, _base, _alt, _decider));
    RETURN;
  END IF;
  PERFORM pg_temp.rec('C','C-00','vacuity guard: a real fixture exists',
    true, format('entity=%s reg=%s base=%s alt=%s', _entity, _reg, _base, _alt));

  BEGIN
    -- C: resolution
    _res := public.enforcement_penalty_currency_resolve(_entity);
    _buf := pg_temp.bufrec(_buf,'C','C-01',
      'the penalty currency is the applicable regulator body base currency',
      _res->>'currency' = _base AND _res->>'source' = 'REGULATOR_BASE'
        AND (_res->>'regulator_id')::uuid = _reg,
      'currency='||COALESCE(_res->>'currency','∅')||' source='||COALESCE(_res->>'source','∅'));

    _buf := pg_temp.bufrec(_buf,'C','C-02',
      'the resolution names the regulator monetary configuration of record',
      (_res->>'monetary_config_id')::uuid = _cfg.id, 'config='||COALESCE(_res->>'monetary_config_id','∅'));

    _ok := false; _msg := '';
    BEGIN
      PERFORM public.enforcement_penalty_currency_resolve('00000000-0000-0000-0000-000000000000'::uuid);
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM;
    END;
    _buf := pg_temp.bufrec(_buf,'C','C-03',
      'an unresolvable entity fails closed instead of assuming a currency', _ok, _msg);

    -- fixture case
    INSERT INTO public.enforcement_actions
      (entity_id, enforcement_type, status, stage, description, opened_by, decision_at,
       decision_outcome, findings, legal_basis, case_number)
    VALUES (_entity, 'EPC_GATE', 'decided', 'SANCTION', 'EPC gate fixture', _decider, now(),
            'breach_established', 'EPC gate findings', 'EPC gate basis', 'EPC-GATE-0001')
    RETURNING id INTO _case;

    -- D: browser cannot denominate
    UPDATE public.enforcement_actions SET penalty_amount = 10000 WHERE id = _case;
    SELECT penalty_currency INTO _cur FROM public.enforcement_actions WHERE id = _case;
    _buf := pg_temp.bufrec(_buf,'D','D-01',
      'omitting the currency still yields the authoritative regulator base currency',
      _cur = _base, 'currency='||COALESCE(_cur,'∅'));

    SELECT count(*) INTO _n FROM public.enforcement_actions
     WHERE id = _case AND penalty_regulator_id = _reg
       AND penalty_monetary_config_id = _cfg.id
       AND penalty_currency_source = 'REGULATOR_BASE'
       AND penalty_currency_set_at IS NOT NULL;
    _buf := pg_temp.bufrec(_buf,'D','D-02',
      'the sanction snapshots its currency, regulator body, configuration and time', _n = 1, 'rows='||_n);

    -- a browser-supplied foreign currency cannot override the governed currency
    UPDATE public.enforcement_actions SET penalty_currency = _alt WHERE id = _case;
    SELECT penalty_currency INTO _cur FROM public.enforcement_actions WHERE id = _case;
    _buf := pg_temp.bufrec(_buf,'D','D-03',
      'a browser-submitted foreign currency cannot rewrite the sanction currency',
      _cur = _base, 'currency='||COALESCE(_cur,'∅')||' attempted='||_alt);

    -- a fresh case under REGULATOR_BASE policy refuses a foreign currency outright
    _ok := false; _msg := '';
    BEGIN
      INSERT INTO public.enforcement_actions
        (entity_id, enforcement_type, status, stage, description, opened_by,
         penalty_amount, penalty_currency, case_number)
      VALUES (_entity, 'EPC_GATE', 'decided', 'SANCTION', 'EPC gate reject', _decider,
              5000, _alt, 'EPC-GATE-0002');
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM;
    END;
    _buf := pg_temp.bufrec(_buf,'D','D-04',
      'under the regulator-base policy a non-base penalty currency is refused', _ok, _msg);

    _ok := false; _msg := '';
    BEGIN
      UPDATE public.monetary_configs
         SET enforcement_penalty_currency_policy = 'NOT_A_POLICY' WHERE id = _cfg.id;
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM;
    END;
    _buf := pg_temp.bufrec(_buf,'D','D-05',
      'an unknown penalty currency policy cannot be configured', _ok, _msg);

    -- with explicit business configuration the approved currency is accepted with a reason
    UPDATE public.monetary_configs
       SET enforcement_penalty_currency_policy = 'EXPLICIT_ALLOWED_CURRENCIES',
           enforcement_penalty_allowed_currencies = ARRAY[_alt],
           supported_transaction_currencies =
             (SELECT ARRAY(SELECT DISTINCT x FROM unnest(
                COALESCE(supported_transaction_currencies,'{}'::text[]) || _alt) x))
     WHERE id = _cfg.id;

    _ok := false; _msg := '';
    BEGIN
      PERFORM public.enforcement_penalty_currency_resolve(_entity, _alt, NULL);
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM;
    END;
    _buf := pg_temp.bufrec(_buf,'D','D-06',
      'an approved non-base currency without a recorded legal reason is refused', _ok, _msg);

    _res := public.enforcement_penalty_currency_resolve(_entity, _alt,
              'Statutory penalty denominated under the regulator approved currency list.');
    _buf := pg_temp.bufrec(_buf,'D','D-07',
      'an approved non-base currency with a recorded reason is permitted',
      _res->>'currency' = _alt AND _res->>'source' = 'REGULATOR_APPROVED_CURRENCY',
      'currency='||COALESCE(_res->>'currency','∅'));

    _ok := false; _msg := '';
    BEGIN
      PERFORM public.enforcement_penalty_currency_resolve(_entity, 'ZZZ',
                'Attempt to use a currency outside the approved list.');
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM;
    END;
    _buf := pg_temp.bufrec(_buf,'D','D-08',
      'a currency outside the regulator approved list is refused', _ok, _msg);

    UPDATE public.monetary_configs
       SET enforcement_penalty_currency_policy = 'REGULATOR_BASE',
           enforcement_penalty_allowed_currencies = '{}'::text[]
     WHERE id = _cfg.id;

    -- E: isolation from officer assignment and entity reporting currency
    UPDATE public.licensees SET lead_regulator_id = _decider WHERE id = _entity;
    _res := public.enforcement_penalty_currency_resolve(_entity);
    _buf := pg_temp.bufrec(_buf,'E','E-01',
      'an officer assignment field cannot change the penalty currency',
      _res->>'currency' = _base AND (_res->>'regulator_id')::uuid = _reg,
      'currency='||COALESCE(_res->>'currency','∅'));

    INSERT INTO public.entity_currency_profiles
      (entity_id, regulator_id, reporting_currency_override, effective_from, status, reason, source, created_by)
    VALUES (_entity, _reg, _alt, current_date - 1, 'ACTIVE',
            'Gate fixture: reporting currency override must not affect enforcement.', 'GATE', _decider);
    _res := public.enforcement_penalty_currency_resolve(_entity);
    _buf := pg_temp.bufrec(_buf,'E','E-02',
      'an entity reporting-currency override does not change the penalty currency',
      _res->>'currency' = _base, 'penalty='||COALESCE(_res->>'currency','∅')||' reporting_override='||_alt);

    -- F: immutability and tender separation
    UPDATE public.monetary_configs SET base_currency = _alt WHERE id = _cfg.id;
    UPDATE public.enforcement_actions SET penalty_amount = 12000 WHERE id = _case;
    SELECT penalty_currency INTO _cur FROM public.enforcement_actions WHERE id = _case;
    _buf := pg_temp.bufrec(_buf,'F','F-01',
      'a later regulator base-currency change never rewrites a fixed sanction currency',
      _cur = _base, 'currency='||COALESCE(_cur,'∅')||' new_base='||_alt);
    UPDATE public.monetary_configs SET base_currency = _base WHERE id = _cfg.id;

    INSERT INTO public.enforcement_penalty_payments (case_id, amount, currency, kind, recorded_by)
    VALUES (_case, 1000, _alt, 'payment', _decider);
    SELECT penalty_currency INTO _cur FROM public.enforcement_actions WHERE id = _case;
    _buf := pg_temp.bufrec(_buf,'F','F-02',
      'settlement in another tender currency does not rewrite the sanction currency',
      _cur = _base, 'sanction='||COALESCE(_cur,'∅')||' tender='||_alt);

    SELECT count(*) INTO _n FROM public.enforcement_penalty_payments
     WHERE case_id = _case AND currency = _alt;
    _buf := pg_temp.bufrec(_buf,'F','F-03',
      'the tender currency is preserved on the settlement record', _n = 1, 'rows='||_n);

    RAISE EXCEPTION 'EPC_GATE_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'EPC_GATE_ROLLBACK' THEN
      _buf := pg_temp.bufrec(_buf,'F','F-99','the behavioural block completed without an unexpected error',
        false, SQLERRM);
    END IF;
  END;

  PERFORM set_config('request.jwt.claims', NULL, true);

  INSERT INTO epc_results (section, id, descr, passed, detail)
  SELECT r->>'section', r->>'id', r->>'descr', (r->>'passed')::boolean, r->>'detail'
    FROM jsonb_array_elements(_buf) r;
END $beh$;

-- ---------------------------------------------------------------------------
-- H — the historical estate carries authoritative currency
-- ---------------------------------------------------------------------------
DO $h$
DECLARE _n int; _cur text;
BEGIN
  SELECT count(*) INTO _n FROM public.enforcement_actions
   WHERE COALESCE(penalty_amount,0) > 0
     AND (penalty_currency IS NULL OR penalty_currency !~ '^[A-Z]{3}$');
  PERFORM pg_temp.rec('H','H-01','every positive penalty carries an ISO currency', _n = 0, 'rows='||_n);

  SELECT count(*) INTO _n FROM public.enforcement_actions
   WHERE COALESCE(penalty_amount,0) > 0 AND penalty_regulator_id IS NULL;
  PERFORM pg_temp.rec('H','H-02','every positive penalty names its regulator body', _n = 0, 'rows='||_n);

  SELECT count(*) INTO _n FROM public.enforcement_actions
   WHERE COALESCE(penalty_amount,0) > 0 AND penalty_currency_source IS NULL;
  PERFORM pg_temp.rec('H','H-03','every positive penalty records how its currency was determined',
    _n = 0, 'rows='||_n);

  SELECT count(*) INTO _n FROM public.enforcement_actions e
   WHERE COALESCE(e.penalty_amount,0) > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.monetary_configs c
        WHERE c.id = e.penalty_monetary_config_id
          AND (e.penalty_currency = c.base_currency
               OR e.penalty_currency = ANY (COALESCE(c.enforcement_penalty_allowed_currencies,'{}'::text[]))));
  PERFORM pg_temp.rec('H','H-04',
    'every penalty currency is the regulator base currency or an approved currency of its configuration',
    _n = 0, 'rows='||_n);

  SELECT count(*) INTO _n FROM public.enforcement_penalty_payments p
    JOIN public.enforcement_actions e ON e.id = p.case_id
   WHERE p.currency IS NULL OR p.currency !~ '^[A-Z]{3}$';
  PERFORM pg_temp.rec('H','H-05','every settlement carries an ISO tender currency', _n = 0, 'rows='||_n);

  SELECT count(*) INTO _n FROM public.audit_logs
   WHERE action = 'DATA_REMEDIATION'
     AND metadata->>'remediation' = 'ENFORCEMENT_PENALTY_CURRENCY';
  PERFORM pg_temp.rec('H','H-06',
    'the historical currency remediation is auditable with its old and new currency', _n >= 1, 'audit_rows='||_n);
END $h$;

-- ---------------------------------------------------------------------------
-- Z — zero residue
-- ---------------------------------------------------------------------------
DO $z$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.enforcement_actions WHERE case_number LIKE 'EPC-GATE-%';
  PERFORM pg_temp.rec('Z','Z-01','the gate-owned enforcement cases were rolled back', _n = 0, 'rows='||_n);

  SELECT count(*) INTO _n FROM public.entity_currency_profiles WHERE source = 'GATE';
  PERFORM pg_temp.rec('Z','Z-02','the gate-owned currency profile was rolled back', _n = 0, 'rows='||_n);

  SELECT count(*) INTO _n FROM public.monetary_configs
   WHERE enforcement_penalty_currency_policy <> 'REGULATOR_BASE'
     AND array_length(COALESCE(enforcement_penalty_allowed_currencies,'{}'::text[]),1) IS NULL;
  PERFORM pg_temp.rec('Z','Z-03','no configuration is left in a half-applied penalty currency policy',
    _n = 0, 'rows='||_n);
END $z$;

\echo ''
\echo '============== verify:enforcement-currency results =============='
SELECT section, id, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, descr, detail
  FROM epc_results ORDER BY seq;

\echo ''
SELECT count(*) FILTER (WHERE passed) AS passed,
       count(*) FILTER (WHERE NOT passed) AS failed,
       count(*) AS total
  FROM epc_results;

DO $fin$
DECLARE _fail int;
BEGIN
  SELECT count(*) INTO _fail FROM epc_results WHERE NOT passed;
  IF _fail > 0 THEN
    RAISE EXCEPTION 'verify:enforcement-currency FAILED — % assertion(s) did not hold', _fail;
  END IF;
  RAISE NOTICE 'verify:enforcement-currency PASSED — penalty currency authority holds';
END $fin$;
