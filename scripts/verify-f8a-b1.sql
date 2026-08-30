-- ============================================================================
-- F8A-B1 — canonical relationship foundation gate
-- Rollback-safe, deterministic. Usage:
--   psql -v ON_ERROR_STOP=1 -f scripts/verify-f8a-b1.sql
-- ============================================================================
\set ON_ERROR_STOP on
SET row_security = on;
SET client_min_messages = notice;

DO $verify$
DECLARE
  pass int := 0; fail int := 0;
  PROCEDURE_MARK text;
  v_ok boolean; v_n int; v_txt text;
  v_party uuid; v_entity uuid; v_rt uuid; v_rt2 uuid; v_r1 uuid;
BEGIN
  -- helper macro replacement via inline checks
  -- A. canonical architecture -------------------------------------------------
  v_ok := to_regclass('public.ownership_interests') IS NOT NULL
      AND to_regclass('public.entity_appointments') IS NOT NULL
      AND to_regclass('public.party_relationships') IS NOT NULL
      AND to_regclass('public.party_kinds') IS NOT NULL;
  IF v_ok THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'A-01 canonical stores missing'; END IF;

  IF to_regclass('public.graph_nodes') IS NULL AND to_regclass('public.graph_edges') IS NULL
     AND to_regclass('public.ownership_graph') IS NULL THEN pass:=pass+1;
  ELSE fail:=fail+1; RAISE WARNING 'A-02 duplicate graph store present'; END IF;

  SELECT count(*) INTO v_n FROM public.party_kinds
   WHERE key IN ('PERSON','ORGANIZATION','TRUST','FOUNDATION','PARTNERSHIP','OTHER_LEGAL_ARRANGEMENT');
  IF v_n = 6 THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'A-03 party kind catalogue incomplete (%)', v_n; END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='parties_party_kind_catalogue_fk' AND convalidated)
  THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'A-04 parties.party_kind not catalogue-bound'; END IF;

  SELECT count(*) INTO v_n FROM public.relationship_types
   WHERE key IN ('trustee_of','settlor_of','beneficiary_of','partner_of') AND is_active;
  IF v_n = 4 THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'A-05 arrangement relationship types missing (%)', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.role_types
   WHERE key IN ('external_auditor','trustee','partner','key_function_holder') AND is_active;
  IF v_n = 4 THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'A-06 role catalogue extension missing (%)', v_n; END IF;

  -- Ownership-like relationship types may not become a second ledger.
  SELECT count(*) INTO v_n FROM public.relationship_types
   WHERE is_ownership AND allows_structural_entry;
  IF v_n = 0 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'A-07 % ownership-like relationship type(s) still allow structural entry', v_n; END IF;

  -- B. legacy retirement ------------------------------------------------------
  SELECT count(*) INTO v_n FROM public.entity_relationships;
  IF v_n = 0 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-01 legacy entity_relationships has % live row(s) — census required', v_n; END IF;

  IF NOT has_table_privilege('authenticated','public.entity_relationships','SELECT')
     AND NOT has_table_privilege('authenticated','public.entity_relationships','INSERT')
     AND NOT has_table_privilege('anon','public.entity_relationships','SELECT')
  THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'B-02 legacy table still browser-reachable'; END IF;

  SELECT count(*) INTO v_n FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
   WHERE p.proname IN ('entity_relationship_save','entity_relationship_delete')
     AND (has_function_privilege('authenticated',p.oid,'EXECUTE')
       OR has_function_privilege('anon',p.oid,'EXECUTE'));
  IF v_n = 0 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-03 % legacy relationship RPC(s) still browser-callable', v_n; END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_txt FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
   WHERE p.proname='entity360_section';
  IF position('entity_relationships' in v_txt) = 0 THEN pass:=pass+1;
  ELSE fail:=fail+1; RAISE WARNING 'B-04 entity360_section still reads legacy relationships'; END IF;
  IF position('party_relationships' in v_txt) > 0 THEN pass:=pass+1;
  ELSE fail:=fail+1; RAISE WARNING 'B-05 entity360_section does not read canonical relationships'; END IF;
  IF position('''ownership_percentage''' in v_txt) = 0 THEN pass:=pass+1;
  ELSE fail:=fail+1; RAISE WARNING 'B-06 non-ownership relationship view still exposes a holding percentage'; END IF;
  IF position('recorded_ubo' in v_txt) > 0 THEN pass:=pass+1;
  ELSE fail:=fail+1; RAISE WARNING 'B-07 Entity360 ownership does not label the UBO marker as recorded'; END IF;
  IF position('economic_interest_percentage' in v_txt) > 0
     AND position('voting_rights_percentage' in v_txt) > 0
     AND position('beneficial_interest_percentage' in v_txt) > 0 THEN pass:=pass+1;
  ELSE fail:=fail+1; RAISE WARNING 'B-08 ownership percentage dimensions collapsed'; END IF;

  -- C. security ---------------------------------------------------------------
  FOR v_txt IN SELECT x FROM unnest(ARRAY['ownership_interests','party_relationships',
                                          'entity_appointments','entity_change_sets','entity_change_items']) x LOOP
    IF has_table_privilege('authenticated','public.'||v_txt,'INSERT')
       OR has_table_privilege('authenticated','public.'||v_txt,'UPDATE')
       OR has_table_privilege('authenticated','public.'||v_txt,'DELETE')
       OR has_table_privilege('anon','public.'||v_txt,'SELECT') THEN
      fail:=fail+1; RAISE WARNING 'C-01 % is browser-mutable or anon-readable', v_txt;
    ELSE pass:=pass+1; END IF;
  END LOOP;

  SELECT count(*) INTO v_n FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
   WHERE p.proname IN ('entity_structure_ownership','entity_structure_appointments',
                       'entity_structure_relationships','entity_structure_change_sets',
                       'entity_structure_change_items')
     AND p.prosecdef
     AND p.proconfig::text LIKE '%search_path%'
     AND has_function_privilege('authenticated',p.oid,'EXECUTE')
     AND NOT has_function_privilege('anon',p.oid,'EXECUTE');
  IF v_n = 5 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'C-02 governed structural read contract incomplete (% of 5)', v_n; END IF;

  IF NOT has_function_privilege('authenticated','public.entity_structure_can_view(uuid)','EXECUTE')
  THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'C-03 internal guard helper is browser-callable'; END IF;

  SELECT count(*) INTO v_n FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
   WHERE p.prorettype='trigger'::regtype
     AND p.proname IN ('ownership_interests_validate','party_relationships_validate')
     AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'));
  IF v_n = 0 THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'C-04 validation triggers browser-callable'; END IF;

  -- D. behavioural: ownership + relationship invariants (rollback-safe) -------
  SELECT l.id, l.party_id INTO v_entity, v_party
    FROM public.licensees l WHERE l.party_id IS NOT NULL LIMIT 1;
  SELECT id INTO v_rt FROM public.relationship_types WHERE key='parent_of';

  IF v_entity IS NOT NULL AND v_rt IS NOT NULL THEN
    -- percentage bounds
    BEGIN
      INSERT INTO public.ownership_interests (owner_party_id, owned_entity_id, economic_interest_percentage, is_direct)
      VALUES ((SELECT id FROM public.parties WHERE id <> v_party LIMIT 1), v_entity, 150, true);
      fail:=fail+1; RAISE WARNING 'D-01 out-of-range percentage accepted';
    EXCEPTION WHEN others THEN pass:=pass+1; END;

    -- self ownership
    BEGIN
      INSERT INTO public.ownership_interests (owner_party_id, owned_entity_id, is_direct)
      VALUES (v_party, v_entity, true);
      fail:=fail+1; RAISE WARNING 'D-02 self-ownership accepted';
    EXCEPTION WHEN others THEN pass:=pass+1; END;

    -- inverted effective interval
    BEGIN
      INSERT INTO public.ownership_interests (owner_party_id, owned_entity_id, is_direct, effective_from, effective_to)
      VALUES ((SELECT id FROM public.parties WHERE id <> v_party LIMIT 1), v_entity, true,
              now(), now() - interval '10 days');
      fail:=fail+1; RAISE WARNING 'D-03 inverted ownership interval accepted';
    EXCEPTION WHEN others THEN pass:=pass+1; END;

    -- shares_held > total_shares
    BEGIN
      INSERT INTO public.ownership_interests (owner_party_id, owned_entity_id, is_direct, shares_held, total_shares)
      VALUES ((SELECT id FROM public.parties WHERE id <> v_party LIMIT 1), v_entity, true, 200, 100);
      fail:=fail+1; RAISE WARNING 'D-04 shares_held above total_shares accepted';
    EXCEPTION WHEN others THEN pass:=pass+1; END;

    -- positive ownership write (person owner) via canonical table under definer context
    BEGIN
      INSERT INTO public.ownership_interests (owner_party_id, owned_entity_id, is_direct,
        economic_interest_percentage, voting_rights_percentage, beneficial_interest_percentage)
      SELECT p.id, v_entity, true, 40, 55, 30
        FROM public.parties p WHERE p.party_kind='PERSON' LIMIT 1;
      IF EXISTS (SELECT 1 FROM public.ownership_interests
                  WHERE owned_entity_id=v_entity AND economic_interest_percentage=40
                    AND voting_rights_percentage=55 AND beneficial_interest_percentage=30)
      THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'D-05 ownership dimensions not preserved distinctly'; END IF;
    EXCEPTION WHEN others THEN fail:=fail+1; RAISE WARNING 'D-05 canonical ownership write failed: %', SQLERRM; END;

    -- relationship: self rejected
    BEGIN
      INSERT INTO public.party_relationships (source_party_id, target_party_id, relationship_type_id, entity_id)
      VALUES (v_party, v_party, v_rt, v_entity);
      fail:=fail+1; RAISE WARNING 'D-06 self relationship accepted';
    EXCEPTION WHEN others THEN pass:=pass+1; END;

    -- relationship: ownership-like type rejected as structural fact
    BEGIN
      INSERT INTO public.party_relationships (source_party_id, target_party_id, relationship_type_id, entity_id)
      SELECT v_party, p.id, rt.id, v_entity
        FROM public.relationship_types rt, public.parties p
       WHERE rt.key='shareholder_of' AND p.id <> v_party LIMIT 1;
      fail:=fail+1; RAISE WARNING 'D-07 ownership-like relationship accepted as structural fact';
    EXCEPTION WHEN others THEN pass:=pass+1; END;

    -- relationship: valid write, then exact duplicate + inverse duplicate rejected
    BEGIN
      INSERT INTO public.party_relationships (source_party_id, target_party_id, relationship_type_id, entity_id, effective_from)
      SELECT v_party, p.id, v_rt, v_entity, now() - interval '1 day'
        FROM public.parties p WHERE p.id <> v_party AND p.party_kind='ORGANIZATION' LIMIT 1
      RETURNING id INTO v_r1;
      IF v_r1 IS NOT NULL THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'D-08 valid relationship write failed'; END IF;

      BEGIN
        INSERT INTO public.party_relationships (source_party_id, target_party_id, relationship_type_id, entity_id, effective_from)
        SELECT source_party_id, target_party_id, relationship_type_id, entity_id, effective_from
          FROM public.party_relationships WHERE id = v_r1;
        fail:=fail+1; RAISE WARNING 'D-09 duplicate overlapping relationship accepted';
      EXCEPTION WHEN others THEN pass:=pass+1; END;

      BEGIN
        INSERT INTO public.party_relationships (source_party_id, target_party_id, relationship_type_id, entity_id, effective_from)
        SELECT r.target_party_id, r.source_party_id,
               (SELECT inverse_relationship_type_id FROM public.relationship_types WHERE id=r.relationship_type_id),
               r.entity_id, r.effective_from
          FROM public.party_relationships r WHERE r.id = v_r1;
        fail:=fail+1; RAISE WARNING 'D-10 stored inverse duplicate accepted';
      EXCEPTION WHEN others THEN pass:=pass+1; END;

      BEGIN
        INSERT INTO public.party_relationships (source_party_id, target_party_id, relationship_type_id, entity_id, effective_from)
        SELECT r.target_party_id, r.source_party_id, r.relationship_type_id, r.entity_id, r.effective_from
          FROM public.party_relationships r WHERE r.id = v_r1;
        fail:=fail+1; RAISE WARNING 'D-11 hierarchical cycle accepted';
      EXCEPTION WHEN others THEN pass:=pass+1; END;

      BEGIN
        INSERT INTO public.party_relationships (source_party_id, target_party_id, relationship_type_id, entity_id,
          effective_from, effective_to)
        SELECT v_party, p.id, v_rt, v_entity, now(), now() - interval '5 days'
          FROM public.parties p WHERE p.id <> v_party LIMIT 1;
        fail:=fail+1; RAISE WARNING 'D-12 inverted relationship interval accepted';
      EXCEPTION WHEN others THEN pass:=pass+1; END;
    EXCEPTION WHEN others THEN fail:=fail+1; RAISE WARNING 'D-08 relationship fixture failed: %', SQLERRM; END;
  ELSE
    fail:=fail+1; RAISE WARNING 'D-00 no entity with a canonical party available for behavioural probes';
  END IF;

  -- E. maker-checker + apply contract ----------------------------------------
  SELECT pg_get_functiondef(p.oid) INTO v_txt FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
   WHERE p.proname='entity_change_set_transition';
  IF position('Maker-checker violation' in v_txt) > 0 THEN pass:=pass+1;
  ELSE fail:=fail+1; RAISE WARNING 'E-01 self-approval not blocked'; END IF;
  IF position('''apply''' in v_txt) > 0 AND position('idempotent' in v_txt) > 0 THEN pass:=pass+1;
  ELSE fail:=fail+1; RAISE WARNING 'E-02 apply step or idempotent replay missing'; END IF;
  IF position('''withdraw''' in v_txt) > 0 THEN pass:=pass+1;
  ELSE fail:=fail+1; RAISE WARNING 'E-03 withdraw step missing'; END IF;
  IF position('entity.change_set.applied' in v_txt) > 0 THEN pass:=pass+1;
  ELSE fail:=fail+1; RAISE WARNING 'E-04 apply is not audited'; END IF;
  IF position('source_change_set_id' in v_txt) > 0 THEN pass:=pass+1;
  ELSE fail:=fail+1; RAISE WARNING 'E-05 applied records carry no change-set provenance'; END IF;
  IF position('owner_party_id' in v_txt) > 0 AND position('owned_entity_id' in v_txt) > 0 THEN pass:=pass+1;
  ELSE fail:=fail+1; RAISE WARNING 'E-06 apply does not write canonical ownership'; END IF;

  -- F. direct/indirect + recorded-vs-derived contract documented -------------
  IF col_description('public.ownership_interests'::regclass,
       (SELECT attnum FROM pg_attribute WHERE attrelid='public.ownership_interests'::regclass AND attname='is_direct'))
     LIKE '%MUST NOT be traversed%' THEN pass:=pass+1;
  ELSE fail:=fail+1; RAISE WARNING 'F-01 direct/indirect traversal invariant not documented'; END IF;
  IF col_description('public.ownership_interests'::regclass,
       (SELECT attnum FROM pg_attribute WHERE attrelid='public.ownership_interests'::regclass AND attname='is_ubo'))
     LIKE '%NOT a deterministic calculated UBO%' THEN pass:=pass+1;
  ELSE fail:=fail+1; RAISE WARNING 'F-02 recorded-vs-derived UBO boundary not documented'; END IF;
  IF col_description('public.fp_individual_roles'::regclass,
       (SELECT attnum FROM pg_attribute WHERE attrelid='public.fp_individual_roles'::regclass AND attname='ownership_pct'))
     LIKE '%NOT ownership authority%' THEN pass:=pass+1;
  ELSE fail:=fail+1; RAISE WARNING 'F-03 competing F&P ownership field not classified'; END IF;
  IF col_description('public.financial_group_members'::regclass,
       (SELECT attnum FROM pg_attribute WHERE attrelid='public.financial_group_members'::regclass AND attname='ownership_percentage'))
     LIKE '%NOT legal ownership authority%' THEN pass:=pass+1;
  ELSE fail:=fail+1; RAISE WARNING 'F-04 prudential perimeter field not classified'; END IF;

  RAISE NOTICE 'F8A-B1 gate: % passed, % failed', pass, fail;
  IF fail > 0 THEN
    RAISE EXCEPTION 'F8A-B1 gate FAILED with % defect(s)', fail;
  END IF;

  -- rollback all fixtures
  RAISE EXCEPTION 'F8A_B1_ROLLBACK_OK:%', pass;
EXCEPTION
  WHEN others THEN
    IF SQLERRM LIKE 'F8A_B1_ROLLBACK_OK:%' THEN
      RAISE NOTICE 'F8A-B1 gate: PASS (% assertions, all fixtures rolled back)',
        split_part(SQLERRM, ':', 2);
    ELSE
      RAISE;
    END IF;
END
$verify$;
