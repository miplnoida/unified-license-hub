-- ============================================================================
-- verify:f5b1 — F5-B1 POST-LICENSING PRIVILEGE & CONFIGURATION LOCKDOWN
--
-- Permanent gate for:
--   GAP-F5-08 (CRITICAL) public.regulatory_request_types  — anon/authenticated DML
--   GAP-F5-09 (HIGH)     public.license_lifecycle_configs — browser DML
--   GAP-F5-10 (HIGH)     public.license_renewals          — browser DML
--
-- ACL inspection alone is not accepted: sections C/D behaviourally prove denial
-- under the anon and authenticated roles, and prove that the governed admin path
-- succeeds for an authorised actor. All empirical writes are executed inside a
-- savepoint that is always rolled back → zero residue.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f scripts/verify-f5b1-privileges.sql
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
SET client_min_messages = notice;

CREATE TEMP TABLE f5b1_results (
  seq serial, section text, id text, descr text, passed boolean, detail text
);

CREATE OR REPLACE FUNCTION pg_temp.rec(_s text, _id text, _d text, _ok boolean, _detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO f5b1_results (section, id, descr, passed, detail)
  VALUES (_s, _id, _d, _ok, _detail);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.as_anon(_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
    EXECUTE 'SET LOCAL ROLE anon';
    EXECUTE _sql;
    _state := '00000';
  EXCEPTION WHEN others THEN
    _state := SQLSTATE || ': ' || left(SQLERRM, 140);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);
  RETURN _state;
END $$;

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
    _state := SQLSTATE || ': ' || left(SQLERRM, 140);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);
  RETURN _state;
END $$;

