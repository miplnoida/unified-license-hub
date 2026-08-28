-- ============================================================================
-- F2-B — USERS, ENTITY IDENTITY & ONBOARDING REMEDIATION GATE
--
-- Proves the F2 remediation contract:
--   S1  privilege contract on the identity estate (GAP-F2-01)
--   S2  canonical entity identity convergence                (GAP-F2-02)
--   S3  uniqueness / ownership keys                          (GAP-F2-04)
--   S4  user-identity coverage                               (GAP-F2-05)
--   S5  onboarding token handling                            (GAP-F2-06)
--   S6  governed vocabularies                                (GAP-F2-07)
--   S7  capability + data-remediation registers, handoff     (GAP-F2-09/10)
--
-- Read-only apart from rolled-back probe transactions.
--
-- Usage:
--   psql -v ON_ERROR_STOP=1 -f scripts/verify-f2b-remediation.sql
-- ============================================================================

\set ON_ERROR_STOP on
SET client_min_messages = warning;

BEGIN;

DROP TABLE IF EXISTS f2b_results;
CREATE TEMP TABLE f2b_results (
  seq serial, stage text, id text, descr text, passed boolean, detail text
);

CREATE OR REPLACE FUNCTION pg_temp.rec(_stage text, _id text, _d text, _ok boolean, _detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO f2b_results (stage, id, descr, passed, detail) VALUES (_stage, _id, _d, _ok, _detail);
END $$;

-- Executes `_sql` as the `anon` API role; returns SQLSTATE ('00000' on success).
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
    _state := SQLSTATE || ': ' || left(SQLERRM, 160);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '{}', true);
  RETURN _state;
END $$;

