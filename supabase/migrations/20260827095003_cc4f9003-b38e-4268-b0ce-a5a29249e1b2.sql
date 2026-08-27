CREATE OR REPLACE FUNCTION public.entity_identifier_verify(
  _identifier_id uuid,
  _authoritative_source text,
  _evidence_notes text,
  _verified_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  u uuid := auth.uid();
  ident public.entity_identifiers%ROWTYPE;
  v_entity_id uuid;
  v_promoted boolean := false;
  v_verified_status_id uuid;
  v_prev_entity_status text;
BEGIN
  IF u IS NULL OR NOT public.is_internal_staff(u) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.e360_section_allowed(u, 'identity') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _authoritative_source IS NULL OR btrim(_authoritative_source) = '' THEN
    RAISE EXCEPTION 'authoritative_source_required' USING ERRCODE = '22023';
  END IF;
  IF _evidence_notes IS NULL OR btrim(_evidence_notes) = '' THEN
    RAISE EXCEPTION 'evidence_notes_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO ident FROM public.entity_identifiers WHERE id = _identifier_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'identifier_not_found' USING ERRCODE = '22023';
  END IF;
  IF ident.effective_to IS NOT NULL THEN
    RAISE EXCEPTION 'identifier_not_active' USING ERRCODE = '22023';
  END IF;
  IF ident.verification_status = 'VERIFIED' THEN
    RAISE EXCEPTION 'identifier_already_verified' USING ERRCODE = '22023';
  END IF;

  v_entity_id := ident.entity_id;

  UPDATE public.entity_identifiers
  SET verification_status = 'VERIFIED',
      source_type = 'EXTERNAL_REGISTRY',
      source_reference = btrim(_authoritative_source),
      updated_at = now()
  WHERE id = _identifier_id;

  IF ident.is_primary THEN
    SELECT s.label INTO v_prev_entity_status
    FROM public.licensees l
    LEFT JOIN public.entity_identity_statuses s ON s.id = l.identity_status_id
    WHERE l.id = v_entity_id;

    SELECT id INTO v_verified_status_id
    FROM public.entity_identity_statuses
    WHERE key = 'verified' AND is_active;

    IF v_verified_status_id IS NOT NULL THEN
      UPDATE public.licensees
      SET identity_status_id = v_verified_status_id, updated_at = now()
      WHERE id = v_entity_id
        AND identity_status_id IS DISTINCT FROM v_verified_status_id;
      v_promoted := FOUND;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (
    u, 'ENTITY_IDENTIFIER_VERIFIED', 'entity_identifiers', _identifier_id::text,
    jsonb_build_object('verification_status', ident.verification_status),
    jsonb_build_object('verification_status', 'VERIFIED',
                       'authoritative_source', btrim(_authoritative_source),
                       'verified_at', COALESCE(_verified_at, now())),
    jsonb_build_object('entity_id', v_entity_id,
                       'evidence_notes', btrim(_evidence_notes),
                       'is_primary', ident.is_primary,
                       'entity_identity_promoted', v_promoted,
                       'previous_entity_identity_status', v_prev_entity_status,
                       'source', 'entity360_identity_section')
  );

  RETURN jsonb_build_object(
    'id', _identifier_id,
    'verification_status', 'VERIFIED',
    'is_primary', ident.is_primary,
    'entity_identity_promoted', v_promoted
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.entity_identifier_verify(uuid, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entity_identifier_verify(uuid, text, text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.entity_identifier_reject_verification(
  _identifier_id uuid,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  u uuid := auth.uid();
  ident public.entity_identifiers%ROWTYPE;
BEGIN
  IF u IS NULL OR NOT public.is_internal_staff(u) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.e360_section_allowed(u, 'identity') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO ident FROM public.entity_identifiers WHERE id = _identifier_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'identifier_not_found' USING ERRCODE = '22023';
  END IF;
  IF ident.effective_to IS NOT NULL THEN
    RAISE EXCEPTION 'identifier_not_active' USING ERRCODE = '22023';
  END IF;
  IF ident.verification_status = 'VERIFIED' THEN
    RAISE EXCEPTION 'identifier_already_verified' USING ERRCODE = '22023';
  END IF;

  UPDATE public.entity_identifiers
  SET verification_status = 'DISPUTED', updated_at = now()
  WHERE id = _identifier_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (
    u, 'ENTITY_IDENTIFIER_VERIFICATION_REJECTED', 'entity_identifiers', _identifier_id::text,
    jsonb_build_object('verification_status', ident.verification_status),
    jsonb_build_object('verification_status', 'DISPUTED'),
    jsonb_build_object('entity_id', ident.entity_id,
                       'reason', btrim(_reason),
                       'source', 'entity360_identity_section')
  );

  RETURN jsonb_build_object('id', _identifier_id, 'verification_status', 'DISPUTED');
END;
$function$;

REVOKE ALL ON FUNCTION public.entity_identifier_reject_verification(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entity_identifier_reject_verification(uuid, text) TO authenticated;