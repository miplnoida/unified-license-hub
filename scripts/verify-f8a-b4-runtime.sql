-- ============================================================================
-- F8A-B4 RUNTIME SMOKE GATE
--
-- Unlike scripts/verify-f8a-b4.sql (contract + RBAC assertions with rollback
-- fixtures), this gate probes the *connected environment*: every governed B4
-- RPC must exist live with the callable signature the frontend uses, and every
-- routed B4 screen's backend call must actually execute.
--
-- Failure classes are reported distinctly and never conflated:
--   MISSING_FUNCTION / SIGNATURE_MISMATCH / MISSING_RELATION / MISSING_COLUMN
--   / SCHEMA_CACHE / AUTHORIZATION / SHAPE_MISMATCH / BACKEND_ERROR
-- A legitimately empty result is only a PASS when the RPC itself executed.
--
-- Usage:
--   psql -v ON_ERROR_STOP=1 -f scripts/verify-f8a-b4-runtime.sql
-- ============================================================================
\set ON_ERROR_STOP on
SET row_security = on;
SET client_min_messages = notice;

DO $runtime$
DECLARE
  pass int := 0; fail int := 0;
  sig text; v_n int; v_json jsonb; v_admin uuid;
  v_addr uuid; v_party uuid; v_entity uuid;
  SIGS text[] := ARRAY[
    'address_upsert_canonical(text,text,text,text,text,text,text,text,uuid,uuid,uuid)',
    'address_usage_propose(uuid,text,uuid,text,date,text,uuid,text)',
    'address_usage_approve(uuid,boolean)',
    'address_usage_end(uuid,date)',
    'address_common_matches(uuid,date,integer)',
    'address_360_overview(uuid,date)',
    'relationship_intelligence_search(text,text[],integer)',
    'address_projection_queue()',
    'address_project_sources()',
    'person_address_intelligence(uuid,date)',
    'address_usage_visible(uuid,text,uuid)',
    'address_normalize_key(text,text,text,text,text,text,text)',
    'address_norm_street(text)',
    'address_require(text)'
  ];
