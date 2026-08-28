-- ============================================================================
-- verify:f5b2 — F5-B2 POST-LICENSING INTAKE AUTHORITY & CANONICAL BINDING
--
-- Permanent gate for:
--   GAP-F5-01 (HIGH)   intake/submission trusted client-written taxonomy
--   GAP-F5-02 (HIGH)   submission wrongly restricted to the application creator
--   GAP-F5-15 (MEDIUM) service <-> licence compatibility enforced only in the UI
--
-- Static contract inspection alone is NOT accepted. Sections C-E behaviourally
-- prove: (1) the compatibility predicate refuses out-of-scope services,
-- (2) an entity delegate holding `submit` may submit while a view-only member
-- may not, and (3) client-supplied taxonomy is overwritten by licence-derived
-- truth at draft creation. Every empirical write runs inside a savepoint that is
-- always rolled back → zero residue.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f scripts/verify-f5b2-intake.sql
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
SET client_min_messages = notice;

DROP TABLE IF EXISTS f5b2_results;
CREATE TEMP TABLE f5b2_results (
  seq serial, section text, id text, descr text, passed boolean, detail text
);

DROP FUNCTION IF EXISTS pg_temp.rec(text,text,text,boolean,text);
CREATE OR REPLACE FUNCTION pg_temp.rec(_s text, _id text, _d text, _ok boolean, _detail text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO f5b2_results (section, id, descr, passed, detail)
  VALUES (_s, _id, _d, _ok, _detail);
END $$;

-- Run _sql as the given authenticated identity, returning the SQLSTATE or
-- '00000' on success. Identity is always reset, even on failure.
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

-- Evaluate a boolean expression as the given identity.
DROP FUNCTION IF EXISTS pg_temp.bool_as_user(uuid,text);
CREATE OR REPLACE FUNCTION pg_temp.bool_as_user(_uid uuid, _expr text)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE _v boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role','authenticated')::text, true);
  BEGIN
    EXECUTE 'SELECT (' || _expr || ')::boolean' INTO _v;
  EXCEPTION WHEN others THEN
    _v := NULL;
  END;
  PERFORM set_config('request.jwt.claims', '{}', true);
  RETURN _v;
END $$;

-- ===========================================================================
-- SECTION A — governed surface exists with the expected security contract
-- ===========================================================================
DO $a$
DECLARE _n int; _detail text;
BEGIN
  -- A-01/02/03 the three canonical routines exist, definer, search_path pinned
  FOR _detail IN
    SELECT x FROM (VALUES
      ('service_license_compatible'),
      ('resolve_post_license_intake_context'),
      ('can_submit_application')) t(x)
  LOOP
    SELECT count(*) INTO _n
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname = _detail
       AND p.prosecdef
       AND array_to_string(coalesce(p.proconfig,'{}'), ',') ILIKE '%search_path%';
    PERFORM pg_temp.rec('A','A-' || _detail,
      'public.' || _detail || ' exists as SECURITY DEFINER with a pinned search_path',
      _n = 1, 'matches=' || _n);
  END LOOP;

  -- A-04 no browser-facing routine is executable by unauthenticated visitors
  SELECT count(*), coalesce(string_agg(t.fn, ', '), 'none') INTO _n, _detail
    FROM (VALUES ('public.service_license_compatible(uuid,uuid)'),
                 ('public.resolve_post_license_intake_context(uuid,uuid)'),
                 ('public.can_submit_application(uuid)')) t(fn)
   WHERE has_function_privilege('anon', t.fn, 'EXECUTE');
  PERFORM pg_temp.rec('A','A-04','anon cannot execute the F5-B2 intake routines',
    _n = 0, 'anon-executable=' || _n || ' [' || _detail || ']');

  -- A-05 signed-in users can execute them (the app depends on it)
  SELECT count(*) INTO _n
    FROM (VALUES ('public.service_license_compatible(uuid,uuid)'),
                 ('public.resolve_post_license_intake_context(uuid,uuid)'),
                 ('public.can_submit_application(uuid)')) t(fn)
   WHERE has_function_privilege('authenticated', t.fn, 'EXECUTE');
  PERFORM pg_temp.rec('A','A-05','authenticated can execute the F5-B2 intake routines',
    _n = 3, 'executable=' || _n || '/3');
END $a$;

-- ===========================================================================
-- SECTION B — source contract of the two governed intake RPCs
-- ===========================================================================
DO $b$
DECLARE _src text; _ok boolean;
BEGIN
  SELECT pg_get_functiondef(oid) INTO _src FROM pg_proc
   WHERE pronamespace='public'::regnamespace AND proname='submit_application';

  -- B-01 GAP-F5-02: creator-only blocker removed
  _ok := _src NOT ILIKE '%You do not own this application%';
  PERFORM pg_temp.rec('B','B-01','submit_application no longer refuses non-creators outright',
    _ok, CASE WHEN _ok THEN 'creator-only refusal absent' ELSE 'creator-only refusal still present' END);

  -- B-02 GAP-F5-02: authority derived from entity membership capability
  _ok := _src ILIKE '%entity_membership_capability%';
  PERFORM pg_temp.rec('B','B-02','submit_application derives authority from entity `submit` capability',
    _ok, CASE WHEN _ok THEN 'capability check present' ELSE 'capability check missing' END);

  -- B-03 GAP-F5-01: taxonomy re-derived from the licence at submission
  _ok := _src ILIKE '%resolve_post_license_intake_context%';
  PERFORM pg_temp.rec('B','B-03','submit_application re-derives taxonomy from the licence',
    _ok, CASE WHEN _ok THEN 'canonical resolver used' ELSE 'canonical resolver missing' END);

  -- B-04 GAP-F5-15: compatibility enforced server-side at submission
  _ok := _src ILIKE '%service_license_compatible%';
  PERFORM pg_temp.rec('B','B-04','submit_application enforces service<->licence compatibility',
    _ok, CASE WHEN _ok THEN 'compatibility gate present' ELSE 'compatibility gate missing' END);

  -- B-05 audit trail records the submitting authority
  _ok := _src ILIKE '%submission_authority%';
  PERFORM pg_temp.rec('B','B-05','submit_application records submitting authority in the audit trail',
    _ok, CASE WHEN _ok THEN 'submission_authority recorded' ELSE 'submission_authority missing' END);

  SELECT pg_get_functiondef(oid) INTO _src FROM pg_proc
   WHERE pronamespace='public'::regnamespace AND proname='create_application_draft';

  -- B-06 GAP-F5-01 at intake
  _ok := _src ILIKE '%resolve_post_license_intake_context%';
  PERFORM pg_temp.rec('B','B-06','create_application_draft binds taxonomy from the licence',
    _ok, CASE WHEN _ok THEN 'canonical resolver used' ELSE 'canonical resolver missing' END);

  -- B-07 GAP-F5-15 at intake
  _ok := _src ILIKE '%service_license_compatible%';
  PERFORM pg_temp.rec('B','B-07','create_application_draft enforces service<->licence compatibility',
    _ok, CASE WHEN _ok THEN 'compatibility gate present' ELSE 'compatibility gate missing' END);
END $b$;

-- ===========================================================================
-- SECTION C — empirical service <-> licence compatibility matrix (GAP-F5-15)
-- ===========================================================================
DO $c$
DECLARE
  _lic public.licenses;
  _same uuid; _other uuid; _tested int := 0; _ok_ct int := 0; _bad text := '';
BEGIN
  FOR _lic IN
    SELECT l.* FROM public.licenses l
     WHERE l.sub_sector_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.services s
                    WHERE s.sub_sector_id = l.sub_sector_id AND s.status = 'active')
     ORDER BY l.issued_at DESC
     LIMIT 5
  LOOP
    SELECT s.id INTO _same FROM public.services s
     WHERE s.sub_sector_id = _lic.sub_sector_id AND s.status = 'active' LIMIT 1;
    SELECT s.id INTO _other FROM public.services s
     WHERE s.sub_sector_id IS DISTINCT FROM _lic.sub_sector_id AND s.status = 'active' LIMIT 1;

    _tested := _tested + 1;
    IF public.service_license_compatible(_same, _lic.id) THEN
      _ok_ct := _ok_ct + 1;
    ELSE
      _bad := _bad || 'in-scope refused for ' || _lic.license_number || '; ';
    END IF;

    IF _other IS NOT NULL AND public.service_license_compatible(_other, _lic.id) THEN
      _bad := _bad || 'out-of-scope accepted for ' || _lic.license_number || '; ';
    END IF;
  END LOOP;

  PERFORM pg_temp.rec('C','C-01','in-scope services are compatible with their licence',
    _tested > 0 AND _ok_ct = _tested, 'licences=' || _tested || ' compatible=' || _ok_ct);
  PERFORM pg_temp.rec('C','C-02','out-of-scope services are refused for every sampled licence',
    _bad = '', coalesce(nullif(_bad,''), 'no violations'));

  -- C-03 null / unknown arguments are refused, never defaulted to allow
  PERFORM pg_temp.rec('C','C-03','null and unknown identifiers are refused',
    public.service_license_compatible(NULL, NULL) = false
    AND public.service_license_compatible(gen_random_uuid(), gen_random_uuid()) = false,
    'null=' || public.service_license_compatible(NULL, NULL)::text
    || ' unknown=' || public.service_license_compatible(gen_random_uuid(), gen_random_uuid())::text);
