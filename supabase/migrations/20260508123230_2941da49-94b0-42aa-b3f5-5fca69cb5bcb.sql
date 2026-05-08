CREATE OR REPLACE FUNCTION public.save_ppoc_mapping(_mapping_id uuid, _ppoc_user_id uuid, _licensee_id uuid, _sector_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_mapping_id uuid;
  v_licensee record;
  v_resolved_sector_id uuid;
  v_existing record;
  v_sector_count integer;
  v_unique_sector_count integer;
  v_same_sectors boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;

  IF NOT (public.has_role(v_uid,'super_admin'::app_role) OR public.has_role(v_uid,'admin'::app_role)) THEN
    RETURN jsonb_build_object('error','Admin only','code','FORBIDDEN','http',403);
  END IF;

  IF _ppoc_user_id IS NULL THEN
    RETURN jsonb_build_object('error','Please select a PPOC user.','code','PPOC_REQUIRED','http',422);
  END IF;

  IF _licensee_id IS NULL THEN
    RETURN jsonb_build_object('error','Please select a licensee entity.','code','LICENSEE_REQUIRED','http',422);
  END IF;

  IF _sector_ids IS NULL OR coalesce(array_length(_sector_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('error','Please select at least one sector for this PPOC mapping.','code','SECTORS_REQUIRED','http',422);
  END IF;

  SELECT count(*)::int, count(distinct s)::int
    INTO v_sector_count, v_unique_sector_count
    FROM unnest(_sector_ids) AS s;

  IF v_sector_count <> v_unique_sector_count THEN
    RETURN jsonb_build_object('error','Duplicate sectors are not allowed in a PPOC mapping.','code','DUPLICATE_SECTORS','http',422);
  END IF;

  SELECT l.id, l.name, l.sector_id, l.status, l.license_id
    INTO v_licensee
    FROM public.licensees l
   WHERE l.id = _licensee_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Selected licensee entity was not found.','code','LICENSEE_NOT_FOUND','http',404);
  END IF;

  -- Resolve sector with the same priority as the Licensee Entities admin page:
  -- registrations.sector_id -> applications.data->>'sector_id' -> licensees.sector_id
  v_resolved_sector_id := v_licensee.sector_id;

  IF v_resolved_sector_id IS NULL AND v_licensee.license_id IS NOT NULL THEN
    SELECT COALESCE(
             NULLIF(r.sector_id::text,'')::uuid,
             NULLIF(a.data->>'sector_id','')::uuid
           )
      INTO v_resolved_sector_id
      FROM public.licenses lic
      LEFT JOIN public.applications a ON a.id = lic.application_id
      LEFT JOIN public.registrations r ON r.user_id = a.applicant_id
     WHERE lic.id = v_licensee.license_id
     LIMIT 1;
  END IF;

  IF v_resolved_sector_id IS NULL THEN
    RETURN jsonb_build_object('error','Selected licensee entity does not have a resolvable sector assignment.','code','LICENSEE_SECTOR_MISSING','http',422);
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.sectors s
     WHERE s.id = ANY(_sector_ids)
       AND COALESCE(s.status, 'active') = 'active'
    HAVING count(*) = array_length(_sector_ids, 1)
  ) THEN
    RETURN jsonb_build_object('error','One or more selected sectors are invalid or inactive.','code','INVALID_SECTORS','http',422);
  END IF;

  IF NOT (v_resolved_sector_id = ANY(_sector_ids)) THEN
    RETURN jsonb_build_object('error','Selected entity does not belong to the assigned PPOC sectors.','code','LICENSEE_SECTOR_MISMATCH','http',422);
  END IF;

  IF _mapping_id IS NOT NULL THEN
    SELECT *
      INTO v_existing
      FROM public.ppoc_entity_mappings
     WHERE id = _mapping_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('error','PPOC mapping not found.','code','MAPPING_NOT_FOUND','http',404);
    END IF;
  END IF;

  IF NOT public.is_eligible_ppoc_user(_ppoc_user_id, _mapping_id) THEN
    RETURN jsonb_build_object('error','Selected PPOC user is not an eligible external or licensee contact user.','code','INVALID_PPOC_USER','http',422);
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.ppoc_entity_mappings m
     WHERE m.ppoc_user_id = _ppoc_user_id
       AND m.licensee_id = _licensee_id
       AND (_mapping_id IS NULL OR m.id <> _mapping_id)
  ) INTO v_same_sectors;

  IF v_same_sectors THEN
    RETURN jsonb_build_object('error','This PPOC mapping already exists.','code','DUPLICATE_MAPPING','http',409);
  END IF;

  IF _mapping_id IS NULL THEN
    INSERT INTO public.ppoc_entity_mappings (ppoc_user_id, licensee_id, is_active)
    VALUES (_ppoc_user_id, _licensee_id, true)
    RETURNING id INTO v_mapping_id;
  ELSE
    UPDATE public.ppoc_entity_mappings
       SET ppoc_user_id = _ppoc_user_id,
           licensee_id = _licensee_id,
           updated_at = now()
     WHERE id = _mapping_id;
    v_mapping_id := _mapping_id;
  END IF;

  DELETE FROM public.ppoc_mapping_sectors WHERE mapping_id = v_mapping_id;

  INSERT INTO public.ppoc_mapping_sectors (mapping_id, sector_id)
  SELECT v_mapping_id, s
    FROM unnest(_sector_ids) AS s;

  PERFORM public.create_audit_log(
    v_uid,
    CASE WHEN _mapping_id IS NULL THEN 'ppoc_mapping_created' ELSE 'ppoc_mapping_updated' END,
    'ppoc_mapping',
    v_mapping_id::text,
    NULL,
    jsonb_build_object('ppoc_user_id', _ppoc_user_id, 'licensee_id', _licensee_id, 'sector_ids', _sector_ids, 'resolved_sector_id', v_resolved_sector_id),
    NULL
  );

  RETURN jsonb_build_object('success', true, 'mapping_id', v_mapping_id, 'http', 200);
END;
$function$;