-- Executes `_sql` as the `authenticated` API role impersonating `_uid`.
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
-- S1 — IDENTITY PRIVILEGE CONTRACT (GAP-F2-01)
-- Registry-derived: no table name is hard-coded.
-- ===========================================================================
DO $s1$
DECLARE _n int; _detail text; _res text; _probe text; _uid uuid;
BEGIN
  SELECT count(*) INTO _n FROM public.identity_governed_tables;
  PERFORM pg_temp.rec('S1','A-01','identity estate is registered under a governed privilege contract',
    _n >= 32, 'registered tables=' || _n);

  -- Every registered table must exist
  SELECT count(*), coalesce(string_agg(table_name, ', '), 'none') INTO _n, _detail
    FROM public.identity_governed_tables
   WHERE to_regclass('public.' || quote_ident(table_name)) IS NULL;
  PERFORM pg_temp.rec('S1','A-02','every registered identity table exists', _n = 0, 'missing=' || _n || ' [' || _detail || ']');

  -- A-03: anon holds nothing outside allowlisted SELECT
  WITH viol AS (
    SELECT g.table_name, p.priv
      FROM public.identity_governed_tables g
      CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(priv)
     WHERE to_regclass('public.' || quote_ident(g.table_name)) IS NOT NULL
       AND has_table_privilege('anon', 'public.' || quote_ident(g.table_name), p.priv)
       AND NOT (p.priv = 'SELECT' AND g.anon_select_allowed)
  )
  SELECT count(*), coalesce(string_agg(DISTINCT table_name || '/' || priv, ', '), 'none') INTO _n, _detail FROM viol;
  PERFORM pg_temp.rec('S1','A-03','public (not signed in) role holds no privilege on identity data outside allowlisted reads',
    _n = 0, 'violations=' || _n || ' [' || left(_detail, 400) || ']');

  -- A-04: authenticated holds no destructive/structural privilege at all
  WITH viol AS (
    SELECT g.table_name, p.priv
      FROM public.identity_governed_tables g
      CROSS JOIN (VALUES ('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(priv)
     WHERE to_regclass('public.' || quote_ident(g.table_name)) IS NOT NULL
       AND has_table_privilege('authenticated', 'public.' || quote_ident(g.table_name), p.priv)
  )
  SELECT count(*), coalesce(string_agg(DISTINCT table_name || '/' || priv, ', '), 'none') INTO _n, _detail FROM viol;
  PERFORM pg_temp.rec('S1','A-04','signed-in users hold no delete/truncate/structural privilege on identity data',
    _n = 0, 'violations=' || _n || ' [' || left(_detail, 400) || ']');

  -- A-05: authenticated INSERT/UPDATE only where the register justifies it
  WITH viol AS (
    SELECT g.table_name, p.priv
      FROM public.identity_governed_tables g
      CROSS JOIN (VALUES ('INSERT'),('UPDATE')) p(priv)
     WHERE to_regclass('public.' || quote_ident(g.table_name)) IS NOT NULL
       AND has_table_privilege('authenticated', 'public.' || quote_ident(g.table_name), p.priv)
       AND NOT (p.priv = ANY(g.authenticated_writes))
  )
  SELECT count(*), coalesce(string_agg(DISTINCT table_name || '/' || priv, ', '), 'none') INTO _n, _detail FROM viol;
  PERFORM pg_temp.rec('S1','A-05','signed-in direct writes exist only where the register records a justification',
    _n = 0, 'violations=' || _n || ' [' || left(_detail, 400) || ']');

  -- A-06: PUBLIC pseudo-role carries nothing
  WITH viol AS (
    SELECT c.relname, a.privilege_type
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
      CROSS JOIN LATERAL aclexplode(c.relacl) a
     WHERE c.relname IN (SELECT table_name FROM public.identity_governed_tables)
       AND a.grantee = 0
  )
  SELECT count(*), coalesce(string_agg(DISTINCT relname || '/' || privilege_type, ', '), 'none') INTO _n, _detail FROM viol;
  PERFORM pg_temp.rec('S1','A-06','no identity privilege is inherited through PUBLIC', _n = 0,
    'violations=' || _n || ' [' || left(_detail, 300) || ']');

  -- A-07: trusted backend keeps access
  SELECT count(*) INTO _n FROM public.identity_governed_tables g
   WHERE to_regclass('public.' || quote_ident(g.table_name)) IS NOT NULL
     AND NOT (has_table_privilege('service_role', 'public.' || quote_ident(g.table_name), 'SELECT')
              AND has_table_privilege('service_role', 'public.' || quote_ident(g.table_name), 'UPDATE'));
  PERFORM pg_temp.rec('S1','A-07','trusted backend role retains required access on the identity estate', _n = 0, 'missing=' || _n);

  -- A-08: RLS enabled everywhere in the register
  SELECT count(*), coalesce(string_agg(g.table_name, ', '), 'none') INTO _n, _detail
    FROM public.identity_governed_tables g
    JOIN pg_class c ON c.relname = g.table_name
    JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
   WHERE c.relkind = 'r' AND NOT c.relrowsecurity;
  PERFORM pg_temp.rec('S1','A-08','row level security is enabled on every registered identity table',
    _n = 0, 'without RLS=' || _n || ' [' || left(_detail, 300) || ']');

  -- Empirical negative probes on the identity core.
  _res := pg_temp.as_anon('TRUNCATE public.profiles');
  PERFORM pg_temp.rec('S1','P-01','public TRUNCATE of user profiles is refused (42501)', _res LIKE '42501%', _res);

  _res := pg_temp.as_anon('DELETE FROM public.entity_user_memberships WHERE false');
  PERFORM pg_temp.rec('S1','P-02','public DELETE of entity memberships is refused (42501)', _res LIKE '42501%', _res);

  _res := pg_temp.as_anon('UPDATE public.licensees SET name = name WHERE false');
  PERFORM pg_temp.rec('S1','P-03','public UPDATE of entity records is refused (42501)', _res LIKE '42501%', _res);

  _res := pg_temp.as_anon('SELECT 1 FROM public.onboarding_resolution_tokens LIMIT 1');
  PERFORM pg_temp.rec('S1','P-04','public read of onboarding tokens is refused (42501)', _res LIKE '42501%', _res);

  _res := pg_temp.as_anon('SELECT 1 FROM public.registration_journey_types LIMIT 1');
  PERFORM pg_temp.rec('S1','P-05','allowlisted public read of the registration journey catalogue still works',
    _res = '00000', _res);

  SELECT id INTO _uid FROM auth.users ORDER BY created_at LIMIT 1;
  IF _uid IS NOT NULL THEN
    _res := pg_temp.as_user(_uid, 'TRUNCATE public.entity_identifiers');
    PERFORM pg_temp.rec('S1','P-06','signed-in TRUNCATE of entity identifiers is refused (42501)', _res LIKE '42501%', _res);

    _res := pg_temp.as_user(_uid, 'DELETE FROM public.profiles WHERE false');
    PERFORM pg_temp.rec('S1','P-07','signed-in DELETE of user profiles is refused (42501)', _res LIKE '42501%', _res);

    _res := pg_temp.as_user(_uid, 'DELETE FROM public.onboarding_journey_state WHERE false');
    PERFORM pg_temp.rec('S1','P-08','signed-in DELETE of onboarding journey state is refused (42501)', _res LIKE '42501%', _res);
  ELSE
    PERFORM pg_temp.rec('S1','P-06','signed-in negative probes', NULL, 'no auth user fixture available');
  END IF;
END
$s1$;

-- ===========================================================================
-- S2 — CANONICAL ENTITY IDENTITY CONVERGENCE (GAP-F2-02)
-- ===========================================================================
DO $s2$
DECLARE _n int; _m int; _detail text;
BEGIN
  SELECT count(*) INTO _n FROM public.licensees WHERE party_id IS NULL;
  PERFORM pg_temp.rec('S2','B-01','every regulated entity is bound to a canonical organisation record', _n = 0, 'unbound=' || _n);

  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='licensees' AND column_name='party_id' AND is_nullable='NO';
  PERFORM pg_temp.rec('S2','B-02','the entity/organisation binding is structurally mandatory', _n = 1, 'not null columns=' || _n);

  SELECT count(*) INTO _n FROM public.parties p WHERE p.party_kind='ORGANIZATION'
    AND NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.party_id = p.id);
  PERFORM pg_temp.rec('S2','B-03','every organisation party has its organisation projection', _n = 0, 'missing=' || _n);

  SELECT count(*) INTO _n FROM public.parties p WHERE p.party_kind='PERSON'
    AND NOT EXISTS (SELECT 1 FROM public.persons x WHERE x.party_id = p.id);
  PERFORM pg_temp.rec('S2','B-04','every person party has its person projection', _n = 0, 'missing=' || _n);

  SELECT count(*) INTO _n FROM public.licensees;
  SELECT count(*) INTO _m FROM public.organizations;
  PERFORM pg_temp.rec('S2','B-05','entity count and organisation count no longer give two different answers',
    _m >= _n, 'entities=' || _n || ' organisations=' || _m);

  SELECT count(*) INTO _n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE c.relname='licensees' AND t.tgname='trg_licensees_ensure_party_binding' AND NOT t.tgisinternal;
  PERFORM pg_temp.rec('S2','B-06','new entity records converge automatically at creation', _n = 1, 'triggers=' || _n);

  SELECT count(*) INTO _n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE c.relname='parties' AND t.tgname='trg_parties_ensure_projection' AND NOT t.tgisinternal;
  PERFORM pg_temp.rec('S2','B-07','new party records get their projection in the same step', _n = 1, 'triggers=' || _n);

  -- Empirical: an entity insert without a party binding still converges.
  BEGIN
    INSERT INTO public.licensees (name, status)
    VALUES ('F2B CONVERGENCE PROBE ' || gen_random_uuid()::text, 'active');
    SELECT count(*) INTO _n FROM public.licensees l
     WHERE l.name LIKE 'F2B CONVERGENCE PROBE %'
       AND (l.party_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.party_id = l.party_id));
    PERFORM pg_temp.rec('S2','B-08','an entity created without a party binding is converged automatically', _n = 0, 'divergent probes=' || _n);
  EXCEPTION WHEN others THEN
    PERFORM pg_temp.rec('S2','B-08','an entity created without a party binding is converged automatically', false,
      SQLSTATE || ': ' || left(SQLERRM, 160));
  END;
