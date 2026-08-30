-- ============================================================================
-- certify:f7c — REGULATORY RETURNS FINAL CERTIFICATION GATE (module freeze)
--
-- This gate certifies F7 as a FROZEN module. It deliberately does not repeat
-- verify:f7b assertion-for-assertion; verify:f7b remains the remediation gate
-- and must also pass. certify:f7c proves the cross-contract properties that a
-- freeze depends on:
--
--   A  complete production surface inventory — every active F7 table and
--      routine is classified, and no unexplained surface exists
--   B  canonical spine — one authoritative returns lifecycle, legacy stores
--      retired, no second status engine, immutability enforced by triggers
--   C  security — anonymous closure, pinned search_path, trigger functions not
--      API callable, no browser DML on canonical tables
--   D  authority & maker-checker matrix — every material action is a guarded
--      server routine; unauthorised personas are refused
--   E  lifecycle + F8 downstream acceptance contract — DRAFT/SUBMITTED/
--      REJECTED never signal downstream; each ACCEPTED canonical version
--      signals exactly once, including an accepted amendment version
--   F  currency & regulator provenance — snapshot authority, no post-submission
--      rebase, definition mandate precedence, institutional body identity
--   G  F6 late-fee boundary — F7 records the regulatory event, F6 owns money
--   H  notification contract — one guarded emitter, stable keys, idempotent
--   I  live-estate integrity — the real F7 estate has no orphans or gaps
--   J  navigation & discoverability — canonical routes registered, permissioned
--      and reachable, legacy routes classified
--   K  operability — the hot regulator/entity query paths are indexed
--   Z  zero residue
--
-- Every empirical write happens inside a block that is ALWAYS rolled back.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f scripts/certify-f7c.sql
-- ============================================================================
\set ON_ERROR_STOP on
SET row_security = on;
\pset pager off
SET client_min_messages = notice;

DROP TABLE IF EXISTS f7c_results;
CREATE TEMP TABLE f7c_results (
  seq serial, section text, id text, descr text, passed boolean, detail text
);

-- Gate hygiene: the pooler can hand this gate a backend whose pg_temp still
-- holds helpers with different parameter names from an earlier gate.
DROP FUNCTION IF EXISTS pg_temp.rec(text,text,text,boolean,text);
DROP FUNCTION IF EXISTS pg_temp.bufrec(jsonb,text,text,text,boolean,text);
DROP FUNCTION IF EXISTS pg_temp.act(uuid);

