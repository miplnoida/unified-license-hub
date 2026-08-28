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
DECLARE _n int; _fn text; _detail text; _total int := 0; _anon int := 0; _auth int := 0;
BEGIN
  FOR _fn IN
    SELECT x FROM (VALUES
      ('service_license_compatible'),
      ('resolve_post_license_intake_context'),
      ('can_submit_application'),
      ('post_license_service_applicability'),
      ('is_post_license_filing')) t(x)
  LOOP
    SELECT count(*) INTO _n
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname = _fn
       AND p.prosecdef
       AND array_to_string(coalesce(p.proconfig,'{}'), ',') ILIKE '%search_path%';
    PERFORM pg_temp.rec('A','A-' || _fn,
      'public.' || _fn || ' exists as SECURITY DEFINER with a pinned search_path',
      _n = 1, 'matches=' || _n);
  END LOOP;

  -- the canonical F5 stage vocabulary is exactly post_license + renewal
  PERFORM pg_temp.rec('A','A-stages',
    'the supported F5 lifecycle stages are exactly post_license and renewal',
    (SELECT public.post_license_service_stages()) @> ARRAY['post_license','renewal']
    AND array_length(public.post_license_service_stages(),1) = 2,
    'stages=' || array_to_string(public.post_license_service_stages(), ','));

  FOR _fn IN
    SELECT x FROM (VALUES
      ('public.service_license_compatible(uuid,uuid)'),
      ('public.resolve_post_license_intake_context(uuid,uuid)'),
      ('public.can_submit_application(uuid)'),
      ('public.post_license_service_applicability(uuid,uuid)'),
      ('public.is_post_license_filing(uuid,uuid)')) t(x)
  LOOP
    _total := _total + 1;
    IF has_function_privilege('anon', _fn, 'EXECUTE') THEN _anon := _anon + 1; END IF;
    IF has_function_privilege('authenticated', _fn, 'EXECUTE') THEN _auth := _auth + 1; END IF;
  END LOOP;

  PERFORM pg_temp.rec('A','A-04','anon cannot execute the F5-B2 intake routines',
    _anon = 0, 'anon-executable=' || _anon || '/' || _total);
  PERFORM pg_temp.rec('A','A-05','authenticated can execute the F5-B2 intake routines',
    _auth = _total, 'executable=' || _auth || '/' || _total);
END $a$;