END
$s2$;

-- ===========================================================================
-- S3 — UNIQUENESS / OWNERSHIP KEYS (GAP-F2-04)
-- ===========================================================================
DO $s3$
DECLARE _n int; _res text;
BEGIN
  SELECT count(*) INTO _n FROM pg_indexes WHERE schemaname='public' AND indexname='profiles_email_lower_uidx';
  PERFORM pg_temp.rec('S3','C-01','one user profile per e-mail address is enforced', _n = 1, 'indexes=' || _n);

  SELECT count(*) INTO _n FROM pg_indexes WHERE schemaname='public' AND indexname='pre_license_users_email_lower_uidx';
  PERFORM pg_temp.rec('S3','C-02','one pre-licensee user per e-mail address is enforced', _n = 1, 'indexes=' || _n);

  SELECT count(*) INTO _n FROM pg_indexes WHERE schemaname='public' AND indexname='licensees_name_lower_uidx';
  PERFORM pg_temp.rec('S3','C-03','entity legal name uniqueness is enforced for non-merged entities', _n = 1, 'indexes=' || _n);

  SELECT count(*) INTO _n FROM pg_indexes WHERE schemaname='public' AND indexname='registration_entity_bindings_registration_uidx';
  PERFORM pg_temp.rec('S3','C-04','a registration can bind to at most one entity', _n = 1, 'indexes=' || _n);

  -- Empirical duplicate rejection
  BEGIN
    INSERT INTO public.licensees (name, status)
    SELECT name, 'active' FROM public.licensees WHERE merged_into_entity_id IS NULL ORDER BY created_at LIMIT 1;
    PERFORM pg_temp.rec('S3','C-05','a duplicate entity name is rejected', false, 'insert unexpectedly succeeded');
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.rec('S3','C-05','a duplicate entity name is rejected', true, '23505 unique_violation');
  WHEN others THEN
    PERFORM pg_temp.rec('S3','C-05','a duplicate entity name is rejected', false, SQLSTATE || ': ' || left(SQLERRM,160));
  END;
