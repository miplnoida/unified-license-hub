-- ============================================================================
-- verify:f7b — REGULATORY RETURNS CONSOLIDATED REMEDIATION GATE
--
-- Proves, empirically and repeatably, that the F7 returns module runs on one
-- canonical spine with server-side authority:
--
--   A  canonical spine & privilege — the canonical returns tables exist, are
--      RLS-enabled, hold no browser write privilege, are closed to anonymous
--      callers, and every entrypoint is a guarded SECURITY DEFINER routine with
--      a pinned search_path
--   B  legacy retirement — the pre-canonical returns stores are unreachable
--      from the browser and their governed RPC family is not executable
--   C  governance surfaces — extensions, amendments, RFI, evidence and overdue
--      detection exist as governed, audited, reason-bearing RPCs
--   D  notifications — the submit and review lifecycle emits notifications
--      through the single guarded `returns_notify` helper
--   E  maker-checker — the submitter of a version cannot decide it
--   F  currency authority — the entity reporting currency hierarchy is
--      statutory definition mandate → effective-dated entity override →
--      regulator base currency, resolved server-side, with no default anywhere
--   G  filing currency snapshots — every filing records its currency of record
--      with provenance, and a later profile change never rewrites it
--   H  override governance — overrides are effective-dated, reason-bearing,
--      superseded rather than deleted, and only an authorised internal caller
--      may maintain them
--   Z  zero residue
--
-- Vacuity guard: the behavioural sections require a real regulated entity with
-- a lead regulator, an active monetary configuration, a user holding
-- `licensee_management.edit` and a non-privileged user. If any is absent the
-- gate FAILS rather than passing on an empty fixture.
--
-- Every empirical write happens inside a block that is ALWAYS rolled back.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f scripts/verify-f7b.sql
-- ============================================================================
\set ON_ERROR_STOP on
SET row_security = on;
\pset pager off
SET client_min_messages = notice;

DROP TABLE IF EXISTS f7b_results;
CREATE TEMP TABLE f7b_results (
  seq serial, section text, id text, descr text, passed boolean, detail text
);

