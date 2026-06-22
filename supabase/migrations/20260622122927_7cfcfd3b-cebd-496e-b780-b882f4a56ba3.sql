CREATE OR REPLACE FUNCTION public.can_user_access_licensee(_user_id uuid, _target_licensee_id uuid, _target_sector_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    _user_id IS NOT NULL
    AND _target_licensee_id IS NOT NULL
    AND (
      -- Primary User: profile directly linked to the licensee
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _user_id
          AND p.licensee_id = _target_licensee_id
      )
      OR
      -- Original license holder: the licensee row links to a license whose
      -- holder_id is the current user (covers pre_license_users-created
      -- accounts whose profile.licensee_id was never backfilled).
      EXISTS (
        SELECT 1
        FROM public.licensees l
        JOIN public.licenses lic ON lic.id = l.license_id
        WHERE l.id = _target_licensee_id
          AND lic.holder_id = _user_id
          AND (
            _target_sector_id IS NULL
            OR lic.sector_id IS NULL
            OR lic.sector_id = _target_sector_id
          )
      )
      OR
      -- PPOC: active mapping, sector match when target sector is provided
      EXISTS (
        SELECT 1
        FROM public.ppoc_entity_mappings m
        JOIN public.licensees l ON l.id = m.licensee_id
        WHERE m.ppoc_user_id = _user_id
          AND m.is_active = true
          AND m.licensee_id = _target_licensee_id
          AND (
            _target_sector_id IS NULL
            OR EXISTS (
              SELECT 1 FROM public.ppoc_mapping_sectors s
              WHERE s.mapping_id = m.id
                AND s.sector_id = _target_sector_id
            )
          )
          AND (
            l.sector_id IS NULL
            OR EXISTS (
              SELECT 1 FROM public.ppoc_mapping_sectors s
              WHERE s.mapping_id = m.id
                AND s.sector_id = l.sector_id
            )
          )
      )
    )
$function$;