END $c$;

-- ===========================================================================
-- SECTION D — empirical delegated submission authority (GAP-F5-02)
-- Rollback-safe: all fixtures created inside a savepoint that is released.
-- ===========================================================================
DO $d$
DECLARE
  _lic public.licenses;
  _owner uuid;
  _delegate uuid;
  _viewer uuid;
  _app_id uuid;
  _filing_role uuid;
  _viewer_role uuid;
  _res text;
  _r_owner boolean; _r_delegate boolean; _r_viewer boolean;
  _c_viewer text; _c_delegate text;
  _harness text := NULL;
BEGIN
  -- the membership table is keyed on public.licensees, so only a licence whose
  -- holder is a registered licensee can host the delegation fixtures
  SELECT l.* INTO _lic FROM public.licenses l
   WHERE l.sub_sector_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.licensees x WHERE x.id = l.holder_id)
   ORDER BY l.issued_at DESC LIMIT 1;

  SELECT id INTO _filing_role FROM public.entity_membership_roles WHERE key = 'FILING_USER';
  SELECT id INTO _viewer_role FROM public.entity_membership_roles WHERE key = 'VIEWER';

  SELECT p.id INTO _owner FROM public.profiles p ORDER BY p.created_at LIMIT 1;
  SELECT p.id INTO _delegate FROM public.profiles p WHERE p.id <> _owner ORDER BY p.created_at LIMIT 1;
  SELECT p.id INTO _viewer FROM public.profiles p
   WHERE p.id NOT IN (_owner, _delegate) ORDER BY p.created_at LIMIT 1;

  IF _lic.id IS NULL OR _filing_role IS NULL OR _viewer_role IS NULL
     OR _owner IS NULL OR _delegate IS NULL OR _viewer IS NULL THEN
    PERFORM pg_temp.rec('D','D-00','fixtures available for the delegated-authority proof',
      false, 'insufficient fixtures in the live estate');
    RETURN;
  END IF;

  BEGIN
    -- implicit savepoint: every fixture below is discarded by the raise at the end
    INSERT INTO public.entity_user_memberships
      (user_id, entity_id, membership_role_id, status, approved_at, effective_from,
       authority_evidence_reference)
    VALUES (_delegate, _lic.holder_id, _filing_role, 'APPROVED', now(), now(), 'F5-B2 probe'),
           (_viewer,   _lic.holder_id, _viewer_role, 'APPROVED', now(), now(), 'F5-B2 probe');

    INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id, regulator_id)
    VALUES (_owner, 'F5-B2 probe', 'draft',
            jsonb_build_object('type','post_license','license_id', _lic.id,
                               'licensee_id', _lic.holder_id),
            _lic.holder_id, _lic.regulator_id)
    RETURNING id INTO _app_id;

    _r_owner    := pg_temp.bool_as_user(_owner,    format('public.can_submit_application(%L)', _app_id));
    _r_delegate := pg_temp.bool_as_user(_delegate, format('public.can_submit_application(%L)', _app_id));
    _r_viewer   := pg_temp.bool_as_user(_viewer,   format('public.can_submit_application(%L)', _app_id));

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _viewer::text, 'role','authenticated')::text, true);
    SELECT (public.submit_application(_app_id)->>'code') INTO _c_viewer;

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _delegate::text, 'role','authenticated')::text, true);
    SELECT (public.submit_application(_app_id)->>'code') INTO _c_delegate;
    PERFORM set_config('request.jwt.claims', '{}', true);

    RAISE EXCEPTION 'F5B2_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5B2_ROLLBACK' THEN
      _harness := SQLSTATE || ': ' || left(SQLERRM,160);
    END IF;
    PERFORM set_config('request.jwt.claims', '{}', true);
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('D','D-99','delegated-authority probe executed without harness error',
      false, _harness);
    RETURN;
  END IF;

  PERFORM pg_temp.rec('D','D-01','the filing creator may submit',
    _r_owner IS TRUE, 'creator=' || coalesce(_r_owner::text,'null'));
  PERFORM pg_temp.rec('D','D-02','an approved entity delegate with the submit capability may submit',
    _r_delegate IS TRUE, 'delegate=' || coalesce(_r_delegate::text,'null'));
  PERFORM pg_temp.rec('D','D-03','a view-only entity member may not submit',
    _r_viewer IS FALSE, 'viewer=' || coalesce(_r_viewer::text,'null'));
  PERFORM pg_temp.rec('D','D-04','submit_application refuses a view-only entity member',
    _c_viewer = 'FORBIDDEN', 'code=' || coalesce(_c_viewer,'null'));
  PERFORM pg_temp.rec('D','D-05','the entity delegate clears the authority gate (blocked only by later controls)',
    coalesce(_c_delegate,'') <> 'FORBIDDEN', 'code=' || coalesce(_c_delegate,'success'));
