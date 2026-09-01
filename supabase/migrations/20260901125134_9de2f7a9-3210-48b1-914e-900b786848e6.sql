-- 1. entity_for_license: only trust applications.entity_id when the entity exists.
CREATE OR REPLACE FUNCTION public.entity_for_license(_license_id uuid, _application_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_entity_id uuid;
BEGIN
  IF _application_id IS NOT NULL THEN
    SELECT a.entity_id INTO v_entity_id
      FROM public.applications a
      JOIN public.licensees l ON l.id = a.entity_id
     WHERE a.id = _application_id;
  END IF;

  IF v_entity_id IS NULL AND _license_id IS NOT NULL THEN
    SELECT el.entity_id INTO v_entity_id
      FROM public.entity_licenses el
      JOIN public.licensees l ON l.id = el.entity_id
     WHERE el.license_id = _license_id
     ORDER BY (l.merged_into_entity_id IS NULL) DESC,
              COALESCE(el.is_primary, false) DESC, el.effective_from
     LIMIT 1;
  END IF;

  IF v_entity_id IS NULL AND _license_id IS NOT NULL THEN
    SELECT id INTO v_entity_id FROM public.licensees
     WHERE license_id = _license_id ORDER BY created_at LIMIT 1;
  END IF;

  RETURN public.entity_follow_merge(v_entity_id);
END $function$;

-- 2. entity_link_license: never write a dangling entity reference.
CREATE OR REPLACE FUNCTION public.entity_link_license(_entity_id uuid, _license_id uuid, _application_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_from timestamptz;
BEGIN
  IF _entity_id IS NULL OR _license_id IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.licensees WHERE id = _entity_id) THEN
    RAISE EXCEPTION 'ENTITY_NOT_FOUND: % is not a regulated entity', _entity_id;
  END IF;

  SELECT id INTO v_id FROM public.entity_licenses
   WHERE entity_id = _entity_id AND license_id = _license_id LIMIT 1;

  IF v_id IS NULL THEN
    SELECT COALESCE(valid_from, now()) INTO v_from FROM public.licenses WHERE id = _license_id;
    INSERT INTO public.entity_licenses (entity_id, license_id, effective_from, is_primary, source)
    VALUES (_entity_id, _license_id, COALESCE(v_from, now()),
            NOT EXISTS (SELECT 1 FROM public.entity_licenses WHERE entity_id = _entity_id),
            'LICENCE_ISSUANCE')
    RETURNING id INTO v_id;
  END IF;

  IF _application_id IS NOT NULL THEN
    UPDATE public.applications
       SET entity_id = _entity_id, updated_at = now()
     WHERE id = _application_id AND entity_id IS DISTINCT FROM _entity_id;
  END IF;

  RETURN v_id;
END $function$;

-- 3. Clear dangling entity references on applications.
UPDATE public.applications a
   SET entity_id = NULL, updated_at = now()
 WHERE a.entity_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = a.entity_id);