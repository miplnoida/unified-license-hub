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

-- ---------------------------------------------------------------------------
-- N — positive lifecycle behaviour, end to end (always rolled back)
--
-- Builds a real gate-owned return definition, applicability rule, obligation,
-- reporting periods and filings and then drives the whole governed lifecycle
-- with real personas: obligation derivation, period generation, filing open,
-- validation refusal, evidence, submission, notification idempotency, RFI
-- round trip, review maker-checker, amendment, extension grant/refusal,
-- overdue idempotency and a mandated-currency snapshot.
-- ---------------------------------------------------------------------------
DO $n$
DECLARE
  _buf jsonb := '[]'::jsonb; r record; _ctx text; _ok boolean; _msg text;
  _entity uuid; _filer uuid; _oth_entity uuid; _oth_filer uuid;
  _cfg uuid; _rev uuid; _chk uuid; _dual uuid;
  _sector uuid; _tpl uuid;
  _def uuid; _def2 uuid; _ob uuid; _ob2 uuid;
  _p uuid[]; _p1 uuid; _p2 uuid; _p3 uuid; _p4 uuid; _p5 uuid; _p6 uuid;
  _res jsonb; _fil uuid; _ver uuid; _fil2 uuid; _ver2 uuid; _fil3 uuid; _ver3 uuid;
  _req uuid; _ext uuid; _ext2 uuid; _ev uuid;
  _n int; _n2 int; _due date; _newdue date; _amend uuid;
  _cur text; _src text; _created int;
