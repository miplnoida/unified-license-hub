-- ============================================================================
-- F8A-B2 — deterministic ownership traversal + configurable UBO gate
--
-- Rollback-safe and deterministic: every fixture is created inside the single
-- DO block transaction and discarded by the terminal rollback exception.
--
-- Usage:
--   psql -v ON_ERROR_STOP=1 -f scripts/verify-f8a-b2.sql
-- ============================================================================
\set ON_ERROR_STOP on
-- DEF-F5-B3R-01: pooled backends can arrive with a leaked row_security=off.
SET row_security = on;
SET client_min_messages = notice;

DO $verify$
DECLARE
  pass int := 0; fail int := 0;
  v_ok boolean; v_n int; v_txt text; v_num numeric;
  v_entity uuid; v_seed uuid; v_reg uuid; v_reg2 uuid;
  v_admin uuid; v_outsider uuid; v_staff uuid;
  v_p1 uuid; v_p2 uuid; v_pc uuid; v_h1 uuid; v_h2 uuid; v_t1 uuid; v_f1 uuid;
  v_x uuid; v_y uuid;
  v_otype uuid; v_pol_a uuid; v_pol_b uuid; v_pol_other uuid;
  v_net jsonb; v_net2 jsonb; v_ubo jsonb; v_node jsonb; v_res jsonb;
  v_today date := CURRENT_DATE;
