-- 1. Public control plane: allow the public registration choice page to read the catalogue.
GRANT SELECT ON public.registration_journey_types TO anon, authenticated;
GRANT ALL ON public.registration_journey_types TO service_role;

-- 2. Refactor FORM_FIRST resolution into an actor-parameterised internal routine
--    so it can also be invoked by the service-role registration submission path
--    (the applicant has no session at submission time).
CREATE OR REPLACE FUNCTION public.onboarding_form_first_resolve_internal(_registration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  reg public.registrations;
  v_payload jsonb;
  v_raw jsonb;
  v_event uuid;
  v_entity uuid;
  v_case uuid;
  v_status text;
  v_prov jsonb;
  v_existing public.registration_entity_bindings;
BEGIN
  SELECT * INTO reg FROM public.registrations WHERE id = _registration_id;
  IF reg.id IS NULL THEN RAISE EXCEPTION 'Registration not found' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_existing FROM public.registration_entity_bindings WHERE registration_id = _registration_id;
  IF v_existing.id IS NOT NULL AND v_existing.entity_id IS NOT NULL THEN
    RETURN jsonb_build_object('outcome','ALREADY_BOUND','entity_bound',true,'binding_status',v_existing.binding_status);
  END IF;

  v_payload := jsonb_build_object(
    'legal_name', reg.applicant_name,
    'identifiers', COALESCE(reg.entity_specific_data->'identifiers','[]'::jsonb),
    'license_number', NULLIF(reg.entity_specific_data->>'license_number',''),
    'sector_id', reg.sector_id::text,
    'journey_type', 'FORM_FIRST');

  BEGIN
    v_raw := public.entity_resolve_identity(v_payload);
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.onboarding_log_identification_event(
      reg.user_id, 'FORM_FIRST', 'PUBLIC_REGISTRATION', v_payload, 'SYSTEM_ERROR', NULL, NULL, '[]'::jsonb, NULL, SQLERRM);
    RAISE;
  END;

  v_entity := NULLIF(v_raw->>'entity_id','')::uuid;
  v_case := NULLIF(v_raw->>'case_id','')::uuid;

  v_event := public.onboarding_log_identification_event(
    reg.user_id, 'FORM_FIRST', 'PUBLIC_REGISTRATION', v_payload, COALESCE(v_raw->>'outcome','NO_MATCH'),
    v_entity, v_case, COALESCE(v_raw->'candidates','[]'::jsonb), v_raw->>'match_basis', NULL);

  IF (v_raw->>'outcome') = 'EXACT_MATCH' THEN
    v_status := 'BOUND_EXISTING';
  ELSIF (v_raw->>'outcome') = 'POSSIBLE_MATCH' THEN
    v_status := 'PENDING_RESOLUTION';
  ELSE
    v_prov := public.wb_onboarding_provision_entity(v_payload || jsonb_build_object('case_id', v_case));
    v_entity := (v_prov->>'entity_id')::uuid;
    v_status := 'BOUND_PROVISIONAL';
    PERFORM public.onboarding_record_journey_event(reg.user_id, 'PROVISIONAL_ENTITY_CREATED', 'FORM_FIRST',
      v_entity, _registration_id, v_event, jsonb_build_object('legal_name', reg.applicant_name));
  END IF;

  INSERT INTO public.registration_entity_bindings
    (registration_id, entity_id, resolution_case_id, identification_event_id, binding_status, bound_at)
  VALUES (_registration_id, v_entity, v_case, v_event, v_status,
          CASE WHEN v_entity IS NOT NULL THEN now() END)
  ON CONFLICT (registration_id) DO UPDATE
    SET entity_id = COALESCE(EXCLUDED.entity_id, public.registration_entity_bindings.entity_id),
        resolution_case_id = COALESCE(EXCLUDED.resolution_case_id, public.registration_entity_bindings.resolution_case_id),
        identification_event_id = EXCLUDED.identification_event_id,
        binding_status = EXCLUDED.binding_status,
        bound_at = COALESCE(EXCLUDED.bound_at, public.registration_entity_bindings.bound_at),
        updated_at = now();

  PERFORM public.onboarding_record_follow_up(
    CASE WHEN v_status = 'PENDING_RESOLUTION' THEN 'CONTINUE_FORM_FIRST' ELSE 'CONTINUES_APPLICATION' END,
    jsonb_build_object('registration_id', _registration_id, 'binding_status', v_status), v_event, reg.user_id);

  RETURN jsonb_build_object(
    'outcome', v_raw->>'outcome',
    'binding_status', v_status,
    'entity_bound', v_entity IS NOT NULL,
    'case_reference', v_raw->>'case_number',
    'event_reference', (SELECT event_reference FROM public.entity_identity_resolution_events WHERE id = v_event));
END $function$;

REVOKE ALL ON FUNCTION public.onboarding_form_first_resolve_internal(uuid) FROM PUBLIC, anon, authenticated;

-- Authenticated wrapper keeps the existing ownership/staff authorisation contract.
CREATE OR REPLACE FUNCTION public.onboarding_form_first_resolve(_registration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE reg public.registrations;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO reg FROM public.registrations WHERE id = _registration_id;
  IF reg.id IS NULL THEN RAISE EXCEPTION 'Registration not found' USING ERRCODE='22023'; END IF;
  IF reg.user_id <> auth.uid() AND NOT (public.is_internal_staff(auth.uid()) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE='42501';
  END IF;
  RETURN public.onboarding_form_first_resolve_internal(_registration_id);
END $function$;

REVOKE ALL ON FUNCTION public.onboarding_form_first_resolve(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.onboarding_form_first_resolve(uuid) TO authenticated, service_role;

-- Service-role-only submission-path entry point: the applicant is not signed in
-- when the public registration is durably created.
CREATE OR REPLACE FUNCTION public.onboarding_form_first_resolve_service(_registration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.onboarding_form_first_resolve_internal(_registration_id);
END $function$;

REVOKE ALL ON FUNCTION public.onboarding_form_first_resolve_service(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.onboarding_form_first_resolve_service(uuid) TO service_role;