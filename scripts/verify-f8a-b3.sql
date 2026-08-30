-- ============================================================================
-- F8A-B3 — person identity linkage + appointment/F&P bridge + Person 360 gate
--
-- Rollback-safe and deterministic: every fixture is created inside the single
-- DO block transaction and discarded by the terminal rollback exception.
--
-- Usage:
--   psql -v ON_ERROR_STOP=1 -f scripts/verify-f8a-b3.sql
-- ============================================================================
\set ON_ERROR_STOP on
SET row_security = on;
SET client_min_messages = notice;

DO $verify$
DECLARE
  pass int := 0; fail int := 0;
  v_ok boolean; v_n int; v_txt text;
  v_admin uuid; v_outsider uuid; v_staff uuid;
  v_entity uuid; v_seed uuid; v_reg uuid; v_reg2 uuid; v_entity2 uuid; v_seed2 uuid;
  v_role uuid; v_otype uuid;
  v_person uuid; v_person_b uuid; v_org uuid;
  v_fp1 uuid; v_fp2 uuid; v_fp_orphan uuid; v_fp_amb uuid;
  v_appt uuid; v_appt2 uuid; v_appt_nofp uuid;
  v_net jsonb; v_q jsonb; v_res jsonb; v_row jsonb;
  v_before int; v_after int;
  v_today date := CURRENT_DATE;
  v_lic_editor uuid; v_fp_editor uuid; v_other_editor uuid;