-- ===========================================================================
-- SECTION B — source contract of the governed intake RPCs
-- ===========================================================================
DO $b$
DECLARE _src text; _sub text; _can text; _ok boolean;
BEGIN
  SELECT pg_get_functiondef(oid) INTO _src FROM pg_proc
   WHERE pronamespace='public'::regnamespace AND proname='submit_application';
  SELECT pg_get_functiondef(oid) INTO _can FROM pg_proc
   WHERE pronamespace='public'::regnamespace AND proname='can_submit_application';
  SELECT pg_get_functiondef(oid) INTO _sub FROM pg_proc
   WHERE pronamespace='public'::regnamespace AND proname='create_application_draft';

  -- B-01 GAP-F5-02: creator-only blocker removed
  _ok := _src NOT ILIKE '%You do not own this application%';
  PERFORM pg_temp.rec('B','B-01','submit_application no longer refuses non-creators outright',
    _ok, CASE WHEN _ok THEN 'creator-only refusal absent' ELSE 'creator-only refusal still present' END);

  -- B-02 GAP-F5-02: authority delegated through the governed predicate, which
  --      itself derives authority from the entity `submit` capability
  _ok := _src ILIKE '%can_submit_application%'
         AND _can ILIKE '%entity_membership_capability%';
  PERFORM pg_temp.rec('B','B-02','submit_application derives authority from the governed entity `submit` capability predicate',
    _ok, 'submit->predicate=' || (_src ILIKE '%can_submit_application%')::text
         || ' predicate->capability=' || (_can ILIKE '%entity_membership_capability%')::text);

  -- B-02b F5-B2 DELTA: delegation is gated on canonical F5 classification
  _ok := _can ILIKE '%is_post_license_filing%';
  PERFORM pg_temp.rec('B','B-02b','can_submit_application gates delegation on canonical F5 classification',
    _ok, CASE WHEN _ok THEN 'classification gate present' ELSE 'classification gate missing' END);

  -- B-03 GAP-F5-01: taxonomy re-derived from the licence at submission
  _ok := _src ILIKE '%resolve_post_license_intake_context%';
  PERFORM pg_temp.rec('B','B-03','submit_application re-derives taxonomy from the licence',
    _ok, CASE WHEN _ok THEN 'canonical resolver used' ELSE 'canonical resolver missing' END);

  -- B-04 GAP-F5-15: applicability enforced server-side at submission
  _ok := _src ILIKE '%post_license_service_applicability%';
  PERFORM pg_temp.rec('B','B-04','submit_application enforces the F5 service applicability predicate',
    _ok, CASE WHEN _ok THEN 'applicability gate present' ELSE 'applicability gate missing' END);

  -- B-05 audit trail records the submitting authority
  _ok := _src ILIKE '%submission_authority%';
  PERFORM pg_temp.rec('B','B-05','submit_application records submitting authority in the audit trail',
    _ok, CASE WHEN _ok THEN 'submission_authority recorded' ELSE 'submission_authority missing' END);

  -- B-06 GAP-F5-01 at intake
  _ok := _sub ILIKE '%resolve_post_license_intake_context%';
  PERFORM pg_temp.rec('B','B-06','create_application_draft binds taxonomy from the licence',
    _ok, CASE WHEN _ok THEN 'canonical resolver used' ELSE 'canonical resolver missing' END);

  -- B-07 GAP-F5-15 at intake
  _ok := _sub ILIKE '%post_license_service_applicability%';
  PERFORM pg_temp.rec('B','B-07','create_application_draft enforces the F5 service applicability predicate',
    _ok, CASE WHEN _ok THEN 'applicability gate present' ELSE 'applicability gate missing' END);
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
     WHERE s.sub_sector_id = _lic.sub_sector_id AND s.status = 'active'
       AND lower(s.lifecycle_stage) = ANY (public.post_license_service_stages()) LIMIT 1;
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

  PERFORM pg_temp.rec('C','C-01','in-scope genuine F5 services are compatible with their licence',
    _tested > 0 AND _ok_ct = _tested, 'licences=' || _tested || ' compatible=' || _ok_ct);
  PERFORM pg_temp.rec('C','C-02','different-sub-sector services are refused for every sampled licence',
    _bad = '', coalesce(nullif(_bad,''), 'no violations'));

  -- C-03 null / unknown arguments are refused, never defaulted to allow
  PERFORM pg_temp.rec('C','C-03','null and unknown identifiers are refused (fail closed)',
    public.service_license_compatible(NULL, NULL) = false
    AND public.service_license_compatible(gen_random_uuid(), gen_random_uuid()) = false
    AND public.is_post_license_filing(NULL, NULL) = false,
    'null=' || public.service_license_compatible(NULL, NULL)::text
    || ' unknown=' || public.service_license_compatible(gen_random_uuid(), gen_random_uuid())::text);

  -- C-04 governed codes distinguish a missing licence from a missing service
  PERFORM pg_temp.rec('C','C-04','governed applicability codes are stable for missing bindings',
    public.post_license_service_applicability(NULL, NULL) = 'LICENSE_REQUIRED'
    AND public.post_license_service_applicability(NULL, gen_random_uuid()) = 'LICENSE_NOT_FOUND',
    'null/null=' || public.post_license_service_applicability(NULL, NULL)
    || ' null/unknown=' || public.post_license_service_applicability(NULL, gen_random_uuid()));
END $c$;

-- ===========================================================================
-- SECTION D — empirical submission authority (GAP-F5-02) + F5-B2 DELTA
-- Proves delegated authority is an F5 capability and does NOT reach F4 initial
-- licensing. Rollback-safe: fixtures live in an implicit savepoint that is
-- always discarded.
-- ===========================================================================
DO $d$
DECLARE
  _lic public.licenses;
  _svc uuid;
  _owner uuid;
  _delegate uuid;
  _viewer uuid;
  _foreign uuid;
  _other_entity uuid;
  _f5_app uuid;
  _f4_app uuid;
  _filing_role uuid;
  _viewer_role uuid;
  _r_owner boolean; _r_delegate boolean; _r_viewer boolean; _r_foreign boolean;
  _r_f4_owner boolean; _r_f4_delegate boolean;
  _c_viewer text; _c_delegate text; _c_f4_delegate text; _c_foreign text;
  _harness text := NULL;