END
$s3$;

-- ===========================================================================
-- S4 — USER IDENTITY COVERAGE (GAP-F2-05)
-- ===========================================================================
DO $s4$
DECLARE _n int; _detail text;
BEGIN
  SELECT count(*), coalesce(string_agg(u.id::text, ', '), 'none') INTO _n, _detail
    FROM auth.users u
   WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
     AND NOT EXISTS (SELECT 1 FROM public.pre_license_users pl WHERE pl.id = u.id);
  PERFORM pg_temp.rec('S4','D-01','every authenticated user has an identity record (profile or pre-licensee)',
    _n = 0, 'orphans=' || _n || ' [' || left(_detail, 200) || ']');

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace AND ns.nspname='public'
   WHERE p.proname='handle_new_user';
  PERFORM pg_temp.rec('S4','D-02','account creation is served by a single governed identity trigger function', _n = 1, 'functions=' || _n);

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace AND ns.nspname='public'
   WHERE p.proname='identity_integrity_report';
  PERFORM pg_temp.rec('S4','D-03','a staff-only identity integrity report exists', _n = 1, 'functions=' || _n);

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace AND ns.nspname='public'
   WHERE p.proname='identity_integrity_report'
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  PERFORM pg_temp.rec('S4','D-04','the identity integrity report is not callable without signing in', _n = 0, 'anon executable=' || _n);
END
$s4$;

