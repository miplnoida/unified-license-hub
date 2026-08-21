-- Registration convergence — FORM_FIRST server-boundary proof.
--
-- Proves, at the database boundary, that the public New Applicant Registration
-- journey resolves through governed operations only:
--   EXACT_MATCH    → binds the registration to the existing canonical entity
--                    (no second entity created)
--   POSSIBLE_MATCH → governed resolution case, binding PENDING_RESOLUTION
--   NO_MATCH       → governed provisional entity, binding BOUND_PROVISIONAL
-- plus: repeat invocation is safe (ALREADY_BOUND), another user cannot resolve
-- somebody else's registration, anonymous callers are refused, and the browser
-- roles hold no execute rights on the service-only entry point.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f supabase/tests/onboarding/01_form_first_resolution.sql
-- Everything runs inside a transaction and is rolled back.
BEGIN;

DO $$
DECLARE
  v_owner uuid;
  v_other uuid;
  v_sector uuid;
  v_sub uuid;
  v_cat uuid;
  v_reg_uid uuid := gen_random_uuid();
  v_entity uuid;
  v_type uuid;
  v_reg uuid;
  v_res jsonb;
  v_binding public.registration_entity_bindings;
  v_entities_before int;
  v_name text := 'ZZQXV Holdings Trust Company ' || substr(gen_random_uuid()::text, 1, 8);
