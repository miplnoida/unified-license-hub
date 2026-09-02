CREATE OR REPLACE FUNCTION public.can_read_licensee(_user uuid, _licensee_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s_id uuid;
BEGIN
  IF _user IS NULL OR _licensee_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_user) THEN RETURN true; END IF;

  SELECT sector_id INTO s_id FROM public.licensees WHERE id = _licensee_id;

  IF public.has_permission(_user, 'licensee_management', 'view_all_entities')
     OR public.has_permission(_user, 'license_management', 'view_all_entities')
  THEN
    RETURN true;
  END IF;

  IF NOT public.has_external_role(_user)
     AND (
       public.has_scoped_permission(_user, 'licensee_management', 'view', _licensee_id, s_id, NULL)
       OR public.has_scoped_permission(_user, 'license_management', 'view', _licensee_id, s_id, NULL)
     )
  THEN
    RETURN true;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user AND p.licensee_id = _licensee_id) THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.ppoc_entity_mappings m
             WHERE m.ppoc_user_id = _user AND m.licensee_id = _licensee_id AND m.is_active = true) THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.licensees lc WHERE lc.id = _licensee_id
             AND (lc.lead_regulator_id = _user OR lc.regulator_officer_id = _user
                  OR lc.alternate_regulator_id = _user OR lc.assigned_supervisor_id = _user)) THEN RETURN true; END IF;
  -- Canonical supervision assignment register: an internal officer formally
  -- assigned to this entity can read it (scoped to that entity only).
  IF NOT public.has_external_role(_user)
     AND EXISTS (SELECT 1 FROM public.entity_supervision_assignments a
                  WHERE a.entity_id = _licensee_id
                    AND COALESCE(a.status,'active') = 'active'
                    AND (a.effective_to IS NULL OR a.effective_to > now())
                    AND _user IN (a.lead_supervisor_user_id, a.alternate_supervisor_user_id, a.supervisor_id))
  THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$function$;