BEGIN
  -- the membership table is keyed on public.licensees, so only a licence whose
  -- holder is a registered licensee can host the delegation fixtures
  SELECT l.* INTO _lic FROM public.licenses l
   WHERE l.sub_sector_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.licensees x WHERE x.id = l.holder_id)
     AND EXISTS (SELECT 1 FROM public.services s
                  WHERE s.sub_sector_id = l.sub_sector_id AND s.status='active'
                    AND lower(s.lifecycle_stage) = ANY (public.post_license_service_stages()))
   ORDER BY l.issued_at DESC LIMIT 1;

  SELECT s.id INTO _svc FROM public.services s
   WHERE s.sub_sector_id = _lic.sub_sector_id AND s.status='active'
     AND lower(s.lifecycle_stage) = ANY (public.post_license_service_stages()) LIMIT 1;

  SELECT id INTO _filing_role FROM public.entity_membership_roles WHERE key = 'FILING_USER';
  SELECT id INTO _viewer_role FROM public.entity_membership_roles WHERE key = 'VIEWER';

  SELECT p.id INTO _owner FROM public.profiles p ORDER BY p.created_at LIMIT 1;
  SELECT p.id INTO _delegate FROM public.profiles p WHERE p.id <> _owner ORDER BY p.created_at LIMIT 1;
  SELECT p.id INTO _viewer FROM public.profiles p
   WHERE p.id NOT IN (_owner, _delegate) ORDER BY p.created_at LIMIT 1;
  SELECT p.id INTO _foreign FROM public.profiles p
   WHERE p.id NOT IN (_owner, _delegate, _viewer) ORDER BY p.created_at LIMIT 1;
  SELECT x.id INTO _other_entity FROM public.licensees x
   WHERE x.id <> _lic.holder_id AND x.merged_into_entity_id IS NULL LIMIT 1;

  IF _lic.id IS NULL OR _svc IS NULL OR _filing_role IS NULL OR _viewer_role IS NULL
     OR _owner IS NULL OR _delegate IS NULL OR _viewer IS NULL OR _foreign IS NULL
     OR _other_entity IS NULL THEN
    PERFORM pg_temp.rec('D','D-00','fixtures available for the authority proof',
      false, 'insufficient fixtures in the live estate');
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.entity_user_memberships
      (user_id, entity_id, membership_role_id, status, approved_at, effective_from,
       authority_evidence_reference)
    VALUES (_delegate, _lic.holder_id,  _filing_role, 'APPROVED', now(), now(), 'F5-B2 probe'),
           (_viewer,   _lic.holder_id,  _viewer_role, 'APPROVED', now(), now(), 'F5-B2 probe'),
           (_foreign,  _other_entity,   _filing_role, 'APPROVED', now(), now(), 'F5-B2 probe');

    -- genuine F5 filing: licence bound + applicable F5 service
    INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id, regulator_id)
    VALUES (_owner, 'F5-B2 probe f5', 'draft',
            jsonb_build_object('type','post_license','license_id', _lic.id,
                               'service_id', _svc, 'licensee_id', _lic.holder_id),
            _lic.holder_id, _lic.regulator_id)
    RETURNING id INTO _f5_app;

    -- F4 initial licensing filing: no licence, no service
    INSERT INTO public.applications (applicant_id, license_type, status, data, entity_id, regulator_id)
    VALUES (_owner, 'F5-B2 probe f4', 'draft',
            jsonb_build_object('sector_id', _lic.sector_id, 'sub_sector_id', _lic.sub_sector_id),
            _lic.holder_id, _lic.regulator_id)
    RETURNING id INTO _f4_app;

    _r_owner    := pg_temp.bool_as_user(_owner,    format('public.can_submit_application(%L)', _f5_app));
    _r_delegate := pg_temp.bool_as_user(_delegate, format('public.can_submit_application(%L)', _f5_app));
    _r_viewer   := pg_temp.bool_as_user(_viewer,   format('public.can_submit_application(%L)', _f5_app));
    _r_foreign  := pg_temp.bool_as_user(_foreign,  format('public.can_submit_application(%L)', _f5_app));

    _r_f4_owner    := pg_temp.bool_as_user(_owner,    format('public.can_submit_application(%L)', _f4_app));
    _r_f4_delegate := pg_temp.bool_as_user(_delegate, format('public.can_submit_application(%L)', _f4_app));

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _viewer::text, 'role','authenticated')::text, true);
    SELECT (public.submit_application(_f5_app)->>'code') INTO _c_viewer;

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _foreign::text, 'role','authenticated')::text, true);
    SELECT (public.submit_application(_f5_app)->>'code') INTO _c_foreign;

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _delegate::text, 'role','authenticated')::text, true);
    SELECT (public.submit_application(_f5_app)->>'code') INTO _c_delegate;
    SELECT (public.submit_application(_f4_app)->>'code') INTO _c_f4_delegate;
    PERFORM set_config('request.jwt.claims', '{}', true);

    RAISE EXCEPTION 'F5B2_ROLLBACK';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'F5B2_ROLLBACK' THEN
      _harness := SQLSTATE || ': ' || left(SQLERRM,160);
    END IF;
    PERFORM set_config('request.jwt.claims', '{}', true);
  END;

  IF _harness IS NOT NULL THEN
    PERFORM pg_temp.rec('D','D-99','authority probe executed without harness error',
      false, _harness);
    RETURN;
  END IF;

  PERFORM pg_temp.rec('D','D-01','F5: the filing creator may submit',
    _r_owner IS TRUE, 'creator=' || coalesce(_r_owner::text,'null'));
  PERFORM pg_temp.rec('D','D-02','F5: an approved same-entity delegate with the submit capability may submit',
    _r_delegate IS TRUE, 'delegate=' || coalesce(_r_delegate::text,'null'));
  PERFORM pg_temp.rec('D','D-03','F5: a same-entity view-only member may not submit',
    _r_viewer IS FALSE, 'viewer=' || coalesce(_r_viewer::text,'null'));
  PERFORM pg_temp.rec('D','D-04','F5: submit_application refuses a view-only entity member',
    _c_viewer = 'FORBIDDEN', 'code=' || coalesce(_c_viewer,'null'));
  PERFORM pg_temp.rec('D','D-05','F5: the delegate clears the authority gate (blocked only by later controls)',
    coalesce(_c_delegate,'') <> 'FORBIDDEN', 'code=' || coalesce(_c_delegate,'success'));
  PERFORM pg_temp.rec('D','D-06','F5: a cross-entity delegate is denied',
    _r_foreign IS FALSE AND _c_foreign = 'FORBIDDEN',
    'predicate=' || coalesce(_r_foreign::text,'null') || ' code=' || coalesce(_c_foreign,'null'));

  -- PERMANENT F4 NON-REGRESSION ASSERTION.
  -- F5 delegated submission authority MUST NOT apply to F4 initial licensing.
  -- This is asserted here directly and is not inferred from certify:f3c or
  -- verify:f4b passing.
  PERFORM pg_temp.rec('D','D-07','F4 NON-REGRESSION: the original applicant of an initial application may still submit',
    _r_f4_owner IS TRUE, 'applicant=' || coalesce(_r_f4_owner::text,'null'));
  PERFORM pg_temp.rec('D','D-08','F4 NON-REGRESSION: a submit-capable same-entity delegate may NOT submit an initial (F4) application',
    _r_f4_delegate IS FALSE AND _c_f4_delegate = 'FORBIDDEN',
    'predicate=' || coalesce(_r_f4_delegate::text,'null') || ' code=' || coalesce(_c_f4_delegate,'null'));