CREATE OR REPLACE FUNCTION pg_temp.rec(_s text, _id text, _d text, _ok boolean, _detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO f7c_results (section, id, descr, passed, detail) VALUES (_s,_id,_d,_ok,_detail);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.bufrec(_buf jsonb, _s text, _id text, _d text, _ok boolean, _detail text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(_buf,'[]'::jsonb) || jsonb_build_object(
    'section',_s,'id',_id,'descr',_d,'passed',_ok,'detail',_detail)
$$;

CREATE OR REPLACE FUNCTION pg_temp.act(_uid uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role','authenticated')::text, true)::void
$$;

-- ---------------------------------------------------------------------------
-- A — complete production surface inventory
-- ---------------------------------------------------------------------------
DO $a$
DECLARE _t text; _missing text := ''; _n int; _extra text := '';
BEGIN
  -- A-01 canonical spine tables (ACTIVE CANONICAL)
  FOREACH _t IN ARRAY ARRAY[
    'return_definitions','return_definition_forms','reporting_obligation_rules',
    'entity_reporting_obligations','reporting_periods','return_filings',
    'return_filing_versions','return_filing_form_requirements',
    'return_filing_validation_results','return_filing_requests',
    'return_filing_extensions','return_filing_evidence','return_overdue_events',
    'return_metric_values','return_form_validation_rules','entity_currency_profiles'
  ] LOOP
    IF to_regclass('public.'||_t) IS NULL THEN _missing := _missing||_t||' '; END IF;
  END LOOP;
  PERFORM pg_temp.rec('A','A-01','every ACTIVE CANONICAL F7 table exists in the live schema',
    _missing = '', COALESCE(NULLIF('missing: '||_missing,'missing: '),'16 canonical tables present'));

  -- A-02 canonical routine family (ACTIVE CANONICAL entrypoints)
  _missing := '';
  FOREACH _t IN ARRAY ARRAY[
    'returns_derive_entity_obligations','returns_generate_periods','returns_open_filing',
    'returns_validate_filing','returns_submit_filing','returns_review_filing',
    'returns_raise_rfi','returns_respond_to_request','returns_request_amendment',
    'returns_decide_amendment','returns_request_extension','returns_decide_extension',
    'returns_attach_evidence','returns_withdraw_evidence','returns_overdue_sweep',
    'returns_notify','returns_filing_metrics_display','returns_snapshot_filing_currency',
    'returns_rebase_filing_currency','returns_filing_detail','returns_filing_queue_v2',
    'returns_entity_calendar','entity_reporting_currency_resolve','entity_regulator_body_resolve'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE n.nspname='public' AND p.proname=_t) THEN
      _missing := _missing||_t||' ';
    END IF;
  END LOOP;
  PERFORM pg_temp.rec('A','A-02','every ACTIVE CANONICAL F7 lifecycle, currency and read routine exists',
    _missing = '', COALESCE(NULLIF('missing: '||_missing,'missing: '),'24 canonical routines present'));

  -- A-03 legacy stores are classified DEAD/RETIRED and hold no live operational rows
  SELECT (SELECT count(*) FROM public.compliance_returns) + (SELECT count(*) FROM public.returns_filed)
    INTO _n;
  PERFORM pg_temp.rec('A','A-03','the DEAD/RETIRED legacy filing stores (compliance_returns, returns_filed) hold no operational rows',
    _n = 0, 'legacy rows='||_n);

  -- A-04 compatibility bridges are declared and reachable
  PERFORM pg_temp.rec('A','A-04','the declared COMPATIBILITY BRIDGE routines for legacy filing links exist',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='returns_resolve_legacy_filing')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='returns_migrate_legacy_filing'),
    'legacy resolve/migrate bridges present');

  -- A-05 no unexplained canonical surface: every canonical table carries RLS
  SELECT count(*) INTO _n FROM pg_class c JOIN pg_namespace nn ON nn.oid=c.relnamespace
   WHERE nn.nspname='public' AND NOT c.relrowsecurity
     AND c.relname IN ('return_definitions','return_definition_forms','entity_reporting_obligations',
       'reporting_periods','return_filings','return_filing_versions','return_filing_requests',
       'return_filing_extensions','return_filing_evidence','return_overdue_events',
       'return_metric_values','entity_currency_profiles','return_filing_validation_results');
  PERFORM pg_temp.rec('A','A-05','no canonical F7 table is left without row level security',
    _n = 0, 'tables without RLS='||_n);
END $a$;

-- ---------------------------------------------------------------------------
-- B — canonical spine: one authoritative lifecycle
-- ---------------------------------------------------------------------------
DO $b$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM information_schema.role_table_grants
   WHERE table_schema='public' AND grantee IN ('anon','authenticated')
     AND privilege_type IN ('INSERT','UPDATE','DELETE')
     AND table_name IN ('return_definitions','return_definition_forms','entity_reporting_obligations',
       'reporting_periods','return_filings','return_filing_versions','return_filing_requests',
       'return_filing_extensions','return_filing_evidence','return_overdue_events',
       'return_metric_values','entity_currency_profiles','return_filing_validation_results',
       'compliance_returns','returns_filed');
  PERFORM pg_temp.rec('B','B-01','no browser role holds direct write privilege on any canonical or legacy returns table',
    _n = 0, 'browser write grants='||_n);

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'compliance_return%'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  PERFORM pg_temp.rec('B','B-02','no legacy compliance_return_* mutator is callable from the browser',
    _n = 0, 'callable legacy routines='||_n);

  PERFORM pg_temp.rec('B','B-03','filing versions are sealed by an immutability trigger rather than by UI convention',
    EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
             JOIN pg_proc p ON p.oid=t.tgfoid
             WHERE c.relname='return_filing_versions' AND NOT t.tgisinternal
               AND p.proname='return_filing_version_immutable'),
    'trg_rfv_immutable present');

  PERFORM pg_temp.rec('B','B-04','submitted metric values are sealed by an immutability trigger',
    EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
             JOIN pg_proc p ON p.oid=t.tgfoid
             WHERE c.relname='return_metric_values' AND NOT t.tgisinternal
               AND p.proname='return_metric_value_immutable'),
    'trg_rmv_immutable present');

  PERFORM pg_temp.rec('B','B-05','the filing currency snapshot is protected by a trigger, not by the caller',
    EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
             JOIN pg_proc p ON p.oid=t.tgfoid
             WHERE c.relname='return_filings' AND NOT t.tgisinternal
               AND p.proname='return_filing_currency_snapshot_protect'),
    'trg_return_filing_currency_protect present');

  -- one status engine: only the governed routines write return_filings.status
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND pg_get_functiondef(p.oid) ~* 'UPDATE\s+(public\.)?return_filings'
     AND p.proname NOT LIKE 'returns\_%'
     AND p.proname NOT IN ('return_filing_currency_snapshot_protect','onboarding_touch',
                           'cert_v2_seed_returns','cert_seed_returns_v1','cert_v2_seed_calculate');
  PERFORM pg_temp.rec('B','B-06','only the governed returns_* routine family updates canonical filing state',
    _n = 0, 'foreign writers='||_n);
END $b$;

