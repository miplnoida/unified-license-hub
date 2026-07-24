CREATE OR REPLACE FUNCTION public.is_record_assigned_to_user(
  _user_id uuid, _module text, _record_id uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  m text := lower(regexp_replace(coalesce(_module,''),'\s+','_','g'));
  hit boolean;
BEGIN
  IF _user_id IS NULL OR _record_id IS NULL OR m = '' THEN
    RETURN false;
  END IF;

  IF m IN ('application_management','applications') THEN
    SELECT EXISTS(SELECT 1 FROM public.applications a
                  WHERE a.id = _record_id AND a.assigned_to = _user_id) INTO hit;
    RETURN COALESCE(hit,false);

  ELSIF m IN ('complaint_management','complaints') THEN
    SELECT EXISTS(SELECT 1 FROM public.complaints c
                  WHERE c.id = _record_id AND c.investigator_id = _user_id)
        OR EXISTS(SELECT 1 FROM public.complaint_investigation_tasks t
                  WHERE t.complaint_id = _record_id AND t.owner_id = _user_id)
      INTO hit;
    RETURN COALESCE(hit,false);

  ELSIF m IN ('conduct_investigations','market_conduct') THEN
    SELECT EXISTS(SELECT 1 FROM public.conduct_investigations i
                  WHERE i.id = _record_id AND i.assigned_investigator = _user_id) INTO hit;
    RETURN COALESCE(hit,false);

  ELSIF m = 'conduct_alerts' THEN
    SELECT EXISTS(SELECT 1 FROM public.conduct_alerts a
                  WHERE a.id = _record_id AND a.assigned_to = _user_id) INTO hit;
    RETURN COALESCE(hit,false);

  ELSIF m IN ('inspection_management','inspections') THEN
    SELECT EXISTS(SELECT 1 FROM public.inspections i
                  WHERE i.id = _record_id
                    AND (i.lead_inspector_id = _user_id OR i.inspector_id = _user_id))
      INTO hit;
    RETURN COALESCE(hit,false);

  ELSIF m IN ('enforcement_management','enforcement_actions','enforcement') THEN
    SELECT EXISTS(SELECT 1 FROM public.enforcement_actions e
                  WHERE e.id = _record_id AND (e.opened_by = _user_id OR e.closed_by = _user_id))
      INTO hit;
    RETURN COALESCE(hit,false);

  ELSIF m IN ('prudential_supervision','prudential_actions') THEN
    SELECT EXISTS(SELECT 1 FROM public.prudential_actions p
                  WHERE p.id = _record_id AND p.assigned_to = _user_id) INTO hit;
    RETURN COALESCE(hit,false);

  ELSIF m IN ('licensee_management','licensees','license_management','licenses','returns_management','compliance_returns','returns_filed') THEN
    SELECT EXISTS(
      SELECT 1 FROM public.licensees l
      WHERE l.id = _record_id
        AND (l.lead_regulator_id = _user_id
          OR l.regulator_officer_id = _user_id
          OR l.alternate_regulator_id = _user_id
          OR l.assigned_supervisor_id = _user_id)
    ) INTO hit;
    RETURN COALESCE(hit,false);

  ELSIF m IN ('report_management','reports') THEN
    SELECT EXISTS(SELECT 1 FROM public.reports r
                  WHERE r.id = _record_id AND r.created_by = _user_id) INTO hit;
    RETURN COALESCE(hit,false);
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.is_record_assigned_to_user(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_record_assigned_to_user(uuid,text,uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.is_record_assigned_to_user(uuid,text,uuid) IS
  'Authoritative per-module assignment resolver. Returns TRUE only when the exact record is currently assigned to the user through the module-specific authoritative column(s). Unknown modules deny.';

CREATE OR REPLACE FUNCTION public.can_read_licensee(_user uuid, _licensee_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_read_licensee(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_licensee(uuid,uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.can_read_licensee(uuid,uuid) IS
  'Checks whether the current user can read a licensee via all-entity permission, scoped licensee/license management permission, direct assignment, primary-user ownership, or active PPOC mapping.';