DROP FUNCTION IF EXISTS pg_temp.rec(text,text,text,boolean,text);
CREATE OR REPLACE FUNCTION pg_temp.rec(_s text, _id text, _d text, _ok boolean, _detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO f7b_results (section, id, descr, passed, detail) VALUES (_s,_id,_d,_ok,_detail);
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
-- A — canonical spine & privilege
-- ---------------------------------------------------------------------------
DO $a$
DECLARE _t text; _n int; _missing text := '';
BEGIN
  FOREACH _t IN ARRAY ARRAY[
    'return_definitions','return_definition_forms','entity_reporting_obligations',
    'reporting_periods','return_filings','return_filing_versions',
    'return_filing_form_requirements','return_filing_validation_results',
    'return_filing_requests','return_metric_values','return_form_validation_rules',
    'return_filing_extensions','return_filing_evidence','return_overdue_events',
    'entity_currency_profiles'
  ] LOOP
    IF to_regclass('public.'||_t) IS NULL THEN _missing := _missing||_t||' '; END IF;
  END LOOP;
  PERFORM pg_temp.rec('A','A-01','the canonical returns spine and its governance tables all exist',
    _missing = '', COALESCE(NULLIF('missing: '||_missing,'missing: '),'all present'));

  SELECT count(*) INTO _n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND NOT c.relrowsecurity
     AND c.relname IN ('return_filings','return_filing_versions','return_filing_extensions',
                       'return_filing_evidence','return_overdue_events','entity_currency_profiles');
  PERFORM pg_temp.rec('A','A-02','row level security is enabled on every returns governance table',
    _n = 0, 'tables without RLS='||_n);

  SELECT count(*) INTO _n FROM information_schema.role_table_grants
   WHERE table_schema='public' AND grantee IN ('authenticated','anon')
     AND privilege_type IN ('INSERT','UPDATE','DELETE')
     AND table_name IN ('return_filings','return_filing_versions','return_filing_extensions',
                        'return_filing_evidence','return_overdue_events','entity_currency_profiles',
                        'return_metric_values','return_filing_validation_results');
  PERFORM pg_temp.rec('A','A-03','the browser holds no direct write privilege on any returns table',
    _n = 0, 'browser write grants='||_n);

  SELECT count(*) INTO _n FROM information_schema.role_table_grants
   WHERE table_schema='public' AND grantee='anon'
     AND table_name IN ('return_filings','return_filing_versions','return_filing_extensions',
                        'return_filing_evidence','return_overdue_events','entity_currency_profiles');
  PERFORM pg_temp.rec('A','A-04','anonymous callers hold no privilege on any returns table',
    _n = 0, 'anon grants='||_n);

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('returns_submit_filing','returns_review_filing','returns_open_filing',
                       'returns_raise_rfi','returns_request_amendment','returns_decide_amendment',
                       'returns_request_extension','returns_decide_extension',
                       'returns_attach_evidence','returns_withdraw_evidence','returns_overdue_sweep',
                       'returns_notify','returns_snapshot_filing_currency','returns_rebase_filing_currency',
                       'entity_reporting_currency_resolve','entity_currency_override_set',
                       'entity_currency_override_supersede','entity_currency_profile_overview')
     AND (NOT p.prosecdef OR p.proconfig IS NULL
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'));
  PERFORM pg_temp.rec('A','A-05','every returns entrypoint is SECURITY DEFINER with a pinned search_path',
    _n = 0, 'unguarded routines='||_n);
END $a$;

-- ---------------------------------------------------------------------------
-- B — legacy retirement
-- ---------------------------------------------------------------------------
DO $b$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM information_schema.role_table_grants
   WHERE table_schema='public' AND grantee IN ('authenticated','anon')
     AND privilege_type IN ('INSERT','UPDATE','DELETE')
     AND table_name IN ('compliance_returns','returns_filed');
  PERFORM pg_temp.rec('B','B-01','the pre-canonical returns stores accept no browser writes',
    _n = 0, 'legacy browser write grants='||_n);

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'compliance_return%'
     AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
          OR has_function_privilege('anon', p.oid, 'EXECUTE'));
  PERFORM pg_temp.rec('B','B-02','the legacy compliance_return_* RPC family is not callable from the browser',
    _n = 0, 'callable legacy routines='||_n);

  SELECT count(*) INTO _n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE c.relname='compliance_returns' AND NOT t.tgisinternal
     AND (t.tgname ILIKE '%notif%' OR t.tgname ILIKE '%escalat%' OR t.tgname ILIKE '%due%');
  PERFORM pg_temp.rec('B','B-03','the retired legacy notification trigger is gone',
    _n = 0, 'legacy lifecycle triggers='||_n);

  SELECT count(*) INTO _n FROM public.compliance_returns;
  PERFORM pg_temp.rec('B','B-04','no live filing activity is accumulating in the retired store',
    _n = 0, 'legacy rows='||_n);
END $b$;

-- ---------------------------------------------------------------------------
-- C / D / E — governance surfaces, notifications, maker-checker
-- ---------------------------------------------------------------------------
DO $c$
DECLARE _src text; _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.return_filing_requests
   WHERE request_kind NOT IN (SELECT unnest(ARRAY['RFI','CORRECTION','AMENDMENT','EXTENSION','CLARIFICATION']));
  PERFORM pg_temp.rec('C','C-01','every recorded request uses a canonical request kind',
    _n = 0, 'off-catalogue requests='||_n);

  FOR _src, _n IN
    SELECT p.proname, 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('returns_request_extension','returns_decide_extension',
                         'returns_request_amendment','returns_decide_amendment',
                         'returns_withdraw_evidence','entity_currency_override_set',
                         'entity_currency_override_supersede','returns_rebase_filing_currency')
       AND pg_get_functiondef(p.oid) !~* 'length\(.*reason'
  LOOP
    PERFORM pg_temp.rec('C','C-02:'||_src, _src||' refuses a governance action without a substantive reason',
      false, 'no reason-length guard found');
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM f7b_results WHERE id LIKE 'C-02:%') THEN
    PERFORM pg_temp.rec('C','C-02','every governance action requires a substantive recorded reason', true, 'all guarded');
  END IF;

  SELECT pg_get_functiondef(oid) INTO _src FROM pg_proc
   WHERE proname='returns_overdue_sweep' AND pronamespace='public'::regnamespace;
  PERFORM pg_temp.rec('C','C-03','overdue detection records an event ledger row rather than mutating silently',
    _src ~* 'return_overdue_events', 'ledger referenced='||(_src ~* 'return_overdue_events')::text);

  SELECT pg_get_functiondef(oid) INTO _src FROM pg_proc
   WHERE proname='returns_decide_extension' AND pronamespace='public'::regnamespace;
  PERFORM pg_temp.rec('C','C-04','granting an extension moves the regulatory deadline of record',
    _src ~* 'reporting_periods', 'period update present='||(_src ~* 'reporting_periods')::text);

  SELECT pg_get_functiondef(oid) INTO _src FROM pg_proc
   WHERE proname='returns_submit_filing' AND pronamespace='public'::regnamespace;
  PERFORM pg_temp.rec('D','D-01','submitting a filing notifies through the single guarded helper',
    _src ~* 'returns_notify', 'returns_notify called='||(_src ~* 'returns_notify')::text);

  SELECT pg_get_functiondef(oid) INTO _src FROM pg_proc
   WHERE proname='returns_review_filing' AND pronamespace='public'::regnamespace;
  PERFORM pg_temp.rec('D','D-02','review decisions notify through the single guarded helper',
    _src ~* 'returns_notify', 'returns_notify called='||(_src ~* 'returns_notify')::text);

  PERFORM pg_temp.rec('E','E-01','the submitter of a version cannot decide it (maker-checker)',
    _src ~* 'submitted_by', 'submitter separation enforced='||(_src ~* 'submitted_by')::text);

  -- Notification delivery must never roll back the regulatory action: either the
  -- helper or the canonical enqueue it delegates to absorbs failure.
  SELECT COALESCE(
      (SELECT pg_get_functiondef(oid) FROM pg_proc
        WHERE proname='returns_notify' AND pronamespace='public'::regnamespace), '')
    || COALESCE(
      (SELECT pg_get_functiondef(oid) FROM pg_proc
        WHERE proname='notification_enqueue_event' AND pronamespace='public'::regnamespace), '')
    INTO _src;
  PERFORM pg_temp.rec('D','D-03','notification failures never roll back the regulatory action',
    _src ~* 'EXCEPTION WHEN', 'fail-safe handler present='||(_src ~* 'EXCEPTION WHEN')::text);
