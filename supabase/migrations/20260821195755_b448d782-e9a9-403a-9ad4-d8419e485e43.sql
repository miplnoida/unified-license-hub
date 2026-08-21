CREATE OR REPLACE FUNCTION public.entity_create_local(_legal_name text, _identifiers jsonb DEFAULT '[]'::jsonb, _sector_id uuid DEFAULT NULL::uuid, _lifecycle_key text DEFAULT 'applicant'::text, _identity_status_key text DEFAULT 'provisional'::text, _case_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_party uuid; v_entity uuid; v_life uuid; v_ident uuid; v_type uuid; rec jsonb; v_norm text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF btrim(COALESCE(_legal_name,'')) = '' THEN RAISE EXCEPTION 'legal_name is required' USING ERRCODE='22023'; END IF;

  SELECT id INTO v_life FROM public.lifecycle_stages WHERE key = _lifecycle_key;
  SELECT id INTO v_ident FROM public.entity_identity_statuses WHERE key = _identity_status_key;

  INSERT INTO public.parties (party_kind, display_name) VALUES ('ORGANIZATION', _legal_name)
  RETURNING id INTO v_party;
  -- Applicant-declared names are LOCAL_PROVISIONAL until a registry projection
  -- or verification promotes them (organizations_legal_name_authority_check).
  INSERT INTO public.organizations (party_id, legal_name, display_name, legal_name_authority)
  VALUES (v_party, _legal_name, _legal_name, 'LOCAL_PROVISIONAL');

  INSERT INTO public.licensees (name, sector_id, status, party_id, lifecycle_stage_id, identity_status_id, applicant_id)
  VALUES (_legal_name, _sector_id, 'active', v_party, v_life, v_ident, uid)
  RETURNING id INTO v_entity;

  FOR rec IN SELECT jsonb_array_elements(COALESCE(_identifiers,'[]'::jsonb)) LOOP
    SELECT id INTO v_type FROM public.entity_identifier_types WHERE key = rec->>'type' AND is_active;
    CONTINUE WHEN v_type IS NULL;
    v_norm := public.normalize_entity_identifier(v_type, rec->>'value');
    CONTINUE WHEN COALESCE(v_norm,'') = '';
    INSERT INTO public.entity_identifiers
      (entity_id, identifier_type_id, identifier_value, normalized_value, uniqueness_scope,
       is_primary, verification_status, source_type, effective_from)
    SELECT v_entity, v_type, rec->>'value', v_norm, t.uniqueness_scope, false, 'unverified', 'APPLICANT_DECLARED', now()
    FROM public.entity_identifier_types t WHERE t.id = v_type
    ON CONFLICT DO NOTHING;
  END LOOP;

  IF _case_id IS NOT NULL THEN
    INSERT INTO public.entity_resolution_events (case_id, event_type, actor_id, detail)
    VALUES (_case_id, 'entity.created', uid, jsonb_build_object('entity_id', v_entity));
  END IF;

  PERFORM public.create_audit_log(uid, 'entity.created', 'entity', v_entity::text,
    NULL, jsonb_build_object('legal_name', _legal_name, 'lifecycle', _lifecycle_key,
                             'identity_status', _identity_status_key), '{}'::jsonb);
  RETURN v_entity;
END $function$;