BEGIN
  -- two non-staff-agnostic actors
  SELECT id INTO v_owner FROM public.profiles ORDER BY created_at LIMIT 1;
  SELECT id INTO v_other FROM public.profiles WHERE id <> v_owner ORDER BY created_at LIMIT 1;
  IF v_owner IS NULL OR v_other IS NULL THEN
    RAISE EXCEPTION 'need two application users to run this check';
  END IF;

  INSERT INTO public.regulators(id, name, code, status)
  VALUES (v_reg_uid, '__ff_reg__', '__FF_'||substr(v_reg_uid::text,1,8), 'active');
  INSERT INTO public.sectors(id, name, regulator_id) VALUES (gen_random_uuid(), '__ff_sec__', v_reg_uid)
    RETURNING id INTO v_sector;
  INSERT INTO public.sub_sectors(id, name, sector_id) VALUES (gen_random_uuid(), '__ff_sub__', v_sector)
    RETURNING id INTO v_sub;
  INSERT INTO public.categories(id, name, sector_id, sub_sector_id)
    VALUES (gen_random_uuid(), '__ff_cat__', v_sector, v_sub) RETURNING id INTO v_cat;

  SELECT count(*)::int INTO v_entities_before FROM public.licensees;

  -- ========================================================== A. EXACT_MATCH
  INSERT INTO public.licensees(id, name, status)
  VALUES (gen_random_uuid(), v_name, 'active') RETURNING id INTO v_entity;

  -- globally-unique identifier type keeps the fixture jurisdiction-free
  SELECT id INTO v_type FROM public.entity_identifier_types
   WHERE key = 'legal_entity_identifier' AND is_active;
  INSERT INTO public.entity_identifiers(entity_id, identifier_type_id, identifier_value, source_type, regulator_id)
  VALUES (v_entity, v_type, 'FFTEST-'||substr(gen_random_uuid()::text,1,10), 'MANUAL', v_reg_uid);

  INSERT INTO public.registrations(
    user_id, sector_id, sub_sector_id, category_id, applicant_name,
    mailing_address, physical_address, same_as_mailing,
    first_name, last_name, telephone, email, status, entity_specific_data)
  VALUES (v_owner, v_sector, v_sub, v_cat, v_name, '{}'::jsonb, '{}'::jsonb, true,
    'FF','Owner','0000000000','ff+exact@example.com','pending_review',
    jsonb_build_object('identifiers', jsonb_build_array(jsonb_build_object(
      'type', (SELECT key FROM public.entity_identifier_types WHERE id = v_type),
      'value', (SELECT identifier_value FROM public.entity_identifiers WHERE entity_id = v_entity LIMIT 1)))))
  RETURNING id INTO v_reg;

  v_res := public.onboarding_form_first_resolve_service(v_reg);
  IF v_res->>'outcome' <> 'EXACT_MATCH' THEN
    RAISE EXCEPTION '[FAIL] expected EXACT_MATCH, got %', v_res;
  END IF;
  SELECT * INTO v_binding FROM public.registration_entity_bindings WHERE registration_id = v_reg;
  IF v_binding.binding_status <> 'BOUND_EXISTING' OR v_binding.entity_id <> v_entity THEN
    RAISE EXCEPTION '[FAIL] exact match must bind the existing entity; got %', v_binding;
  END IF;
  IF (SELECT count(*) FROM public.licensees) <> v_entities_before + 1 THEN
    RAISE EXCEPTION '[FAIL] exact match created a duplicate entity';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.entity_identity_resolution_events
                  WHERE id = v_binding.identification_event_id AND journey_type = 'FORM_FIRST') THEN
    RAISE EXCEPTION '[FAIL] no FORM_FIRST identification event recorded';
  END IF;
  RAISE NOTICE '[OK] EXACT_MATCH → BOUND_EXISTING, no duplicate entity, FORM_FIRST event recorded';

  -- repeat invocation must be safe
  v_res := public.onboarding_form_first_resolve_service(v_reg);
  IF v_res->>'outcome' <> 'ALREADY_BOUND' THEN
    RAISE EXCEPTION '[FAIL] repeat invocation not idempotent: %', v_res;
  END IF;
  RAISE NOTICE '[OK] repeat invocation is idempotent (ALREADY_BOUND)';

  -- another user cannot resolve this registration
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_other::text, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.onboarding_form_first_resolve(v_reg);
    RAISE EXCEPTION '[FAIL] another user was allowed to resolve this registration';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '[OK] another user cannot resolve somebody else''s registration';
  END;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- anonymous caller refused by the authenticated wrapper
  BEGIN
    PERFORM public.onboarding_form_first_resolve(v_reg);
    RAISE EXCEPTION '[FAIL] anonymous caller was allowed to resolve';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '[OK] anonymous caller refused';
  END;

  -- ======================================================= B. POSSIBLE_MATCH
  v_entities_before := (SELECT count(*)::int FROM public.licensees);
  INSERT INTO public.registrations(
    user_id, sector_id, sub_sector_id, category_id, applicant_name,
    mailing_address, physical_address, same_as_mailing,
    first_name, last_name, telephone, email, status, entity_specific_data)
  VALUES (v_owner, v_sector, v_sub, v_cat, v_name || ' Limited', '{}'::jsonb, '{}'::jsonb, true,
    'FF','Owner','0000000000','ff+possible@example.com','pending_review', '{}'::jsonb)
  RETURNING id INTO v_reg;

  v_res := public.onboarding_form_first_resolve_service(v_reg);
  IF v_res->>'outcome' <> 'POSSIBLE_MATCH' THEN
    RAISE EXCEPTION '[FAIL] expected POSSIBLE_MATCH, got %', v_res;
  END IF;
  SELECT * INTO v_binding FROM public.registration_entity_bindings WHERE registration_id = v_reg;
  IF v_binding.binding_status <> 'PENDING_RESOLUTION' OR v_binding.entity_id IS NOT NULL THEN
    RAISE EXCEPTION '[FAIL] possible match must stay pending with no entity; got %', v_binding;
  END IF;
  IF v_binding.resolution_case_id IS NULL THEN
    RAISE EXCEPTION '[FAIL] possible match did not create a governed resolution case';
  END IF;
  IF (SELECT count(*) FROM public.licensees) <> v_entities_before THEN
    RAISE EXCEPTION '[FAIL] possible match created an entity (duplicate bypass)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.registrations WHERE id = v_reg) THEN
    RAISE EXCEPTION '[FAIL] registration was not preserved';
  END IF;
  RAISE NOTICE '[OK] POSSIBLE_MATCH → PENDING_RESOLUTION, resolution case opened, no entity created';

  -- ============================================================ C. NO_MATCH
  v_entities_before := (SELECT count(*)::int FROM public.licensees);
  INSERT INTO public.registrations(
    user_id, sector_id, sub_sector_id, category_id, applicant_name,
    mailing_address, physical_address, same_as_mailing,
    first_name, last_name, telephone, email, status, entity_specific_data)
  VALUES (v_owner, v_sector, v_sub, v_cat, 'QQJXZW' || replace(gen_random_uuid()::text,'-','') || ' Ventures',
    '{}'::jsonb, '{}'::jsonb, true,
    'FF','Owner','0000000000','ff+nomatch@example.com','pending_review', '{}'::jsonb)
  RETURNING id INTO v_reg;

  v_res := public.onboarding_form_first_resolve_service(v_reg);
  IF v_res->>'outcome' <> 'NO_MATCH' THEN
    RAISE EXCEPTION '[FAIL] expected NO_MATCH, got %', v_res;
  END IF;
  SELECT * INTO v_binding FROM public.registration_entity_bindings WHERE registration_id = v_reg;
  IF v_binding.binding_status <> 'BOUND_PROVISIONAL' OR v_binding.entity_id IS NULL THEN
    RAISE EXCEPTION '[FAIL] no match must bind a governed provisional entity; got %', v_binding;
  END IF;
  IF (SELECT count(*) FROM public.licensees) <> v_entities_before + 1 THEN
    RAISE EXCEPTION '[FAIL] provisional entity was not provisioned exactly once';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.registration_journey_events
                  WHERE registration_id = v_reg AND journey_type = 'FORM_FIRST') THEN
    RAISE EXCEPTION '[FAIL] no FORM_FIRST journey event recorded for provisioning';
  END IF;
  RAISE NOTICE '[OK] NO_MATCH → governed provisional entity bound, journey event recorded';

  -- ===================================================== D. execute surface
  IF has_function_privilege('anon', 'public.onboarding_form_first_resolve_service(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.onboarding_form_first_resolve_service(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '[FAIL] browser roles can execute the service-only resolver';
  END IF;
  IF has_function_privilege('anon', 'public.onboarding_form_first_resolve(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '[FAIL] anon can execute the authenticated resolver';
  END IF;
  IF has_table_privilege('anon', 'public.licensees', 'INSERT')
     OR has_table_privilege('anon', 'public.registration_entity_bindings', 'INSERT') THEN
    RAISE EXCEPTION '[FAIL] anonymous role can write canonical entity tables';
  END IF;
  IF NOT has_table_privilege('anon', 'public.registration_journey_types', 'SELECT') THEN
    RAISE EXCEPTION '[FAIL] public journey catalogue is not readable by visitors';
  END IF;
  RAISE NOTICE '[OK] execute/DML surface is correct';

  RAISE NOTICE '=== FORM_FIRST resolution: PASSED ===';
END $$;

ROLLBACK;