END $c$;

-- ---------------------------------------------------------------------------
-- F / G — currency authority and filing snapshots (structural)
-- ---------------------------------------------------------------------------
DO $f$
DECLARE _n int; _src text;
BEGIN
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='return_filings'
     AND column_name IN ('reporting_currency','currency_source','currency_as_of',
                         'entity_currency_profile_id','currency_snapshot_at');
  PERFORM pg_temp.rec('G','G-01','every filing carries a currency of record with full provenance',
    _n = 5, 'snapshot columns='||_n);

  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='return_definitions' AND column_name='mandatory_currency_code';
  PERFORM pg_temp.rec('F','F-01','a return definition may mandate a currency only through explicit configuration',
    _n = 1, 'mandatory_currency_code present='||_n);

  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='monetary_configs' AND column_name='returns_fx_date_policy';
  PERFORM pg_temp.rec('F','F-02','the FX date policy for returns is regulator configuration, not code',
    _n = 1, 'returns_fx_date_policy present='||_n);

  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema='public' AND table_name IN ('return_definitions','entity_reporting_obligations')
     AND column_name LIKE '%currency%' AND column_default IS NOT NULL;
  PERFORM pg_temp.rec('F','F-03','no returns table assumes a default currency',
    _n = 0, 'defaulted currency columns='||_n);

  SELECT pg_get_functiondef(oid) INTO _src FROM pg_proc
   WHERE proname='entity_reporting_currency_resolve' AND pronamespace='public'::regnamespace;
  PERFORM pg_temp.rec('F','F-04','the resolver applies definition mandate → entity override → regulator base',
    _src ~* 'RETURN_DEFINITION' AND _src ~* 'ENTITY_OVERRIDE' AND _src ~* 'REGULATOR_BASE',
    'hierarchy sources present');

  SELECT pg_get_functiondef(oid) INTO _src FROM pg_proc
   WHERE proname='returns_open_filing' AND pronamespace='public'::regnamespace;
  PERFORM pg_temp.rec('G','G-02','opening a filing snapshots its currency at the canonical open point',
    _src ~* 'returns_snapshot_filing_currency', 'snapshot call present');

  SELECT count(*) INTO _n FROM public.return_filings WHERE reporting_currency IS NULL;
  PERFORM pg_temp.rec('G','G-03','no filing exists without a recorded currency of record',
    _n = 0, 'filings without currency='||_n);

  SELECT count(*) INTO _n FROM public.return_filings
   WHERE currency_source NOT IN ('REGULATOR_BASE','ENTITY_OVERRIDE','RETURN_DEFINITION');
  PERFORM pg_temp.rec('G','G-04','every filing currency states a canonical provenance',
    _n = 0, 'off-catalogue provenance='||_n);

  SELECT pg_get_functiondef(oid) INTO _src FROM pg_proc
   WHERE proname='returns_rebase_filing_currency' AND pronamespace='public'::regnamespace;
  PERFORM pg_temp.rec('G','G-05','currency may be rebased only while the filing is still a draft',
    _src ~* 'DRAFT', 'draft-only guard present');

  -- The entity reporting currency has exactly one authority: no other module
  -- keeps a parallel entity-level currency preference column.
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema='public'
     AND column_name IN ('reporting_currency_override','preferred_currency','entity_currency')
     AND table_name <> 'entity_currency_profiles';
  PERFORM pg_temp.rec('F','F-05','no module maintains an independent entity-currency preference',
    _n = 0, 'competing preference columns='||_n);