END $d$;

-- ===========================================================================
-- SECTION E — empirical canonical taxonomy binding at intake (GAP-F5-01)
-- ===========================================================================
DO $e$
DECLARE
  _lic public.licenses;
  _member uuid;
  _svc uuid;
  _bad_svc uuid;
  _app public.applications;
  _stored jsonb;
  _res_incompat text;
  _res_mismatch text;
  _harness text := NULL;
BEGIN
  SELECT l.* INTO _lic
    FROM public.licenses l
    JOIN public.entity_user_memberships m ON m.entity_id = l.holder_id AND m.status = 'APPROVED'
   WHERE l.sub_sector_id IS NOT NULL
     AND lower(l.status) = 'active'
     AND EXISTS (SELECT 1 FROM public.services s
                  WHERE s.sub_sector_id = l.sub_sector_id AND s.status='active')
   ORDER BY l.issued_at DESC LIMIT 1;

  IF _lic.id IS NULL THEN
    PERFORM pg_temp.rec('E','E-00','fixtures available for the canonical-binding proof',
      false, 'no active licence with an approved member and in-scope services');
    RETURN;
  END IF;

  SELECT m.user_id INTO _member FROM public.entity_user_memberships m
   WHERE m.entity_id = _lic.holder_id AND m.status = 'APPROVED' LIMIT 1;

  SELECT s.id INTO _svc FROM public.services s
   WHERE s.sub_sector_id = _lic.sub_sector_id AND s.status='active' LIMIT 1;
  SELECT s.id INTO _bad_svc FROM public.services s
   WHERE s.sub_sector_id IS DISTINCT FROM _lic.sub_sector_id AND s.status='active' LIMIT 1;

  BEGIN
    -- implicit savepoint: role grant, draft and probes are all discarded below
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_member, 'licensee_primary'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _member::text, 'role','authenticated')::text, true);

    SELECT * INTO _app FROM public.create_application_draft(
      'F5-B2 canonical probe',
      jsonb_build_object(
        'type','post_license',
        'license_id', _lic.id,
        'service_id', _svc,
        'sector_id', gen_random_uuid(),
        'sub_sector_id', gen_random_uuid(),
        'category_id', gen_random_uuid()
      ),
      NULL);
    _stored := _app.data;

    IF _bad_svc IS NOT NULL THEN
      _res_incompat := pg_temp.as_user(_member, format(
        'SELECT public.create_application_draft(%L, %L::jsonb, NULL)',
        'F5-B2 incompatible probe',
        jsonb_build_object('type','post_license','license_id', _lic.id, 'service_id', _bad_svc)::text));
    END IF;

    _res_mismatch := pg_temp.as_user(_member, format(
      'SELECT public.create_application_draft(%L, %L::jsonb, NULL)',
      'F5-B2 mismatch probe',
      jsonb_build_object('type','post_license','license_id', _lic.id,
                         'licensee_id', gen_random_uuid())::text));

    PERFORM set_config('request.jwt.claims', '{}', true);
    RAISE EXCEPTION 'F5B2_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5B2_ROLLBACK' THEN
      _harness := SQLSTATE || ': ' || left(SQLERRM,160);
    END IF;
    PERFORM set_config('request.jwt.claims', '{}', true);
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('E','E-99','canonical-binding probe executed without harness error',
      false, _harness);
    RETURN;
  END IF;

  PERFORM pg_temp.rec('E','E-01','client-supplied taxonomy is overwritten with licence-derived values',
    (_stored->>'sector_id')::uuid IS NOT DISTINCT FROM _lic.sector_id
    AND (_stored->>'sub_sector_id')::uuid IS NOT DISTINCT FROM _lic.sub_sector_id
    AND (_stored->>'category_id')::uuid IS NOT DISTINCT FROM _lic.category_id,
    'stored sector=' || coalesce(_stored->>'sector_id','null')
    || ' licence sector=' || coalesce(_lic.sector_id::text,'null'));

  PERFORM pg_temp.rec('E','E-02','the filing entity is derived from the licence holder',
    _app.entity_id IS NOT DISTINCT FROM _lic.holder_id
    AND (_stored->>'licensee_id')::uuid IS NOT DISTINCT FROM _lic.holder_id,
    'entity=' || coalesce(_app.entity_id::text,'null')
    || ' holder=' || coalesce(_lic.holder_id::text,'null'));

  PERFORM pg_temp.rec('E','E-03','an out-of-scope service is refused at draft creation',
    _res_incompat ILIKE '%SERVICE_LICENSE_INCOMPATIBLE%',
    'result=' || coalesce(_res_incompat,'no fixture'));

  PERFORM pg_temp.rec('E','E-04','a mismatched entity claim is refused at draft creation',
    _res_mismatch ILIKE '%LICENSE_ENTITY_MISMATCH%', 'result=' || coalesce(_res_mismatch,'null'));