-- ===========================================================================
-- SECTION A — F5 privilege surface (ACL census)
-- ===========================================================================
DO $a$
DECLARE _n int; _detail text;
BEGIN
  -- A-01 regulatory_request_types: zero external write/structural privileges
  SELECT count(*), coalesce(string_agg(r.rolename || '/' || p.priv, ', '), 'none') INTO _n, _detail
    FROM (VALUES ('anon'),('authenticated')) r(rolename)
    CROSS JOIN (VALUES ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(priv)
   WHERE has_table_privilege(r.rolename, 'public.regulatory_request_types', p.priv);
  PERFORM pg_temp.rec('A','A-01',
    'regulatory request types hold no write or structural privilege for browser roles',
    _n = 0, 'violations=' || _n || ' [' || _detail || ']');

  -- A-02 regulatory_request_types: anon holds no privilege at all
  PERFORM pg_temp.rec('A','A-02',
    'unauthenticated visitors have no access to regulatory request types',
    NOT has_table_privilege('anon', 'public.regulatory_request_types', 'SELECT'),
    'anon SELECT = ' || has_table_privilege('anon','public.regulatory_request_types','SELECT')::text);

  -- A-03 regulatory_request_types: authenticated read preserved
  PERFORM pg_temp.rec('A','A-03',
    'signed-in users retain read access to regulatory request types',
    has_table_privilege('authenticated', 'public.regulatory_request_types', 'SELECT'), 'select retained');

  -- A-04 license_lifecycle_configs: zero browser DML
  SELECT count(*), coalesce(string_agg(r.rolename || '/' || p.priv, ', '), 'none') INTO _n, _detail
    FROM (VALUES ('anon'),('authenticated')) r(rolename)
    CROSS JOIN (VALUES ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(priv)
   WHERE has_table_privilege(r.rolename, 'public.license_lifecycle_configs', p.priv);
  PERFORM pg_temp.rec('A','A-04',
    'licence lifecycle configuration cannot be changed directly by browser roles',
    _n = 0, 'violations=' || _n || ' [' || _detail || ']');

  -- A-05 license_lifecycle_configs: read retained (product depends on it)
  PERFORM pg_temp.rec('A','A-05',
    'signed-in users retain read access to licence lifecycle configuration',
    has_table_privilege('authenticated', 'public.license_lifecycle_configs', 'SELECT'), 'select retained');

  -- A-06 license_renewals: zero browser DML
  SELECT count(*), coalesce(string_agg(r.rolename || '/' || p.priv, ', '), 'none') INTO _n, _detail
    FROM (VALUES ('anon'),('authenticated')) r(rolename)
    CROSS JOIN (VALUES ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(priv)
   WHERE has_table_privilege(r.rolename, 'public.license_renewals', p.priv);
  PERFORM pg_temp.rec('A','A-06',
    'renewal records cannot be created or advanced directly by browser roles',
    _n = 0, 'violations=' || _n || ' [' || _detail || ']');

  -- A-07 license_renewals: read retained
  PERFORM pg_temp.rec('A','A-07',
    'signed-in users retain scoped read access to renewal records',
    has_table_privilege('authenticated', 'public.license_renewals', 'SELECT'), 'select retained');

  -- A-08 trusted server path retains full access on all three tables
  SELECT count(*) INTO _n
    FROM (VALUES ('public.regulatory_request_types'),
                 ('public.license_lifecycle_configs'),
                 ('public.license_renewals')) t(tbl)
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(priv)
   WHERE NOT has_table_privilege('service_role', t.tbl, p.priv);
  PERFORM pg_temp.rec('A','A-08',
    'the trusted server path retains the access it needs on all three tables',
    _n = 0, 'missing service_role privileges=' || _n);

  -- A-09 RLS enabled on all three
  SELECT count(*) INTO _n
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public'
     AND c.relname IN ('regulatory_request_types','license_lifecycle_configs','license_renewals')
     AND c.relrowsecurity;
  PERFORM pg_temp.rec('A','A-09', 'row-level security remains enabled on all three tables',
    _n = 3, 'tables with RLS=' || _n || '/3');

  -- A-10 no residual write policy that implies browser mutation is expected
  SELECT count(*), coalesce(string_agg(tablename || '/' || policyname, ', '), 'none') INTO _n, _detail
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('regulatory_request_types','license_lifecycle_configs','license_renewals')
     AND cmd <> 'SELECT'
     AND 'authenticated' = ANY (roles);
  PERFORM pg_temp.rec('A','A-10',
    'no leftover rule suggests browser users may still write these tables',
    _n = 0, 'residual write policies=' || _n || ' [' || _detail || ']');
END $a$;

-- ===========================================================================
-- SECTION B — governed replacement path (authorization surface)
-- ===========================================================================
DO $b$
DECLARE _n int; _detail text; _fn text;
BEGIN
  FOREACH _fn IN ARRAY ARRAY[
    'public.admin_upsert_license_lifecycle_config(uuid, jsonb)',
    'public.admin_set_license_lifecycle_config_active(uuid, boolean, text)'
  ] LOOP
    PERFORM pg_temp.rec('B','B-01/' || split_part(_fn,'(',1),
      'the governed configuration operation exists on the server',
      to_regprocedure(_fn) IS NOT NULL, _fn);

    PERFORM pg_temp.rec('B','B-02/' || split_part(_fn,'(',1),
      'unauthenticated visitors cannot invoke the governed configuration operation',
      NOT has_function_privilege('anon', to_regprocedure(_fn), 'EXECUTE'),
      'anon execute = ' || has_function_privilege('anon', to_regprocedure(_fn), 'EXECUTE')::text);

    PERFORM pg_temp.rec('B','B-03/' || split_part(_fn,'(',1),
      'the governed operation is not callable by the world (PUBLIC)',
      NOT EXISTS (
        SELECT 1 FROM pg_proc p
        CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        WHERE p.oid = to_regprocedure(_fn) AND a.grantee = 0),
      'no PUBLIC execute grant');

    PERFORM pg_temp.rec('B','B-04/' || split_part(_fn,'(',1),
      'the governed operation runs with a fixed, safe search path',
      EXISTS (SELECT 1 FROM pg_proc p
               WHERE p.oid = to_regprocedure(_fn)
                 AND p.prosecdef
                 AND array_to_string(coalesce(p.proconfig,'{}'::text[]), ',') ILIKE '%search_path%public%'),
      'security definer + pinned search_path');

    PERFORM pg_temp.rec('B','B-05/' || split_part(_fn,'(',1),
      'the governed operation checks the actor''s configuration permission server-side',
      pg_get_functiondef(to_regprocedure(_fn)) ILIKE '%has_permission(uid, ''license_management'', ''manage_config'')%'
      AND pg_get_functiondef(to_regprocedure(_fn)) ILIKE '%auth.uid()%',
      'auth.uid() + license_management.manage_config');

    PERFORM pg_temp.rec('B','B-06/' || split_part(_fn,'(',1),
      'the governed operation records audit evidence',
      pg_get_functiondef(to_regprocedure(_fn)) ILIKE '%config_change_log%'
      AND pg_get_functiondef(to_regprocedure(_fn)) ILIKE '%compliance_audit_logs%',
      'config_change_log + compliance_audit_logs');
  END LOOP;

  -- B-07 the permission pair referenced must exist in the canonical catalogue
  PERFORM pg_temp.rec('B','B-07',
    'the permission the governed operation checks exists in the canonical catalogue',
    EXISTS (SELECT 1 FROM public.sec_permissions sp
             JOIN public.sec_modules sm ON sm.id = sp.module_id
            WHERE sm.key = 'license_management' AND sp.key = 'manage_config'),
    'license_management.manage_config catalogued');

  -- B-08 governed renewal writer still exists (F5-B3 will build the effect)
  PERFORM pg_temp.rec('B','B-08',
    'the governed lifecycle action remains the only server writer for renewals',
    to_regprocedure('public.license_lifecycle_action(uuid, text, jsonb, text)') IS NOT NULL
    AND pg_get_functiondef(to_regprocedure('public.license_lifecycle_action(uuid, text, jsonb, text)'))
        ILIKE '%license_renewals%',
    'license_lifecycle_action writes license_renewals');
END $b$;

-- ===========================================================================
-- SECTION C — empirical negative tests (rollback-safe, zero residue)
-- ===========================================================================
DO $c$
DECLARE
  _ordinary uuid;
  _res text;
  _cfg uuid;
  _lic uuid;
  _n_before int; _n_after int;
BEGIN
  SELECT count(*) INTO _n_before FROM public.regulatory_request_types;

  -- an ordinary authenticated user: no admin role, no licence config permission
  SELECT p.id INTO _ordinary
    FROM public.profiles p
   WHERE NOT public.is_super_admin(p.id)
     AND NOT public.has_permission(p.id, 'license_management', 'manage_config')
   ORDER BY p.created_at
   LIMIT 1;

  SELECT id INTO _cfg FROM public.license_lifecycle_configs ORDER BY created_at LIMIT 1;
  SELECT id INTO _lic FROM public.licenses ORDER BY created_at LIMIT 1;

  IF _ordinary IS NULL THEN
    PERFORM pg_temp.rec('C','C-00','an ordinary signed-in user fixture is available', false, 'none found');
    RETURN;
  END IF;

  -- ---- regulatory_request_types (GAP-F5-08)
  _res := pg_temp.as_anon($q$INSERT INTO public.regulatory_request_types (key, label)
                             VALUES ('F5B1_PROBE','F5B1 probe')$q$);
  PERFORM pg_temp.rec('C','C-01','an unauthenticated visitor cannot create a regulatory request type',
    _res <> '00000', 'result=' || _res);

  _res := pg_temp.as_anon($q$UPDATE public.regulatory_request_types SET label = 'F5B1 tampered'$q$);
  PERFORM pg_temp.rec('C','C-02','an unauthenticated visitor cannot edit regulatory request types',
    _res <> '00000', 'result=' || _res);

  _res := pg_temp.as_anon($q$DELETE FROM public.regulatory_request_types$q$);
  PERFORM pg_temp.rec('C','C-03','an unauthenticated visitor cannot delete regulatory request types',
    _res <> '00000', 'result=' || _res);

  _res := pg_temp.as_user(_ordinary, $q$INSERT INTO public.regulatory_request_types (key, label)
                                        VALUES ('F5B1_PROBE2','F5B1 probe 2')$q$);
  PERFORM pg_temp.rec('C','C-04','an ordinary signed-in user cannot create a regulatory request type',
    _res <> '00000', 'result=' || _res);

  _res := pg_temp.as_user(_ordinary, $q$UPDATE public.regulatory_request_types SET label = 'F5B1 tampered'$q$);
  PERFORM pg_temp.rec('C','C-05','an ordinary signed-in user cannot edit regulatory request types',
    _res <> '00000', 'result=' || _res);

  _res := pg_temp.as_user(_ordinary, $q$DELETE FROM public.regulatory_request_types$q$);
  PERFORM pg_temp.rec('C','C-06','an ordinary signed-in user cannot delete regulatory request types',
    _res <> '00000', 'result=' || _res);

  -- ---- license_lifecycle_configs (GAP-F5-09)
  _res := pg_temp.as_user(_ordinary,
    $q$INSERT INTO public.license_lifecycle_configs (matter_kind, renewal_cycle, period_days,
          renewal_window_days, grace_period_days)
        VALUES ('renewal','annual',365,60,30)$q$);
  PERFORM pg_temp.rec('C','C-07','an ordinary signed-in user cannot create lifecycle configuration directly',
    _res <> '00000', 'result=' || _res);

  _res := pg_temp.as_user(_ordinary,
    $q$UPDATE public.license_lifecycle_configs SET grace_period_days = 999$q$);
  PERFORM pg_temp.rec('C','C-08','an ordinary signed-in user cannot edit lifecycle configuration directly',
    _res <> '00000', 'result=' || _res);

  _res := pg_temp.as_user(_ordinary, $q$DELETE FROM public.license_lifecycle_configs$q$);
  PERFORM pg_temp.rec('C','C-09','an ordinary signed-in user cannot delete lifecycle configuration directly',
    _res <> '00000', 'result=' || _res);

  -- governed operation must also refuse an unauthorised actor
  _res := pg_temp.as_user(_ordinary,
    $q$SELECT public.admin_upsert_license_lifecycle_config(NULL,
         '{"matter_kind":"renewal","change_reason":"F5B1 probe"}'::jsonb)$q$);
  PERFORM pg_temp.rec('C','C-10','the governed configuration operation refuses an unauthorised signed-in user',
    _res LIKE '42501%', 'result=' || _res);

  _res := pg_temp.as_anon(
    $q$SELECT public.admin_upsert_license_lifecycle_config(NULL,
         '{"matter_kind":"renewal"}'::jsonb)$q$);
  PERFORM pg_temp.rec('C','C-11','the governed configuration operation refuses an unauthenticated visitor',
    _res <> '00000', 'result=' || _res);

  -- ---- license_renewals (GAP-F5-10)
  IF _lic IS NOT NULL THEN
    _res := pg_temp.as_user(_ordinary, format(
      $q$INSERT INTO public.license_renewals (license_id, initiated_by, status)
         VALUES (%L, %L, 'submitted')$q$, _lic, _ordinary));
    PERFORM pg_temp.rec('C','C-12','an ordinary signed-in user cannot fabricate a renewal record',
      _res <> '00000', 'result=' || _res);
  END IF;

  _res := pg_temp.as_user(_ordinary, $q$UPDATE public.license_renewals SET status = 'approved'$q$);
  PERFORM pg_temp.rec('C','C-13','an ordinary signed-in user cannot advance a renewal record to approved',
    _res <> '00000', 'result=' || _res);

  _res := pg_temp.as_user(_ordinary, $q$DELETE FROM public.license_renewals$q$);
  PERFORM pg_temp.rec('C','C-14','an ordinary signed-in user cannot delete a renewal record',
    _res <> '00000', 'result=' || _res);

  _res := pg_temp.as_anon($q$UPDATE public.license_renewals SET status = 'approved'$q$);
  PERFORM pg_temp.rec('C','C-15','an unauthenticated visitor cannot touch renewal records',
    _res <> '00000', 'result=' || _res);

  -- residue check for this section
  SELECT count(*) INTO _n_after FROM public.regulatory_request_types;
  PERFORM pg_temp.rec('C','C-16','the negative tests left the reference data unchanged',
    _n_after = _n_before, 'before=' || _n_before || ' after=' || _n_after);
END $c$;

-- ===========================================================================
-- SECTION D — empirical positive test of the governed admin path
--             (executed inside a savepoint that is always rolled back)
-- ===========================================================================
DO $d$
DECLARE
  _admin uuid;
  _cfg uuid;
  _audit_before int; _audit_after int;
  _log_before int; _log_after int;
  _cfg_before int; _cfg_after int;
  _grace int;
  _res text;
BEGIN
  SELECT p.id INTO _admin
    FROM public.profiles p
   WHERE public.is_super_admin(p.id)
      OR public.has_permission(p.id, 'license_management', 'manage_config')
   ORDER BY p.created_at
   LIMIT 1;

  IF _admin IS NULL THEN
    PERFORM pg_temp.rec('D','D-00','an authorised configuration administrator fixture is available',
      false, 'none found');
    RETURN;
  END IF;

  SELECT count(*) INTO _cfg_before FROM public.license_lifecycle_configs;
  SELECT count(*) INTO _audit_before FROM public.compliance_audit_logs
   WHERE object_type = 'license_lifecycle_configs';
  SELECT count(*) INTO _log_before FROM public.config_change_log
   WHERE table_name = 'license_lifecycle_configs';

  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _admin::text, 'role','authenticated')::text, true);

    -- create
    _cfg := public.admin_upsert_license_lifecycle_config(NULL, jsonb_build_object(
      'matter_kind','renewal', 'renewal_cycle','annual', 'period_days', 365,
      'renewal_window_days', 60, 'grace_period_days', 30,
      'notes','F5-B1 rollback-safe probe', 'change_reason','F5-B1 gate probe'));
    PERFORM pg_temp.rec('D','D-01','an authorised administrator can create lifecycle configuration through the governed path',
      _cfg IS NOT NULL, 'config=' || coalesce(_cfg::text,'null'));

    -- update
    PERFORM public.admin_upsert_license_lifecycle_config(_cfg, jsonb_build_object(
      'grace_period_days', 45, 'change_reason','F5-B1 gate probe update'));
    SELECT grace_period_days INTO _grace FROM public.license_lifecycle_configs WHERE id = _cfg;
    PERFORM pg_temp.rec('D','D-02','an authorised administrator can edit lifecycle configuration through the governed path',
      _grace = 45, 'grace_period_days=' || _grace);

    -- vocabulary validation
    BEGIN
      PERFORM public.admin_upsert_license_lifecycle_config(NULL,
        '{"matter_kind":"not_a_lifecycle_kind"}'::jsonb);
      _res := '00000';
    EXCEPTION WHEN others THEN _res := SQLSTATE || ': ' || left(SQLERRM,80);
    END;
    PERFORM pg_temp.rec('D','D-03','the governed path rejects an invalid lifecycle vocabulary value',
      _res <> '00000', 'result=' || _res);

    -- scope integrity
    BEGIN
      PERFORM public.admin_upsert_license_lifecycle_config(NULL, jsonb_build_object(
        'matter_kind','renewal', 'regulator_id', gen_random_uuid()));
      _res := '00000';
    EXCEPTION WHEN others THEN _res := SQLSTATE || ': ' || left(SQLERRM,80);
    END;
    PERFORM pg_temp.rec('D','D-04','the governed path rejects an unknown regulator scope',
      _res <> '00000', 'result=' || _res);

    -- retirement requires a reason
    BEGIN
      PERFORM public.admin_set_license_lifecycle_config_active(_cfg, false, NULL);
      _res := '00000';
    EXCEPTION WHEN others THEN _res := SQLSTATE || ': ' || left(SQLERRM,80);
    END;
    PERFORM pg_temp.rec('D','D-05','retiring a lifecycle configuration without a reason is refused',
      _res <> '00000', 'result=' || _res);

    PERFORM public.admin_set_license_lifecycle_config_active(_cfg, false, 'F5-B1 gate probe retirement');
    PERFORM pg_temp.rec('D','D-06','an authorised administrator can retire lifecycle configuration with a reason',
      NOT (SELECT is_active FROM public.license_lifecycle_configs WHERE id = _cfg), 'is_active=false');

    -- audit evidence
    SELECT count(*) INTO _audit_after FROM public.compliance_audit_logs
     WHERE object_type = 'license_lifecycle_configs';
    SELECT count(*) INTO _log_after FROM public.config_change_log
     WHERE table_name = 'license_lifecycle_configs';
    PERFORM pg_temp.rec('D','D-07','every governed configuration change produced audit evidence',
      _audit_after >= _audit_before + 3 AND _log_after >= _log_before + 3,
      format('compliance_audit_logs +%s, config_change_log +%s',
             _audit_after - _audit_before, _log_after - _log_before));

    RAISE EXCEPTION 'F5B1_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5B1_ROLLBACK' THEN
      PERFORM pg_temp.rec('D','D-99','the governed positive path executed without an unexpected error',
        false, SQLSTATE || ': ' || left(SQLERRM,160));
    END IF;
  END;

  PERFORM set_config('request.jwt.claims', '{}', true);
END $d$;

-- ===========================================================================
-- SECTION E — residue + wider F5-sensitive privilege regression
-- ===========================================================================
DO $e$
DECLARE _n int; _detail text;
BEGIN
  -- E-01 no probe residue anywhere
  SELECT (SELECT count(*) FROM public.regulatory_request_types WHERE key LIKE 'F5B1%')
       + (SELECT count(*) FROM public.license_lifecycle_configs WHERE notes LIKE 'F5-B1%')
    INTO _n;
  PERFORM pg_temp.rec('E','E-01','the gate left no synthetic records behind', _n = 0, 'residue rows=' || _n);

  -- E-02 wider F5-sensitive estate: no browser DML on lifecycle-effect tables
  SELECT count(*), coalesce(string_agg(t.tbl || ' ' || r.rolename || '/' || p.priv, ', '), 'none')
    INTO _n, _detail
    FROM (VALUES ('public.license_terms'),
                 ('public.license_variations'),
                 ('public.license_variation_items'),
                 ('public.license_lifecycle_matters'),
                 ('public.license_renewals'),
                 ('public.license_lifecycle_configs'),
                 ('public.regulatory_request_types'),
                 ('public.regulatory_service_tasks'),
                 ('public.services')) t(tbl)
    CROSS JOIN (VALUES ('anon'),('authenticated')) r(rolename)
    CROSS JOIN (VALUES ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(priv)
   WHERE has_table_privilege(r.rolename, t.tbl, p.priv);
  PERFORM pg_temp.rec('E','E-02','no browser role can write any F5-sensitive licence or service table',
    _n = 0, 'violations=' || _n || ' [' || _detail || ']');

  -- E-03 anon holds no read on the two governed configuration tables
  SELECT count(*), coalesce(string_agg(t.tbl, ', '), 'none') INTO _n, _detail
    FROM (VALUES ('public.license_lifecycle_configs'),
                 ('public.regulatory_request_types')) t(tbl)
   WHERE has_table_privilege('anon', t.tbl, 'SELECT');
  PERFORM pg_temp.rec('E','E-03','unauthenticated visitors cannot read governed post-licensing configuration',
    _n = 0, 'anon-readable=' || _n || ' [' || _detail || ']');
END $e$;

-- ===========================================================================
-- REPORT
-- ===========================================================================
SELECT section, id, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, descr, detail
  FROM f5b1_results ORDER BY seq;

DO $r$
DECLARE _p int; _f int; _detail text;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE NOT passed) INTO _p, _f FROM f5b1_results;
  RAISE NOTICE 'verify:f5b1 — % PASS / % FAIL', _p, _f;
  IF _f > 0 THEN
    SELECT string_agg(id || ' (' || detail || ')', '; ') INTO _detail FROM f5b1_results WHERE NOT passed;
    RAISE EXCEPTION 'verify:f5b1 FAILED — %', _detail;
  END IF;
END $r$;