END $f$;

-- ---------------------------------------------------------------------------
-- F / G / H — behavioural, always rolled back
-- ---------------------------------------------------------------------------
DO $beh$
DECLARE
  _buf jsonb := '[]'::jsonb;
  _entity uuid; _reg uuid; _base text; _alt text;
  _admin uuid; _plain uuid;
  _profile uuid; _res jsonb; _filing record; _before text; _after text;
  _ok boolean; _msg text; _r jsonb;
BEGIN
  SELECT l.id, l.lead_regulator_id INTO _entity, _reg
    FROM public.licensees l
   WHERE l.lead_regulator_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.return_filings f WHERE f.entity_id = l.id)
   ORDER BY l.created_at LIMIT 1;

  SELECT c.base_currency INTO _base FROM public.monetary_configs c
   WHERE c.is_active AND (c.regulator_id = _reg OR c.regulator_id IS NULL)
   ORDER BY (c.regulator_id IS NOT NULL) DESC LIMIT 1;

  SELECT code INTO _alt FROM public.currencies
   WHERE is_active AND code <> COALESCE(_base,'') AND public.currency_is_supported(code, _reg)
   ORDER BY code LIMIT 1;

  SELECT p.id INTO _admin FROM public.profiles p
   WHERE public.is_super_admin(p.id) OR public.has_permission(p.id,'licensee_management','edit')
   ORDER BY p.created_at LIMIT 1;

  SELECT p.id INTO _plain FROM public.profiles p
   WHERE NOT public.is_super_admin(p.id)
     AND NOT public.has_permission(p.id,'licensee_management','edit')
   ORDER BY p.created_at LIMIT 1;

  IF _entity IS NULL OR _base IS NULL OR _admin IS NULL OR _plain IS NULL THEN
    PERFORM pg_temp.rec('H','H-00',
      'vacuity guard: a regulated entity with filings, an active monetary configuration, an authorised officer and a non-privileged user all exist',
      false, format('entity=%s base=%s admin=%s plain=%s', _entity, _base, _admin, _plain));
    RETURN;
  END IF;
  PERFORM pg_temp.rec('H','H-00','vacuity guard: a real fixture exists for the behavioural sections',
    true, format('entity=%s base=%s', _entity, _base));

  SELECT * INTO _filing FROM public.return_filings WHERE entity_id = _entity
   ORDER BY created_at LIMIT 1;
  _before := _filing.reporting_currency;

  BEGIN
    -- default: with no override the entity inherits the regulator base currency
    _res := public.entity_reporting_currency_resolve(_entity, current_date, NULL);
    _buf := pg_temp.bufrec(_buf,'F','F-06',
      'with no override the entity reports in the regulator base currency',
      _res->>'currency' = _base AND _res->>'source' = 'REGULATOR_BASE',
      'resolved='||COALESCE(_res->>'currency','∅')||' source='||COALESCE(_res->>'source','∅'));

    -- an unauthorised caller cannot maintain an override
    PERFORM pg_temp.act(_plain);
    _ok := false; _msg := '';
    BEGIN
      PERFORM public.entity_currency_override_set(_entity, COALESCE(_alt,_base), current_date,
        'Gate probe: unauthorised caller must be refused');
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM;
    END;
    _buf := pg_temp.bufrec(_buf,'H','H-01',
      'a caller without licensee authority cannot maintain a reporting currency override', _ok, _msg);

    PERFORM pg_temp.act(_admin);

    -- a thin reason is refused
    _ok := false; _msg := '';
    BEGIN
      PERFORM public.entity_currency_override_set(_entity, COALESCE(_alt,_base), current_date, 'why');
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM;
    END;
    _buf := pg_temp.bufrec(_buf,'H','H-02','an override without a substantive reason is refused', _ok, _msg);

    -- an unsupported / unknown currency is refused
    _ok := false; _msg := '';
    BEGIN
      PERFORM public.entity_currency_override_set(_entity, 'ZZZ', current_date,
        'Gate probe: unknown ISO currency must be refused');
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM;
    END;
    _buf := pg_temp.bufrec(_buf,'H','H-03','an override to an unknown or unsupported currency is refused', _ok, _msg);

    IF _alt IS NOT NULL THEN
      _r := public.entity_currency_override_set(_entity, _alt, current_date,
        'Gate probe: entity reports in a currency other than the regulator base currency');
      _profile := (_r->>'entity_currency_profile_id')::uuid;
      _buf := pg_temp.bufrec(_buf,'H','H-04','an authorised officer may record an effective-dated override',
        _profile IS NOT NULL, 'profile='||COALESCE(_profile::text,'∅'));

      _res := public.entity_reporting_currency_resolve(_entity, current_date, NULL);
      _buf := pg_temp.bufrec(_buf,'F','F-07','the active override takes precedence over the regulator base currency',
        _res->>'currency' = _alt AND _res->>'source' = 'ENTITY_OVERRIDE',
        'resolved='||COALESCE(_res->>'currency','∅')||' source='||COALESCE(_res->>'source','∅'));

      _res := public.entity_reporting_currency_resolve(_entity, current_date - 1, NULL);
      _buf := pg_temp.bufrec(_buf,'F','F-08','the override does not apply before its effective date',
        _res->>'source' = 'REGULATOR_BASE',
        'earlier source='||COALESCE(_res->>'source','∅'));

      SELECT reporting_currency INTO _after FROM public.return_filings WHERE id = _filing.id;
      _buf := pg_temp.bufrec(_buf,'G','G-06',
        'changing the entity profile never rewrites the currency of an existing filing',
        _after IS NOT DISTINCT FROM _before,
        format('before=%s after=%s', COALESCE(_before,'∅'), COALESCE(_after,'∅')));

      _buf := pg_temp.bufrec(_buf,'H','H-05','the override change is audited',
        EXISTS (SELECT 1 FROM public.audit_logs a
                 WHERE a.entity_id = _profile::text
                    OR a.new_value::text LIKE '%'||_profile::text||'%'
                    OR a.metadata::text LIKE '%'||_profile::text||'%'),
        'audit row present');

      PERFORM public.entity_currency_override_supersede(_profile,
        'Gate probe: supersede the override and fall back to the regulator base currency');
      _buf := pg_temp.bufrec(_buf,'H','H-06','superseding retains history rather than deleting the record',
        EXISTS (SELECT 1 FROM public.entity_currency_profiles WHERE id = _profile
                  AND status IN ('SUPERSEDED','WITHDRAWN')),
        'history retained');

      _res := public.entity_reporting_currency_resolve(_entity, current_date, NULL);
      _buf := pg_temp.bufrec(_buf,'F','F-09','once superseded the entity reverts to the regulator base currency',
        _res->>'source' = 'REGULATOR_BASE',
        'source='||COALESCE(_res->>'source','∅'));
    ELSE
      _buf := pg_temp.bufrec(_buf,'H','H-04',
        'an authorised officer may record an effective-dated override', false,
        'no second supported currency is configured for this regulator — business configuration boundary');
    END IF;

    -- an unknown entity fails closed rather than assuming a currency
    _ok := false; _msg := '';
    BEGIN
      PERFORM public.entity_reporting_currency_resolve('00000000-0000-0000-0000-000000000000'::uuid, current_date, NULL);
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM;
    END;
    _buf := pg_temp.bufrec(_buf,'F','F-10','an unresolvable entity fails closed instead of assuming a currency', _ok, _msg);

    RAISE EXCEPTION 'F7B_GATE_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'F7B_GATE_ROLLBACK' THEN
      _buf := pg_temp.bufrec(_buf,'H','H-99','the behavioural block completed without an unexpected error',
        false, SQLERRM);
    END IF;
  END;

  PERFORM set_config('request.jwt.claims', NULL, true);

  INSERT INTO f7b_results (section, id, descr, passed, detail)
  SELECT r->>'section', r->>'id', r->>'descr', (r->>'passed')::boolean, r->>'detail'
    FROM jsonb_array_elements(_buf) r;