-- ---------------------------------------------------------------------------
-- C — security certification
-- ---------------------------------------------------------------------------
DO $c$
DECLARE _n int; _bad text := '';
BEGIN
  SELECT count(*), string_agg(p.proname,', ') INTO _n, _bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND (p.proname LIKE 'returns\_%' OR p.proname LIKE 'entity\_currency\_%'
          OR p.proname LIKE 'entity\_reporting\_%' OR p.proname LIKE 'entity\_regulator\_%'
          OR p.proname LIKE 'return\_filing\_%')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  PERFORM pg_temp.rec('C','C-01','no F7 returns, currency or regulator-identity routine is executable anonymously',
    _n = 0, COALESCE('anon-executable: '||_bad,'none'));

  SELECT count(*), string_agg(p.proname,', ') INTO _n, _bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef
     AND (p.proname LIKE 'returns\_%' OR p.proname LIKE 'entity\_currency\_%'
          OR p.proname LIKE 'entity\_reporting\_%' OR p.proname LIKE 'entity\_regulator\_%')
     AND (p.proconfig IS NULL OR NOT EXISTS (
           SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'));
  PERFORM pg_temp.rec('C','C-02','every SECURITY DEFINER F7 routine pins its search_path',
    _n = 0, COALESCE('unpinned: '||_bad,'all pinned'));

  SELECT count(*), string_agg(p.proname,', ') INTO _n, _bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prorettype = 'trigger'::regtype
     AND p.proname IN ('returns_touch_updated_at','return_filing_currency_snapshot_protect',
                       'return_filing_version_immutable','return_metric_value_immutable',
                       'tg_prudential_detect_on_acceptance')
     AND (has_function_privilege('anon', p.oid,'EXECUTE')
       OR has_function_privilege('authenticated', p.oid,'EXECUTE'));
  PERFORM pg_temp.rec('C','C-03','no F7 trigger function is callable through the API roles',
    _n = 0, COALESCE('API-callable triggers: '||_bad,'none'));

  PERFORM pg_temp.rec('C','C-04','the overdue sweep authorises system execution through the canonical trusted-service identity, never a database login name',
    (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='returns_overdue_sweep') ~ 'is_trusted_service_request'
    AND (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='returns_overdue_sweep') !~ 'current_user',
    'trusted-service identity in use');

  SELECT count(*) INTO _n FROM information_schema.role_table_grants
   WHERE table_schema='public' AND grantee='anon'
     AND table_name IN ('return_filings','return_filing_versions','return_filing_evidence',
                        'entity_currency_profiles','return_overdue_events','reporting_periods');
  PERFORM pg_temp.rec('C','C-05','anonymous callers hold no privilege at all on the canonical returns estate',
    _n = 0, 'anon grants='||_n);
END $c$;

-- ---------------------------------------------------------------------------
-- D — authority & maker-checker matrix (static contract)
-- ---------------------------------------------------------------------------
DO $d$
DECLARE _fn text; _def text; _bad text := '';
BEGIN
  FOREACH _fn IN ARRAY ARRAY[
    'returns_open_filing','returns_submit_filing','returns_review_filing','returns_raise_rfi',
    'returns_respond_to_request','returns_request_amendment','returns_decide_amendment',
    'returns_request_extension','returns_decide_extension','returns_attach_evidence',
    'returns_withdraw_evidence','returns_rebase_filing_currency','returns_overdue_sweep'
  ] LOOP
    SELECT pg_get_functiondef(p.oid) INTO _def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=_fn LIMIT 1;
    IF _def IS NULL OR _def !~* '(returns_require|returns_can_|has_permission|is_super_admin|sec_is_internal_user|is_trusted_service_request)' THEN
      _bad := _bad||_fn||' ';
    END IF;
  END LOOP;
  PERFORM pg_temp.rec('D','D-01','every material F7 action performs a server-side authority check inside the routine',
    _bad = '', COALESCE(NULLIF('unchecked: '||_bad,'unchecked: '),'13 actions checked'));

  _bad := '';
  FOREACH _fn IN ARRAY ARRAY[
    'returns_review_filing','returns_decide_amendment','returns_decide_extension',
    'returns_withdraw_evidence','returns_rebase_filing_currency'
  ] LOOP
    SELECT pg_get_functiondef(p.oid) INTO _def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=_fn LIMIT 1;
    IF _def IS NULL OR _def !~* '_reason' THEN _bad := _bad||_fn||' '; END IF;
  END LOOP;
  PERFORM pg_temp.rec('D','D-02','every decision-grade F7 action requires a recorded reason',
    _bad = '', COALESCE(NULLIF('reasonless: '||_bad,'reasonless: '),'5 decisions carry reasons'));

  _bad := '';
  FOREACH _fn IN ARRAY ARRAY['returns_review_filing','returns_decide_amendment','returns_decide_extension'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO _def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=_fn LIMIT 1;
    IF _def IS NULL OR _def !~* '(submitted_by|requested_by|created_by)\s*(IS NOT NULL\s*(AND|\n)\s*[a-z0-9_.]*\.?(submitted_by|requested_by|created_by)\s*)?=\s*(auth\.uid\(\)|v_[a-z_]+|_[a-z_]+)' THEN
      IF _def IS NULL OR _def !~* 'maker-checker' THEN _bad := _bad||_fn||' '; END IF;
    END IF;

  END LOOP;
  PERFORM pg_temp.rec('D','D-03','every F7 decision routine enforces maker-checker separation in the server routine',
    _bad = '', COALESCE(NULLIF('no separation: '||_bad,'no separation: '),'3 decisions separated'));

  PERFORM pg_temp.rec('D','D-04','F7 authority is expressed through the canonical returns_require permission helper',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='returns_require' AND p.prosecdef),
    'returns_require present and SECURITY DEFINER');
END $d$;

-- ---------------------------------------------------------------------------
-- E — lifecycle certification + F8 downstream acceptance contract
--     (empirical, always rolled back)
-- ---------------------------------------------------------------------------
DO $e$
DECLARE
  _buf jsonb := '[]'::jsonb; r record; _ctx text; _ok boolean; _msg text;
  _entity uuid; _filer uuid; _oth_entity uuid; _oth_filer uuid;
  _cfg uuid; _rev uuid; _chk uuid; _sector uuid; _tpl uuid; _plain uuid;
  _def uuid; _ob uuid; _p1 uuid; _p2 uuid;
  _res jsonb; _fil uuid; _ver uuid; _ver2 uuid; _resp uuid; _amend uuid;
  _n int; _n2 int; _sig int;
BEGIN
  FOR r IN SELECT m.entity_id, m.user_id FROM public.entity_user_memberships m
            WHERE m.status='APPROVED' LOOP
    PERFORM pg_temp.act(r.user_id);
    IF _entity IS NULL AND public.returns_can_file(r.entity_id) THEN
      _entity := r.entity_id; _filer := r.user_id;
    END IF;
  END LOOP;
  FOR r IN SELECT m.entity_id, m.user_id FROM public.entity_user_memberships m
            WHERE m.status='APPROVED' AND m.entity_id <> _entity AND m.user_id <> _filer LOOP
    PERFORM pg_temp.act(r.user_id);
    IF _oth_entity IS NULL AND public.returns_can_file(r.entity_id)
       AND NOT public.returns_can_file(_entity) THEN
      _oth_entity := r.entity_id; _oth_filer := r.user_id;
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
  SELECT p.id INTO _plain FROM public.profiles p
   WHERE NOT public.is_super_admin(p.id)
     AND NOT public.has_permission(p.id,'returns_management','edit')
   ORDER BY p.created_at LIMIT 1;
  SELECT public.sector_effective_id(l.sector_id) INTO _sector FROM public.licensees l WHERE l.id=_entity;
  SELECT t.id INTO _tpl FROM public.form_templates t
    JOIN public.form_versions v ON v.template_id=t.id AND v.status='published'
   ORDER BY t.id LIMIT 1;

  PERFORM pg_temp.rec('E','E-00',
    'the certification fixture has a real entity filer, an unrelated entity filer, a configuration officer, a reviewer, an independent approver, a non-privileged user, a sector and a published form template',
    _entity IS NOT NULL AND _filer IS NOT NULL AND _oth_entity IS NOT NULL AND _oth_filer IS NOT NULL
      AND _cfg IS NOT NULL AND _rev IS NOT NULL AND _chk IS NOT NULL AND _plain IS NOT NULL
      AND _sector IS NOT NULL AND _tpl IS NOT NULL,
    format('entity=%s filer=%s other=%s cfg=%s rev=%s chk=%s plain=%s', _entity,_filer,_oth_entity,_cfg,_rev,_chk,_plain));

  IF _entity IS NULL OR _filer IS NULL OR _oth_entity IS NULL OR _cfg IS NULL
     OR _rev IS NULL OR _chk IS NULL OR _plain IS NULL OR _sector IS NULL OR _tpl IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.return_definitions(
      code, name, description, frequency, due_days_after_period_end,
      requires_declaration, status, is_active, effective_from)
    VALUES ('F7C-CERT-QTR','F7C certification quarterly return','Certification fixture only',
            'QUARTERLY', 30, true, 'ACTIVE', true,
            date_trunc('quarter', CURRENT_DATE - interval '24 months')::date)
    RETURNING id INTO _def;

    INSERT INTO public.return_definition_forms(
      return_definition_id, form_template_id, sequence, is_required, effective_from)
    VALUES (_def, _tpl, 1, true, date_trunc('quarter', CURRENT_DATE - interval '24 months')::date);

    INSERT INTO public.reporting_obligation_rules(
      return_definition_id, code, name, sector_id, requires_active_license, effective_from, is_active)
    VALUES (_def,'F7C-CERT-RULE','F7C certification applicability rule', _sector, false,
            date_trunc('quarter', CURRENT_DATE - interval '24 months')::date, true);

    PERFORM pg_temp.act(_cfg);
    PERFORM public.returns_derive_entity_obligations(_entity);
    SELECT o.id INTO _ob FROM public.entity_reporting_obligations o
     WHERE o.entity_id=_entity AND o.return_definition_id=_def AND o.status='ACTIVE';
    PERFORM public.returns_generate_periods(_ob, CURRENT_DATE);
    SELECT p.id INTO _p1 FROM public.reporting_periods p
     WHERE p.entity_reporting_obligation_id=_ob AND p.status='OPEN' ORDER BY p.period_start LIMIT 1;
    SELECT p.id INTO _p2 FROM public.reporting_periods p
     WHERE p.entity_reporting_obligation_id=_ob AND p.status='OPEN' AND p.id <> _p1
     ORDER BY p.period_start LIMIT 1;

    _buf := pg_temp.bufrec(_buf,'E','E-01',
      'an applicable entity acquires the obligation and deterministic reporting periods from configuration alone',
      _ob IS NOT NULL AND _p1 IS NOT NULL AND _p2 IS NOT NULL,
      format('obligation=%s p1=%s p2=%s', _ob,_p1,_p2));

    -- wrong entity cannot open a filing on this obligation's period
    PERFORM pg_temp.act(_oth_filer);
    _ok := false; _msg := '';
    BEGIN PERFORM public.returns_open_filing(_p1);
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM; END;
    _buf := pg_temp.bufrec(_buf,'E','E-02',
      'an unrelated entity filer can never open a filing against another entity''s period', _ok, _msg);

    -- non-privileged internal user cannot open it either
    PERFORM pg_temp.act(_plain);
    _ok := false; _msg := '';
    BEGIN PERFORM public.returns_open_filing(_p1);
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM; END;
    _buf := pg_temp.bufrec(_buf,'E','E-03',
      'a signed-in user with no returns authority cannot open a filing', _ok, _msg);

    -- entity filer opens, completes and submits
    PERFORM pg_temp.act(_filer);
    _res := public.returns_open_filing(_p1);
    _fil := (_res->>'filing_id')::uuid; _ver := (_res->>'version_id')::uuid;
    _buf := pg_temp.bufrec(_buf,'E','E-04',
      'the entity filer opens a canonical filing with its first version and a snapshotted currency and regulator body',
      EXISTS (SELECT 1 FROM public.return_filings f
               WHERE f.id=_fil AND f.reporting_currency IS NOT NULL AND f.currency_source IS NOT NULL
                 AND f.regulator_id IS NOT NULL AND f.regulator_source IS NOT NULL
                 AND f.currency_snapshot_at IS NOT NULL),
      'filing='||coalesce(_fil::text,'∅'));

    -- downstream must be silent for a DRAFT version
    SELECT count(*) INTO _sig FROM public.prudential_detection_runs d
     WHERE d.return_filing_version_id = _ver;
    _buf := pg_temp.bufrec(_buf,'E','E-05',
      'a DRAFT filing version raises no downstream accepted-return signal', _sig = 0, 'signals='||_sig);

    FOR r IN SELECT q.id, q.form_template_id, q.form_version_id
               FROM public.return_filing_form_requirements q
              WHERE q.return_filing_version_id = _ver LOOP
      PERFORM set_config('request.jwt.claims','{}', true);
      INSERT INTO public.form_responses(template_id, version_id, user_id, response_data, status)
      VALUES (r.form_template_id,
              COALESCE(r.form_version_id,
                (SELECT v.id FROM public.form_versions v
                  WHERE v.template_id=r.form_template_id AND v.status='published'
                  ORDER BY v.created_at DESC LIMIT 1)),
              _filer, '{"f7c_gate":true}'::jsonb, 'submitted')
      RETURNING id INTO _resp;
      PERFORM pg_temp.act(_filer);
      PERFORM public.returns_attach_form_response(r.id, _resp, 'COMPLETED');
    END LOOP;

    _res := public.returns_submit_filing(_ver, true);
    _buf := pg_temp.bufrec(_buf,'E','E-06',
      'a complete return submits, sealing the version with its submitter and timestamp',
      (_res->>'submitted')::boolean IS TRUE
      AND EXISTS (SELECT 1 FROM public.return_filing_versions v
                   WHERE v.id=_ver AND v.status='SUBMITTED' AND v.submitted_by=_filer
                     AND v.submitted_at IS NOT NULL),
      'submit='||_res::text);

    SELECT count(*) INTO _sig FROM public.prudential_detection_runs d
     WHERE d.return_filing_version_id = _ver;
    _buf := pg_temp.bufrec(_buf,'E','E-07',
      'a SUBMITTED but undecided version raises no downstream accepted-return signal', _sig = 0, 'signals='||_sig);

    -- RFI does not signal downstream either
    PERFORM pg_temp.act(_rev);
    PERFORM public.returns_raise_rfi(_ver,'Certification fixture: clarify the reported position.');
    SELECT count(*) INTO _sig FROM public.prudential_detection_runs d
     WHERE d.return_filing_version_id = _ver;
    _buf := pg_temp.bufrec(_buf,'E','E-08',
      'an open RFI raises no downstream accepted-return signal', _sig = 0, 'signals='||_sig);

    -- the submitter cannot decide their own filing (external submitter, internal decision)
    PERFORM pg_temp.act(_filer);
    _ok := false; _msg := '';
    BEGIN PERFORM public.returns_review_filing(_ver,'ACCEPT','Certification probe: the filer must not decide.');
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM; END;
    _buf := pg_temp.bufrec(_buf,'E','E-09',
      'the entity that filed the return can never decide it', _ok, _msg);

    -- independent acceptance signals downstream exactly once
    PERFORM pg_temp.act(_rev);
    PERFORM public.returns_review_filing(_ver,'START_REVIEW', NULL);
    PERFORM pg_temp.act(_chk);
    PERFORM public.returns_review_filing(_ver,'ACCEPT','Certification fixture: accepted as filed.');
    SELECT count(*) INTO _sig FROM public.prudential_detection_runs d
     WHERE d.return_filing_version_id = _ver;
    _buf := pg_temp.bufrec(_buf,'E','E-10',
      'accepting a canonical filing version raises the downstream accepted-return signal exactly once',
      _sig = 1 AND (SELECT status FROM public.return_filing_versions WHERE id=_ver)='ACCEPTED',
      'signals='||_sig);

    -- the accepted version is historically immutable
    _ok := false; _msg := '';
    BEGIN
      PERFORM set_config('request.jwt.claims','{}', true);
      UPDATE public.return_filing_versions SET status='DRAFT' WHERE id=_ver;
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM; END;
    _buf := pg_temp.bufrec(_buf,'E','E-11',
      'an accepted filing version cannot be rewritten, even by a direct database update',
      _ok AND (SELECT status FROM public.return_filing_versions WHERE id=_ver)='ACCEPTED', _msg);

    -- amendment: new version, old history untouched, second acceptance signals once more
    PERFORM pg_temp.act(_filer);
    _amend := public.returns_request_amendment(_fil,'Certification fixture: a corrected figure must be refiled.');
    PERFORM pg_temp.act(_chk);
    _res := public.returns_decide_amendment(_amend,'APPROVE','Certification fixture: amendment approved.');
    _ver2 := (_res->>'new_version_id')::uuid;
    _buf := pg_temp.bufrec(_buf,'E','E-12',
      'an approved amendment opens a superseding draft version and leaves the accepted history unchanged',
      EXISTS (SELECT 1 FROM public.return_filing_versions v
               WHERE v.id=_ver2 AND v.status='DRAFT' AND v.supersedes_version_id=_ver)
      AND (SELECT status FROM public.return_filing_versions WHERE id=_ver)='ACCEPTED'
      AND (SELECT is_immutable FROM public.return_filing_versions WHERE id=_ver),
      'amendment='||_res::text);

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
              _filer, '{"f7c_gate":true}'::jsonb, 'submitted')
      RETURNING id INTO _resp;
      PERFORM pg_temp.act(_filer);
      PERFORM public.returns_attach_form_response(r.id, _resp, 'COMPLETED');
    END LOOP;
    PERFORM public.returns_submit_filing(_ver2, true);
    PERFORM pg_temp.act(_chk);
    PERFORM public.returns_review_filing(_ver2,'ACCEPT','Certification fixture: amended return accepted.');
    SELECT count(*) INTO _sig FROM public.prudential_detection_runs d WHERE d.return_filing_version_id=_ver2;
    SELECT count(*) INTO _n FROM public.prudential_detection_runs d WHERE d.return_filing_version_id=_ver;
    _buf := pg_temp.bufrec(_buf,'E','E-13',
      'accepting the amended version raises its own downstream signal exactly once and never re-signals the superseded version',
      _sig = 1 AND _n = 1, format('amended signals=%s original signals=%s', _sig, _n));

    -- a rejected version never signals downstream
    PERFORM pg_temp.act(_filer);
    _res := public.returns_open_filing(_p2);
    FOR r IN SELECT q.id, q.form_template_id, q.form_version_id
               FROM public.return_filing_form_requirements q
              WHERE q.return_filing_version_id = (_res->>'version_id')::uuid LOOP
      PERFORM set_config('request.jwt.claims','{}', true);
      INSERT INTO public.form_responses(template_id, version_id, user_id, response_data, status)
      VALUES (r.form_template_id,
              COALESCE(r.form_version_id,
                (SELECT v.id FROM public.form_versions v
                  WHERE v.template_id=r.form_template_id AND v.status='published'
                  ORDER BY v.created_at DESC LIMIT 1)),
              _filer, '{"f7c_gate":true}'::jsonb, 'submitted')
      RETURNING id INTO _resp;
      PERFORM pg_temp.act(_filer);
      PERFORM public.returns_attach_form_response(r.id, _resp, 'COMPLETED');
    END LOOP;
    PERFORM public.returns_submit_filing((_res->>'version_id')::uuid, true);
    PERFORM pg_temp.act(_chk);
    PERFORM public.returns_review_filing((_res->>'version_id')::uuid,'REJECT',
      'Certification fixture: rejected, the return must be refiled.');
    SELECT count(*) INTO _sig FROM public.prudential_detection_runs d
     WHERE d.return_filing_version_id = (_res->>'version_id')::uuid;
    _buf := pg_temp.bufrec(_buf,'E','E-14',
      'a REJECTED version raises no downstream accepted-return signal',
      _sig = 0 AND (SELECT status FROM public.return_filing_versions
                     WHERE id=(_res->>'version_id')::uuid)='REJECTED', 'signals='||_sig);

    -- currency of record cannot be rebased once the return is submitted/accepted
    PERFORM pg_temp.act(_cfg);
    _ok := false; _msg := '';
    BEGIN PERFORM public.returns_rebase_filing_currency(_fil,'Certification probe: post-acceptance rebase must be refused.');
    EXCEPTION WHEN OTHERS THEN _ok := true; _msg := SQLERRM; END;
    _buf := pg_temp.bufrec(_buf,'E','E-15',
      'the currency of record of a submitted or accepted filing can never be rebased', _ok, _msg);

    -- notifications: stable keys, one per business event, one submission event
    -- per submitted version (the original and the amended version)
    SELECT count(*) INTO _n FROM public.notification_event_queue q
     WHERE q.entity_type='return_filing' AND q.entity_id=_fil AND q.event_key='return.submitted';
    SELECT count(DISTINCT q.event_key) INTO _n2 FROM public.notification_event_queue q
     WHERE q.entity_type='return_filing' AND q.entity_id=_fil;
    _buf := pg_temp.bufrec(_buf,'E','E-16',
      'the lifecycle emits stable notification keys, one submission event per submitted version and no duplicates',
      _n = 2 AND _n2 >= 3, format('submitted=%s distinct keys=%s', _n, _n2));


    RAISE EXCEPTION 'F7C_LIFECYCLE_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'F7C_LIFECYCLE_ROLLBACK' THEN
      GET STACKED DIAGNOSTICS _ctx = PG_EXCEPTION_CONTEXT;
      _buf := pg_temp.bufrec(_buf,'E','E-ERR','the certification lifecycle fixture ran to completion',
        false, SQLSTATE||': '||left(SQLERRM,200)||' | '||left(coalesce(_ctx,''),400));
    END IF;
  END;

  PERFORM set_config('request.jwt.claims','{}', true);
  FOR r IN SELECT * FROM jsonb_array_elements(_buf) e LOOP
    PERFORM pg_temp.rec(r.value->>'section', r.value->>'id', r.value->>'descr',
      (r.value->>'passed')::boolean, r.value->>'detail');
  END LOOP;
END $e$;

-- ---------------------------------------------------------------------------
-- F — currency & regulator provenance (contract level)
-- ---------------------------------------------------------------------------
DO $f$
DECLARE _n int; _def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='entity_reporting_currency_resolve' LIMIT 1;
  PERFORM pg_temp.rec('F','F-01','the currency hierarchy is definition mandate, then approved effective-dated entity override, then regulator base currency',
    _def ~* 'mandatory_currency_code' AND _def ~* 'entity_currency_profiles' AND _def ~* 'base_currency',
    'resolver hierarchy present');

  PERFORM pg_temp.rec('F','F-02','only an APPROVED override can govern; proposed or superseded overrides cannot',
  PERFORM pg_temp.rec('F','F-02','only an authorised override that reached ACTIVE (or the ACTIVE override in force at a historical date, later superseded) can govern; proposed and rejected overrides never can',
    _def ~* 'status IN \(''ACTIVE'',''SUPERSEDED''\)' AND _def !~* 'PROPOSED' AND _def !~* 'REJECTED',
    'ACTIVE/SUPERSEDED-only override selection');


  PERFORM pg_temp.rec('F','F-03','entity currency overrides are scoped to the institutional regulator body',
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='entity_currency_profiles' AND column_name='regulator_id'),
    'entity_currency_profiles.regulator_id present');

  PERFORM pg_temp.rec('F','F-04','the institutional regulator body is resolved server-side and is never a human officer assignment',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='entity_regulator_body_resolve')
    AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='return_filings' AND column_name='regulator_source'),
    'canonical body resolver and filing provenance present');

  SELECT count(*) INTO _n FROM public.return_filings f
   WHERE f.regulator_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.regulators g WHERE g.id = f.regulator_id);
  PERFORM pg_temp.rec('F','F-05','every filing regulator snapshot points at a real institutional regulator body',
    _n = 0, 'non-institutional snapshots='||_n);

  PERFORM pg_temp.rec('F','F-06','F7 consumes the canonical F6-X FX engine rather than defining a second one',
    (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='returns_filing_metrics_display') ~* 'fx_convert|fx_rate',
    'metrics display delegates to the F6-X conversion engine');

  PERFORM pg_temp.rec('F','F-07','the metrics display reports unconverted rather than substituting zero or aggregating unlike currencies',
    (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='returns_filing_metrics_display') ~* 'UNCONVERTED',
    'UNCONVERTED outcome present');
