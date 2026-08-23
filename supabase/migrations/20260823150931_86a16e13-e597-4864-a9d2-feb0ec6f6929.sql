-- GAP-P15-004 (P1): an assigned-scope prudential analyst could never act on a
-- supervised institution, because the assignment resolver only recognised
-- ownership of an existing prudential action record. Supervision assignment on
-- the institution itself is the authoritative source for that scope.
CREATE OR REPLACE FUNCTION public.is_record_assigned_to_user(_user_id uuid, _module text, _record_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
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

  ELSIF m IN ('prudential_supervision','prudential_actions') THEN
    SELECT EXISTS(SELECT 1 FROM public.prudential_actions p
                  WHERE p.id = _record_id AND p.assigned_to = _user_id)
        OR EXISTS(SELECT 1 FROM public.entity_supervision_assignments a
                  WHERE a.entity_id = _record_id
                    AND a.supervisor_id = _user_id
                    AND COALESCE(a.status,'active') = 'active'
                    AND (a.effective_from IS NULL OR a.effective_from <= now())
                    AND (a.effective_to IS NULL OR a.effective_to >= now()))
        OR EXISTS(SELECT 1 FROM public.licensees l
                  WHERE l.id = _record_id
                    AND (l.lead_regulator_id = _user_id
                      OR l.regulator_officer_id = _user_id
                      OR l.alternate_regulator_id = _user_id
                      OR l.assigned_supervisor_id = _user_id))
      INTO hit;
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
  END IF;

  RETURN false;
END;
$function$;