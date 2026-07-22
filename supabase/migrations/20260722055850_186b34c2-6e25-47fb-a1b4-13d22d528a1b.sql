
-- Phase 2: assigned-scope must prove assignment.

-- Module-specific assignment resolver. Returns TRUE only when the exact
-- record is currently assigned to the caller via the authoritative
-- assignment column(s) for the module. Any unknown module denies.
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
    -- Entity-scoped modules: assignment proven through licensee regulator chain.
    SELECT EXISTS(
      SELECT 1 FROM public.licensees l
      WHERE l.id = _record_id
        AND (l.lead_regulator_id = _user_id
          OR l.regulator_officer_id = _user_id
          OR l.alternate_regulator_id = _user_id)
    ) INTO hit;
    RETURN COALESCE(hit,false);

  ELSIF m IN ('report_management','reports') THEN
    SELECT EXISTS(SELECT 1 FROM public.reports r
                  WHERE r.id = _record_id AND r.created_by = _user_id) INTO hit;
    RETURN COALESCE(hit,false);
  END IF;

  -- Unknown module → deny. Callers must add an explicit branch above.
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.is_record_assigned_to_user(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_record_assigned_to_user(uuid,text,uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.is_record_assigned_to_user(uuid,text,uuid) IS
  'Authoritative per-module assignment resolver. Returns TRUE only when the exact record is currently assigned to the user through the module-specific authoritative column(s). Unknown modules deny.';

-- Rewrite has_scoped_permission so scope=assigned requires proof.
-- Keep the existing signature (policies depend on it) but treat _licensee_id
-- as the record id for assigned-scope checks. The record-owner argument
-- continues to serve `own` scope. When callers cannot provide a record id
-- (list queries), the DB denies for assigned scope — those queries must be
-- rewritten to per-row checks or gated via helper functions.
CREATE OR REPLACE FUNCTION public.has_scoped_permission(
  _user_id uuid, _module text, _action text,
  _licensee_id uuid DEFAULT NULL, _sector_id uuid DEFAULT NULL, _owner_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE scope jsonb; kind text;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_user_id) THEN RETURN true; END IF;
  IF NOT public.has_permission(_user_id, _module, _action) THEN RETURN false; END IF;

  scope := public.user_scope_for(_user_id, _module, _action);
  kind := scope ->> 'scope';

  IF kind = 'all' THEN
    RETURN true;
  ELSIF kind = 'sector' THEN
    RETURN _sector_id IS NOT NULL AND scope -> 'sectors' ? _sector_id::text;
  ELSIF kind = 'institution' THEN
    RETURN _licensee_id IS NOT NULL AND scope -> 'licensees' ? _licensee_id::text;
  ELSIF kind = 'assigned' THEN
    -- CRITICAL FIX: assigned scope must prove assignment via authoritative
    -- module resolver. When no record id is passed, deny.
    IF _licensee_id IS NULL THEN RETURN false; END IF;
    RETURN public.is_record_assigned_to_user(_user_id, _module, _licensee_id);
  ELSIF kind = 'own' THEN
    RETURN _owner_id IS NOT NULL AND _owner_id = _user_id;
  END IF;
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.has_scoped_permission(uuid,text,text,uuid,uuid,uuid) IS
  'Scope-aware permission check. For assigned scope, defers to is_record_assigned_to_user with the record id passed in _licensee_id. Callers that cannot supply a record id must rewrite as per-row checks.';