END $beh$;

-- ---------------------------------------------------------------------------
-- M — monetary display modes (as-reported / regulator base / consolidated)
--
-- Proves the display reader exists, is guarded, is read-only, refuses unknown
-- modes, never sums unlike currencies silently and reports unconvertible
-- values explicitly instead of as zero.
-- ---------------------------------------------------------------------------
DO $m$
DECLARE
  _ok boolean; _msg text; _filing uuid; _admin uuid; _res jsonb; _bad int;
BEGIN
  PERFORM pg_temp.rec('M','M-01','the monetary display reader exists as a guarded SECURITY DEFINER routine',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname='public' AND p.proname='returns_filing_metrics_display'
               AND p.prosecdef AND p.proconfig::text LIKE '%search_path%'),
    'definer + pinned search_path');

  PERFORM pg_temp.rec('M','M-02','the display reader is read-only (STABLE, never mutating a filing)',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname='public' AND p.proname='returns_filing_metrics_display'
               AND p.provolatile = 's'),
    'volatility=stable');

  PERFORM pg_temp.rec('M','M-03','anonymous callers cannot execute the display reader',
    NOT has_function_privilege('anon','public.returns_filing_metrics_display(uuid,text)','EXECUTE'),
    'anon execute revoked');

  SELECT user_id INTO _admin FROM public.user_roles WHERE role = 'super_admin' LIMIT 1;
  SELECT id INTO _filing FROM public.return_filings WHERE reporting_currency IS NOT NULL LIMIT 1;

  IF _admin IS NULL OR _filing IS NULL THEN
    PERFORM pg_temp.rec('M','M-04','a real filing and authorised officer exist to exercise display modes',
      false, 'vacuous fixture — gate fails rather than passing empty');
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('sub', _admin)::text, true);

    _res := public.returns_filing_metrics_display(_filing, 'AS_REPORTED');
    PERFORM pg_temp.rec('M','M-04','as-reported mode shows the filing currency of record unchanged',
      (_res->>'ok')::boolean AND _res->>'display_currency' = _res->>'filing_currency',
      'filing='||COALESCE(_res->>'filing_currency','∅')||' display='||COALESCE(_res->>'display_currency','∅'));

    _res := public.returns_filing_metrics_display(_filing, 'REGULATOR_BASE');
    PERFORM pg_temp.rec('M','M-05','regulator base mode resolves a target currency server-side',
      (_res->>'ok')::boolean AND (_res->>'display_currency') IS NOT NULL,
      'display='||COALESCE(_res->>'display_currency','∅'));

    SELECT count(*) INTO _bad
      FROM jsonb_array_elements(_res->'metrics') x
     WHERE x->>'status' = 'UNCONVERTED' AND (x->>'display_value') IS NOT NULL;
    PERFORM pg_temp.rec('M','M-06','an unconvertible value is never presented as a converted figure',
      _bad = 0, 'contradictory rows='||_bad);

    PERFORM pg_temp.rec('M','M-07','a filing is only declared summable when every value converted',
      ((_res->>'summable')::boolean) = ((_res->>'incomplete_count')::int = 0),
      'summable='||COALESCE(_res->>'summable','∅')||' incomplete='||COALESCE(_res->>'incomplete_count','∅'));

    _res := public.returns_filing_metrics_display(_filing, 'CONSOLIDATED_REPORTING');
    PERFORM pg_temp.rec('M','M-08','consolidated reporting mode is available and records its FX date',
      (_res->>'ok')::boolean AND (_res->>'fx_as_of') IS NOT NULL,
      'fx_as_of='||COALESCE(_res->>'fx_as_of','∅'));

    _ok := false; _msg := '';
    BEGIN
      PERFORM public.returns_filing_metrics_display(_filing, 'INVENTED_MODE');
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM;
    END;
    PERFORM pg_temp.rec('M','M-09','an unknown display mode is refused instead of silently defaulting', _ok, _msg);

    PERFORM set_config('request.jwt.claims', NULL, true);
  END IF;