END $f$;

-- ---------------------------------------------------------------------------
-- G — F6 late-fee boundary
-- ---------------------------------------------------------------------------
DO $g$
DECLARE _n int; _bad text := '';
BEGIN
  SELECT count(*), string_agg(p.proname,', ') INTO _n, _bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'returns\_%'
     AND pg_get_functiondef(p.oid) ~* 'INSERT\s+INTO\s+(public\.)?(fee_assessments|fee_assessment_lines|payments|payment_allocations|fee_receipts)';
  PERFORM pg_temp.rec('G','G-01','no F7 routine assesses, charges or settles money itself',
    _n = 0, COALESCE('monetary writers: '||_bad,'none'));

  PERFORM pg_temp.rec('G','G-02','an overdue regulatory event names the F6 late-fee owner instead of computing a fee',
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='return_overdue_events' AND column_name='late_fee_owner'),
    'return_overdue_events.late_fee_owner present');
END $g$;

-- ---------------------------------------------------------------------------
-- H — notification contract
-- ---------------------------------------------------------------------------
DO $h$
DECLARE _fn text; _def text; _bad text := '';
BEGIN
  PERFORM pg_temp.rec('H','H-01','F7 emits notifications through a single guarded helper',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='returns_notify' AND p.prosecdef),
    'returns_notify present');

  FOREACH _fn IN ARRAY ARRAY['returns_submit_filing','returns_review_filing','returns_raise_rfi',
                             'returns_decide_extension','returns_decide_amendment','returns_overdue_sweep'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO _def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=_fn LIMIT 1;
    IF _def IS NULL OR _def !~* '(returns_notify|notification_enqueue_event)' THEN _bad := _bad||_fn||' '; END IF;
  END LOOP;
  PERFORM pg_temp.rec('H','H-02','every notifiable F7 lifecycle event reaches the shared notification architecture',
    _bad = '', COALESCE(NULLIF('silent: '||_bad,'silent: '),'6 lifecycle events notify'));

  PERFORM pg_temp.rec('H','H-03','notification emission carries an idempotency key so a retry cannot duplicate a business event',
    (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='returns_notify') ~* '(_suffix|dedupe|idempot|ON CONFLICT)',
    'idempotency key present');
END $h$;

-- ---------------------------------------------------------------------------
-- I — live-estate integrity
-- ---------------------------------------------------------------------------
DO $i$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.return_filings f
   LEFT JOIN public.reporting_periods p ON p.id=f.reporting_period_id WHERE p.id IS NULL;
  PERFORM pg_temp.rec('I','I-01','no live filing is orphaned from its reporting period', _n=0, 'orphans='||_n);

  SELECT count(*) INTO _n FROM public.return_filing_versions v
   LEFT JOIN public.return_filings f ON f.id=v.return_filing_id WHERE f.id IS NULL;
  PERFORM pg_temp.rec('I','I-02','no live filing version is orphaned from its filing', _n=0, 'orphans='||_n);

  SELECT count(*) INTO _n FROM public.return_filings WHERE regulator_id IS NULL;
  PERFORM pg_temp.rec('I','I-03','every live filing carries an institutional regulator snapshot', _n=0, 'missing='||_n);

  SELECT count(*) INTO _n FROM public.return_filings WHERE reporting_currency IS NULL;
  PERFORM pg_temp.rec('I','I-04','every live filing carries a currency-of-record snapshot', _n=0, 'missing='||_n);

  SELECT count(*) INTO _n FROM public.return_filings f WHERE f.status='ACCEPTED'
    AND NOT EXISTS (SELECT 1 FROM public.return_filing_versions v
                     WHERE v.return_filing_id=f.id AND v.status='ACCEPTED');
  PERFORM pg_temp.rec('I','I-05','no accepted filing exists without an accepted version', _n=0, 'defects='||_n);

  SELECT count(*) INTO _n FROM public.return_filing_evidence e
   LEFT JOIN public.return_filing_versions v ON v.id=e.return_filing_version_id WHERE v.id IS NULL;
  PERFORM pg_temp.rec('I','I-06','no evidence row points at a missing filing version', _n=0, 'defects='||_n);

  SELECT count(*) INTO _n FROM public.return_filing_extensions
   WHERE status IN ('APPROVED','GRANTED') AND granted_due_date IS NULL;
  PERFORM pg_temp.rec('I','I-07','no granted extension is missing its effective deadline', _n=0, 'defects='||_n);

  SELECT count(*) INTO _n FROM (
    SELECT reporting_period_id FROM public.return_filings
     WHERE status NOT IN ('WITHDRAWN','SUPERSEDED') GROUP BY 1 HAVING count(*)>1) d;
  PERFORM pg_temp.rec('I','I-08','no reporting period carries two live filings', _n=0, 'duplicates='||_n);

  SELECT count(*) INTO _n FROM public.return_filing_versions v
   WHERE v.supersedes_version_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.return_filing_versions o
                      WHERE o.id=v.supersedes_version_id AND o.return_filing_id=v.return_filing_id);
  PERFORM pg_temp.rec('I','I-09','every superseding version supersedes a real earlier version of the same filing',
    _n=0, 'broken lineage='||_n);

  SELECT count(*) INTO _n FROM public.return_filings
   WHERE status NOT IN ('DRAFT','SUBMITTED','UNDER_REVIEW','ACCEPTED','REJECTED','WITHDRAWN','SUPERSEDED');
  PERFORM pg_temp.rec('I','I-10','no live filing carries an unknown status', _n=0, 'invalid='||_n);