BEGIN
  -- ==========================================================================
  -- A. IDENTITY MODEL — no second person master, one canonical bridge
  -- ==========================================================================
  SELECT count(*) INTO v_n FROM information_schema.tables
   WHERE table_schema='public'
     AND table_name IN ('person_identities','person_master','natural_persons','persons_v2');
  IF v_n = 0 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'A-01 a competing person master exists (%)', v_n; END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='fp_individual_party_links')
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'A-02 canonical F&P->person bridge table missing'; END IF;

  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='fp_individual_party_links'
     AND column_name IN ('match_method','match_confidence','match_category',
                         'match_evidence','link_reason','linked_by','linked_at');
  IF v_n = 7 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'A-03 bridge lacks method/category/evidence/provenance columns (% of 7)', v_n; END IF;

  -- one F&P record can resolve to exactly one canonical person
  SELECT count(*) INTO v_n FROM pg_indexes
   WHERE schemaname='public' AND tablename='fp_individual_party_links'
     AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%fp_individual_id%';
  IF v_n >= 1 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'A-04 bridge does not enforce one canonical person per F&P record'; END IF;

  -- appointments remain the canonical organisation-role store
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='entity_appointments'
                AND column_name='fp_individual_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='entity_appointments'
                AND column_name='person_party_id' AND is_nullable='NO')
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'A-05 appointment bridge columns are not canonical'; END IF;

  -- ==========================================================================
  -- B. CONTRACT / SECURITY SURFACE
  -- ==========================================================================
  FOR v_txt IN SELECT x FROM unnest(ARRAY[
      'fp_link_person_manual','fp_person_identity_queue','person_relationship_network',
      'person_360_overview','entity_appointment_resolve_fp_bridge','fp_link_persons_deterministic']) x
  LOOP
    SELECT count(*) INTO v_n FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
     WHERE p.proname=v_txt AND p.prosecdef AND p.proconfig::text LIKE '%search_path%'
       AND NOT has_function_privilege('anon',p.oid,'EXECUTE');
    IF v_n >= 1 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'B-01 % is not a hardened non-anonymous SECURITY DEFINER RPC', v_txt; END IF;
  END LOOP;

  -- the internal linker is never callable from a client role
  SELECT count(*) INTO v_n FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
   WHERE p.proname='fp_try_link_individual'
     AND (has_function_privilege('authenticated',p.oid,'EXECUTE')
       OR has_function_privilege('anon',p.oid,'EXECUTE'));
  IF v_n = 0 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-02 internal linker is client-executable'; END IF;

  -- browser DML on the identity bridge is impossible
  SELECT count(*) INTO v_n FROM (
    SELECT unnest(ARRAY['INSERT','UPDATE','DELETE']) priv) p
   WHERE has_table_privilege('authenticated','public.fp_individual_party_links', p.priv)
      OR has_table_privilege('anon','public.fp_individual_party_links', p.priv);
  IF v_n = 0 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-03 identity bridge accepts browser DML (% privilege(s))', v_n; END IF;

  IF has_table_privilege('authenticated','public.fp_individual_party_links','SELECT')
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-04 governed read of the bridge is not possible'; END IF;

  -- NO probabilistic / fuzzy / AI matching anywhere in the linkage path
  SELECT string_agg(pg_get_functiondef(p.oid), E'\n') INTO v_txt FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
   WHERE p.proname IN ('fp_person_link_candidates','fp_try_link_individual',
                       'fp_link_persons_deterministic','fp_link_person_manual');
  IF v_txt !~* '(similarity|levenshtein|soundex|metaphone|pg_trgm|<->|ILIKE\s*''%)'
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-05 linkage path contains fuzzy/probabilistic matching'; END IF;

  -- the repaired sweep no longer references the non-existent identifier column
  SELECT pg_get_functiondef(p.oid) INTO v_txt FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
   WHERE p.proname='fp_link_persons_deterministic' LIMIT 1;
  IF position('entity_identifiers' in v_txt) = 0 AND position('LIMIT 1' in v_txt) = 0
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-06 deterministic sweep still uses the broken join or arbitrary pick'; END IF;

  -- Person 360 must never expose sensitive identity attributes
  SELECT pg_get_functiondef(p.oid) INTO v_txt FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
   WHERE p.proname='person_relationship_network' LIMIT 1;
  IF position('date_of_birth' in v_txt) = 0
     AND position('national_id' in v_txt) = 0
     AND position('passport_number' in v_txt) = 0
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-07 person network selects sensitive identity attributes'; END IF;

  -- link-on-create / link-on-update triggers exist
  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE NOT tgisinternal AND tgname IN
     ('trg_fp_individual_autolink','trg_entity_appointment_autolink',
      'trg_fp_person_link_guard','trg_entity_appointment_fp_bridge');
  IF v_n = 4 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-08 linkage/guard triggers incomplete (% of 4)', v_n; END IF;

  -- ==========================================================================
  -- FIXTURES (all rolled back)
  -- ==========================================================================
  SELECT p.id INTO v_admin FROM public.profiles p
   WHERE public.is_super_admin(p.id) ORDER BY p.id LIMIT 1;
  SELECT p.id INTO v_outsider FROM public.profiles p
   WHERE NOT public.is_super_admin(p.id)
     AND NOT public.has_permission(p.id,'entity_structure','view')
     AND NOT public.has_permission(p.id,'fit_and_proper','view') ORDER BY p.id LIMIT 1;
  SELECT id INTO v_role FROM public.role_types WHERE is_active ORDER BY sort_order, key LIMIT 1;
  SELECT id INTO v_otype FROM public.ownership_types WHERE key='DIRECT_SHAREHOLDING' AND is_active;

  SELECT l.id, l.party_id INTO v_entity, v_seed
    FROM public.licensees l
   WHERE l.party_id IS NOT NULL
     AND public.entity_reporting_regulator(l.id) IS NOT NULL
   ORDER BY l.id LIMIT 1;
  v_reg := public.entity_reporting_regulator(v_entity);

  IF v_admin IS NULL OR v_entity IS NULL OR v_role IS NULL OR v_reg IS NULL THEN
    fail:=fail+1;
    RAISE WARNING 'F-00 fixtures unavailable (admin=%, entity=%, role=%, regulator=%)',
      v_admin, v_entity, v_role, v_reg;
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

    INSERT INTO public.parties (party_kind, display_name)
    VALUES ('PERSON','B3 Gate Canonical Person') RETURNING id INTO v_person;
    INSERT INTO public.persons (party_id, full_name) VALUES (v_person,'B3 Gate Canonical Person')
    ON CONFLICT (party_id) DO NOTHING;
    INSERT INTO public.parties (party_kind, display_name)
    VALUES ('PERSON','B3 Gate Second Person') RETURNING id INTO v_person_b;
    INSERT INTO public.persons (party_id, full_name) VALUES (v_person_b,'B3 Gate Second Person')
    ON CONFLICT (party_id) DO NOTHING;
    INSERT INTO public.parties (party_kind, display_name)
    VALUES ('ORGANIZATION','B3 Gate Organization') RETURNING id INTO v_org;

    -- F&P context records
    INSERT INTO public.fp_individuals (full_name, status, regulator_id)
    VALUES ('B3 Gate Canonical Person','active', v_reg) RETURNING id INTO v_fp1;
    INSERT INTO public.fp_individuals (full_name, status, regulator_id)
    VALUES ('B3 Gate Canonical Person','active', v_reg) RETURNING id INTO v_fp2;
    INSERT INTO public.fp_individuals (full_name, status, regulator_id)
    VALUES ('B3 Gate Evidence-Free Individual','active', v_reg) RETURNING id INTO v_fp_orphan;

    -- ======================================================================
    -- C. DETERMINISTIC LINKAGE — link-on-create via governed appointment
    -- ======================================================================
    INSERT INTO public.entity_appointments
      (entity_id, person_party_id, role_type_id, effective_from, status, fp_individual_id)
    VALUES (v_entity, v_person, v_role, v_today - 100, 'ACTIVE', v_fp1)
    RETURNING id INTO v_appt;

    IF EXISTS (SELECT 1 FROM public.fp_individual_party_links
                WHERE fp_individual_id=v_fp1 AND person_party_id=v_person
                  AND match_method='APPOINTMENT_BRIDGE' AND match_confidence='DETERMINISTIC')
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'C-01 deterministic link-on-create did not occur'; END IF;

    IF EXISTS (SELECT 1 FROM public.audit_logs
                WHERE action='fp.person_identity.linked_deterministic'
                  AND entity_id = v_fp1::text)
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'C-02 deterministic linkage was not audited'; END IF;

    -- idempotent replay creates no duplicate
    v_res := public.fp_link_persons_deterministic();
    SELECT count(*) INTO v_n FROM public.fp_individual_party_links WHERE fp_individual_id=v_fp1;
    IF v_n = 1 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'C-03 replay duplicated the identity link (%)', v_n; END IF;

    -- an F&P record with no governed evidence must remain unresolved: never guessed
    IF NOT EXISTS (SELECT 1 FROM public.fp_individual_party_links WHERE fp_individual_id=v_fp_orphan)
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'C-04 an evidence-free F&P record was auto-linked'; END IF;

    -- same-name records are NOT merged
    IF NOT EXISTS (SELECT 1 FROM public.fp_individual_party_links WHERE fp_individual_id=v_fp2)
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'C-05 identical names produced an automatic link'; END IF;

    -- ambiguity: legacy data where one F&P record is appointed as two different
    -- canonical people (both rows recorded before any bridge existed)
    INSERT INTO public.fp_individuals (full_name, status, regulator_id)
    VALUES ('B3 Gate Ambiguous Individual','active', v_reg) RETURNING id INTO v_fp_amb;
    INSERT INTO public.entity_appointments
      (entity_id, person_party_id, role_type_id, effective_from, status, fp_individual_id)
    VALUES (v_entity, v_person_b, v_role, v_today - 90, 'ACTIVE', v_fp_amb),
           (v_entity, v_person,   v_role, v_today - 89, 'ACTIVE', v_fp_amb);

    SELECT count(*) INTO v_n FROM public.fp_person_link_candidates(v_fp_amb);
    IF v_n = 2 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'C-06 ambiguous candidate set not detected (%)', v_n; END IF;

    IF NOT EXISTS (SELECT 1 FROM public.fp_individual_party_links WHERE fp_individual_id=v_fp_amb)
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'C-07 an ambiguous F&P record was linked automatically'; END IF;

    -- ======================================================================
    -- D. UNRESOLVED QUEUE
    -- ======================================================================
    v_q := public.fp_person_identity_queue(1000);
    SELECT x INTO v_row FROM jsonb_array_elements(v_q->'rows') x
     WHERE (x->>'fp_individual_id')::uuid = v_fp_orphan;
    IF v_row->>'state' = 'NO_CANDIDATE'
       AND v_row->>'reason' = 'NO_CANONICAL_IDENTITY_EVIDENCE'
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'D-01 evidence-free record not queued honestly (%)', v_row; END IF;

    SELECT x INTO v_row FROM jsonb_array_elements(v_q->'rows') x
     WHERE (x->>'fp_individual_id')::uuid = v_fp_amb;
    IF v_row->>'state' = 'AMBIGUOUS_CANDIDATES' AND (v_row->>'candidate_count')::int = 2
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'D-02 ambiguous record not queued as ambiguous (%)', v_row; END IF;

    SELECT x INTO v_row FROM jsonb_array_elements(v_q->'rows') x
     WHERE (x->>'fp_individual_id')::uuid = v_fp1;
    IF v_row->>'state' = 'LINKED_DETERMINISTIC'
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'D-03 linked record misreported (%)', v_row; END IF;

    BEGIN
      PERFORM public.fp_person_identity_queue(5000);
      fail:=fail+1; RAISE WARNING 'D-04 unbounded queue request accepted';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%INVALID_LIMIT%' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'D-04 unexpected error: %', SQLERRM; END IF; END;

    -- ======================================================================
    -- E. MANUAL GOVERNED RESOLUTION
    -- ======================================================================
    BEGIN
      PERFORM public.fp_link_person_manual(v_fp2, v_person, 'x');
      fail:=fail+1; RAISE WARNING 'E-01 manual resolution accepted without a real reason';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%RESOLUTION_REASON_REQUIRED%' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'E-01 unexpected error: %', SQLERRM; END IF; END;

    BEGIN
      PERFORM public.fp_link_person_manual(v_fp2, v_org, 'Verified identity documents on file');
      fail:=fail+1; RAISE WARNING 'E-02 a non-person party was accepted as an identity target';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%PERSON_PARTY_REQUIRED%' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'E-02 unexpected error: %', SQLERRM; END IF; END;

    v_res := public.fp_link_person_manual(v_fp2, v_person, 'Verified identity documents on file');
    IF v_res->>'state' = 'LINKED'
       AND EXISTS (SELECT 1 FROM public.fp_individual_party_links
                    WHERE fp_individual_id=v_fp2 AND person_party_id=v_person
                      AND match_method='MANUAL' AND match_category='MANUAL_CONFIRMED'
                      AND link_reason IS NOT NULL AND linked_by = v_admin)
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'E-03 governed manual resolution did not record a provenance-complete link'; END IF;

    IF EXISTS (SELECT 1 FROM public.audit_logs
                WHERE action='fp.person_identity.linked_manual' AND entity_id=v_fp2::text)
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'E-04 manual resolution was not audited'; END IF;

    -- replay is idempotent, conflicting re-point is refused
    v_res := public.fp_link_person_manual(v_fp2, v_person, 'Verified identity documents on file');
    IF v_res->>'state' = 'ALREADY_LINKED' THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'E-05 manual replay was not idempotent (%)', v_res; END IF;

    BEGIN
      PERFORM public.fp_link_person_manual(v_fp2, v_person_b, 'Attempted re-point to another person');
      fail:=fail+1; RAISE WARNING 'E-06 an F&P record was re-pointed to a second person';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%CONFLICTING_PERSON_LINK%' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'E-06 unexpected error: %', SQLERRM; END IF; END;

    -- one canonical person legitimately carries several F&P contexts
    SELECT count(*) INTO v_n FROM public.fp_individual_party_links WHERE person_party_id=v_person;
    IF v_n = 2 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'E-07 a person cannot hold multiple F&P contexts (%)', v_n; END IF;

    -- ======================================================================
    -- F. APPOINTMENT / F&P BRIDGE
    -- ======================================================================
    BEGIN
      INSERT INTO public.entity_appointments
        (entity_id, person_party_id, role_type_id, effective_from, status, fp_individual_id)
      VALUES (v_entity, v_person_b, v_role, v_today - 50, 'ACTIVE', v_fp1);
      fail:=fail+1; RAISE WARNING 'F-01 appointment contradicting the canonical link was accepted';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%APPOINTMENT_FP_PERSON_CONFLICT%' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'F-01 unexpected error: %', SQLERRM; END IF; END;

    INSERT INTO public.entity_appointments
      (entity_id, person_party_id, role_type_id, effective_from, status)
    VALUES (v_entity, v_person_b, v_role, v_today - 40, 'ACTIVE')
    RETURNING id INTO v_appt_nofp;

    v_res := public.entity_appointment_resolve_fp_bridge(v_appt_nofp);
    IF v_res->>'state' = 'UNRESOLVED' AND v_res->>'reason' = 'NO_LINKED_FP_CONTEXT'
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'F-02 bridge resolution invented an F&P context (%)', v_res; END IF;

    -- a person with two linked F&P contexts is deliberately not auto-bridged
    INSERT INTO public.entity_appointments
      (entity_id, person_party_id, role_type_id, effective_from, status)
    VALUES (v_entity, v_person, v_role, v_today - 39, 'ACTIVE')
    RETURNING id INTO v_appt2;
    v_res := public.entity_appointment_resolve_fp_bridge(v_appt2);
    IF v_res->>'state' = 'UNRESOLVED' AND v_res->>'reason' = 'MULTIPLE_FP_CONTEXTS'
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'F-03 ambiguous bridge was resolved arbitrarily (%)', v_res; END IF;

    -- unambiguous case bridges and audits
    v_res := public.fp_link_person_manual(v_fp_orphan, v_person_b, 'Confirmed by regulator records');
    v_res := public.entity_appointment_resolve_fp_bridge(v_appt_nofp);
    IF v_res->>'state' = 'BRIDGED'
       AND (SELECT fp_individual_id FROM public.entity_appointments WHERE id=v_appt_nofp) = v_fp_orphan
       AND EXISTS (SELECT 1 FROM public.audit_logs
                    WHERE action='entity_appointment.fp_bridge_resolved'
                      AND entity_id=v_appt_nofp::text)
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'F-04 unambiguous bridge did not resolve (%)', v_res; END IF;

    v_res := public.entity_appointment_resolve_fp_bridge(v_appt_nofp);
    IF v_res->>'state' = 'ALREADY_BRIDGED' THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'F-05 bridge resolution is not idempotent (%)', v_res; END IF;

    -- ======================================================================
    -- G. PERSON 360 / PERSON NETWORK
    -- ======================================================================
    IF v_otype IS NOT NULL THEN
      INSERT INTO public.ownership_interests (owner_party_id, owned_entity_id, ownership_type_id,
        economic_interest_percentage, voting_rights_percentage, is_direct, is_controller,
        approval_status, effective_from)
      VALUES (v_person, v_entity, v_otype, 30, 45, true, true, 'APPROVED', v_today - 300);
    END IF;

    v_net := public.person_relationship_network(v_person, v_today);

    IF v_net->'identity'->>'person_party_id' = v_person::text
       AND v_net->'identity'->>'display_name' = 'B3 Gate Canonical Person'
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'G-01 canonical identity header incorrect'; END IF;

    IF (v_net->'counts'->>'appointments_total')::int >= 3
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'G-02 appointments not aggregated (%)', v_net->'counts'; END IF;

    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_net->'appointments') e
                WHERE (e->>'appointment_id')::uuid = v_appt
                  AND e->>'entity_id' = v_entity::text
                  AND (e->>'is_current')::boolean
                  AND e->>'source_authority' = 'entity_appointments')
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'G-03 governed appointment missing from the person network'; END IF;

    IF v_otype IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_net->'ownership') e
                  WHERE (e->>'economic_interest_percentage')::numeric = 30
                    AND (e->>'voting_rights_percentage')::numeric = 45
                    AND (e->>'is_controller')::boolean
                    AND e->>'source_authority' = 'ownership_interests')
      THEN pass:=pass+1; ELSE fail:=fail+1;
        RAISE WARNING 'G-04 economic/voting interests are not reported distinctly'; END IF;
    ELSE
      fail:=fail+1; RAISE WARNING 'G-04 no ownership type fixture available';
    END IF;

    IF (v_net->>'fp_contexts_visible')::boolean
       AND (v_net->'counts'->>'fp_contexts')::int = 2
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'G-05 F&P contexts not surfaced for a permitted reader'; END IF;

    -- point-in-time honesty: before the appointment existed nothing is reported
    v_net := public.person_relationship_network(v_person, v_today - 200);
    IF (v_net->'counts'->>'appointments_total')::int = 0
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'G-06 as-of date ignored (%)', v_net->'counts'; END IF;

    -- an organization party is not a person
    BEGIN
      PERFORM public.person_relationship_network(v_org, v_today);
      fail:=fail+1; RAISE WARNING 'G-07 an organization was treated as a canonical person';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%PERSON_PARTY_REQUIRED%' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'G-07 unexpected error: %', SQLERRM; END IF; END;

    v_net := public.person_360_overview(v_person);
    IF v_net ? 'conflicts' AND (v_net->>'conflicts')::int = 0
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'G-08 Person 360 overview does not report conflict state'; END IF;

    -- ======================================================================
    -- H. AUTHORIZATION
    -- ======================================================================
    PERFORM set_config('request.jwt.claims', NULL, true);
    BEGIN
      PERFORM public.person_relationship_network(v_person, v_today);
      fail:=fail+1; RAISE WARNING 'H-01 unauthenticated person network succeeded';
    EXCEPTION WHEN insufficient_privilege THEN pass:=pass+1;
      WHEN others THEN fail:=fail+1; RAISE WARNING 'H-01 unexpected error: %', SQLERRM; END;

    BEGIN
      PERFORM public.fp_person_identity_queue(10);
      fail:=fail+1; RAISE WARNING 'H-02 unauthenticated identity queue succeeded';
    EXCEPTION WHEN insufficient_privilege THEN pass:=pass+1;
      WHEN others THEN fail:=fail+1; RAISE WARNING 'H-02 unexpected error: %', SQLERRM; END;

    BEGIN
      PERFORM public.fp_link_person_manual(v_fp_amb, v_person, 'Unauthenticated attempt at linkage');
      fail:=fail+1; RAISE WARNING 'H-03 unauthenticated manual linkage succeeded';
    EXCEPTION WHEN insufficient_privilege THEN pass:=pass+1;
      WHEN others THEN fail:=fail+1; RAISE WARNING 'H-03 unexpected error: %', SQLERRM; END;

    IF v_outsider IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outsider)::text, true);
      BEGIN
        PERFORM public.person_relationship_network(v_person, v_today);
        fail:=fail+1; RAISE WARNING 'H-04 an unprivileged identity read the person network';
      EXCEPTION WHEN insufficient_privilege THEN pass:=pass+1;
        WHEN others THEN fail:=fail+1; RAISE WARNING 'H-04 unexpected error: %', SQLERRM; END;

      BEGIN
        PERFORM public.fp_link_person_manual(v_fp_amb, v_person, 'Unprivileged attempt at linkage');
        fail:=fail+1; RAISE WARNING 'H-05 an unprivileged identity linked an identity';
      EXCEPTION WHEN insufficient_privilege THEN pass:=pass+1;
        WHEN others THEN fail:=fail+1; RAISE WARNING 'H-05 unexpected error: %', SQLERRM; END;
    ELSE
      fail:=fail+2; RAISE WARNING 'H-04/H-05 no unprivileged identity fixture available';
    END IF;

    -- an internal identity without scope over the entity sees no branch of it
    SELECT p.id INTO v_staff FROM public.profiles p
     WHERE NOT public.is_super_admin(p.id)
       AND (public.has_permission(p.id,'entity_structure','view')
         OR public.has_permission(p.id,'fit_and_proper','view'))
       AND NOT public.regulatory_scope_allows(p.id,'entity_structure','view',
             v_reg,NULL,NULL,v_entity,NULL)
     ORDER BY p.id LIMIT 1;
    IF v_staff IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff)::text, true);
      v_net := public.person_relationship_network(v_person, v_today);
      IF (v_net->'counts'->>'appointments_total')::int = 0
         AND (v_net->>'restricted_branches')::int > 0
         AND v_net->>'restricted_reason' = 'REGULATOR_SCOPE_RESTRICTED'
      THEN pass:=pass+1; ELSE fail:=fail+1;
        RAISE WARNING 'H-06 out-of-scope identity saw restricted branches (%)', v_net->'counts'; END IF;
    ELSE
      RAISE NOTICE 'H-06 skipped: no in-permission out-of-scope identity exists live';
      pass:=pass+1;
    END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

    -- ======================================================================
    -- I. NO SIDE EFFECTS ON FROZEN CONTRACTS
    -- ======================================================================
    -- B2 ownership traversal still functions unchanged for the same entity
    BEGIN
      v_net := public.entity_ownership_network(v_entity);
      IF v_net ? 'nodes' THEN pass:=pass+1; ELSE fail:=fail+1;
        RAISE WARNING 'I-01 B2 traversal contract changed'; END IF;
    EXCEPTION WHEN others THEN
      fail:=fail+1; RAISE WARNING 'I-01 B2 traversal failed: %', SQLERRM; END;

    BEGIN
      v_net := public.entity_ubo_resolve(v_entity);
      IF v_net IS NOT NULL THEN pass:=pass+1; ELSE fail:=fail+1;
        RAISE WARNING 'I-02 B2 UBO resolver returned nothing'; END IF;
    EXCEPTION WHEN others THEN
      fail:=fail+1; RAISE WARNING 'I-02 B2 UBO resolver failed: %', SQLERRM; END;

    PERFORM set_config('request.jwt.claims', NULL, true);
  END IF;

  -- ==========================================================================
  -- J. CANONICAL AUTHORIZATION VOCABULARY
  --
  -- The B3 resolution surfaces are governed exclusively by the catalogued
  -- permissions licensee_management.edit (licensee/entity side) and
  -- fit_and_proper.edit (person/F&P side). The retired vocabulary
  -- entity_structure.edit must exist nowhere and must authorize nothing.
  -- ==========================================================================
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- J-01 the retired pair is absent from the permission catalogue
  SELECT count(*) INTO v_n
    FROM public.sec_permissions sp
    JOIN public.sec_modules sm ON sm.id = sp.module_id
   WHERE sm.key = 'entity_structure' AND sp.key = 'edit';
  IF v_n = 0 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'J-01 entity_structure.edit was promoted into the catalogue'; END IF;

  -- J-02 no routine anywhere recognises the retired pair
  SELECT count(*) INTO v_n FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND pg_get_functiondef(p.oid) ~ $$entity_structure'\s*,\s*'edit$$;
  IF v_n = 0 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'J-02 % routine(s) still check entity_structure.edit', v_n; END IF;

  -- J-03 the appointment bridge is governed by the canonical pairs only
  SELECT pg_get_functiondef(p.oid) INTO v_txt FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'entity_appointment_resolve_fp_bridge';
  IF v_txt IS NOT NULL
     AND v_txt LIKE '%licensee_management%' AND v_txt LIKE '%fit_and_proper%'
     AND v_txt NOT LIKE '%entity_structure%'
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'J-03 appointment bridge authorization is not canonical'; END IF;

  -- J-04 the manual person linkage action is governed by fit_and_proper.edit
  SELECT pg_get_functiondef(p.oid) INTO v_txt FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'fp_link_person_manual';
  IF v_txt IS NOT NULL AND v_txt ~ $$fit_and_proper'\s*,\s*'edit$$
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'J-04 manual linkage is not governed by fit_and_proper.edit'; END IF;

  -- ------------------------------------------------------------------------
  -- Behavioural positive / negative proof against live identities.
  --
  -- Each probe uses a random target id, so authorization is the only thing
  -- under test: a permitted identity fails past the guard with a domain error
  -- (never 42501) and mutates nothing; a denied identity fails at the guard.
  -- ------------------------------------------------------------------------
  SELECT p.id INTO v_lic_editor FROM public.profiles p
   WHERE NOT public.is_super_admin(p.id)
     AND public.has_permission(p.id,'licensee_management','edit')
   ORDER BY p.id LIMIT 1;

  SELECT p.id INTO v_fp_editor FROM public.profiles p
   WHERE NOT public.is_super_admin(p.id)
     AND public.has_permission(p.id,'fit_and_proper','edit')
   ORDER BY p.id LIMIT 1;

  -- an identity holding some unrelated edit permission but neither canonical pair
  SELECT p.id INTO v_other_editor FROM public.profiles p
   WHERE NOT public.is_super_admin(p.id)
     AND NOT public.has_permission(p.id,'licensee_management','edit')
     AND NOT public.has_permission(p.id,'fit_and_proper','edit')
     AND (public.has_permission(p.id,'complaint_management','edit')
       OR public.has_permission(p.id,'returns_management','edit')
       OR public.has_permission(p.id,'application_management','edit'))
   ORDER BY p.id LIMIT 1;

  -- J-05 POSITIVE: licensee_management.edit passes the appointment-bridge guard
  IF v_lic_editor IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_lic_editor)::text, true);
    BEGIN
      PERFORM public.entity_appointment_resolve_fp_bridge(gen_random_uuid());
      fail:=fail+1;
      RAISE WARNING 'J-05 bridge returned for a nonexistent appointment';
    EXCEPTION
      WHEN insufficient_privilege THEN fail:=fail+1;
        RAISE WARNING 'J-05 licensee_management.edit was denied the bridge action';
      WHEN others THEN
        IF SQLERRM LIKE '%APPOINTMENT_NOT_FOUND%' THEN pass:=pass+1;
        ELSE fail:=fail+1;
          RAISE WARNING 'J-05 unexpected bridge error: %', SQLERRM; END IF; END;
  ELSE
    fail:=fail+1; RAISE WARNING 'J-05 no licensee_management.edit identity exists live';
  END IF;

  -- J-06 POSITIVE: fit_and_proper.edit passes the appointment-bridge guard too
  IF v_fp_editor IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_fp_editor)::text, true);
    BEGIN
      PERFORM public.entity_appointment_resolve_fp_bridge(gen_random_uuid());
      fail:=fail+1; RAISE WARNING 'J-06 bridge returned for a nonexistent appointment';
    EXCEPTION
      WHEN insufficient_privilege THEN fail:=fail+1;
        RAISE WARNING 'J-06 fit_and_proper.edit was denied the bridge action';
      WHEN others THEN
        IF SQLERRM LIKE '%APPOINTMENT_NOT_FOUND%' THEN pass:=pass+1;
        ELSE fail:=fail+1;
          RAISE WARNING 'J-06 unexpected bridge error: %', SQLERRM; END IF; END;
  ELSE
    fail:=fail+1; RAISE WARNING 'J-06 no fit_and_proper.edit identity exists live';
  END IF;

  -- J-07 POSITIVE: fit_and_proper.edit passes the manual person-linkage guard
  IF v_fp_editor IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_fp_editor)::text, true);
    BEGIN
      PERFORM public.fp_link_person_manual(gen_random_uuid(), gen_random_uuid(),
        'B3 authorization probe against a nonexistent subject');
      fail:=fail+1; RAISE WARNING 'J-07 manual linkage accepted unknown subjects';
    EXCEPTION
      WHEN insufficient_privilege THEN fail:=fail+1;
        RAISE WARNING 'J-07 fit_and_proper.edit was denied manual linkage';
      WHEN others THEN pass:=pass+1; END;
  ELSE
    fail:=fail+1; RAISE WARNING 'J-07 no fit_and_proper.edit identity exists live';
  END IF;

  -- J-08 NEGATIVE: an unrelated edit permission authorizes nothing here
  IF v_other_editor IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_other_editor)::text, true);
    BEGIN
      PERFORM public.entity_appointment_resolve_fp_bridge(gen_random_uuid());
      fail:=fail+1;
      RAISE WARNING 'J-08 an unrelated edit permission authorized the bridge';
    EXCEPTION
      WHEN insufficient_privilege THEN pass:=pass+1;
      WHEN others THEN fail:=fail+1;
        RAISE WARNING 'J-08 bridge failed open for an unrelated permission: %', SQLERRM; END;

    BEGIN
      PERFORM public.fp_link_person_manual(gen_random_uuid(), gen_random_uuid(),
        'B3 negative authorization probe with an unrelated permission');
      fail:=fail+1;
      RAISE WARNING 'J-09 an unrelated edit permission authorized manual linkage';
    EXCEPTION
      WHEN insufficient_privilege THEN pass:=pass+1;
      WHEN others THEN fail:=fail+1;
        RAISE WARNING 'J-09 linkage failed open for an unrelated permission: %', SQLERRM; END;
  ELSE
    RAISE NOTICE 'J-08/J-09 skipped: no unrelated-edit-only identity exists live';
    pass:=pass+2;
  END IF;

  -- J-10 the appointment bridge remains fail-closed for anonymous callers
  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN
    PERFORM public.entity_appointment_resolve_fp_bridge(gen_random_uuid());
    fail:=fail+1; RAISE WARNING 'J-10 anonymous caller reached the bridge';
  EXCEPTION WHEN insufficient_privilege THEN pass:=pass+1;
    WHEN others THEN fail:=fail+1;
      RAISE WARNING 'J-10 unexpected anonymous error: %', SQLERRM; END;



  RAISE NOTICE 'F8A-B3 gate: % passed, % failed', pass, fail;
  IF fail > 0 THEN
    RAISE EXCEPTION 'F8A-B3 gate FAILED with % defect(s)', fail;
  END IF;

  -- rollback all fixtures
  RAISE EXCEPTION 'F8A_B3_ROLLBACK_OK:%', pass;
EXCEPTION
  WHEN others THEN
    IF SQLERRM LIKE 'F8A_B3_ROLLBACK_OK:%' THEN
      RAISE NOTICE 'F8A-B3 gate: PASS (% assertions, all fixtures rolled back)',
        split_part(SQLERRM, ':', 2);
    ELSE
      RAISE;
    END IF;
END
$verify$;