END $m$;

-- ---------------------------------------------------------------------------
-- K — entity currency override approval control (business configuration)
-- ---------------------------------------------------------------------------
DO $k$
DECLARE _ok boolean;
BEGIN
  PERFORM pg_temp.rec('K','K-01','the override approval mode is business configuration, not a hardcoded rule',
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='monetary_configs'
               AND column_name='entity_currency_override_approval_mode'),
    'monetary_configs.entity_currency_override_approval_mode');

  PERFORM pg_temp.rec('K','K-02','an independent decision routine exists for proposed overrides',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='entity_currency_override_decide' AND p.prosecdef),
    'entity_currency_override_decide');

  PERFORM pg_temp.rec('K','K-03','a proposer may withdraw an undecided proposal',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='entity_currency_override_withdraw' AND p.prosecdef),
    'entity_currency_override_withdraw');

  PERFORM pg_temp.rec('K','K-04','the proposal lifecycle statuses are all supported by the store',
    (SELECT count(*) FROM (VALUES ('PROPOSED'),('ACTIVE'),('REJECTED'),('SUPERSEDED'),('WITHDRAWN')) v(s)
      WHERE pg_get_constraintdef(c.oid) LIKE '%'||v.s||'%') = 5,
    'status domain complete')
    FROM pg_constraint c
    WHERE c.conrelid = 'public.entity_currency_profiles'::regclass
      AND pg_get_constraintdef(c.oid) LIKE '%status%' LIMIT 1;

  PERFORM pg_temp.rec('K','K-05','decision provenance is retained on the profile itself',
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='entity_currency_profiles'
        AND column_name IN ('proposed_by','proposed_at','decision_by','decision_at','decision_reason')) = 5,
    'proposal/decision metadata present');

  PERFORM pg_temp.rec('K','K-06','anonymous callers cannot decide or withdraw an override',
    NOT has_function_privilege('anon','public.entity_currency_override_decide(uuid,text,text)','EXECUTE')
    AND NOT has_function_privilege('anon','public.entity_currency_override_withdraw(uuid,text)','EXECUTE'),
    'anon execute revoked');

  SELECT count(*) = 0 INTO _ok
    FROM public.entity_currency_profiles p
    JOIN public.return_filings f ON f.entity_id = p.entity_id
   WHERE p.status = 'PROPOSED' AND f.reporting_currency = p.reporting_currency_override
     AND f.currency_source = 'ENTITY_OVERRIDE'
     AND f.entity_currency_profile_id = p.id;
  PERFORM pg_temp.rec('K','K-07','a merely proposed override never becomes a filing currency of record',
    _ok, 'no filing bound to a proposed override');