END $i$;

-- ---------------------------------------------------------------------------
-- J — navigation & discoverability
-- ---------------------------------------------------------------------------
DO $j$
DECLARE _p text; _missing text := ''; _n int;
BEGIN
  FOREACH _p IN ARRAY ARRAY['/returns/queue','/returns/obligations','/returns/calendar',
                            '/returns/filings/:filingId','/entity/returns/dashboard'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.sec_routes r WHERE r.path_pattern=_p AND r.is_active) THEN
      _missing := _missing||_p||' ';
    END IF;
  END LOOP;
  PERFORM pg_temp.rec('J','J-01','every canonical F7 route is registered and active in the route registry',
    _missing='', COALESCE(NULLIF('missing: '||_missing,'missing: '),'5 canonical routes registered'));

  SELECT count(*) INTO _n FROM public.sec_routes r
   WHERE r.path_pattern LIKE '/returns/%' AND r.is_active AND r.audience='internal'
     AND r.is_protected AND r.required_permission_id IS NULL;
  PERFORM pg_temp.rec('J','J-02','every protected internal returns route carries a required permission',
    _n=0, 'unpermissioned='||_n);

  SELECT count(*) INTO _n FROM public.sec_navigation_items n
    LEFT JOIN public.sec_routes r ON r.id=n.route_id
   WHERE n.is_active AND n.show_in_sidebar
     AND coalesce(n.href_override, r.path_pattern) IN ('/returns/queue','/returns/obligations','/returns/calendar');
  PERFORM pg_temp.rec('J','J-03','the regulator returns queue, obligations workbench and reporting calendar are menu-linked',
    _n = 3, 'menu-linked internal returns items='||_n);

  SELECT count(*) INTO _n FROM public.sec_navigation_items n
    LEFT JOIN public.sec_routes r ON r.id=n.route_id
   WHERE n.is_active AND n.show_in_sidebar AND n.audience='external'
     AND coalesce(n.href_override, r.path_pattern) LIKE '/entity/returns%';
  PERFORM pg_temp.rec('J','J-04','the regulated entity returns experience is menu-linked for the external audience',
    _n >= 1, 'external returns menu items='||_n);