END $d$;

-- ===========================================================================
-- SECTION E — empirical canonical taxonomy binding + classification hardening
-- ===========================================================================
DO $e$
DECLARE
  _lic public.licenses;
  _member uuid;
  _svc uuid;
  _bad_svc uuid;
  _pre_svc uuid;
  _inactive_svc uuid;
  _retired_svc uuid;
  _wrong_reg_svc uuid;
  _other_reg uuid;
  _app public.applications;
  _stored jsonb;
  _res_incompat text;
  _res_mismatch text;
  _res_prelicence text;
  _res_no_service text;
  _res_forged text;
  _draft_count int;
  _app_pre text; _app_inactive text; _app_retired text; _app_wrong_reg text; _app_other_sub text;
  _harness text := NULL;
BEGIN
  SELECT l.* INTO _lic
    FROM public.licenses l
    JOIN public.entity_user_memberships m ON m.entity_id = l.holder_id AND m.status = 'APPROVED'
   WHERE l.sub_sector_id IS NOT NULL
     AND lower(l.status) = 'active'
     AND EXISTS (SELECT 1 FROM public.services s
                  WHERE s.sub_sector_id = l.sub_sector_id AND s.status='active'
                    AND lower(s.lifecycle_stage) = ANY (public.post_license_service_stages()))
   ORDER BY l.issued_at DESC LIMIT 1;

  IF _lic.id IS NULL THEN
    PERFORM pg_temp.rec('E','E-00','fixtures available for the canonical-binding proof',
      false, 'no active licence with an approved member and in-scope F5 services');
    RETURN;
  END IF;

  SELECT m.user_id INTO _member FROM public.entity_user_memberships m
   WHERE m.entity_id = _lic.holder_id AND m.status = 'APPROVED' LIMIT 1;

  SELECT s.id INTO _svc FROM public.services s
   WHERE s.sub_sector_id = _lic.sub_sector_id AND s.status='active'
     AND lower(s.lifecycle_stage) = ANY (public.post_license_service_stages()) LIMIT 1;
  SELECT s.id INTO _bad_svc FROM public.services s
   WHERE s.sub_sector_id IS DISTINCT FROM _lic.sub_sector_id AND s.status='active'
     AND lower(s.lifecycle_stage) = ANY (public.post_license_service_stages()) LIMIT 1;
  SELECT r.id INTO _other_reg FROM public.regulators r
   WHERE r.id IS DISTINCT FROM public._resolve_effective_regulator(
           _lic.regulator_id, _lic.sector_id, _lic.category_id) LIMIT 1;

  BEGIN
    -- Synthetic catalogue fixtures, all discarded with the savepoint. Each one
    -- differs from a genuine F5 service in exactly ONE dimension.
    INSERT INTO public.services (sector_id, sub_sector_id, name, status, lifecycle_stage, effective_from)
    VALUES (_lic.sector_id, _lic.sub_sector_id, 'F5-B2 probe pre-licence', 'active', 'pre_license', now())
    RETURNING id INTO _pre_svc;

    INSERT INTO public.services (sector_id, sub_sector_id, name, status, lifecycle_stage, effective_from)
    VALUES (_lic.sector_id, _lic.sub_sector_id, 'F5-B2 probe inactive', 'inactive', 'post_license', now())
    RETURNING id INTO _inactive_svc;

    INSERT INTO public.services (sector_id, sub_sector_id, name, status, lifecycle_stage, effective_from, effective_to)
    VALUES (_lic.sector_id, _lic.sub_sector_id, 'F5-B2 probe retired', 'active', 'post_license',
            now() - interval '2 years', now() - interval '1 day')
    RETURNING id INTO _retired_svc;

    INSERT INTO public.services (sector_id, sub_sector_id, name, status, lifecycle_stage, effective_from, regulator_id)
    VALUES (_lic.sector_id, _lic.sub_sector_id, 'F5-B2 probe wrong regulator', 'active', 'post_license',
            now(), _other_reg)
    RETURNING id INTO _wrong_reg_svc;

    _app_pre       := public.post_license_service_applicability(_pre_svc, _lic.id);
    _app_inactive  := public.post_license_service_applicability(_inactive_svc, _lic.id);
    _app_retired   := public.post_license_service_applicability(_retired_svc, _lic.id);
    _app_wrong_reg := public.post_license_service_applicability(_wrong_reg_svc, _lic.id);
    _app_other_sub := CASE WHEN _bad_svc IS NULL THEN 'NO_FIXTURE'
                           ELSE public.post_license_service_applicability(_bad_svc, _lic.id) END;

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
    PERFORM set_config('request.jwt.claims', '{}', true);

    IF _bad_svc IS NOT NULL THEN
      _res_incompat := pg_temp.as_user(_member, format(
        'SELECT public.create_application_draft(%L, %L::jsonb, NULL)',
        'F5-B2 incompatible probe',
        jsonb_build_object('type','post_license','license_id', _lic.id, 'service_id', _bad_svc)::text));
    END IF;

    _res_mismatch := pg_temp.as_user(_member, format(
      'SELECT public.create_application_draft(%L, %L::jsonb, NULL)',
      'F5-B2 mismatch probe',
      jsonb_build_object('type','post_license','license_id', _lic.id, 'service_id', _svc,
                         'licensee_id', gen_random_uuid())::text));

    -- an arbitrary (non-F5) service id must NOT be able to classify a filing as F5
    _res_prelicence := pg_temp.as_user(_member, format(
      'SELECT public.create_application_draft(%L, %L::jsonb, NULL)',
      'F5-B2 prelicence probe',
      jsonb_build_object('type','post_license','license_id', _lic.id, 'service_id', _pre_svc)::text));

    -- forged type=post_license with no licence and no service
    _res_forged := pg_temp.as_user(_member, format(
      'SELECT public.create_application_draft(%L, %L::jsonb, NULL)',
      'F5-B2 forged probe',
      jsonb_build_object('type','post_license')::text));

    -- licence bound but no service
    _res_no_service := pg_temp.as_user(_member, format(
      'SELECT public.create_application_draft(%L, %L::jsonb, NULL)',
      'F5-B2 no-service probe',
      jsonb_build_object('type','post_license','license_id', _lic.id)::text));

    SELECT count(*) INTO _draft_count FROM public.applications
     WHERE license_type IN ('F5-B2 prelicence probe','F5-B2 forged probe','F5-B2 no-service probe');

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

  PERFORM pg_temp.rec('E','E-03','a different-sub-sector F5 service is refused at draft creation',
    _res_incompat ILIKE '%SERVICE_LICENSE_INCOMPATIBLE%',
    'result=' || coalesce(_res_incompat,'no fixture'));

  PERFORM pg_temp.rec('E','E-04','a mismatched entity claim is refused at draft creation',
    _res_mismatch ILIKE '%LICENSE_ENTITY_MISMATCH%', 'result=' || coalesce(_res_mismatch,'null'));

  -- F5-B2 DELTA: lifecycle-stage applicability
  PERFORM pg_temp.rec('E','E-05','a same-sub-sector PRE-LICENCE service is not an F5 service',
    _app_pre = 'POST_LICENSE_SERVICE_NOT_APPLICABLE', 'code=' || coalesce(_app_pre,'null'));
  PERFORM pg_temp.rec('E','E-06','an inactive F5 service is not applicable',
    _app_inactive = 'POST_LICENSE_SERVICE_NOT_APPLICABLE', 'code=' || coalesce(_app_inactive,'null'));
  PERFORM pg_temp.rec('E','E-07','an effectively retired (expired) F5 service is not applicable',
    _app_retired = 'POST_LICENSE_SERVICE_NOT_APPLICABLE', 'code=' || coalesce(_app_retired,'null'));
  PERFORM pg_temp.rec('E','E-08','a wrong-regulator service is incompatible with the licence',
    _app_wrong_reg = 'SERVICE_LICENSE_INCOMPATIBLE', 'code=' || coalesce(_app_wrong_reg,'null'));
  PERFORM pg_temp.rec('E','E-09','a different-sub-sector F5 service is incompatible',
    _app_other_sub = 'SERVICE_LICENSE_INCOMPATIBLE', 'code=' || coalesce(_app_other_sub,'null'));

  PERFORM pg_temp.rec('E','E-10','an arbitrary non-F5 service id cannot classify a filing as F5',
    _res_prelicence ILIKE '%POST_LICENSE_SERVICE_NOT_APPLICABLE%',
    'result=' || coalesce(_res_prelicence,'null'));
  PERFORM pg_temp.rec('E','E-11','a forged type=post_license with no licence or service is denied',
    _res_forged ILIKE '%LICENSE_REQUIRED%', 'result=' || coalesce(_res_forged,'null'));
  PERFORM pg_temp.rec('E','E-12','a licence-bound filing with no service is denied',
    _res_no_service ILIKE '%POST_LICENSE_SERVICE_REQUIRED%', 'result=' || coalesce(_res_no_service,'null'));
  PERFORM pg_temp.rec('E','E-13','no draft falls through to initial licensing when an F5 claim is refused',
    _draft_count = 0, 'drafts_created=' || coalesce(_draft_count::text,'null'));
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

  SELECT count(*) INTO _n FROM public.services WHERE name LIKE 'F5-B2 probe%';
  PERFORM pg_temp.rec('F','F-03','no probe catalogue service survives the run', _n = 0, 'residue=' || _n);
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