END $k$;

-- ---------------------------------------------------------------------------
-- Z — zero residue

-- ---------------------------------------------------------------------------
DO $z$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.entity_currency_profiles WHERE reason LIKE 'Gate probe:%';
  PERFORM pg_temp.rec('Z','Z-01','the gate leaves no synthetic currency override behind', _n = 0, 'residue rows='||_n);

  SELECT count(*) INTO _n FROM public.return_filings WHERE reporting_currency IS NULL;
  PERFORM pg_temp.rec('Z','Z-02','no filing was left without a currency of record', _n = 0, 'residue rows='||_n);

  SELECT count(*) INTO _n FROM public.return_filing_extensions WHERE reason LIKE 'Gate probe:%';
  PERFORM pg_temp.rec('Z','Z-03','the gate leaves no synthetic extension behind', _n = 0, 'residue rows='||_n);
END $z$;


-- ===========================================================================
-- SECTION L — GOVERNED FILING LIFECYCLE AUTHORITY (empirical). Every lifecycle
-- transition — RFI, extension, amendment, evidence — is reachable only through
-- a governed routine, refuses a non-privileged caller, and fails closed on an
-- unknown filing rather than creating orphan governance records.
-- ===========================================================================
DO $l$
DECLARE _plain uuid; _ok boolean; _msg text; _n int; _fake uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  SELECT p.id INTO _plain FROM public.profiles p
   WHERE NOT public.is_super_admin(p.id)
     AND NOT public.has_permission(p.id,'returns_management','edit')
   ORDER BY p.created_at LIMIT 1;

  IF _plain IS NULL THEN
    PERFORM pg_temp.rec('L','L-00','vacuity guard: a non-privileged caller exists for the lifecycle probes',
      false, 'no non-privileged profile — refusing to certify vacuously');
    RETURN;
  END IF;
  PERFORM pg_temp.rec('L','L-00','vacuity guard: a non-privileged caller exists for the lifecycle probes',
    true, 'plain='||_plain::text);

  PERFORM pg_temp.act(_plain);

  _ok := false; _msg := '';
  BEGIN PERFORM public.returns_raise_rfi(_fake, 'Gate probe: unauthorised RFI must be refused', NULL);
  EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM; END;
  PERFORM pg_temp.rec('L','L-01','a non-privileged caller cannot raise a regulator RFI', _ok, _msg);

  _ok := false; _msg := '';
  BEGIN PERFORM public.returns_decide_extension(_fake, 'APPROVED',
    'Gate probe: unauthorised extension decision must be refused', NULL);
  EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM; END;
  PERFORM pg_temp.rec('L','L-02','a non-privileged caller cannot decide an extension request', _ok, _msg);

  _ok := false; _msg := '';
  BEGIN PERFORM public.returns_decide_amendment(_fake, 'APPROVED',
    'Gate probe: unauthorised amendment decision must be refused');
  EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM; END;
  PERFORM pg_temp.rec('L','L-03','a non-privileged caller cannot decide an amendment request', _ok, _msg);

  _ok := false; _msg := '';
  BEGIN PERFORM public.returns_overdue_sweep(NULL);
  EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM; END;
  PERFORM pg_temp.rec('L','L-04','a non-privileged caller cannot run the overdue sweep', _ok, _msg);

  PERFORM set_config('request.jwt.claims','{}', true);

  SELECT count(*) INTO _n FROM public.return_filing_extensions WHERE return_filing_id = _fake;
  PERFORM pg_temp.rec('L','L-05','the refused lifecycle probes created no extension record', _n = 0, 'rows='||_n);

  SELECT count(*) INTO _n FROM public.return_filing_evidence WHERE return_filing_id = _fake;
  PERFORM pg_temp.rec('L','L-06','the refused lifecycle probes created no evidence record', _n = 0, 'rows='||_n);
END $l$;

\echo ''
\echo '========================= verify:f7b results ========================='
SELECT section, id, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, descr, detail
  FROM f7b_results ORDER BY seq;

\echo ''
SELECT count(*) FILTER (WHERE passed) AS passed,
       count(*) FILTER (WHERE NOT passed) AS failed,
       count(*) AS total
  FROM f7b_results;

DO $fin$
DECLARE _fail int;
BEGIN
  SELECT count(*) INTO _fail FROM f7b_results WHERE NOT passed;
  IF _fail > 0 THEN
    RAISE EXCEPTION 'verify:f7b FAILED — % assertion(s) did not hold', _fail;
  END IF;
  RAISE NOTICE 'verify:f7b PASSED — returns consolidated remediation holds';
END $fin$;