BEGIN
  -- ==========================================================================
  -- A. LEDGER SHAPE — canonical ownership edge is party -> party
  -- ==========================================================================
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='ownership_interests'
                AND column_name='owned_party_id')
  THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'A-01 ownership_interests.owned_party_id missing'; END IF;

  SELECT is_nullable='YES' INTO v_ok FROM information_schema.columns
   WHERE table_schema='public' AND table_name='ownership_interests' AND column_name='owned_entity_id';
  IF v_ok THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'A-02 owned_entity_id still mandatory — non-regulated targets impossible'; END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname='ownership_interests_owned_target_present')
  THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'A-03 owned-target invariant missing'; END IF;

  SELECT count(*) INTO v_n FROM public.ownership_interests WHERE owned_party_id IS NULL;
  IF v_n = 0 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'A-04 % legacy ownership row(s) not backfilled to a canonical party', v_n; END IF;

  -- exactly one ownership ledger
  SELECT count(*) INTO v_n FROM information_schema.tables
   WHERE table_schema='public'
     AND table_name IN ('ownership_edges','ownership_graph','ubo_graph','ownership_interests_v2');
  IF v_n = 0 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'A-05 a second ownership store exists (%)', v_n; END IF;

  -- traversal indexes actually exist (owned side + reverse/owner side)
  SELECT count(*) INTO v_n FROM pg_indexes
   WHERE schemaname='public' AND tablename='ownership_interests'
     AND indexname IN ('idx_ownership_owned_party_effective','idx_ownership_owner_party_effective');
  IF v_n = 2 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'A-06 traversal indexes incomplete (% of 2)', v_n; END IF;

  -- ==========================================================================
  -- B. CONTRACT / SECURITY SURFACE
  -- ==========================================================================
  FOR v_txt IN SELECT x FROM unnest(ARRAY['entity_ownership_network','entity_ubo_resolve']) x LOOP
    SELECT count(*) INTO v_n FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
     WHERE p.proname=v_txt AND p.prosecdef AND p.proconfig::text LIKE '%search_path%'
       AND has_function_privilege('authenticated',p.oid,'EXECUTE')
       AND NOT has_function_privilege('anon',p.oid,'EXECUTE');
    IF v_n = 1 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'B-01 % is not a hardened internal RPC', v_txt; END IF;
  END LOOP;

  SELECT count(*) INTO v_n FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
   WHERE p.proname='entity_ownership_network_core'
     AND (has_function_privilege('anon',p.oid,'EXECUTE')
       OR has_function_privilege('authenticated',p.oid,'EXECUTE'));
  IF v_n = 0 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-02 unauthorized traversal core is browser-callable'; END IF;

  -- regulator scope is enforced by both public RPCs
  FOR v_txt IN SELECT pg_get_functiondef(p.oid) FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
   WHERE p.proname IN ('entity_ownership_network','entity_ubo_resolve') LOOP
    IF position('regulatory_scope_allows' in v_txt) > 0
       AND position('entity_reporting_regulator' in v_txt) > 0
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'B-03 an ownership RPC does not enforce regulator-body scope'; END IF;
  END LOOP;

  -- no identity attribute may leak through the network contract
  SELECT string_agg(pg_get_functiondef(p.oid), ' ') INTO v_txt FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
   WHERE p.proname IN ('entity_ownership_network','entity_ownership_network_core','entity_ubo_resolve');
  IF position('date_of_birth' in v_txt)=0 AND position('passport' in v_txt)=0
     AND position('national_id' in v_txt)=0 AND position('tax_identification' in v_txt)=0
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-04 identity attributes are reachable through the network contract'; END IF;

  -- UBO policy registry is governed configuration
  IF to_regclass('public.ubo_policies') IS NOT NULL THEN pass:=pass+1;
  ELSE fail:=fail+1; RAISE WARNING 'B-05 ubo_policies registry missing'; END IF;

  IF NOT has_table_privilege('authenticated','public.ubo_policies','INSERT')
     AND NOT has_table_privilege('authenticated','public.ubo_policies','UPDATE')
     AND NOT has_table_privilege('authenticated','public.ubo_policies','DELETE')
     AND NOT has_table_privilege('anon','public.ubo_policies','SELECT')
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-06 UBO policy is directly writable or anon-readable'; END IF;

  IF EXISTS (SELECT 1 FROM public.config_governed_tables WHERE table_name='ubo_policies')
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-07 UBO policy is not registered as governed configuration'; END IF;

  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='ubo_policies'
     AND column_name IN ('regulator_id','ownership_threshold','voting_threshold',
                         'control_test_enabled','effective_from','effective_to',
                         'version','approved_by','approved_at');
  IF v_n = 9 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-08 UBO policy lacks scope/threshold/effective-date/provenance columns (%)', v_n; END IF;

  -- no hard-coded threshold anywhere in the resolver
  SELECT pg_get_functiondef(p.oid) INTO v_txt FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
   WHERE p.proname='entity_ubo_resolve' LIMIT 1;
  IF v_txt !~ '(^|[^0-9])25(\.0+)?\s*(%|::numeric)' AND position('CONFIGURATION_REQUIRED' in v_txt) > 0
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-09 UBO resolver carries a hard-coded threshold or cannot report missing policy'; END IF;

  -- ==========================================================================
  -- FIXTURES (all rolled back)
  -- ==========================================================================
  SELECT p.id INTO v_admin FROM public.profiles p
   WHERE public.is_super_admin(p.id) ORDER BY p.id LIMIT 1;
  SELECT p.id INTO v_outsider FROM public.profiles p
   WHERE NOT public.is_super_admin(p.id)
     AND NOT public.has_permission(p.id,'entity_structure','view') ORDER BY p.id LIMIT 1;
  SELECT id INTO v_otype FROM public.ownership_types WHERE key='DIRECT_SHAREHOLDING' AND is_active;

  SELECT l.id, l.party_id INTO v_entity, v_seed
    FROM public.licensees l
   WHERE l.party_id IS NOT NULL
     AND public.entity_reporting_regulator(l.id) IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.ownership_interests o WHERE o.owned_party_id = l.party_id)
   ORDER BY l.id LIMIT 1;
  v_reg := public.entity_reporting_regulator(v_entity);
  SELECT id INTO v_reg2 FROM public.regulators WHERE id <> v_reg ORDER BY id LIMIT 1;

  IF v_admin IS NULL OR v_entity IS NULL OR v_otype IS NULL OR v_reg IS NULL THEN
    fail:=fail+1;
    RAISE WARNING 'F-00 fixtures unavailable (admin=%, entity=%, ownership_type=%, regulator=%)',
      v_admin, v_entity, v_otype, v_reg;
  ELSE
    -- canonical parties: two persons, a controller person, two NON-REGULATED
    -- holding companies, a trust, a foreign organization, and a cycle pair.
    INSERT INTO public.parties (party_kind, display_name) VALUES
      ('PERSON','B2 Gate Person One') RETURNING id INTO v_p1;
    INSERT INTO public.parties (party_kind, display_name) VALUES
      ('PERSON','B2 Gate Person Two') RETURNING id INTO v_p2;
    INSERT INTO public.parties (party_kind, display_name) VALUES
      ('PERSON','B2 Gate Controller') RETURNING id INTO v_pc;
    INSERT INTO public.parties (party_kind, display_name) VALUES
      ('ORGANIZATION','B2 Gate Holding One (non-regulated)') RETURNING id INTO v_h1;
    INSERT INTO public.parties (party_kind, display_name) VALUES
      ('ORGANIZATION','B2 Gate Holding Two (non-regulated)') RETURNING id INTO v_h2;
    INSERT INTO public.parties (party_kind, display_name) VALUES
      ('ORGANIZATION','B2 Gate Trust Vehicle') RETURNING id INTO v_t1;
    INSERT INTO public.parties (party_kind, display_name) VALUES
      ('ORGANIZATION','B2 Gate Foreign Unidentified') RETURNING id INTO v_f1;
    INSERT INTO public.parties (party_kind, display_name) VALUES
      ('ORGANIZATION','B2 Gate Cycle X') RETURNING id INTO v_x;
    INSERT INTO public.parties (party_kind, display_name) VALUES
      ('ORGANIZATION','B2 Gate Cycle Y') RETURNING id INTO v_y;

    -- A NON-REGULATED holding company can own a regulated entity without a
    -- fake licensee row: this is the B2 pre-condition.
    BEGIN
      INSERT INTO public.ownership_interests (owner_party_id, owned_party_id, ownership_type_id,
        economic_interest_percentage, voting_rights_percentage, is_direct, approval_status,
        effective_from)
      VALUES (v_p1, v_h1, v_otype, 50, 50, true, 'APPROVED', v_today - 400);
      pass:=pass+1;
    EXCEPTION WHEN others THEN
      fail:=fail+1; RAISE WARNING 'F-01 non-regulated ownership target rejected: %', SQLERRM;
    END;

    -- regulated target still resolves both ways (backward compatibility)
    INSERT INTO public.ownership_interests (owner_party_id, owned_entity_id, ownership_type_id,
      economic_interest_percentage, voting_rights_percentage, is_direct, approval_status, effective_from)
    VALUES (v_h1, v_entity, v_otype, 60, 40, true, 'APPROVED', v_today - 400);
    IF EXISTS (SELECT 1 FROM public.ownership_interests
                WHERE owner_party_id=v_h1 AND owned_entity_id=v_entity AND owned_party_id=v_seed)
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'F-02 regulated target did not resolve to its canonical party'; END IF;

    -- the reverse (party target given, entity backfilled)
    INSERT INTO public.ownership_interests (owner_party_id, owned_party_id, ownership_type_id,
      economic_interest_percentage, voting_rights_percentage, is_direct, approval_status, effective_from)
    VALUES (v_p2, v_seed, v_otype, 10, 10, true, 'APPROVED', v_today - 400);
    IF (SELECT owned_entity_id FROM public.ownership_interests
         WHERE owner_party_id=v_p2 AND owned_party_id=v_seed) = v_entity
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'F-03 party target did not backfill the regulated entity id'; END IF;

    -- level 3: P2 -> H2 -> H1 (H1 already owns E) — three ownership levels
    INSERT INTO public.ownership_interests (owner_party_id, owned_party_id, ownership_type_id,
      economic_interest_percentage, voting_rights_percentage, is_direct, approval_status, effective_from)
    VALUES (v_h2, v_h1, v_otype, 50, 50, true, 'APPROVED', v_today - 400);
    INSERT INTO public.ownership_interests (owner_party_id, owned_party_id, ownership_type_id,
      economic_interest_percentage, voting_rights_percentage, is_direct, approval_status, effective_from)
    VALUES (v_p1, v_h2, v_otype, 100, 20, true, 'APPROVED', v_today - 400);

    -- controller far below any ownership threshold
    INSERT INTO public.ownership_interests (owner_party_id, owned_party_id, ownership_type_id,
      economic_interest_percentage, voting_rights_percentage, is_direct, is_controller,
      approval_status, effective_from)
    VALUES (v_pc, v_seed, v_otype, 1, 1, true, true, 'APPROVED', v_today - 400);

    -- trust and unidentified foreign organization terminate chains
    INSERT INTO public.ownership_interests (owner_party_id, owned_party_id, ownership_type_id,
      economic_interest_percentage, voting_rights_percentage, is_direct, approval_status, effective_from)
    VALUES (v_t1, v_seed, v_otype, 5, 5, true, 'APPROVED', v_today - 400);
    INSERT INTO public.ownership_interests (owner_party_id, owned_party_id, ownership_type_id,
      economic_interest_percentage, voting_rights_percentage, is_direct, approval_status, effective_from)
    VALUES (v_f1, v_seed, v_otype, 4, 4, true, 'APPROVED', v_today - 400);

    -- a stored indirect/derived record must never be walked as a structural edge
    INSERT INTO public.ownership_interests (owner_party_id, owned_party_id, ownership_type_id,
      economic_interest_percentage, voting_rights_percentage, is_direct, approval_status, effective_from)
    VALUES (v_p1, v_seed, v_otype, 30, 25, false, 'APPROVED', v_today - 400);

    -- a PROPOSED (unapproved) edge must never be walked
    INSERT INTO public.ownership_interests (owner_party_id, owned_party_id, ownership_type_id,
      economic_interest_percentage, voting_rights_percentage, is_direct, approval_status, effective_from)
    VALUES (v_p2, v_h2, v_otype, 99, 99, true, 'PROPOSED', v_today - 400);

    -- circular ownership: X -> Y -> X, with X owning E
    INSERT INTO public.ownership_interests (owner_party_id, owned_party_id, ownership_type_id,
      economic_interest_percentage, voting_rights_percentage, is_direct, approval_status, effective_from)
    VALUES (v_x, v_seed, v_otype, 20, 20, true, 'APPROVED', v_today - 400);
    INSERT INTO public.ownership_interests (owner_party_id, owned_party_id, ownership_type_id,
      economic_interest_percentage, voting_rights_percentage, is_direct, approval_status, effective_from)
    VALUES (v_y, v_x, v_otype, 100, 100, true, 'APPROVED', v_today - 400);
    INSERT INTO public.ownership_interests (owner_party_id, owned_party_id, ownership_type_id,
      economic_interest_percentage, voting_rights_percentage, is_direct, approval_status, effective_from)
    VALUES (v_x, v_y, v_otype, 100, 100, true, 'APPROVED', v_today - 400);

    -- historical edge: P2 held 80% of E until 200 days ago, superseded by the 10% edge
    INSERT INTO public.ownership_interests (owner_party_id, owned_party_id, ownership_type_id,
      economic_interest_percentage, voting_rights_percentage, is_direct, approval_status,
      effective_from, effective_to)
    VALUES (v_p2, v_seed, v_otype, 80, 80, true, 'APPROVED', v_today - 800, v_today - 200);

    -- ======================================================================
    -- C. AUTHORIZATION
    -- ======================================================================
    PERFORM set_config('request.jwt.claims', NULL, true);
    BEGIN
      PERFORM public.entity_ownership_network(v_entity);
      fail:=fail+1; RAISE WARNING 'C-01 unauthenticated traversal succeeded';
    EXCEPTION WHEN insufficient_privilege THEN pass:=pass+1;
      WHEN others THEN fail:=fail+1; RAISE WARNING 'C-01 unexpected error: %', SQLERRM; END;

    IF v_outsider IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outsider)::text, true);
      BEGIN
        PERFORM public.entity_ubo_resolve(v_entity);
        fail:=fail+1; RAISE WARNING 'C-02 external user resolved UBO';
      EXCEPTION WHEN insufficient_privilege THEN pass:=pass+1;
        WHEN others THEN fail:=fail+1; RAISE WARNING 'C-02 unexpected error: %', SQLERRM; END;
    ELSE
      fail:=fail+1; RAISE WARNING 'C-02 no external user fixture available';
    END IF;

    -- cross-regulator: a staff identity without scope over this entity is denied
    SELECT p.id INTO v_staff FROM public.profiles p
     WHERE NOT public.is_super_admin(p.id)
       AND NOT public.regulatory_scope_allows(p.id,'entity_structure','view',v_reg,NULL,NULL,v_entity,NULL)
     ORDER BY p.id LIMIT 1;
    IF v_staff IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff)::text, true);
      BEGIN
        PERFORM public.entity_ownership_network(v_entity);
        fail:=fail+1; RAISE WARNING 'C-03 out-of-scope identity traversed the network';
      EXCEPTION WHEN insufficient_privilege THEN pass:=pass+1;
        WHEN others THEN fail:=fail+1; RAISE WARNING 'C-03 unexpected error: %', SQLERRM; END;
    ELSE
      fail:=fail+1; RAISE WARNING 'C-03 no out-of-scope identity fixture available';
    END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

    BEGIN
      PERFORM public.entity_ownership_network(v_entity, v_today, 40, 300);
      fail:=fail+1; RAISE WARNING 'C-04 depth above the hard cap was accepted';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%INVALID_DEPTH_LIMIT%' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'C-04 unexpected error: %', SQLERRM; END IF; END;

    BEGIN
      PERFORM public.entity_ownership_network(v_entity, v_today, 10, 5000);
      fail:=fail+1; RAISE WARNING 'C-05 node cap above the hard cap was accepted';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%INVALID_NODE_LIMIT%' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'C-05 unexpected error: %', SQLERRM; END IF; END;

    -- ======================================================================
    -- D. TRAVERSAL BEHAVIOUR
    -- ======================================================================
    v_net := public.entity_ownership_network(v_entity, v_today, 10, 300);

    IF (v_net->'seed'->>'party_id')::uuid = v_seed
       AND (v_net->'seed'->>'regulator_id')::uuid = v_reg
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'D-01 seed/regulator provenance missing'; END IF;

    -- direct person owner (P2, 10%)
    SELECT n INTO v_node FROM jsonb_array_elements(v_net->'nodes') n
     WHERE (n->>'party_id')::uuid = v_p2;
    IF v_node IS NOT NULL AND (v_node->>'min_depth')::int = 1
       AND (v_node->>'economic_percentage')::numeric = 10
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'D-02 direct person owner wrong: %', v_node; END IF;

    -- NON-REGULATED holding company appears as a canonical node, not a licensee
    SELECT n INTO v_node FROM jsonb_array_elements(v_net->'nodes') n
     WHERE (n->>'party_id')::uuid = v_h1;
    IF v_node IS NOT NULL AND (v_node->>'is_regulated')::boolean = false
       AND (v_node->>'economic_percentage')::numeric = 60
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'D-03 non-regulated holding company not traversed: %', v_node; END IF;

    -- P -> H -> E multiplication: P1 via H1 = 50% * 60% = 30
    -- plus P1 -> H2 -> H1 -> E = 100% * 50% * 60% = 30  => two distinct paths = 60
    SELECT n INTO v_node FROM jsonb_array_elements(v_net->'nodes') n
     WHERE (n->>'party_id')::uuid = v_p1;
    IF v_node IS NOT NULL AND (v_node->>'path_count')::int = 2
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'D-04 two independent paths not aggregated distinctly: %', v_node; END IF;

    IF (v_node->>'economic_percentage')::numeric = 60
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'D-05 multi-level economic multiplication wrong: %', v_node->>'economic_percentage'; END IF;

    -- voting is computed separately: 50*40 = 20, plus 20*50*40 = 4  => 24
    IF (v_node->>'voting_percentage')::numeric = 24
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'D-06 voting propagation is not independent of economic: %', v_node->>'voting_percentage'; END IF;

    -- three ownership levels are reached (H2 at depth 2, P1 also at depth 3)
    SELECT n INTO v_node FROM jsonb_array_elements(v_net->'nodes') n
     WHERE (n->>'party_id')::uuid = v_h2;
    IF v_node IS NOT NULL AND (v_node->>'min_depth')::int = 2
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'D-07 third ownership level missing'; END IF;

    -- stored is_direct=false record must NOT be a structural edge
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_net->'edges') e
                    WHERE (e->>'owner_party_id')::uuid = v_p1
                      AND (e->>'owned_party_id')::uuid = v_seed)
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'D-08 derived (is_direct=false) record double-counted as a structural edge'; END IF;

    -- unapproved edge is invisible
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_net->'edges') e
                    WHERE (e->>'owner_party_id')::uuid = v_p2
                      AND (e->>'owned_party_id')::uuid = v_h2)
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'D-09 unapproved edge traversed'; END IF;

    -- every returned edge carries provenance and approval state
    SELECT count(*) INTO v_n FROM jsonb_array_elements(v_net->'edges') e
     WHERE e->>'approval_status' IS DISTINCT FROM 'APPROVED'
        OR e->'effective_from' IS NULL OR e->'recorded_at' IS NULL;
    IF v_n = 0 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'D-10 % edge(s) lack approval/provenance', v_n; END IF;

    -- cycle detected, walk terminated
    IF (v_net->>'cycle_detected')::boolean
       AND jsonb_array_length(v_net->'cycles') > 0
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'D-11 circular ownership not reported'; END IF;

    SELECT count(*) INTO v_n FROM jsonb_array_elements(v_net->'nodes') n
     WHERE (n->>'party_id')::uuid IN (v_x, v_y);
    IF v_n = 2 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'D-12 cycle members not reported exactly once each (%)', v_n; END IF;

    -- deterministic node ordering and repeatability
    v_net2 := public.entity_ownership_network(v_entity, v_today, 10, 300);
    IF v_net2 = v_net THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'D-13 traversal output is not deterministic'; END IF;

    SELECT bool_and(ordered) INTO v_ok FROM (
      SELECT (n->>'min_depth')::int >= COALESCE(lag((n->>'min_depth')::int) OVER (ORDER BY ord), 0) ordered
        FROM jsonb_array_elements(v_net->'nodes') WITH ORDINALITY t(n, ord)) s;
    IF COALESCE(v_ok,true) THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'D-14 node ordering is not deterministic by depth'; END IF;

    -- as-of: 300 days ago P2 held 80%, today 10%
    v_net2 := public.entity_ownership_network(v_entity, v_today - 300, 10, 300);
    SELECT n INTO v_node FROM jsonb_array_elements(v_net2->'nodes') n
     WHERE (n->>'party_id')::uuid = v_p2;
    IF v_node IS NOT NULL AND (v_node->>'economic_percentage')::numeric = 80
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'D-15 historical as-of ownership not honoured: %', v_node; END IF;

    -- depth truncation is explicit
    v_net2 := public.entity_ownership_network(v_entity, v_today, 1, 300);
    IF (v_net2->>'truncated')::boolean
       AND (v_net2->'truncation_reasons') @> '["DEPTH_LIMIT"]'::jsonb
       AND jsonb_array_length(v_net2->'frontier') > 0
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'D-16 depth truncation not reported'; END IF;

    -- node truncation is explicit and deterministic
    v_net2 := public.entity_ownership_network(v_entity, v_today, 10, 2);
    IF (v_net2->>'truncated')::boolean
       AND (v_net2->'truncation_reasons') @> '["NODE_LIMIT"]'::jsonb
       AND jsonb_array_length(v_net2->'nodes') = 2
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'D-17 node truncation not reported'; END IF;

    -- ======================================================================
    -- E. UBO POLICY + RESOLUTION
    -- ======================================================================
    -- no policy configured yet => fail safe
    v_ubo := public.entity_ubo_resolve(v_entity, v_today);
    IF v_ubo->>'status' = 'CONFIGURATION_REQUIRED'
       AND v_ubo->>'reason' = 'UBO_POLICY_NOT_CONFIGURED'
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'E-01 missing UBO policy did not fail safe: %', v_ubo->>'status'; END IF;

    -- a policy belonging to another regulator must not apply
    IF v_reg2 IS NOT NULL THEN
      v_pol_other := public.admin_upsert_ubo_policy(NULL, jsonb_build_object(
        'regulator_id', v_reg2, 'ownership_threshold', 10, 'voting_threshold', 10,
        'control_test_enabled', true, 'effective_from', v_today - 10,
        'notes','B2 gate other-regulator policy'));
      v_ubo := public.entity_ubo_resolve(v_entity, v_today);
      IF v_ubo->>'status' = 'CONFIGURATION_REQUIRED' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'E-02 another regulator''s policy leaked into this entity'; END IF;
    ELSE
      fail:=fail+1; RAISE WARNING 'E-02 no second regulator fixture available';
    END IF;

    -- policy A: 20% ownership / 20% voting, control test on
    v_pol_a := public.admin_upsert_ubo_policy(NULL, jsonb_build_object(
      'regulator_id', v_reg, 'ownership_threshold', 20, 'voting_threshold', 20,
      'control_test_enabled', true, 'effective_from', v_today - 10,
      'notes','B2 gate policy A'));
    IF (SELECT approved_by FROM public.ubo_policies WHERE id=v_pol_a) = v_admin
       AND (SELECT version FROM public.ubo_policies WHERE id=v_pol_a) >= 1
       AND EXISTS (SELECT 1 FROM public.config_change_log
                    WHERE table_name='ubo_policies' AND record_id=v_pol_a AND changed_by=v_admin)
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'E-03 policy approval provenance/audit missing'; END IF;

    v_ubo := public.entity_ubo_resolve(v_entity, v_today);
    IF v_ubo->>'status' = 'RESOLVED'
       AND (v_ubo->'policy'->>'ownership_threshold')::numeric = 20
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'E-04 policy A not applied'; END IF;

    -- P1 (60% economic) qualifies on the economic threshold
    SELECT n INTO v_node FROM jsonb_array_elements(v_ubo->'ubos') n
     WHERE (n->>'party_id')::uuid = v_p1;
    IF v_node IS NOT NULL AND (v_node->'qualification_reasons') @> '["ECONOMIC_THRESHOLD"]'::jsonb
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'E-05 economic-threshold UBO not identified'; END IF;

    -- voting qualification is reported independently (P1 24% voting)
    IF (v_node->'qualification_reasons') @> '["VOTING_THRESHOLD"]'::jsonb
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'E-06 voting-threshold reason missing'; END IF;

    -- controller with 1% qualifies only through the control test
    SELECT n INTO v_node FROM jsonb_array_elements(v_ubo->'ubos') n
     WHERE (n->>'party_id')::uuid = v_pc;
    IF v_node IS NOT NULL
       AND (v_node->'qualification_reasons') @> '["CONTROL_DETERMINATION"]'::jsonb
       AND NOT ((v_node->'qualification_reasons') @> '["ECONOMIC_THRESHOLD"]'::jsonb)
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'E-07 controller below the ownership threshold not identified: %', v_node; END IF;

    -- natural person terminating the chain is reported as such
    IF (v_node->'qualification_reasons') @> '["NATURAL_PERSON_TERMINATION"]'::jsonb
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'E-08 natural-person termination not reported'; END IF;

    -- no natural person is ever invented
    SELECT count(*) INTO v_n FROM jsonb_array_elements(v_ubo->'ubos') n
     WHERE (n->>'is_natural_person')::boolean
       AND NOT EXISTS (SELECT 1 FROM public.parties p
                        WHERE p.id = (n->>'party_id')::uuid AND p.party_kind='PERSON');
    IF v_n = 0 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'E-09 % invented natural person(s) in the UBO result', v_n; END IF;

    -- incomplete chains are explicit
    -- canonical parties.party_kind is currently constrained to PERSON/ORGANIZATION,
    -- so the legal-arrangement branch is proven on the resolver contract itself.
    IF position('TRUST_LEGAL_ARRANGEMENT' in
         (SELECT pg_get_functiondef(q.oid) FROM pg_proc q
           JOIN pg_namespace m ON m.oid=q.pronamespace AND m.nspname='public'
          WHERE q.proname='entity_ubo_resolve' LIMIT 1)) > 0
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'E-10 resolver cannot report a trust/legal arrangement as unresolved'; END IF;

    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_ubo->'unresolved') u
                WHERE (u->>'party_id')::uuid = v_f1 AND u->>'reason'='FOREIGN_UNIDENTIFIED')
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'E-11 unidentified foreign holder not reported'; END IF;

    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_ubo->'unresolved') u WHERE u->>'reason'='CYCLE')
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'E-12 cycle not surfaced as an unresolved state'; END IF;

    v_res := public.entity_ubo_resolve(v_entity, v_today, 1, 300);
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_res->'unresolved') u WHERE u->>'reason'='DEPTH_LIMIT')
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'E-13 depth limit not surfaced as unresolved'; END IF;

    v_res := public.entity_ubo_resolve(v_entity, v_today, 10, 2);
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_res->'unresolved') u WHERE u->>'reason'='NODE_LIMIT')
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'E-14 node limit not surfaced as unresolved'; END IF;

    -- policy B: same structure, stricter thresholds, control test OFF
    v_pol_b := public.admin_upsert_ubo_policy(NULL, jsonb_build_object(
      'regulator_id', v_reg, 'ownership_threshold', 70, 'voting_threshold', 70,
      'control_test_enabled', false, 'effective_from', v_today,
      'notes','B2 gate policy B'));
    IF (SELECT status FROM public.ubo_policies WHERE id=v_pol_a) = 'SUPERSEDED'
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'E-15 prior policy version not superseded'; END IF;

    v_res := public.entity_ubo_resolve(v_entity, v_today);
    IF (v_res->'policy'->>'ownership_threshold')::numeric = 70
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'E-16 policy B not applied'; END IF;

    -- same ownership structure, different regulator policy => different UBOs
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_res->'ubos') n
                    WHERE (n->>'party_id')::uuid = v_p1
                      AND (n->'qualification_reasons') @> '["ECONOMIC_THRESHOLD"]'::jsonb)
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_ubo->'ubos') n
                    WHERE (n->>'party_id')::uuid = v_p1
                      AND (n->'qualification_reasons') @> '["ECONOMIC_THRESHOLD"]'::jsonb)
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'E-17 two policies produced identical UBO outcomes'; END IF;

    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_res->'ubos') n
                    WHERE (n->>'party_id')::uuid = v_pc
                      AND (n->'qualification_reasons') @> '["CONTROL_DETERMINATION"]'::jsonb)
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'E-18 disabled control test still produced a control-based UBO'; END IF;

    -- effective-dated policy: policy A still governs an earlier as-of date
    v_res := public.ubo_policy_resolve(v_reg, v_today - 5);
    IF (v_res->'policy'->>'id')::uuid = v_pol_a
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'E-19 policy resolution is not effective-dated'; END IF;

    -- stored is_ubo remains a declaration input only
    SELECT pg_get_functiondef(p.oid) INTO v_txt FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
     WHERE p.proname='entity_ubo_resolve' LIMIT 1;
    IF position('recorded_ubo_declared' in
         (SELECT pg_get_functiondef(q.oid) FROM pg_proc q
           JOIN pg_namespace m ON m.oid=q.pronamespace AND m.nspname='public'
          WHERE q.proname='entity_ownership_network_core' LIMIT 1)) > 0
       AND v_txt !~ 'is_ubo'
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'E-20 stored is_ubo is substituting for recursive calculation'; END IF;

    -- deterministic UBO output
    IF public.entity_ubo_resolve(v_entity, v_today) = public.entity_ubo_resolve(v_entity, v_today)
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'E-21 UBO output is not deterministic'; END IF;

    -- policy writes are permission-gated
    IF v_outsider IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outsider)::text, true);
      BEGIN
        PERFORM public.admin_upsert_ubo_policy(NULL, jsonb_build_object(
          'regulator_id', v_reg, 'ownership_threshold', 1, 'voting_threshold', 1));
        fail:=fail+1; RAISE WARNING 'E-22 external user wrote UBO policy';
      EXCEPTION WHEN insufficient_privilege THEN pass:=pass+1;
        WHEN others THEN fail:=fail+1; RAISE WARNING 'E-22 unexpected error: %', SQLERRM; END;
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
    ELSE
      fail:=fail+1; RAISE WARNING 'E-22 no external user fixture available';
    END IF;

    PERFORM set_config('request.jwt.claims', NULL, true);
  END IF;

  RAISE NOTICE 'F8A-B2 gate: % passed, % failed', pass, fail;
  IF fail > 0 THEN
    RAISE EXCEPTION 'F8A-B2 gate FAILED with % defect(s)', fail;
  END IF;

  -- rollback all fixtures
  RAISE EXCEPTION 'F8A_B2_ROLLBACK_OK:%', pass;
EXCEPTION
  WHEN others THEN
    IF SQLERRM LIKE 'F8A_B2_ROLLBACK_OK:%' THEN
      RAISE NOTICE 'F8A-B2 gate: PASS (% assertions, all fixtures rolled back)',
        split_part(SQLERRM, ':', 2);
    ELSE
      RAISE;
    END IF;
END
$verify$;