END $e$;

-- ===========================================================================
-- SECTION F — zero residue
-- ===========================================================================
DO $f$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM public.applications
   WHERE license_type LIKE 'F5-B2 %';
  PERFORM pg_temp.rec('F','F-01','no probe application survives the run', _n = 0, 'residue=' || _n);

  SELECT count(*) INTO _n FROM public.entity_user_memberships m
   WHERE m.authority_evidence_reference = 'F5-B2 probe';
  PERFORM pg_temp.rec('F','F-02','no probe membership survives the run', _n = 0, 'residue=' || _n);
END $f$;

-- ===========================================================================
-- REPORT
-- ===========================================================================
SELECT section, id, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, descr, detail
  FROM f5b2_results ORDER BY seq;

DO $r$
DECLARE _p int; _f int; _detail text;
BEGIN
  SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE NOT passed) INTO _p, _f FROM f5b2_results;
  RAISE NOTICE 'verify:f5b2 — % PASS / % FAIL', _p, _f;
  IF _f > 0 THEN
    SELECT string_agg(id || ' (' || detail || ')', '; ') INTO _detail FROM f5b2_results WHERE NOT passed;
    RAISE EXCEPTION 'verify:f5b2 FAILED — %', _detail;
  END IF;
END $r$;

DROP TABLE IF EXISTS f5b2_results;
DROP FUNCTION IF EXISTS pg_temp.rec(text,text,text,boolean,text);
DROP FUNCTION IF EXISTS pg_temp.as_user(uuid,text);
DROP FUNCTION IF EXISTS pg_temp.bool_as_user(uuid,text);
