-- ============================================================================
-- F8A-B4 — canonical address primitive, address usages, deterministic
-- common-address intelligence, projection queue and Address 360 gate.
--
-- Rollback-safe and deterministic: every fixture is created inside the single
-- DO block transaction and discarded by the terminal rollback exception.
--
-- Usage:
--   psql -v ON_ERROR_STOP=1 -f scripts/verify-f8a-b4.sql
-- ============================================================================
\set ON_ERROR_STOP on
SET row_security = on;
SET client_min_messages = notice;

DO $verify$
DECLARE
  pass int := 0; fail int := 0;
  v_ok boolean; v_n int; v_txt text; v_def text;
  v_admin uuid; v_outsider uuid; v_viewer uuid; v_cert_role uuid;
  v_entity uuid; v_reg uuid; v_role uuid;
  v_person uuid; v_person_b uuid;
  v_addr uuid; v_addr_dup uuid; v_addr_other uuid;
  v_use_e uuid; v_use_p uuid; v_use_tmp uuid;
  v_json jsonb; v_row jsonb;
  v_today date := CURRENT_DATE;
  v_before int; v_after int;
BEGIN
  -- ==========================================================================
  -- A. SCHEMA CONTRACT
  -- ==========================================================================
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='addresses')
     AND EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='address_usages')
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'A-01 canonical address tables missing'; END IF;

  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='addresses'
     AND column_name='normalized_key' AND is_generated='ALWAYS';
  IF v_n = 1 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'A-02 normalized_key is not a generated column'; END IF;

  SELECT count(*) INTO v_n FROM pg_indexes
   WHERE schemaname='public' AND tablename='addresses'
     AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%normalized_key%'
     AND indexdef LIKE '%normalization_version%';
  IF v_n >= 1 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'A-03 canonical uniqueness on (normalized_key, version) missing'; END IF;

  SELECT count(*) INTO v_n FROM pg_indexes
   WHERE schemaname='public' AND tablename='address_usages'
     AND indexname IN ('address_usages_natural_uq','address_usages_subject_idx','address_usages_address_idx');
  IF v_n = 3 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'A-04 address_usages indexes incomplete (% of 3)', v_n; END IF;

  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conrelid='public.address_usages'::regclass
     AND conname IN ('address_usages_effective_range','address_usages_approval_metadata');
  IF v_n = 2 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'A-05 effective-dating / approval-metadata invariants missing (% of 2)', v_n; END IF;

  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='address_usages'
     AND column_name IN ('subject_kind','subject_id','usage_type','effective_from','effective_to',
                         'source_kind','source_id','source_detail','approval_status',
                         'approved_by','approved_at','verified_by','verified_at');
  IF v_n = 13 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'A-06 usage provenance/lifecycle columns incomplete (% of 13)', v_n; END IF;

  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.address_usages'::regclass
              AND tgname='address_usages_subject_guard')
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'A-07 canonical-subject guard trigger missing'; END IF;

  -- ==========================================================================
  -- B. DETERMINISTIC NORMALIZATION (incl. ambiguous abbreviations)
  -- ==========================================================================
  IF public.address_norm_street('St Kitts') = 'ST KITTS'
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-01 "St Kitts" normalized to "%"', public.address_norm_street('St Kitts'); END IF;

  IF public.address_norm_street('12 Bay St') = '12 BAY STREET'
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-02 trailing "St" did not resolve to STREET (%)',
      public.address_norm_street('12 Bay St'); END IF;

  IF public.address_norm_street('Dr Smith Building') = 'DR SMITH BUILDING'
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-03 leading "Dr" was expanded (%)',
      public.address_norm_street('Dr Smith Building'); END IF;

  IF public.address_norm_street('Ste 4, 10 Main Street')
     = public.address_norm_street('Suite 4 10 Main St')
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-04 unit designators are not deterministic (% vs %)',
      public.address_norm_street('Ste 4, 10 Main Street'),
      public.address_norm_street('Suite 4 10 Main St'); END IF;

  IF public.address_norm_street('P.O. Box 1234') = public.address_norm_street('PO BOX 1234')
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-05 PO Box forms diverge'; END IF;

  -- Caribbean / international representative cases
  IF public.address_normalize_key('KN', 'Saint George Basseterre', 'Basseterre', NULL,
                                  'Church  St.', NULL, NULL)
     = public.address_normalize_key('kn', 'saint george basseterre', 'BASSETERRE', NULL,
                                  'Church St', NULL, NULL)
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-06 St Kitts & Nevis address pair is not deterministically equal'; END IF;

  IF public.address_normalize_key('GB', 'Greater London', 'London', 'EC2R 8AH',
                                  'Threadneedle St', NULL, NULL)
     = public.address_normalize_key('GB', 'GREATER LONDON', 'london', 'ec2r8ah',
                                  'Threadneedle Street', NULL, NULL)
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-07 UK postcode spacing/abbreviation not deterministic'; END IF;

  IF public.address_normalize_key('TT', NULL, 'Port of Spain', NULL, 'Frederick St', NULL, NULL)
     <> public.address_normalize_key('BB', NULL, 'Port of Spain', NULL, 'Frederick St', NULL, NULL)
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-08 country is not part of the canonical key'; END IF;

  IF public.address_norm_text('Sainté-Anne') = 'SAINTE ANNE'
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-09 diacritic folding is not deterministic (%)',
      public.address_norm_text('Sainté-Anne'); END IF;

  -- no fuzzy / probabilistic matching anywhere on the B4 path
  SELECT string_agg(pg_get_functiondef(p.oid), E'\n') INTO v_def FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
   WHERE p.proname IN ('address_normalize_key','address_norm_street','address_norm_text',
                       'address_common_matches','address_upsert_canonical');
  IF v_def !~* '(similarity|levenshtein|soundex|metaphone|pg_trgm|<->)'
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'B-10 a fuzzy matching primitive exists on the address path'; END IF;

  -- ==========================================================================
  -- CONTRACT / SECURITY SURFACE
  -- ==========================================================================
  FOR v_txt IN SELECT x FROM unnest(ARRAY[
      'address_upsert_canonical','address_usage_propose','address_usage_approve',
      'address_usage_end','address_common_matches','address_360_overview',
      'relationship_intelligence_search','address_projection_queue',
      'address_project_sources','person_address_intelligence']) x
  LOOP
    SELECT count(*) INTO v_n FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
     WHERE p.proname=v_txt AND p.prosecdef AND p.proconfig::text LIKE '%search_path%'
       AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
       AND has_function_privilege('authenticated',p.oid,'EXECUTE');
    IF v_n >= 1 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'G-00 % is not a hardened non-anonymous SECURITY DEFINER RPC', v_txt; END IF;
  END LOOP;

  -- browser DML on the canonical primitive is impossible
  SELECT count(*) INTO v_n FROM (
    SELECT unnest(ARRAY['INSERT','UPDATE','DELETE']) priv) p
   WHERE has_table_privilege('authenticated','public.addresses', p.priv)
      OR has_table_privilege('anon','public.addresses', p.priv)
      OR has_table_privilege('authenticated','public.address_usages', p.priv)
      OR has_table_privilege('anon','public.address_usages', p.priv);
  IF v_n = 0 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'G-01 the address primitive accepts browser DML (% privilege(s))', v_n; END IF;

  IF has_table_privilege('authenticated','public.addresses','SELECT')
     AND has_table_privilege('authenticated','public.address_usages','SELECT')
     AND NOT has_table_privilege('anon','public.addresses','SELECT')
     AND NOT has_table_privilege('anon','public.address_usages','SELECT')
  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'G-02 governed read grants are wrong'; END IF;

  SELECT count(*) INTO v_n FROM pg_class c
   WHERE c.oid IN ('public.addresses'::regclass,'public.address_usages'::regclass)
     AND c.relrowsecurity;
  IF v_n = 2 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'G-03 RLS is not enabled on both address relations'; END IF;

  -- ==========================================================================
  -- FIXTURES (all rolled back)
  -- ==========================================================================
  SELECT p.id INTO v_admin FROM public.profiles p
   WHERE public.is_super_admin(p.id) ORDER BY p.id LIMIT 1;
  SELECT p.id INTO v_outsider FROM public.profiles p
   WHERE NOT public.is_super_admin(p.id)
     AND NOT public.has_permission(p.id,'entity_structure','view') ORDER BY p.id LIMIT 1;

  -- View-only certification persona.
  -- No live role grants entity_structure.view without the mutating actions, so the
  -- gate builds a *rollback-scoped* certification role instead of weakening any
  -- production role. It receives entity_structure.view ONLY.
  SELECT p.id INTO v_viewer FROM public.profiles p
   WHERE NOT public.is_super_admin(p.id)
     AND NOT public.has_permission(p.id,'entity_structure','view')
     AND p.id <> coalesce(v_outsider, '00000000-0000-0000-0000-000000000000'::uuid)
   ORDER BY p.id DESC LIMIT 1;

  IF v_viewer IS NOT NULL THEN
    INSERT INTO public.sec_roles (key, name, description, role_type, status, is_system, is_break_glass)
    VALUES ('cert_b4_view_only','F8A-B4 certification view-only',
            'Rollback-scoped certification persona holding entity_structure.view only',
            'internal','active', false, false)
    RETURNING id INTO v_cert_role;

    INSERT INTO public.sec_role_permissions (role_id, permission_id)
    SELECT v_cert_role, p.id
      FROM public.sec_permissions p
      JOIN public.sec_modules m ON m.id = p.module_id
     WHERE m.key = 'entity_structure' AND p.key = 'view';

    INSERT INTO public.sec_user_roles (user_id, role_id, status)
    VALUES (v_viewer, v_cert_role, 'active');

    -- the persona must hold view and NOT hold any mutating action
    IF public.has_permission(v_viewer,'entity_structure','view')
       AND NOT public.has_permission(v_viewer,'entity_structure','propose')
       AND NOT public.has_permission(v_viewer,'entity_structure','approve')
       AND NOT public.has_permission(v_viewer,'entity_structure','apply')
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'I-00 the view-only certification persona is not correctly scoped'; END IF;
  ELSE
    fail:=fail+1;
    RAISE WARNING 'I-00 no candidate profile is available for the view-only persona';
  END IF;

  SELECT id INTO v_role FROM public.role_types WHERE is_active ORDER BY sort_order, key LIMIT 1;

  SELECT l.id INTO v_entity FROM public.licensees l
   WHERE public.entity_reporting_regulator(l.id) IS NOT NULL ORDER BY l.id LIMIT 1;
  v_reg := public.entity_reporting_regulator(v_entity);

  IF v_admin IS NULL OR v_entity IS NULL OR v_role IS NULL THEN
    fail:=fail+1;
    RAISE WARNING 'F-00 fixtures unavailable (admin=%, entity=%, role=%)', v_admin, v_entity, v_role;
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

    INSERT INTO public.parties (party_kind, display_name)
    VALUES ('PERSON','B4 Gate Canonical Person') RETURNING id INTO v_person;
    INSERT INTO public.persons (party_id, full_name) VALUES (v_person,'B4 Gate Canonical Person')
    ON CONFLICT (party_id) DO NOTHING;
    INSERT INTO public.parties (party_kind, display_name)
    VALUES ('PERSON','B4 Gate Second Person') RETURNING id INTO v_person_b;
    INSERT INTO public.persons (party_id, full_name) VALUES (v_person_b,'B4 Gate Second Person')
    ON CONFLICT (party_id) DO NOTHING;

    -- both people must be connected to an in-scope entity to be visible at all
    INSERT INTO public.entity_appointments
      (entity_id, person_party_id, role_type_id, effective_from, status)
    VALUES (v_entity, v_person,   v_role, v_today - 60, 'ACTIVE'),
           (v_entity, v_person_b, v_role, v_today - 60, 'ACTIVE');

    -- ======================================================================
    -- C. CANONICAL UPSERT — deterministic reuse, never a duplicate
    -- ======================================================================
    v_addr := public.address_upsert_canonical('KN','14 Church St', NULL, NULL,
                'Basseterre','Saint George Basseterre', NULL, 'B4 gate fixture');
    IF v_addr IS NOT NULL THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'C-01 canonical upsert returned nothing'; END IF;

    v_addr_dup := public.address_upsert_canonical('kn','14  CHURCH STREET', NULL, NULL,
                    'basseterre','SAINT GEORGE BASSETERRE', NULL, 'B4 gate equivalent input');
    IF v_addr_dup = v_addr THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'C-02 equivalent input created a second canonical address'; END IF;

    SELECT count(*) INTO v_n FROM public.addresses
     WHERE normalized_key = (SELECT normalized_key FROM public.addresses WHERE id=v_addr);
    IF v_n = 1 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'C-03 duplicate canonical rows exist for one normalized key (%)', v_n; END IF;

    BEGIN
      PERFORM public.address_upsert_canonical('KNA','1 Somewhere');
      fail:=fail+1; RAISE WARNING 'C-04 an invalid country code was accepted';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%ADDRESS_INVALID_COUNTRY%' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'C-04 unexpected error: %', SQLERRM; END IF; END;

    BEGIN
      PERFORM public.address_upsert_canonical('KN','   ');
      fail:=fail+1; RAISE WARNING 'C-05 a blank street was accepted';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%ADDRESS_INVALID_STREET%' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'C-05 unexpected error: %', SQLERRM; END IF; END;

    v_addr_other := public.address_upsert_canonical('KN','9 Independence Square', NULL, NULL,
                      'Basseterre', NULL, NULL, 'B4 gate second address');

    -- ======================================================================
    -- D. USAGE LIFECYCLE — propose -> approve -> active -> ended
    -- ======================================================================
    v_use_e := public.address_usage_propose(v_addr,'ENTITY',v_entity,'REGISTERED',
                 v_today - 30,'MANUAL',NULL,'B4 gate entity usage');
    SELECT approval_status = 'PROPOSED' AND effective_to IS NULL
      INTO v_ok FROM public.address_usages WHERE id=v_use_e;
    IF v_ok THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'D-01 a proposed usage did not start in PROPOSED state'; END IF;

    IF public.address_usage_propose(v_addr,'ENTITY',v_entity,'REGISTERED',
         v_today - 30,'MANUAL',NULL,'replay') = v_use_e
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'D-02 proposing the same usage twice created a duplicate'; END IF;

    PERFORM public.address_usage_approve(v_use_e, true);
    SELECT approval_status='APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL
           AND verified_by IS NOT NULL AND verified_at IS NOT NULL
      INTO v_ok FROM public.address_usages WHERE id=v_use_e;
    IF v_ok THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'D-03 approval did not record approver/verification metadata'; END IF;

    IF public.address_usage_approve(v_use_e) = v_use_e THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'D-04 re-approval is not idempotent'; END IF;

    -- illegal transition: end date before the start date
    BEGIN
      PERFORM public.address_usage_end(v_use_e, v_today - 400);
      fail:=fail+1; RAISE WARNING 'D-05 an end date before effective_from was accepted';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%ADDRESS_INVALID%' OR SQLERRM LIKE '%address_usages_effective_range%'
      THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'D-05 unexpected error: %', SQLERRM; END IF; END;

    -- illegal transition: unknown usage
    BEGIN
      PERFORM public.address_usage_approve(gen_random_uuid());
      fail:=fail+1; RAISE WARNING 'D-06 approving a nonexistent usage succeeded';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%ADDRESS_USAGE_NOT_FOUND%' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'D-06 unexpected error: %', SQLERRM; END IF; END;

    -- end -> historical
    v_use_tmp := public.address_usage_propose(v_addr_other,'ENTITY',v_entity,'OPERATING',
                   v_today - 20,'MANUAL',NULL,'B4 gate historical usage');
    PERFORM public.address_usage_approve(v_use_tmp);
    PERFORM public.address_usage_end(v_use_tmp, v_today - 1);
    SELECT effective_to = v_today - 1 INTO v_ok FROM public.address_usages WHERE id=v_use_tmp;
    IF v_ok THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'D-07 ending a usage did not record the historical end date'; END IF;

    -- ======================================================================
    -- E. SUBJECT INTEGRITY
    -- ======================================================================
    BEGIN
      PERFORM public.address_usage_propose(v_addr,'ENTITY',gen_random_uuid(),'REGISTERED');
      fail:=fail+1; RAISE WARNING 'E-01 a usage referenced a nonexistent entity';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%ADDRESS_SUBJECT_NOT_FOUND%' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'E-01 unexpected error: %', SQLERRM; END IF; END;

    BEGIN
      PERFORM public.address_usage_propose(v_addr,'PERSON',gen_random_uuid(),'CORRESPONDENCE');
      fail:=fail+1; RAISE WARNING 'E-02 a usage referenced a nonexistent canonical person';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%ADDRESS_SUBJECT_NOT_FOUND%' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'E-02 unexpected error: %', SQLERRM; END IF; END;

    BEGIN
      PERFORM public.address_usage_propose(v_addr,'GHOST',v_entity,'REGISTERED');
      fail:=fail+1; RAISE WARNING 'E-03 an unknown subject kind was accepted';
    EXCEPTION WHEN others THEN pass:=pass+1; END;

    -- ======================================================================
    -- M. INTELLIGENCE CORRECTNESS (needs a second co-located subject)
    -- ======================================================================
    v_use_p := public.address_usage_propose(v_addr,'PERSON',v_person,'CORRESPONDENCE',
                 v_today - 10,'MANUAL',NULL,'B4 gate person usage');
    PERFORM public.address_usage_approve(v_use_p);

    SELECT count(*) INTO v_n FROM public.address_common_matches(v_addr, v_today, 200)
     WHERE match_class='EXACT';
    IF v_n >= 2 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'M-01 EXACT co-location was not detected (%)', v_n; END IF;

    SELECT count(*) INTO v_n FROM public.address_common_matches(v_addr, v_today, 200)
     WHERE match_class NOT IN ('EXACT','NORMALIZED');
    IF v_n = 0 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'M-02 an unsupported match class was produced (%)', v_n; END IF;

    -- NORMALIZED equivalence: an equivalent spelling resolves to the SAME canonical
    -- row, so co-location is reported without creating a second address.
    IF public.address_upsert_canonical('KN','14 CHURCH ST', NULL, NULL,
         'BASSETERRE','SAINT GEORGE BASSETERRE') = v_addr
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'M-03 normalized-equivalent input escaped the canonical row'; END IF;

    -- co-location must not mutate identity or relationship truth
    SELECT count(*) INTO v_before FROM public.fp_individual_party_links;
    PERFORM public.address_common_matches(v_addr, v_today, 200);
    PERFORM public.address_360_overview(v_addr, v_today);
    SELECT count(*) INTO v_after FROM public.fp_individual_party_links;
    IF v_before = v_after THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'M-04 reading co-location mutated identity truth'; END IF;

    -- a subject at a DIFFERENT address is not reported as co-located
    SELECT count(*) INTO v_n FROM public.address_common_matches(v_addr, v_today, 200)
     WHERE address_id = v_addr_other;
    IF v_n = 0 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'M-05 an unrelated address was reported as co-located'; END IF;

    -- point-in-time honesty: an ended usage disappears from the current view
    SELECT count(*) INTO v_n FROM public.address_common_matches(v_addr_other, v_today, 200);
    IF v_n = 0 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'M-06 an ended usage is still reported as current (%)', v_n; END IF;
    SELECT count(*) INTO v_n FROM public.address_common_matches(v_addr_other, v_today - 5, 200);
    IF v_n = 1 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'M-07 historical replay lost an ended usage (%)', v_n; END IF;

    -- ======================================================================
    -- F. GOVERNED READS
    -- ======================================================================
    v_json := public.address_360_overview(v_addr, v_today);
    IF v_json ? 'address' AND v_json ? 'occupants' AND v_json ? 'occupant_count'
       AND (v_json->'address'->>'normalized_key') IS NOT NULL
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'F-01 Address 360 payload contract broken (%)', v_json; END IF;

    IF (v_json->>'occupant_count')::int >= 2 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'F-02 Address 360 under-reports occupants (%)', v_json->>'occupant_count'; END IF;

    BEGIN
      PERFORM public.address_360_overview(gen_random_uuid(), v_today);
      fail:=fail+1; RAISE WARNING 'F-03 Address 360 accepted an unknown address';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%ADDRESS_NOT_FOUND%' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'F-03 unexpected error: %', SQLERRM; END IF; END;

    v_json := public.person_address_intelligence(v_person, v_today);
    IF jsonb_array_length(v_json->'addresses') >= 1 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'F-04 person address intelligence returned nothing (%)', v_json; END IF;

    SELECT x INTO v_row FROM jsonb_array_elements(v_json->'addresses') x LIMIT 1;
    IF v_row ? 'co_occupants' AND v_row ? 'source_kind' AND v_row ? 'approval_status'
       AND v_row ? 'effective_from'
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'F-05 person address payload lacks provenance/state (%)', v_row; END IF;

    -- privacy: no identity attributes leak through the intelligence surface
    IF (v_json::text !~* '(date_of_birth|national_id|passport)') THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'F-06 person address intelligence exposes identity attributes'; END IF;

    SELECT count(*) INTO v_n FROM public.relationship_intelligence_search('Church', ARRAY['ADDRESS'], 25);
    IF v_n >= 1 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'F-07 intelligence search did not find the canonical address'; END IF;

    SELECT count(*) INTO v_n FROM public.relationship_intelligence_search(
      'B4 Gate Canonical Person', ARRAY['PERSON'], 25);
    IF v_n >= 1 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'F-08 intelligence search did not find the canonical person'; END IF;

    BEGIN
      PERFORM public.relationship_intelligence_search('ab', ARRAY['ENTITY'], 25);
      fail:=fail+1; RAISE WARNING 'F-09 an unbounded 2-character search was accepted';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%INTELLIGENCE_QUERY_TOO_SHORT%' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'F-09 unexpected error: %', SQLERRM; END IF; END;

    -- ======================================================================
    -- K. AUDIT
    -- ======================================================================
    IF EXISTS (SELECT 1 FROM public.audit_logs
                WHERE action='address.created' AND entity_id=v_addr::text
                  AND metadata->>'wave'='F8A-B4')
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'K-01 canonical address creation was not audited'; END IF;

    IF EXISTS (SELECT 1 FROM public.audit_logs
                WHERE action='address_usage.proposed' AND entity_id=v_use_e::text)
       AND EXISTS (SELECT 1 FROM public.audit_logs
                WHERE action='address_usage.approved' AND entity_id=v_use_e::text)
       AND EXISTS (SELECT 1 FROM public.audit_logs
                WHERE action='address_usage.ended' AND entity_id=v_use_tmp::text)
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'K-02 the usage lifecycle is not fully audited'; END IF;

    SELECT count(*) INTO v_n FROM public.audit_logs
     WHERE entity_id=v_use_e::text AND action LIKE 'address_usage.%' AND user_id IS NULL;
    IF v_n = 0 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'K-03 mutations were audited without an actor (%)', v_n; END IF;

    -- ======================================================================
    -- L. IDENTITY SAFETY — unresolved F&P identities stay unresolved
    -- ======================================================================
    INSERT INTO public.fp_individuals (full_name, status, regulator_id, address)
    VALUES ('B4 Gate Unresolved Individual','active', v_reg, '14 Church St, Basseterre')
    RETURNING id INTO v_use_tmp;

    SELECT count(*) INTO v_before FROM public.fp_individual_party_links;
    v_json := public.address_project_sources();
    SELECT count(*) INTO v_after FROM public.fp_individual_party_links;
    IF v_before = v_after THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'L-01 the projection sweep created identity links'; END IF;

    IF NOT EXISTS (SELECT 1 FROM public.address_usages u
                    WHERE u.source_kind='FP_DECLARATION' AND u.source_id=v_use_tmp)
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'L-02 an unresolved F&P record was projected onto a person'; END IF;

    IF EXISTS (SELECT 1 FROM public.address_projection_queue() q
                WHERE q.source_id=v_use_tmp AND q.reason='UNRESOLVED_PERSON_IDENTITY')
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'L-03 the unresolved F&P address is not surfaced in the queue'; END IF;

    IF v_json ? 'unresolved' AND v_json ? 'addresses_touched' AND v_json ? 'usages_touched'
    THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'L-04 the projection sweep does not report its exceptions (%)', v_json; END IF;

    -- projection never invents a party or an entity
    SELECT count(*) INTO v_n FROM public.address_usages u
     WHERE u.subject_kind='PERSON'
       AND NOT EXISTS (SELECT 1 FROM public.parties p WHERE p.id=u.subject_id AND p.party_kind='PERSON');
    IF v_n = 0 THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'L-05 a person usage points at a nonexistent canonical party (%)', v_n; END IF;

    -- ======================================================================
    -- H / I / J. RBAC POSITIVE, NEGATIVE AND DIRECT-RPC AUTHORIZATION
    -- ======================================================================
    -- H: the privileged fixture identity performed every mutation above.
    IF public.address_require('view') = v_admin THEN pass:=pass+1; ELSE fail:=fail+1;
      RAISE WARNING 'H-01 the privileged identity was not authorized'; END IF;

    IF v_viewer IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_viewer)::text, true);
      -- I-01 view-only user may read (governed read surfaces)
      BEGIN
        PERFORM public.address_360_overview(v_addr, v_today);
        PERFORM count(*) FROM public.relationship_intelligence_search('Church', ARRAY['ADDRESS'], 25);
        pass:=pass+1;
      EXCEPTION WHEN others THEN fail:=fail+1;
        RAISE WARNING 'I-01 a view-only user was denied a governed read: %', SQLERRM; END;
      -- I-02 view-only user may NOT approve
      BEGIN
        PERFORM public.address_usage_approve(v_use_p);
        fail:=fail+1; RAISE WARNING 'I-02 a view-only user approved an address usage';
      EXCEPTION WHEN others THEN
        IF SQLERRM LIKE '%ADDRESS_PERMISSION_DENIED%' THEN pass:=pass+1;
        ELSE fail:=fail+1; RAISE WARNING 'I-02 unexpected error: %', SQLERRM; END IF; END;
      -- I-03 view-only user may NOT run the projection sweep (apply)
      BEGIN
        PERFORM public.address_project_sources();
        fail:=fail+1; RAISE WARNING 'I-03 a view-only user ran the projection sweep';
      EXCEPTION WHEN others THEN
        IF SQLERRM LIKE '%ADDRESS_PERMISSION_DENIED%' THEN pass:=pass+1;
        ELSE fail:=fail+1; RAISE WARNING 'I-03 unexpected error: %', SQLERRM; END IF; END;
      -- I-03a view-only user may NOT propose a usage or a canonical address
      BEGIN
        PERFORM public.address_usage_propose(v_addr,'ENTITY',v_entity,'REGISTERED_OFFICE');
        fail:=fail+1; RAISE WARNING 'I-03a a view-only user proposed an address usage';
      EXCEPTION WHEN others THEN
        IF SQLERRM LIKE '%ADDRESS_PERMISSION_DENIED%' THEN pass:=pass+1;
        ELSE fail:=fail+1; RAISE WARNING 'I-03a unexpected error: %', SQLERRM; END IF; END;
      BEGIN
        PERFORM public.address_upsert_canonical('KN','9 Cert Street', NULL, NULL,
                  'Basseterre', NULL, NULL, 'view-only probe');
        fail:=fail+1; RAISE WARNING 'I-03b a view-only user created a canonical address';
      EXCEPTION WHEN others THEN
        IF SQLERRM LIKE '%ADDRESS_PERMISSION_DENIED%' THEN pass:=pass+1;
        ELSE fail:=fail+1; RAISE WARNING 'I-03b unexpected error: %', SQLERRM; END IF; END;
      -- I-03c view-only user may NOT end (apply) an approved usage
      BEGIN
        PERFORM public.address_usage_end(v_use_e, v_today);
        fail:=fail+1; RAISE WARNING 'I-03c a view-only user ended an address usage';
      EXCEPTION WHEN others THEN
        IF SQLERRM LIKE '%ADDRESS_PERMISSION_DENIED%' THEN pass:=pass+1;
        ELSE fail:=fail+1; RAISE WARNING 'I-03c unexpected error: %', SQLERRM; END IF; END;
    ELSE
      fail:=fail+1;
      RAISE WARNING 'I-01..I-03c not proven: the view-only certification persona was not built';
    END IF;

    IF v_outsider IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outsider)::text, true);
      -- I-04 unrelated user denied every read
      BEGIN
        PERFORM public.address_360_overview(v_addr, v_today);
        fail:=fail+1; RAISE WARNING 'I-04 an unrelated user read Address 360';
      EXCEPTION WHEN others THEN
        IF SQLERRM LIKE '%ADDRESS_PERMISSION_DENIED%' THEN pass:=pass+1;
        ELSE fail:=fail+1; RAISE WARNING 'I-04 unexpected error: %', SQLERRM; END IF; END;
      BEGIN
        PERFORM public.relationship_intelligence_search('Church', ARRAY['ADDRESS'], 25);
        fail:=fail+1; RAISE WARNING 'I-05 an unrelated user searched intelligence';
      EXCEPTION WHEN others THEN
        IF SQLERRM LIKE '%ADDRESS_PERMISSION_DENIED%' THEN pass:=pass+1;
        ELSE fail:=fail+1; RAISE WARNING 'I-05 unexpected error: %', SQLERRM; END IF; END;
      BEGIN
        PERFORM public.address_usage_propose(v_addr,'ENTITY',v_entity,'PRINCIPAL');
        fail:=fail+1; RAISE WARNING 'I-06 an unrelated user proposed an address usage';
      EXCEPTION WHEN others THEN
        IF SQLERRM LIKE '%ADDRESS_PERMISSION_DENIED%' THEN pass:=pass+1;
        ELSE fail:=fail+1; RAISE WARNING 'I-06 unexpected error: %', SQLERRM; END IF; END;
      -- I-07 an out-of-scope person is not visible
      IF NOT public.address_usage_visible(v_outsider,'PERSON',v_person)
      THEN pass:=pass+1; ELSE fail:=fail+1;
        RAISE WARNING 'I-07 an unrelated user can see a person address subject'; END IF;
    ELSE
      fail:=fail+1;
      RAISE WARNING 'I-04..I-07 not proven: no permissionless identity exists live';
    END IF;

    -- J: calling the RPC directly, with no session, must fail closed
    PERFORM set_config('request.jwt.claims', NULL, true);
    BEGIN
      PERFORM public.address_360_overview(v_addr, v_today);
      fail:=fail+1; RAISE WARNING 'J-01 an anonymous caller read Address 360';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%ADDRESS_AUTH_REQUIRED%' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'J-01 unexpected error: %', SQLERRM; END IF; END;

    BEGIN
      PERFORM public.address_usage_approve(v_use_p);
      fail:=fail+1; RAISE WARNING 'J-02 an anonymous caller approved a usage';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%ADDRESS_AUTH_REQUIRED%' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'J-02 unexpected error: %', SQLERRM; END IF; END;

    BEGIN
      PERFORM public.address_projection_queue();
      fail:=fail+1; RAISE WARNING 'J-03 an anonymous caller read the projection queue';
    EXCEPTION WHEN others THEN
      IF SQLERRM LIKE '%ADDRESS_AUTH_REQUIRED%' THEN pass:=pass+1;
      ELSE fail:=fail+1; RAISE WARNING 'J-03 unexpected error: %', SQLERRM; END IF; END;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  END IF;

  -- ==========================================================================
  -- N. FRONTEND / ROUTE CONTRACT (database side of the registration)
  -- ==========================================================================
  SELECT count(*) INTO v_n FROM public.sec_routes r
    JOIN public.sec_permissions p ON p.id = r.required_permission_id
   WHERE r.key IN ('route_relationship_intelligence','route_address_360')
     AND r.is_protected AND r.is_active AND r.audience='internal';
  IF v_n = 2 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'N-01 B4 routes are not registered and permission-guarded (% of 2)', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.sec_routes
   WHERE key='route_relationship_intelligence' AND path_pattern='/intelligence/network'
      OR key='route_address_360' AND path_pattern='/intelligence/addresses/:addressId';
  IF v_n = 2 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'N-02 B4 route paths do not match the router (% of 2)', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.sec_navigation_items
   WHERE key IN ('nav_relationship_intelligence','nav_address_360')
     AND is_active AND icon_key IS NOT NULL AND required_permission_id IS NOT NULL;
  IF v_n = 2 THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'N-03 B4 navigation entries missing/unguarded (% of 2)', v_n; END IF;

  -- the canonical permission family is used; no new permission was invented
  IF NOT EXISTS (SELECT 1 FROM public.sec_modules
                  WHERE key IN ('relationship_intelligence','address_intelligence','addresses'))

  THEN pass:=pass+1; ELSE fail:=fail+1;
    RAISE WARNING 'N-04 an uncatalogued B4 permission module exists'; END IF;

  RAISE NOTICE 'F8A-B4 gate: % passed, % failed', pass, fail;
  IF fail > 0 THEN
    RAISE EXCEPTION 'F8A-B4 gate FAILED with % defect(s)', fail;
  END IF;

  -- rollback all fixtures
  RAISE EXCEPTION 'F8A_B4_ROLLBACK_OK:%', pass;
EXCEPTION
  WHEN others THEN
    IF SQLERRM LIKE 'F8A_B4_ROLLBACK_OK:%' THEN
      RAISE NOTICE 'F8A-B4 gate: PASS (% assertions, all fixtures rolled back)',
        split_part(SQLERRM, ':', 2);
    ELSE
      RAISE;
    END IF;
END
$verify$;
