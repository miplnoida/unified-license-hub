CREATE OR REPLACE FUNCTION public.can_read_license(_user uuid, _license_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  h_id uuid;
  s_id uuid;
  app_id uuid;
  lic_entity uuid;
BEGIN
  IF _user IS NULL OR _license_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_user) THEN RETURN true; END IF;

  SELECT holder_id, sector_id, application_id
    INTO h_id, s_id, app_id
  FROM public.licenses WHERE id = _license_id;

  -- Supervisory / internal scoped access (unchanged)
  IF public.has_scoped_permission(_user, 'license_management', 'view', h_id, s_id, NULL) THEN RETURN true; END IF;

  -- Holder side: the licence holder account itself
  IF h_id IS NOT NULL AND h_id = _user THEN RETURN true; END IF;

  -- Holder side: applicant on the originating application
  IF app_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.id = app_id AND a.applicant_id = _user
  ) THEN RETURN true; END IF;

  -- Entity linked to this licence
  SELECT id INTO lic_entity FROM public.licensees WHERE license_id = _license_id LIMIT 1;

  IF lic_entity IS NOT NULL THEN
    IF public.can_read_licensee(_user, lic_entity) THEN RETURN true; END IF;
    IF EXISTS (
      SELECT 1 FROM public.entity_user_access ea
      WHERE ea.user_id = _user
        AND ea.entity_id = lic_entity
        AND ea.is_active = true
        AND (ea.end_date IS NULL OR ea.end_date >= CURRENT_DATE)
    ) THEN RETURN true; END IF;
  END IF;

  -- Legacy path: holder_id treated as a licensee id (older data)
  IF h_id IS NOT NULL AND public.can_read_licensee(_user, h_id) THEN RETURN true; END IF;

  RETURN false;
END;
$function$;