-- ===========================================================================
-- S5 — ONBOARDING TOKEN HANDLING (GAP-F2-06)
-- ===========================================================================
DO $s5$
DECLARE _n int; _def text;
BEGIN
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='onboarding_resolution_tokens' AND column_name='token';
  PERFORM pg_temp.rec('S5','E-01','raw onboarding token values are no longer persisted', _n = 0, 'plaintext columns=' || _n);

  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='onboarding_resolution_tokens'
     AND column_name='token_hash' AND is_nullable='NO';
  PERFORM pg_temp.rec('S5','E-02','onboarding tokens are stored only as a mandatory irreversible fingerprint', _n = 1, 'columns=' || _n);

  SELECT count(*) INTO _n FROM pg_indexes
   WHERE schemaname='public' AND indexname='onboarding_resolution_tokens_hash_uidx';
  PERFORM pg_temp.rec('S5','E-03','token fingerprints are unique', _n = 1, 'indexes=' || _n);

  SELECT pg_get_functiondef(p.oid) INTO _def FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid=p.pronamespace AND ns.nspname='public'
   WHERE p.proname='onboarding_redeem_token' LIMIT 1;
  PERFORM pg_temp.rec('S5','E-04','single use is enforced inside the shared redeem primitive',
    _def ILIKE '%consumed_at IS NULL%' AND _def ILIKE '%SET consumed_at = now()%',
    'redeem enforces consumed_at=' || (_def ILIKE '%consumed_at IS NULL%')::text);

  PERFORM pg_temp.rec('S5','E-05','the redeem primitive still enforces expiry and step scope',
    _def ILIKE '%expires_at%' AND _def ILIKE '%token_kind = ANY%', 'checks present');

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace AND ns.nspname='public'
   WHERE p.proname IN ('onboarding_issue_token','onboarding_redeem_token')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  PERFORM pg_temp.rec('S5','E-06','token issue/redeem are not callable without signing in', _n = 0, 'anon executable=' || _n);

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace AND ns.nspname='public'
   WHERE p.proname='onboarding_issue_token' AND pg_get_functiondef(p.oid) ILIKE '%sha256%';
  PERFORM pg_temp.rec('S5','E-07','issued tokens are fingerprinted before storage', _n = 1, 'hashing issuers=' || _n);
END
$s5$;

