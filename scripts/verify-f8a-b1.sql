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
  v_maker uuid; v_checker uuid; v_owner uuid; v_otype uuid;
  v_cs uuid; v_cs2 uuid; v_cs3 uuid; v_res jsonb; v_oi record; v_status text;
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

    -- NOTE: the positive ownership write is NOT probed by a direct table insert.
    -- Section G proves it end-to-end through the governed change-set pipeline.



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

  -- G. behavioural governed ownership lifecycle (rollback-safe, real actors) --
  SELECT p.id INTO v_maker FROM public.profiles p
   WHERE public.has_permission(p.id,'entity_structure','propose') ORDER BY p.id LIMIT 1;
  SELECT p.id INTO v_checker FROM public.profiles p
   WHERE public.has_permission(p.id,'entity_structure','approve') AND p.id <> v_maker
   ORDER BY p.id LIMIT 1;
  SELECT p.id INTO v_owner FROM public.parties p
   WHERE p.party_kind='PERSON' AND (v_party IS NULL OR p.id <> v_party) ORDER BY p.id LIMIT 1;
  SELECT id INTO v_otype FROM public.ownership_types WHERE key='DIRECT_SHAREHOLDING' AND is_active;

  IF v_maker IS NULL OR v_checker IS NULL OR v_owner IS NULL OR v_entity IS NULL OR v_otype IS NULL THEN
    fail:=fail+1;
    RAISE WARNING 'G-00 governed lifecycle fixture unavailable (maker=%, checker=%, owner=%, entity=%, ownership_type=%)',
      v_maker, v_checker, v_owner, v_entity, v_otype;
  ELSE
    -- G1 maker proposes a canonical OWNERSHIP change through the governed path
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maker)::text, true);
    v_res := public.entity_change_set_create(
      v_entity,
      jsonb_build_array(jsonb_build_object(
        'change_type','OWNERSHIP','operation','UPSERT','target_table','ownership_interests',
        'proposed_value', jsonb_build_object(
          'owner_party_id', v_owner,
          'owned_entity_id', v_entity,
          'ownership_type_id', v_otype,
          'economic_interest_percentage', 41,
          'voting_rights_percentage', 57,
          'beneficial_interest_percentage', 33,
          'is_direct', true, 'is_controller', true))),
      'FORM_SUBMISSION','F8A-B1 gate governed ownership lifecycle');
    v_cs := (v_res->>'change_set_id')::uuid;
    IF v_cs IS NOT NULL AND (v_res->>'items') = '1'
       AND (SELECT status FROM public.entity_change_sets WHERE id=v_cs) = 'DRAFT'
       AND (SELECT created_by FROM public.entity_change_sets WHERE id=v_cs) = v_maker
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'G-01 governed ownership proposal not created as maker draft'; END IF;

    -- no ownership may exist before approval/apply
    IF NOT EXISTS (SELECT 1 FROM public.ownership_interests WHERE source_change_set_id=v_cs)
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'G-02 ownership written before approval'; END IF;

    -- G2 submit as maker
    PERFORM public.entity_change_set_transition(v_cs,'submit','gate submit');
    IF (SELECT status FROM public.entity_change_sets WHERE id=v_cs)='SUBMITTED'
       AND (SELECT submitted_by FROM public.entity_change_sets WHERE id=v_cs)=v_maker
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'G-03 submit did not record the maker'; END IF;

    -- G3 maker may not approve own change
    BEGIN
      PERFORM public.entity_change_set_transition(v_cs,'approve','self approval attempt');
      fail:=fail+1; RAISE WARNING 'G-04 maker approved own structural change';
    EXCEPTION WHEN insufficient_privilege THEN pass:=pass+1;
      WHEN others THEN
        IF SQLERRM LIKE '%Maker-checker%' THEN pass:=pass+1;
        ELSE fail:=fail+1; RAISE WARNING 'G-04 unexpected self-approval error: %', SQLERRM; END IF;
    END;
    IF (SELECT status FROM public.entity_change_sets WHERE id=v_cs)='SUBMITTED'
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'G-05 rejected self-approval still mutated status'; END IF;

    -- G4 independent checker approves
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_checker)::text, true);
    PERFORM public.entity_change_set_transition(v_cs,'approve','gate approval');
    IF (SELECT status FROM public.entity_change_sets WHERE id=v_cs)='APPROVED'
       AND (SELECT approved_by FROM public.entity_change_sets WHERE id=v_cs)=v_checker
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'G-06 checker approval not recorded'; END IF;

    -- G5 apply
    v_res := public.entity_change_set_transition(v_cs,'apply','gate apply');
    IF (v_res->>'applied')='1' AND (v_res->>'idempotent')='false'
       AND (SELECT status FROM public.entity_change_sets WHERE id=v_cs)='APPLIED'
       AND (SELECT applied_by FROM public.entity_change_sets WHERE id=v_cs)=v_checker
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'G-07 apply did not write exactly one governed record'; END IF;

    SELECT * INTO v_oi FROM public.ownership_interests WHERE source_change_set_id=v_cs;
    IF v_oi.id IS NOT NULL THEN
      IF v_oi.owner_party_id = v_owner
         AND EXISTS (SELECT 1 FROM public.parties WHERE id=v_oi.owner_party_id)
      THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'G-08 applied ownership has no canonical owner party'; END IF;

      IF v_oi.owned_entity_id = v_entity
         AND EXISTS (SELECT 1 FROM public.licensees WHERE id=v_oi.owned_entity_id)
      THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'G-09 applied ownership has no canonical owned entity'; END IF;

      IF v_oi.economic_interest_percentage = 41 AND v_oi.voting_rights_percentage = 57
         AND v_oi.beneficial_interest_percentage = 33
      THEN pass:=pass+1; ELSE fail:=fail+1;
        RAISE WARNING 'G-10 ownership dimensions collapsed on apply (%/%/%)',
          v_oi.economic_interest_percentage, v_oi.voting_rights_percentage, v_oi.beneficial_interest_percentage; END IF;

      IF v_oi.source_change_set_id = v_cs AND v_oi.ownership_type_id = v_otype
         AND v_oi.is_direct AND v_oi.is_controller AND v_oi.recorded_at IS NOT NULL
      THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'G-11 ownership provenance incomplete'; END IF;

      IF v_oi.approval_status='APPROVED' AND v_oi.approved_by = v_checker AND v_oi.approved_at IS NOT NULL
      THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'G-12 ownership approval attribution missing'; END IF;
    ELSE
      fail:=fail+5; RAISE WARNING 'G-08..G-12 no ownership record produced by the governed apply';
    END IF;

    -- G6 idempotent replay
    v_res := public.entity_change_set_transition(v_cs,'apply','gate replay');
    SELECT count(*) INTO v_n FROM public.ownership_interests WHERE source_change_set_id=v_cs;
    IF (v_res->>'idempotent')='true' AND (v_res->>'applied')='0' AND v_n = 1
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'G-13 apply replay is not idempotent (rows=%)', v_n; END IF;

    -- G7 audit trail: maker proposal, checker approval, checker apply
    SELECT count(*) INTO v_n FROM public.audit_logs
     WHERE entity_type='entity_change_set' AND entity_id = v_cs::text
       AND ((action='entity.change_set.created'  AND user_id=v_maker)
         OR (action='entity.change_set.approved' AND user_id=v_checker)
         OR (action='entity.change_set.applied'  AND user_id=v_checker));
    IF v_n >= 3 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'G-14 governed lifecycle audit incomplete (% of 3)', v_n; END IF;

    IF EXISTS (SELECT 1 FROM public.audit_logs
                WHERE entity_type='entity_change_set' AND entity_id=v_cs::text
                  AND action='entity.change_set.applied'
                  AND new_value->>'proposed_by' = v_maker::text
                  AND new_value->>'approved_by' = v_checker::text)
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'G-15 apply audit does not carry maker/checker attribution'; END IF;

    -- G8 rejected change performs no ownership mutation
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maker)::text, true);
    v_res := public.entity_change_set_create(
      v_entity,
      jsonb_build_array(jsonb_build_object(
        'change_type','OWNERSHIP','operation','UPSERT','target_table','ownership_interests',
        'proposed_value', jsonb_build_object('owner_party_id', v_owner, 'owned_entity_id', v_entity,
          'ownership_type_id', v_otype, 'economic_interest_percentage', 12, 'is_direct', true))),
      'FORM_SUBMISSION','F8A-B1 gate rejected lifecycle');
    v_cs2 := (v_res->>'change_set_id')::uuid;
    PERFORM public.entity_change_set_transition(v_cs2,'submit',NULL);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_checker)::text, true);
    PERFORM public.entity_change_set_transition(v_cs2,'reject','gate rejection');
    IF (SELECT status FROM public.entity_change_sets WHERE id=v_cs2)='REJECTED'
       AND NOT EXISTS (SELECT 1 FROM public.ownership_interests WHERE source_change_set_id=v_cs2)
    THEN pass:=pass+1; ELSE fail:=fail+1; RAISE WARNING 'G-16 rejected change mutated canonical ownership'; END IF;
    BEGIN
      PERFORM public.entity_change_set_transition(v_cs2,'apply',NULL);
      fail:=fail+1; RAISE WARNING 'G-17 rejected change set could still be applied';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%approved change sets can be applied%' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'G-17 unexpected apply-after-reject error: %', SQLERRM; END IF;
    END;

    -- G9 withdrawn change performs no ownership mutation
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_maker)::text, true);
    v_res := public.entity_change_set_create(
      v_entity,
      jsonb_build_array(jsonb_build_object(
        'change_type','OWNERSHIP','operation','UPSERT','target_table','ownership_interests',
        'proposed_value', jsonb_build_object('owner_party_id', v_owner, 'owned_entity_id', v_entity,
          'ownership_type_id', v_otype, 'economic_interest_percentage', 7, 'is_direct', true))),
      'FORM_SUBMISSION','F8A-B1 gate withdrawn lifecycle');
    v_cs3 := (v_res->>'change_set_id')::uuid;
    PERFORM public.entity_change_set_transition(v_cs3,'submit',NULL);
    PERFORM public.entity_change_set_transition(v_cs3,'withdraw','gate withdrawal');
    SELECT status INTO v_status FROM public.entity_change_sets WHERE id=v_cs3;
    IF v_status='WITHDRAWN'
       AND NOT EXISTS (SELECT 1 FROM public.ownership_interests WHERE source_change_set_id=v_cs3)
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'G-18 withdrawn change not terminal / mutated ownership (status %)', v_status; END IF;
    BEGIN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_checker)::text, true);
      PERFORM public.entity_change_set_transition(v_cs3,'apply',NULL);
      fail:=fail+1; RAISE WARNING 'G-19 withdrawn change set could still be applied';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%approved change sets can be applied%' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'G-19 unexpected apply-after-withdraw error: %', SQLERRM; END IF;
    END;

    -- G10 zero residue: only the approved+applied change set produced ownership
    SELECT count(*) INTO v_n FROM public.ownership_interests
     WHERE source_change_set_id IN (v_cs, v_cs2, v_cs3);
    IF v_n = 1 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'G-20 governed lifecycle residue: % ownership row(s) for 3 change sets', v_n; END IF;

    PERFORM set_config('request.jwt.claims', NULL, true);
  END IF;


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