BEGIN
  -- ---- personas -----------------------------------------------------------
  FOR r IN SELECT m.entity_id, m.user_id FROM public.entity_user_memberships m
            WHERE m.status='APPROVED' LOOP
    PERFORM pg_temp.act(r.user_id);
    IF public.returns_can_file(r.entity_id) THEN
      IF _entity IS NULL THEN
        _entity := r.entity_id; _filer := r.user_id;
      ELSIF _oth_entity IS NULL AND r.entity_id <> _entity THEN
        _oth_entity := r.entity_id; _oth_filer := r.user_id;
      END IF;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims','{}', true);

  SELECT u.id INTO _cfg FROM auth.users u
   WHERE public.sec_is_internal_user(u.id)
     AND public.has_permission(u.id,'returns_management','manage_config')
     AND public.has_permission(u.id,'returns_management','workflow_action')
   ORDER BY u.id LIMIT 1;

  SELECT u.id INTO _rev FROM auth.users u
   WHERE public.sec_is_internal_user(u.id)
     AND public.has_permission(u.id,'returns_management','review')
   ORDER BY u.id LIMIT 1;

  SELECT u.id INTO _chk FROM auth.users u
   WHERE public.sec_is_internal_user(u.id)
     AND public.has_permission(u.id,'returns_management','approve')
     AND NOT public.has_permission(u.id,'returns_management','create')
   ORDER BY u.id LIMIT 1;

  SELECT u.id INTO _dual FROM auth.users u
   WHERE public.sec_is_internal_user(u.id)
     AND public.has_permission(u.id,'returns_management','create')
     AND public.has_permission(u.id,'returns_management','approve')
     AND u.id <> COALESCE(_chk,'00000000-0000-0000-0000-000000000000'::uuid)
   ORDER BY u.id LIMIT 1;

  SELECT public.sector_effective_id(l.sector_id) INTO _sector
    FROM public.licensees l WHERE l.id = _entity;

  SELECT t.id INTO _tpl FROM public.form_templates t
    JOIN public.form_versions v ON v.template_id = t.id AND v.status = 'published'
   ORDER BY t.id LIMIT 1;

  PERFORM pg_temp.rec('N','N-00',
    'the behavioural lifecycle fixture has a real entity filer, a second entity filer, a configuration officer, a reviewer, an independent approver, a dual-capability internal filer, a sector and a published form template',
    _entity IS NOT NULL AND _filer IS NOT NULL AND _oth_entity IS NOT NULL
      AND _oth_filer IS NOT NULL AND _cfg IS NOT NULL AND _rev IS NOT NULL
      AND _chk IS NOT NULL AND _dual IS NOT NULL AND _sector IS NOT NULL AND _tpl IS NOT NULL,
    format('entity=%s filer=%s other=%s cfg=%s rev=%s chk=%s dual=%s sector=%s template=%s',
      _entity, _filer, _oth_entity, _oth_filer, _cfg, _rev, _chk, _dual, _sector, _tpl));

  IF _entity IS NULL OR _filer IS NULL OR _oth_entity IS NULL OR _cfg IS NULL
     OR _rev IS NULL OR _chk IS NULL OR _dual IS NULL OR _sector IS NULL OR _tpl IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    -- ---- gate-owned definition + applicability rule -----------------------
    INSERT INTO public.return_definitions(
      code, name, description, frequency, due_days_after_period_end,
      requires_declaration, status, is_active, effective_from)
    VALUES ('F7B-GATE-QTR','F7B gate quarterly return','Gate fixture only',
            'QUARTERLY', 30, true, 'ACTIVE', true,
            date_trunc('quarter', CURRENT_DATE - interval '30 months')::date)
    RETURNING id INTO _def;

    INSERT INTO public.return_definition_forms(
      return_definition_id, form_template_id, sequence, is_required, effective_from)
    VALUES (_def, _tpl, 1, true, date_trunc('quarter', CURRENT_DATE - interval '30 months')::date);

    INSERT INTO public.reporting_obligation_rules(
      return_definition_id, code, name, sector_id, requires_active_license,
      effective_from, is_active)
    VALUES (_def, 'F7B-GATE-RULE','F7B gate applicability rule', _sector, false,
            date_trunc('quarter', CURRENT_DATE - interval '30 months')::date, true);

    -- ---- obligation derivation -------------------------------------------
    PERFORM pg_temp.act(_cfg);
    _res := public.returns_derive_entity_obligations(_entity);
    SELECT o.id INTO _ob FROM public.entity_reporting_obligations o
     WHERE o.entity_id = _entity AND o.return_definition_id = _def AND o.status = 'ACTIVE';
    _buf := pg_temp.bufrec(_buf,'N','N-01',
      'an applicable entity acquires the obligation from the published applicability rule',
      _ob IS NOT NULL AND (_res->>'created')::int >= 1,
      'derive='||_res::text||' obligation='||coalesce(_ob::text,'∅'));

    _res := public.returns_derive_entity_obligations(_entity);
    SELECT count(*) INTO _n FROM public.entity_reporting_obligations o
     WHERE o.entity_id = _entity AND o.return_definition_id = _def AND o.status = 'ACTIVE';
    _buf := pg_temp.bufrec(_buf,'N','N-02',
      'repeating derivation never duplicates a live obligation',
      _n = 1, 'active obligations='||_n||' second derive='||_res::text);

    PERFORM public.returns_derive_entity_obligations(_oth_entity);
    SELECT count(*) INTO _n FROM public.entity_reporting_obligations o
     WHERE o.entity_id = _oth_entity AND o.return_definition_id = _def;
    _buf := pg_temp.bufrec(_buf,'N','N-03',
      'an entity outside the rule scope never acquires the obligation',
      _n = 0 OR public.sector_effective_id((SELECT sector_id FROM public.licensees WHERE id=_oth_entity)) = _sector,
      'other-entity obligations='||_n);

    -- ---- period generation ------------------------------------------------
    _res := public.returns_generate_periods(_ob, CURRENT_DATE);
    _created := (_res->>'created')::int;
    SELECT count(*) INTO _n FROM public.reporting_periods p
     WHERE p.entity_reporting_obligation_id = _ob
       AND p.due_date <> (p.period_end + 30);
    _buf := pg_temp.bufrec(_buf,'N','N-04',
      'calendar periods are generated with the configured deadline arithmetic (period end + due days)',
      _created >= 5 AND _n = 0, 'created='||_created||' deadline deviations='||_n);

    _res := public.returns_generate_periods(_ob, CURRENT_DATE);
    _buf := pg_temp.bufrec(_buf,'N','N-05',
      'regenerating periods is idempotent and creates no duplicate period',
      (_res->>'created')::int = 0, 'second run='||_res::text);

    SELECT array_agg(p.id ORDER BY p.period_start) INTO _p
      FROM public.reporting_periods p
     WHERE p.entity_reporting_obligation_id = _ob AND p.status = 'OPEN';
    _p1 := _p[1]; _p2 := _p[2]; _p3 := _p[3]; _p4 := _p[4]; _p5 := _p[5];

    -- ---- filing open ------------------------------------------------------
    PERFORM pg_temp.act(_filer);
    _res := public.returns_open_filing(_p1);
    _fil := (_res->>'filing_id')::uuid; _ver := (_res->>'version_id')::uuid;
    _buf := pg_temp.bufrec(_buf,'N','N-06',
      'an authorised entity filer can open the filing for an open period',
      _fil IS NOT NULL AND _ver IS NOT NULL, 'open='||_res::text);

    _res := public.returns_open_filing(_p1);
    SELECT count(*) INTO _n FROM public.return_filings WHERE reporting_period_id = _p1;
    SELECT count(*) INTO _n2 FROM public.return_filing_versions WHERE return_filing_id = _fil;
    _buf := pg_temp.bufrec(_buf,'N','N-07',
      're-opening the same period returns the same filing and draft version instead of creating a second one',
      (_res->>'filing_id')::uuid = _fil AND (_res->>'version_id')::uuid = _ver
        AND _n = 1 AND _n2 = 1, 'filings='||_n||' versions='||_n2);

    SELECT f.reporting_currency, f.currency_source INTO _cur, _src
      FROM public.return_filings f WHERE f.id = _fil;
    _buf := pg_temp.bufrec(_buf,'N','N-08',
      'opening a filing snapshots its authoritative reporting currency and provenance',
      _cur IS NOT NULL AND _src IS NOT NULL, 'currency='||coalesce(_cur,'∅')||' source='||coalesce(_src,'∅'));

    _ok := false; _msg := '';
    PERFORM pg_temp.act(_oth_filer);
    BEGIN PERFORM public.returns_open_filing(_p2);
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM; END;
    _buf := pg_temp.bufrec(_buf,'N','N-09',
      'a filer of another entity cannot open this entity''s return',
      _ok, _msg);

    -- ---- validation refuses an incomplete return --------------------------
    PERFORM pg_temp.act(_filer);
    _res := public.returns_submit_filing(_ver, true);
    SELECT count(*) INTO _n FROM public.return_filing_validation_results
     WHERE return_filing_version_id = _ver AND is_blocking
       AND rule_code = 'REQUIRED_FORM_INCOMPLETE';
    _buf := pg_temp.bufrec(_buf,'N','N-10',
      'an incomplete return cannot be submitted and the blocking validation is persisted as evidence',
      (_res->>'submitted')::boolean IS FALSE AND _n >= 1,
      'submit='||_res::text||' blocking rows='||_n);

    SELECT v.status INTO _msg FROM public.return_filing_versions v WHERE v.id = _ver;
    _buf := pg_temp.bufrec(_buf,'N','N-11',
      'a refused submission leaves the version in draft and never marks it immutable',
      _msg = 'DRAFT' AND NOT (SELECT is_immutable FROM public.return_filing_versions WHERE id=_ver),
      'version status='||coalesce(_msg,'∅'));

    -- ---- evidence while open ---------------------------------------------
    _ev := public.returns_attach_evidence(_ver,'F7B gate evidence','f7b-gate/evidence.pdf',
             'application/pdf', 1024, 'Gate fixture evidence');
    _buf := pg_temp.bufrec(_buf,'N','N-12',
      'an entity filer can attach evidence to an open version, bound to the filing, version and entity',
      EXISTS (SELECT 1 FROM public.return_filing_evidence e
               WHERE e.id = _ev AND e.return_filing_id = _fil
                 AND e.return_filing_version_id = _ver AND e.entity_id = _entity
                 AND e.uploaded_by = _filer), 'evidence='||coalesce(_ev::text,'∅'));

    PERFORM public.returns_withdraw_evidence(_ev,'Gate fixture withdrawal for evidence lifecycle proof');
    _buf := pg_temp.bufrec(_buf,'N','N-13',
      'withdrawing evidence is a reason-bearing, attributed soft withdrawal rather than a delete',
      EXISTS (SELECT 1 FROM public.return_filing_evidence e
               WHERE e.id = _ev AND e.withdrawn_at IS NOT NULL AND e.withdrawn_by = _filer
                 AND length(coalesce(e.withdrawn_reason,'')) >= 5), 'evidence='||_ev::text);

    -- ---- complete the required form and submit ---------------------------
    FOR r IN SELECT q.id, q.form_template_id, q.form_version_id
               FROM public.return_filing_form_requirements q
              WHERE q.return_filing_version_id = _ver LOOP
      PERFORM set_config('request.jwt.claims','{}', true);
      INSERT INTO public.form_responses(template_id, version_id, user_id, response_data, status)
      VALUES (r.form_template_id,
              COALESCE(r.form_version_id,
                (SELECT v.id FROM public.form_versions v
                  WHERE v.template_id = r.form_template_id AND v.status='published'
                  ORDER BY v.created_at DESC LIMIT 1)),
              _filer, '{"f7b_gate":true}'::jsonb, 'submitted')
      RETURNING id INTO _amend;
      PERFORM pg_temp.act(_filer);
      PERFORM public.returns_attach_form_response(r.id, _amend, 'COMPLETED');
    END LOOP;

    _res := public.returns_submit_filing(_ver, true);
    _buf := pg_temp.bufrec(_buf,'N','N-14',
      'a complete, declared return submits successfully through the governed RPC',
      (_res->>'submitted')::boolean IS TRUE, 'submit='||_res::text);

    _buf := pg_temp.bufrec(_buf,'N','N-15',
      'a submitted version becomes immutable and records who submitted it and when',
      EXISTS (SELECT 1 FROM public.return_filing_versions v
               WHERE v.id = _ver AND v.status='SUBMITTED' AND v.is_immutable
                 AND v.submitted_by = _filer AND v.submitted_at IS NOT NULL)
      AND EXISTS (SELECT 1 FROM public.return_filings f
                   WHERE f.id=_fil AND f.status='SUBMITTED' AND f.submitted_at IS NOT NULL),
      'version/filing submission state');

    SELECT count(*) INTO _n FROM public.notification_event_queue q
     WHERE q.entity_type='return_filing' AND q.entity_id=_fil AND q.event_key='return.submitted';
    _buf := pg_temp.bufrec(_buf,'N','N-16',
      'submission emits exactly one canonical submitted notification for the version',
      _n = 1, 'return.submitted rows='||_n);

    _ok := false; _msg := '';
    BEGIN PERFORM public.returns_submit_filing(_ver, true);
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM; END;
    SELECT count(*) INTO _n2 FROM public.notification_event_queue q
     WHERE q.entity_type='return_filing' AND q.entity_id=_fil AND q.event_key='return.submitted';
    _buf := pg_temp.bufrec(_buf,'N','N-17',
      'resubmitting the same version is refused and emits no duplicate notification',
      _ok AND _n2 = 1, _msg||' | rows='||_n2);

    _ok := false; _msg := '';
    BEGIN PERFORM public.returns_attach_evidence(_ver,'Late evidence','f7b-gate/late.pdf');
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM; END;
    _buf := pg_temp.bufrec(_buf,'N','N-18',
      'the entity cannot alter a submitted version by attaching further evidence to it',
      _ok, _msg);

    -- ---- RFI round trip ---------------------------------------------------
    PERFORM pg_temp.act(_rev);
    PERFORM public.returns_raise_rfi(_ver,'Gate fixture: please clarify the reported balances.');
    SELECT q.id INTO _req FROM public.return_filing_requests q
     WHERE q.return_filing_id = _fil AND q.request_kind='RFI' ORDER BY q.created_at DESC LIMIT 1;
    SELECT count(*) INTO _n FROM public.notification_event_queue q
     WHERE q.entity_type='return_filing' AND q.entity_id=_fil AND q.event_key='return.rfi_raised';
    _buf := pg_temp.bufrec(_buf,'N','N-19',
      'a reviewer can raise an RFI on a submitted return, and the entity is notified once',
      _req IS NOT NULL AND _n = 1, 'request='||coalesce(_req::text,'∅')||' notifications='||_n);

    _ok := false; _msg := '';
    PERFORM pg_temp.act(_oth_filer);
    BEGIN PERFORM public.returns_respond_to_request(_req,'Gate probe: an unrelated entity must not respond.');
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM; END;
    _buf := pg_temp.bufrec(_buf,'N','N-20',
      'only the filing entity may answer its own RFI',
      _ok AND (SELECT status FROM public.return_filing_requests WHERE id=_req) = 'OPEN', _msg);

    PERFORM pg_temp.act(_filer);
    PERFORM public.returns_respond_to_request(_req,'Gate fixture: the reported balances are confirmed as filed.');
    _buf := pg_temp.bufrec(_buf,'N','N-21',
      'the entity response closes the RFI with attribution and timestamp, preserving the original request',
      EXISTS (SELECT 1 FROM public.return_filing_requests q
               WHERE q.id=_req AND q.status='RESPONDED' AND q.responded_by=_filer
                 AND q.responded_at IS NOT NULL AND q.created_by=_rev
                 AND length(coalesce(q.response_text,''))>=10), 'request='||_req::text);

    -- ---- review maker-checker --------------------------------------------
    PERFORM pg_temp.act(_rev);
    PERFORM public.returns_review_filing(_ver,'START_REVIEW', NULL);
    _buf := pg_temp.bufrec(_buf,'N','N-22',
      'a reviewer can take a submitted return under review',
      (SELECT status FROM public.return_filing_versions WHERE id=_ver) = 'UNDER_REVIEW',
      'version status='||(SELECT status FROM public.return_filing_versions WHERE id=_ver));

    PERFORM pg_temp.act(_chk);
    PERFORM public.returns_review_filing(_ver,'ACCEPT','Gate fixture: the return is accepted as filed.');
    _buf := pg_temp.bufrec(_buf,'N','N-23',
      'an independent approver can accept the return, which records the acceptance and seals the version',
      EXISTS (SELECT 1 FROM public.return_filing_versions v
               WHERE v.id=_ver AND v.status='ACCEPTED' AND v.accepted_by=_chk
                 AND v.accepted_at IS NOT NULL AND v.is_immutable)
      AND (SELECT status FROM public.return_filings WHERE id=_fil) = 'ACCEPTED',
      'acceptance state');

    -- ---- amendment -------------------------------------------------------
    PERFORM pg_temp.act(_filer);
    _amend := public.returns_request_amendment(_fil,'Gate fixture: a corrected figure must be refiled.');
    _buf := pg_temp.bufrec(_buf,'N','N-24',
      'the entity can request an amendment to an accepted return',
      EXISTS (SELECT 1 FROM public.return_filing_requests q
               WHERE q.id=_amend AND q.request_kind='AMENDMENT' AND q.status='OPEN'
                 AND q.created_by=_filer), 'amendment='||coalesce(_amend::text,'∅'));

    PERFORM pg_temp.act(_chk);
    _res := public.returns_decide_amendment(_amend,'APPROVE','Gate fixture: amendment approved for refiling.');
    _buf := pg_temp.bufrec(_buf,'N','N-25',
      'approving an amendment opens a new draft version that supersedes the accepted one and never rewrites it',
      EXISTS (SELECT 1 FROM public.return_filing_versions v
               WHERE v.id = (_res->>'new_version_id')::uuid AND v.status='DRAFT'
                 AND v.version_number = 2 AND v.supersedes_version_id = _ver
                 AND NOT v.is_immutable)
      AND (SELECT status FROM public.return_filing_versions WHERE id=_ver) = 'ACCEPTED',
      'amendment decision='||_res::text);

    -- ---- extensions ------------------------------------------------------
    PERFORM pg_temp.act(_filer);
    SELECT p.due_date INTO _due FROM public.reporting_periods p WHERE p.id = _p2;
    _ext := public.returns_request_extension(_p2, _due + 30,
              'Gate fixture: additional time is required to finalise the return.');
    PERFORM pg_temp.act(_chk);
    _res := public.returns_decide_extension(_ext,'GRANT','Gate fixture: extension granted on merit.', NULL);
    SELECT p.due_date INTO _newdue FROM public.reporting_periods p WHERE p.id = _p2;
    _buf := pg_temp.bufrec(_buf,'N','N-26',
      'an independent approver can grant an extension, which moves the effective deadline for that period',
      EXISTS (SELECT 1 FROM public.return_filing_extensions x
               WHERE x.id=_ext AND x.status='GRANTED' AND x.granted_due_date = _due + 30
                 AND x.decided_by=_chk AND x.requested_by=_filer
                 AND length(coalesce(x.decision_reason,''))>=10)
      AND _newdue = _due + 30, 'due '||_due||' -> '||_newdue);

    PERFORM pg_temp.act(_filer);
    SELECT p.due_date INTO _due FROM public.reporting_periods p WHERE p.id = _p3;
    _ext2 := public.returns_request_extension(_p3, _due + 45,
               'Gate fixture: a second extension request for the refusal path.');
    PERFORM pg_temp.act(_chk);
    PERFORM public.returns_decide_extension(_ext2,'REFUSE','Gate fixture: extension refused, deadline stands.', NULL);
    SELECT p.due_date INTO _newdue FROM public.reporting_periods p WHERE p.id = _p3;
    _buf := pg_temp.bufrec(_buf,'N','N-27',
      'a refused extension is recorded with its reason and leaves the original deadline untouched',
      EXISTS (SELECT 1 FROM public.return_filing_extensions x
               WHERE x.id=_ext2 AND x.status='REFUSED' AND x.granted_due_date IS NULL
                 AND x.decided_by=_chk) AND _newdue = _due, 'due unchanged='||_newdue);

    _ok := false; _msg := '';
    PERFORM pg_temp.act(_filer);
    BEGIN PERFORM public.returns_decide_extension(_ext2,'GRANT','Gate probe: the requester cannot self-grant.', NULL);
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM; END;
    _buf := pg_temp.bufrec(_buf,'N','N-28',
      'the extension requester can never decide their own request',
      _ok, _msg);

    -- ---- overdue detection ----------------------------------------------
    PERFORM pg_temp.act(_cfg);
    PERFORM public.returns_overdue_sweep(CURRENT_DATE);
    SELECT count(*) INTO _n FROM public.return_overdue_events e
     WHERE e.reporting_period_id = _p4 AND e.as_of_date = CURRENT_DATE;
    PERFORM public.returns_overdue_sweep(CURRENT_DATE);
    SELECT count(*) INTO _n2 FROM public.return_overdue_events e
     WHERE e.reporting_period_id = _p4 AND e.as_of_date = CURRENT_DATE;
    _buf := pg_temp.bufrec(_buf,'N','N-29',
      'the overdue sweep records a late period exactly once per as-of date, however often it runs',
      _n = 1 AND _n2 = 1, 'first='||_n||' second='||_n2);

    _buf := pg_temp.bufrec(_buf,'N','N-30',
      'an overdue event names the effective deadline, days late and the F6 late-fee owner rather than charging a fee itself',
      EXISTS (SELECT 1 FROM public.return_overdue_events e
               JOIN public.reporting_periods p ON p.id = e.reporting_period_id
               WHERE e.reporting_period_id = _p4 AND e.as_of_date = CURRENT_DATE
                 AND e.effective_due_date = p.due_date
                 AND e.days_late = (CURRENT_DATE - p.due_date)
                 AND e.late_fee_owner IS NOT NULL),
      'overdue event content');

    SELECT count(*) INTO _n FROM public.return_overdue_events e
     WHERE e.reporting_period_id = _p1;
    _buf := pg_temp.bufrec(_buf,'N','N-31',
      'a period whose return has been submitted and accepted is never marked overdue',
      _n = 0, 'events for filed period='||_n);

    -- ---- submitter cannot decide (real maker-checker) --------------------
    PERFORM pg_temp.act(_dual);
    _res := public.returns_open_filing(_p5);
    _fil2 := (_res->>'filing_id')::uuid; _ver2 := (_res->>'version_id')::uuid;
    FOR r IN SELECT q.id, q.form_template_id, q.form_version_id
               FROM public.return_filing_form_requirements q
              WHERE q.return_filing_version_id = _ver2 LOOP
      PERFORM set_config('request.jwt.claims','{}', true);
      INSERT INTO public.form_responses(template_id, version_id, user_id, response_data, status)
      VALUES (r.form_template_id,
              COALESCE(r.form_version_id,
                (SELECT v.id FROM public.form_versions v
                  WHERE v.template_id=r.form_template_id AND v.status='published'
                  ORDER BY v.created_at DESC LIMIT 1)),
              _dual, '{"f7b_gate":true}'::jsonb, 'submitted')
      RETURNING id INTO _amend;
      PERFORM pg_temp.act(_dual);
      PERFORM public.returns_attach_form_response(r.id, _amend, 'COMPLETED');
    END LOOP;
    _res := public.returns_submit_filing(_ver2, true);

    _ok := false; _msg := '';
    BEGIN PERFORM public.returns_review_filing(_ver2,'ACCEPT','Gate probe: the submitter must not accept.');
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM; END;
    _buf := pg_temp.bufrec(_buf,'N','N-32',
      'an internal officer who holds approval rights still cannot decide a return they submitted themselves',
      (_res->>'submitted')::boolean IS TRUE AND _ok
        AND (SELECT status FROM public.return_filing_versions WHERE id=_ver2) = 'SUBMITTED', _msg);

    PERFORM pg_temp.act(_chk);
    PERFORM public.returns_review_filing(_ver2,'ACCEPT','Gate fixture: independently accepted by a second officer.');
    _buf := pg_temp.bufrec(_buf,'N','N-33',
      'the same return is accepted once a genuinely independent approver decides it',
      (SELECT status FROM public.return_filing_versions WHERE id=_ver2) = 'ACCEPTED'
        AND (SELECT accepted_by FROM public.return_filing_versions WHERE id=_ver2) = _chk,
      'independent acceptance');

    -- ---- mandated currency snapshot --------------------------------------
    PERFORM set_config('request.jwt.claims','{}', true);
    INSERT INTO public.return_definitions(
      code, name, frequency, due_days_after_period_end, requires_declaration,
      status, is_active, effective_from, mandatory_currency_code)
    VALUES ('F7B-GATE-FX','F7B gate mandated-currency return','ANNUAL', 30, true,
            'ACTIVE', true, date_trunc('year', CURRENT_DATE - interval '18 months')::date, 'USD')
    RETURNING id INTO _def2;

    INSERT INTO public.reporting_obligation_rules(
      return_definition_id, code, name, sector_id, requires_active_license, effective_from, is_active)
    VALUES (_def2,'F7B-GATE-FX-RULE','F7B gate mandated-currency rule', _sector, false,
            date_trunc('year', CURRENT_DATE - interval '18 months')::date, true);

    PERFORM pg_temp.act(_cfg);
    PERFORM public.returns_derive_entity_obligations(_entity);
    SELECT o.id INTO _ob2 FROM public.entity_reporting_obligations o
     WHERE o.entity_id=_entity AND o.return_definition_id=_def2 AND o.status='ACTIVE';
    PERFORM public.returns_generate_periods(_ob2, CURRENT_DATE);
    SELECT p.id INTO _p6 FROM public.reporting_periods p
     WHERE p.entity_reporting_obligation_id=_ob2 AND p.status='OPEN'
     ORDER BY p.period_start LIMIT 1;

    PERFORM pg_temp.act(_filer);
    _res := public.returns_open_filing(_p6);
    _fil3 := (_res->>'filing_id')::uuid;
    SELECT f.reporting_currency, f.currency_source INTO _cur, _src
      FROM public.return_filings f WHERE f.id=_fil3;
    _buf := pg_temp.bufrec(_buf,'N','N-34',
      'a return definition that mandates a currency overrides the entity currency in the filing snapshot, with the mandate recorded as the provenance',
      _cur = 'USD' AND _src = 'RETURN_DEFINITION',
      'currency='||coalesce(_cur,'∅')||' source='||coalesce(_src,'∅'));

    RAISE EXCEPTION 'F7B_LIFECYCLE_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'F7B_LIFECYCLE_ROLLBACK' THEN
      GET STACKED DIAGNOSTICS _ctx = PG_EXCEPTION_CONTEXT;
      _buf := pg_temp.bufrec(_buf,'N','N-ERR','the positive lifecycle fixture ran to completion',
        false, SQLSTATE||': '||left(SQLERRM,200)||' | '||left(coalesce(_ctx,''),400));
    END IF;
  END;

  PERFORM set_config('request.jwt.claims','{}', true);

  FOR r IN SELECT * FROM jsonb_array_elements(_buf) e LOOP
    PERFORM pg_temp.rec(r.value->>'section', r.value->>'id', r.value->>'descr',
      (r.value->>'passed')::boolean, r.value->>'detail');
  END LOOP;
END $n$;

-- ---------------------------------------------------------------------------
-- N-Z — the lifecycle fixture left nothing behind
-- ---------------------------------------------------------------------------
DO $nz$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.return_definitions WHERE code LIKE 'F7B-GATE-%';
  PERFORM pg_temp.rec('N','N-90','the gate-owned return definitions were rolled back', _n = 0, 'rows='||_n);

  SELECT count(*) INTO _n FROM public.reporting_obligation_rules WHERE code LIKE 'F7B-GATE-%';
  PERFORM pg_temp.rec('N','N-91','the gate-owned applicability rules were rolled back', _n = 0, 'rows='||_n);

  SELECT count(*) INTO _n FROM public.return_filing_evidence WHERE storage_path LIKE 'f7b-gate/%';
  PERFORM pg_temp.rec('N','N-92','the gate-owned evidence rows were rolled back', _n = 0, 'rows='||_n);

  SELECT count(*) INTO _n FROM public.form_responses WHERE response_data ? 'f7b_gate';
  PERFORM pg_temp.rec('N','N-93','the gate-owned form responses were rolled back', _n = 0, 'rows='||_n);
END $nz$;

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