-- ===========================================================================
-- S6 — GOVERNED VOCABULARIES (GAP-F2-07)
-- ===========================================================================
DO $s6$
DECLARE _n int; _m int; _detail text;
BEGIN
  SELECT count(*) INTO _n FROM public.onboarding_stage_catalogue WHERE is_active;
  PERFORM pg_temp.rec('S6','F-01','onboarding stages are configuration, not code', _n >= 6, 'active stages=' || _n);

  SELECT count(*) INTO _n FROM public.entity_membership_status_catalogue WHERE is_active;
  PERFORM pg_temp.rec('S6','F-02','membership statuses are configuration, not code', _n >= 7, 'active statuses=' || _n);

  -- Catalogue must match the database constraint vocabulary exactly.
  SELECT count(*) INTO _n
    FROM (SELECT key FROM public.onboarding_stage_catalogue) c
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_constraint k
      WHERE k.conrelid = 'public.onboarding_journey_state'::regclass
        AND k.conname = 'onboarding_journey_state_stage_check'
        AND pg_get_constraintdef(k.oid) LIKE '%''' || c.key || '''%');
  PERFORM pg_temp.rec('S6','F-03','every configured onboarding stage is a valid stored stage', _n = 0, 'mismatches=' || _n);

  SELECT count(*) INTO _n
    FROM (SELECT key FROM public.entity_membership_status_catalogue) c
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_constraint k
      WHERE k.conrelid = 'public.entity_user_memberships'::regclass
        AND k.conname = 'entity_user_memberships_status_chk'
        AND pg_get_constraintdef(k.oid) LIKE '%''' || c.key || '''%');
  PERFORM pg_temp.rec('S6','F-04','every configured membership status is a valid stored status', _n = 0, 'mismatches=' || _n);

  SELECT count(*) INTO _n FROM public.entity_membership_status_catalogue WHERE is_authority_sufficient;
  PERFORM pg_temp.rec('S6','F-05','exactly one membership status grants authority to act', _n = 1, 'authority statuses=' || _n);

  SELECT count(*) INTO _n FROM public.onboarding_stage_catalogue
   WHERE key='AUTHORITY_PENDING' AND resume_route='/register/authority-pending';
  PERFORM pg_temp.rec('S6','F-06','the pending-authority stage points at a real resume route', _n = 1, 'rows=' || _n);
END
$s6$;

-- ===========================================================================
-- S7 — CAPABILITY / DATA REGISTERS AND HANDOFF (GAP-F2-09, GAP-F2-10)
-- ===========================================================================
DO $s7$
DECLARE _n int; _detail text; _entity uuid; _res jsonb;
BEGIN
  SELECT count(*) INTO _n FROM public.identity_capability_register;
  PERFORM pg_temp.rec('S7','G-01','every identity capability is classified as wired, backlog or demoted', _n >= 7, 'classified=' || _n);

  SELECT count(*), coalesce(string_agg(capability_key, ', '), 'none') INTO _n, _detail
    FROM public.identity_capability_register WHERE coalesce(btrim(decision_note),'') = '';
  PERFORM pg_temp.rec('S7','G-02','every capability classification carries an explicit decision note', _n = 0,
    'unjustified=' || _n || ' [' || _detail || ']');

  SELECT count(*), coalesce(string_agg(object_name, ', '), 'none') INTO _n, _detail
    FROM public.identity_capability_register
   WHERE object_kind = 'TABLE' AND to_regclass('public.' || quote_ident(object_name)) IS NULL;
  PERFORM pg_temp.rec('S7','G-03','every classified capability object exists', _n = 0, 'missing=' || _n || ' [' || _detail || ']');

  SELECT count(*) INTO _n FROM public.identity_data_remediation_register;
  PERFORM pg_temp.rec('S7','G-04','known identity data issues are recorded with an owner note', _n >= 2, 'findings=' || _n);

  -- Register counts must still reflect live data (no stale evidence).
  SELECT count(*) INTO _n FROM public.licensees l
   WHERE NOT EXISTS (SELECT 1 FROM public.entity_user_memberships m WHERE m.entity_id=l.id)
     AND NOT EXISTS (SELECT 1 FROM public.entity_user_access a WHERE a.entity_id=l.id);
  PERFORM pg_temp.rec('S7','G-05','the recorded entities-without-an-owning-human count matches live data',
    _n = (SELECT observed_count FROM public.identity_data_remediation_register WHERE finding_key='ENTITY_WITHOUT_OWNING_HUMAN'),
    'live=' || _n);

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace AND ns.nspname='public'
   WHERE p.proname='onboarding_registration_handoff_ready';
  PERFORM pg_temp.rec('S7','G-06','a registration handoff readiness check exists', _n = 1, 'functions=' || _n);

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace AND ns.nspname='public'
   WHERE p.proname='onboarding_registration_handoff_ready' AND has_function_privilege('anon', p.oid, 'EXECUTE');
  PERFORM pg_temp.rec('S7','G-07','the handoff readiness check is not callable without signing in', _n = 0, 'anon executable=' || _n);

  -- Handoff blockers must be reported for an entity with no owning human.
  SELECT l.id INTO _entity FROM public.licensees l
   WHERE NOT EXISTS (SELECT 1 FROM public.entity_user_memberships m WHERE m.entity_id=l.id)
   ORDER BY l.created_at LIMIT 1;
  IF _entity IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', (SELECT id::text FROM auth.users ORDER BY created_at LIMIT 1), 'role','authenticated')::text, true);
    _res := public.onboarding_registration_handoff_ready(_entity);
    PERFORM set_config('request.jwt.claims', '{}', true);
    PERFORM pg_temp.rec('S7','G-08','handoff readiness reports blockers for an entity with no authorised human',
      (_res->>'ready') = 'false' AND jsonb_array_length(_res->'blockers') > 0, _res::text);
  ELSE
    PERFORM pg_temp.rec('S7','G-08','handoff readiness reports blockers for an entity with no authorised human', NULL, 'no fixture');
  END IF;
END
$s7$;

-- ===========================================================================
-- EVIDENCE
-- ===========================================================================
\pset border 2
SELECT stage, id, descr,
       CASE WHEN passed IS NULL THEN 'N/A' WHEN passed THEN 'TESTED_PASS' ELSE 'TESTED_FAIL' END AS result,
       detail
FROM f2b_results ORDER BY seq;

DO $sum$
DECLARE _p int; _f int; _n int;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE passed IS FALSE), count(*) FILTER (WHERE passed IS NULL)
    INTO _p, _f, _n FROM f2b_results;
  RAISE WARNING 'F2-B EVIDENCE SUMMARY: % TESTED_PASS / % TESTED_FAIL / % N-A', _p, _f, _n;
  IF _f > 0 THEN
    RAISE EXCEPTION 'F2-B remediation gate FAILED: % assertion(s) failed', _f;
  END IF;
END
$sum$;

-- Probe inserts (S2/S3) are intentionally discarded.
ROLLBACK;