BEGIN
  -- ==========================================================================
  -- 1. LIVE FUNCTION EXISTENCE + CALLABLE SIGNATURE
  -- ==========================================================================
  FOREACH sig IN ARRAY SIGS LOOP
    BEGIN
      PERFORM ('public.' || sig)::regprocedure;
      pass := pass + 1;
      RAISE NOTICE 'PASS  contract  %', sig;
    EXCEPTION WHEN undefined_function THEN
      fail := fail + 1;
      RAISE WARNING 'FAIL  MISSING_FUNCTION/SIGNATURE_MISMATCH  %', sig;
    END;
  END LOOP;

  -- executable by authenticated, never by anon/PUBLIC
  SELECT count(*) INTO v_n FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname IN (
     'address_upsert_canonical','address_usage_propose','address_usage_approve',
     'address_usage_end','address_common_matches','address_360_overview',
     'relationship_intelligence_search','address_projection_queue',
     'address_project_sources','person_address_intelligence')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('public', p.oid, 'EXECUTE'));
  IF v_n = 0 THEN pass:=pass+1; RAISE NOTICE 'PASS  anon EXECUTE revoked on every B4 RPC';
  ELSE fail:=fail+1; RAISE WARNING 'FAIL  AUTHORIZATION  % B4 RPCs are anon-executable', v_n; END IF;

  -- ==========================================================================
  -- 2. LIVE RELATIONS + COLUMNS THE SCREENS READ
  -- ==========================================================================
  BEGIN
    PERFORM 'public.addresses'::regclass; PERFORM 'public.address_usages'::regclass;
    pass:=pass+1; RAISE NOTICE 'PASS  relations addresses / address_usages exist';
  EXCEPTION WHEN undefined_table THEN
    fail:=fail+1; RAISE WARNING 'FAIL  MISSING_RELATION  canonical address relations'; END;

  BEGIN
    -- exactly the projection SubjectAddressPanel selects (RLS-governed read)
    PERFORM u.id, u.address_id, u.usage_type, u.approval_status, u.effective_from,
            u.effective_to, u.source_kind, u.source_detail,
            a.street_line1, a.street_line2, a.unit, a.locality, a.admin_area,
            a.postal_code, a.country_code, a.normalized_key
      FROM public.address_usages u
      LEFT JOIN public.addresses a ON a.id = u.address_id
     LIMIT 1;
    pass:=pass+1; RAISE NOTICE 'PASS  screen query  SubjectAddressPanel column contract';
  EXCEPTION
    WHEN undefined_column THEN fail:=fail+1;
      RAISE WARNING 'FAIL  MISSING_COLUMN  SubjectAddressPanel: %', SQLERRM;
    WHEN undefined_table THEN fail:=fail+1;
      RAISE WARNING 'FAIL  MISSING_RELATION  SubjectAddressPanel: %', SQLERRM;
    WHEN others THEN fail:=fail+1;
      RAISE WARNING 'FAIL  BACKEND_ERROR  SubjectAddressPanel: %', SQLERRM; END;

  -- ==========================================================================
  -- 3. EXECUTE EACH ROUTED SCREEN'S BACKEND CALL AS A REAL PERSONA
  -- ==========================================================================
  SELECT p.id INTO v_admin FROM public.profiles p
   WHERE public.is_super_admin(p.id) ORDER BY p.id LIMIT 1;
  IF v_admin IS NULL THEN
    fail:=fail+1; RAISE WARNING 'FAIL  no privileged persona available for runtime probes';
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

    SELECT id INTO v_addr FROM public.addresses ORDER BY created_at LIMIT 1;
    SELECT party_id INTO v_party FROM public.persons ORDER BY party_id LIMIT 1;
    SELECT id INTO v_entity FROM public.licensees ORDER BY id LIMIT 1;

    -- 3a. Address 360 screen
    BEGIN
      IF v_addr IS NULL THEN
        -- no canonical address yet: the RPC must still execute and reject cleanly
        BEGIN
          PERFORM public.address_360_overview(gen_random_uuid(), CURRENT_DATE);
          fail:=fail+1; RAISE WARNING 'FAIL  SHAPE_MISMATCH  Address 360 accepted an unknown id';
        EXCEPTION WHEN others THEN
          IF SQLERRM LIKE '%ADDRESS_NOT_FOUND%' THEN
            pass:=pass+1; RAISE NOTICE 'PASS  screen  Address 360 executed (no canonical address live; NOT_FOUND path)';
          ELSE RAISE; END IF; END;
      ELSE
        v_json := public.address_360_overview(v_addr, CURRENT_DATE);
        IF v_json ? 'address' AND v_json ? 'occupants' AND v_json ? 'occupant_count'
           AND v_json ? 'as_of' AND (v_json->'address') ? 'normalized_key'
        THEN pass:=pass+1; RAISE NOTICE 'PASS  screen  Address 360 executed with the expected shape';
        ELSE fail:=fail+1; RAISE WARNING 'FAIL  SHAPE_MISMATCH  Address 360: %', v_json; END IF;
      END IF;
    EXCEPTION
      WHEN undefined_function THEN fail:=fail+1; RAISE WARNING 'FAIL  MISSING_FUNCTION  Address 360';
      WHEN undefined_table THEN fail:=fail+1; RAISE WARNING 'FAIL  MISSING_RELATION  Address 360: %', SQLERRM;
      WHEN undefined_column THEN fail:=fail+1; RAISE WARNING 'FAIL  MISSING_COLUMN  Address 360: %', SQLERRM;
      WHEN others THEN
        IF SQLERRM LIKE '%ADDRESS_PERMISSION_DENIED%' OR SQLERRM LIKE '%ADDRESS_AUTH_REQUIRED%'
        THEN fail:=fail+1; RAISE WARNING 'FAIL  AUTHORIZATION  Address 360: %', SQLERRM;
        ELSE fail:=fail+1; RAISE WARNING 'FAIL  BACKEND_ERROR  Address 360: %', SQLERRM; END IF; END;

    -- 3b. common matches (Address 360 co-location table)
    BEGIN
      SELECT count(*) INTO v_n FROM public.address_common_matches(
        coalesce(v_addr, gen_random_uuid()), CURRENT_DATE, 50);
      pass:=pass+1; RAISE NOTICE 'PASS  screen  address_common_matches executed (% rows)', v_n;
    EXCEPTION
      WHEN undefined_function THEN fail:=fail+1; RAISE WARNING 'FAIL  MISSING_FUNCTION  address_common_matches';
      WHEN undefined_column THEN fail:=fail+1; RAISE WARNING 'FAIL  MISSING_COLUMN  address_common_matches: %', SQLERRM;
      WHEN others THEN
        -- with no canonical address live, a clean NOT_FOUND still proves the RPC executed
        IF v_addr IS NULL AND SQLERRM LIKE '%ADDRESS_NOT_FOUND%' THEN
          pass:=pass+1;
          RAISE NOTICE 'PASS  screen  address_common_matches executed (no canonical address live; NOT_FOUND path)';
        ELSE fail:=fail+1; RAISE WARNING 'FAIL  BACKEND_ERROR  address_common_matches: %', SQLERRM; END IF; END;

    -- 3c. Relationship Intelligence Search screen
    BEGIN
      SELECT count(*) INTO v_n FROM public.relationship_intelligence_search(
        'Basseterre', ARRAY['ENTITY','PERSON','ADDRESS'], 25);
      pass:=pass+1; RAISE NOTICE 'PASS  screen  relationship_intelligence_search executed (% rows)', v_n;
    EXCEPTION
      WHEN undefined_function THEN fail:=fail+1; RAISE WARNING 'FAIL  MISSING_FUNCTION  relationship_intelligence_search';
      WHEN undefined_table THEN fail:=fail+1; RAISE WARNING 'FAIL  MISSING_RELATION  intelligence search: %', SQLERRM;
      WHEN undefined_column THEN fail:=fail+1; RAISE WARNING 'FAIL  MISSING_COLUMN  intelligence search: %', SQLERRM;
      WHEN others THEN fail:=fail+1; RAISE WARNING 'FAIL  BACKEND_ERROR  intelligence search: %', SQLERRM; END;

    -- input guard must be a validation error, not a crash
    BEGIN
      PERFORM public.relationship_intelligence_search('ab', ARRAY['ENTITY'], 25);
      fail:=fail+1; RAISE WARNING 'FAIL  intelligence search accepted a 2-character query';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%INTELLIGENCE_QUERY_TOO_SHORT%'
      THEN pass:=pass+1; RAISE NOTICE 'PASS  screen  intelligence search rejects too-short input';
      ELSE fail:=fail+1; RAISE WARNING 'FAIL  BACKEND_ERROR  short-query guard: %', SQLERRM; END IF; END;

    -- 3d. projection queue panel
    BEGIN
      SELECT count(*) INTO v_n FROM public.address_projection_queue();
      pass:=pass+1; RAISE NOTICE 'PASS  screen  address_projection_queue executed (% rows)', v_n;
    EXCEPTION
      WHEN undefined_function THEN fail:=fail+1; RAISE WARNING 'FAIL  MISSING_FUNCTION  address_projection_queue';
      WHEN undefined_table THEN fail:=fail+1; RAISE WARNING 'FAIL  MISSING_RELATION  projection queue: %', SQLERRM;
      WHEN undefined_column THEN fail:=fail+1; RAISE WARNING 'FAIL  MISSING_COLUMN  projection queue: %', SQLERRM;
      WHEN others THEN fail:=fail+1; RAISE WARNING 'FAIL  BACKEND_ERROR  projection queue: %', SQLERRM; END;

    -- 3e. Person 360 address panel
    BEGIN
      v_json := public.person_address_intelligence(coalesce(v_party, gen_random_uuid()), CURRENT_DATE);
      IF v_json ? 'party_id' AND v_json ? 'as_of' AND v_json ? 'addresses'
         AND jsonb_typeof(v_json->'addresses') = 'array'
      THEN pass:=pass+1; RAISE NOTICE 'PASS  screen  Person 360 address panel executed with the expected shape';
      ELSE fail:=fail+1; RAISE WARNING 'FAIL  SHAPE_MISMATCH  Person 360 address panel: %', v_json; END IF;
    EXCEPTION
      WHEN undefined_function THEN fail:=fail+1; RAISE WARNING 'FAIL  MISSING_FUNCTION  person_address_intelligence';
      WHEN undefined_table THEN fail:=fail+1; RAISE WARNING 'FAIL  MISSING_RELATION  Person 360 addresses: %', SQLERRM;
      WHEN undefined_column THEN fail:=fail+1; RAISE WARNING 'FAIL  MISSING_COLUMN  Person 360 addresses: %', SQLERRM;
      WHEN others THEN fail:=fail+1; RAISE WARNING 'FAIL  BACKEND_ERROR  Person 360 addresses: %', SQLERRM; END;

    -- 3f. Entity 360 address panel — the SAME canonical primitive, no second implementation
    BEGIN
      SELECT count(*) INTO v_n FROM public.address_usages u
       WHERE u.subject_kind = 'ENTITY' AND u.subject_id = coalesce(v_entity, gen_random_uuid());
      pass:=pass+1; RAISE NOTICE 'PASS  screen  Entity 360 address panel executed (% rows)', v_n;
    EXCEPTION
      WHEN undefined_table THEN fail:=fail+1; RAISE WARNING 'FAIL  MISSING_RELATION  Entity 360 addresses: %', SQLERRM;
      WHEN undefined_column THEN fail:=fail+1; RAISE WARNING 'FAIL  MISSING_COLUMN  Entity 360 addresses: %', SQLERRM;
      WHEN others THEN fail:=fail+1; RAISE WARNING 'FAIL  BACKEND_ERROR  Entity 360 addresses: %', SQLERRM; END;

    IF v_entity IS NOT NULL THEN
      BEGIN
        PERFORM public.address_usage_visible(v_admin, 'ENTITY', v_entity);
        pass:=pass+1; RAISE NOTICE 'PASS  screen  entity address visibility predicate executed';
      EXCEPTION WHEN others THEN fail:=fail+1;
        RAISE WARNING 'FAIL  BACKEND_ERROR  address_usage_visible: %', SQLERRM; END;
    END IF;

    -- ========================================================================
    -- 4. AUTHORIZATION IS NEVER DISGUISED AS AN EMPTY RESULT
    -- ========================================================================
    PERFORM set_config('request.jwt.claims', NULL, true);
    BEGIN
      PERFORM public.address_projection_queue();
      fail:=fail+1; RAISE WARNING 'FAIL  AUTHORIZATION  an unauthenticated projection-queue read succeeded';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%ADDRESS_AUTH_REQUIRED%' OR SQLERRM LIKE '%ADDRESS_PERMISSION_DENIED%'
      THEN pass:=pass+1; RAISE NOTICE 'PASS  authorization  unauthenticated read fails closed and is distinguishable';
      ELSE fail:=fail+1; RAISE WARNING 'FAIL  BACKEND_ERROR  unauthenticated read: %', SQLERRM; END IF; END;

    -- ========================================================================
    -- 5. ROUTE / NAVIGATION RUNTIME REGISTRATION
    -- ========================================================================
    SELECT count(*) INTO v_n FROM public.sec_routes r
     WHERE r.path_pattern IN ('/intelligence/network','/intelligence/addresses/:addressId')
       AND r.is_protected AND r.is_active
       AND r.required_permission_id = 'e024eb66-0279-4ed7-b20c-43849fd0f4e9';
    IF v_n = 2 THEN pass:=pass+1; RAISE NOTICE 'PASS  routes  both B4 routes are live and permission-guarded';
    ELSE fail:=fail+1; RAISE WARNING 'FAIL  routes  % of 2 B4 routes registered/guarded', v_n; END IF;

    SELECT count(*) INTO v_n FROM public.sec_navigation_items
     WHERE key IN ('nav_relationship_intelligence','nav_address_360')
       AND is_active AND icon_key IN ('Network','MapPin');
    IF v_n = 2 THEN pass:=pass+1; RAISE NOTICE 'PASS  navigation  both B4 nav items are live with approved icons';
    ELSE fail:=fail+1; RAISE WARNING 'FAIL  navigation  % of 2 B4 nav items registered', v_n; END IF;
  END IF;

  RAISE NOTICE 'F8A-B4 runtime smoke: % passed, % failed', pass, fail;
  IF fail > 0 THEN
    RAISE EXCEPTION 'F8A-B4 RUNTIME SMOKE FAILED (% failures)', fail;
  END IF;
  RAISE NOTICE 'F8A-B4 runtime smoke: PASS (% live contracts)', pass;
END $runtime$;