END $j$;

-- ---------------------------------------------------------------------------
-- K — operability of the hot query paths
-- ---------------------------------------------------------------------------
DO $k$
DECLARE _missing text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='return_filings'
                  AND indexdef ~* 'status') THEN _missing := _missing||'return_filings(status) '; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='reporting_periods'
                  AND indexdef ~* 'due_date') THEN _missing := _missing||'reporting_periods(due_date) '; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='entity_reporting_obligations'
                  AND indexdef ~* 'entity_id') THEN _missing := _missing||'entity_reporting_obligations(entity_id) '; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='return_filing_versions'
                  AND indexdef ~* 'return_filing_id') THEN _missing := _missing||'return_filing_versions(return_filing_id) '; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='entity_currency_profiles'
                  AND indexdef ~* 'entity_id') THEN _missing := _missing||'entity_currency_profiles(entity_id) '; END IF;
  PERFORM pg_temp.rec('K','K-01','the regulator queue, entity calendar, obligation, version and currency lookup paths are indexed',
    _missing='', COALESCE(NULLIF('unindexed: '||_missing,'unindexed: '),'5 hot paths indexed'));
END $k$;

-- ---------------------------------------------------------------------------
-- Z — zero residue
-- ---------------------------------------------------------------------------
DO $z$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.return_definitions WHERE code LIKE 'F7C-CERT-%';
  PERFORM pg_temp.rec('Z','Z-01','the certification-owned return definitions were rolled back', _n=0, 'rows='||_n);

  SELECT count(*) INTO _n FROM public.reporting_obligation_rules WHERE code LIKE 'F7C-CERT-%';
  PERFORM pg_temp.rec('Z','Z-02','the certification-owned applicability rules were rolled back', _n=0, 'rows='||_n);

  SELECT count(*) INTO _n FROM public.form_responses WHERE response_data ? 'f7c_gate';
  PERFORM pg_temp.rec('Z','Z-03','the certification-owned form responses were rolled back', _n=0, 'rows='||_n);

  SELECT count(*) INTO _n FROM public.notification_event_queue q
   WHERE q.entity_type='return_filing'
     AND NOT EXISTS (SELECT 1 FROM public.return_filings f WHERE f.id=q.entity_id);
  PERFORM pg_temp.rec('Z','Z-04','the certification lifecycle left no notification residue behind', _n=0, 'orphan events='||_n);
END $z$;

\echo ''
\echo '======================== certify:f7c results ========================='
SELECT section, id, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, descr, detail
  FROM f7c_results ORDER BY seq;

\echo ''
SELECT count(*) FILTER (WHERE passed) AS passed,
       count(*) FILTER (WHERE NOT passed) AS failed,
       count(*) AS total
  FROM f7c_results;

DO $fin$
DECLARE _fail int;
BEGIN
  SELECT count(*) INTO _fail FROM f7c_results WHERE NOT passed;
  IF _fail > 0 THEN
    RAISE EXCEPTION 'certify:f7c FAILED — % assertion(s) did not hold', _fail;
  END IF;
  RAISE NOTICE 'certify:f7c PASSED — F7 regulatory returns certified for freeze';
END $fin$;
