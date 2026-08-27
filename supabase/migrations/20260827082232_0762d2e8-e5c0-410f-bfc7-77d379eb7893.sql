CREATE OR REPLACE FUNCTION public.entity_identifier_register(
  _entity_id uuid,
  _identifier_type_key text,
  _identifier_value text,
  _jurisdiction_id uuid DEFAULT NULL,
  _issuer_key text DEFAULT NULL,
  _is_primary boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  u uuid := auth.uid();
  t public.entity_identifier_types%ROWTYPE;
  st_label text;
  new_id uuid := gen_random_uuid();
  v_status text;
BEGIN
  IF u IS NULL OR NOT public.is_internal_staff(u) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.e360_section_allowed(u, 'identity') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO t FROM public.entity_identifier_types
  WHERE key = _identifier_type_key AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_or_inactive_identifier_type: %', _identifier_type_key USING ERRCODE = '22023';
  END IF;

  IF _identifier_value IS NULL OR btrim(_identifier_value) = '' THEN
    RAISE EXCEPTION 'identifier_value_required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.licensees WHERE id = _entity_id) THEN
    RAISE EXCEPTION 'entity_not_found' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.entity_identifiers i
    WHERE i.entity_id = _entity_id
      AND i.identifier_type_id = t.id
      AND i.effective_to IS NULL
  ) THEN
    RAISE EXCEPTION 'duplicate_active_identifier_for_type' USING ERRCODE = '23505';
  END IF;

  SELECT s.label INTO st_label
  FROM public.licensees l
  LEFT JOIN public.entity_identity_statuses s ON s.id = l.identity_status_id
  WHERE l.id = _entity_id;

  v_status := CASE st_label
    WHEN 'Verified' THEN 'VERIFIED'
    WHEN 'Provisional' THEN 'PROVISIONAL'
    WHEN 'Disputed' THEN 'DISPUTED'
    ELSE 'UNVERIFIED'
  END;

  IF _is_primary THEN
    UPDATE public.entity_identifiers
    SET is_primary = false, updated_at = now()
    WHERE entity_id = _entity_id AND is_primary AND effective_to IS NULL;
  END IF;

  INSERT INTO public.entity_identifiers (
    id, entity_id, identifier_type_id, identifier_value, normalized_value,
    uniqueness_scope, jurisdiction_id, issuer_key, regulator_id,
    is_primary, verification_status, effective_from, source_type, source_reference
  ) VALUES (
    new_id, _entity_id, t.id, _identifier_value,
    CASE t.normalization_strategy
      WHEN 'DIGITS_ONLY' THEN regexp_replace(_identifier_value, '\D', '', 'g')
      WHEN 'UPPER_ALPHANUMERIC' THEN upper(regexp_replace(_identifier_value, '[^A-Za-z0-9]', '', 'g'))
      WHEN 'UPPER_TRIM' THEN upper(btrim(_identifier_value))
      ELSE upper(btrim(_identifier_value))
    END,
    t.uniqueness_scope, _jurisdiction_id, _issuer_key,
    CASE WHEN t.uniqueness_scope = 'REGULATOR'
         THEN COALESCE((SELECT lead_regulator_id FROM public.licensees WHERE id = _entity_id),
                       'ca6e0616-55a9-48e7-8652-2b19536afb8a'::uuid)
         ELSE NULL END,
    _is_primary, v_status, now(), 'MANUAL', 'E360-IDENTITY-UI'
  );

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value, metadata)
  VALUES (u, 'ENTITY_IDENTIFIER_REGISTERED', 'entity_identifiers', new_id::text,
          jsonb_build_object('entity_id', _entity_id, 'identifier_type', _identifier_type_key,
                             'identifier_value', _identifier_value, 'is_primary', _is_primary,
                             'verification_status', v_status),
          jsonb_build_object('source', 'entity360_identity_section'));

  RETURN jsonb_build_object('id', new_id, 'verification_status', v_status);
END;
$function$;

REVOKE ALL ON FUNCTION public.entity_identifier_register(uuid, text, text, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entity_identifier_register(uuid, text, text, uuid, text, boolean) TO authenticated;