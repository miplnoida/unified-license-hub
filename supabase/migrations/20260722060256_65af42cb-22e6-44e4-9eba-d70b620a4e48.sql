
-- Phase 3 (slice A): fix assigned-scope on complaints + conduct.
-- The prior policies passed licensee_id as _licensee_id, which after Phase 2
-- caused the assigned resolver to look at licensees instead of the row's
-- own module (complaint / investigation / alert). Add an overload that
-- accepts a record id explicitly, then rewrite the policies.

CREATE OR REPLACE FUNCTION public.has_scoped_permission(
  _user_id uuid, _module text, _action text,
  _record_id uuid,
  _licensee_id uuid,
  _sector_id uuid,
  _owner_id uuid
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
    IF _record_id IS NULL THEN RETURN false; END IF;
    RETURN public.is_record_assigned_to_user(_user_id, _module, _record_id);
  ELSIF kind = 'own' THEN
    RETURN _owner_id IS NOT NULL AND _owner_id = _user_id;
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.has_scoped_permission(uuid,text,text,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_scoped_permission(uuid,text,text,uuid,uuid,uuid,uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.has_scoped_permission(uuid,text,text,uuid,uuid,uuid,uuid) IS
  'Scope-aware permission check with explicit record id. Assigned scope defers to is_record_assigned_to_user(_user, _module, _record_id). Institution/sector/own use the corresponding arguments.';

-- Rewrite complaints policies to pass the row id as record id.
DROP POLICY IF EXISTS "Read complaints" ON public.complaints;
CREATE POLICY "Read complaints" ON public.complaints FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR auth.uid() = complainant_id
  OR public.has_scoped_permission(
       auth.uid(), 'complaint_management', 'view',
       id, license_holder_id,
       (SELECT l.sector_id FROM public.licensees l WHERE l.id = complaints.license_holder_id),
       complainant_id
     )
);

DROP POLICY IF EXISTS "Update complaints" ON public.complaints;
CREATE POLICY "Update complaints" ON public.complaints FOR UPDATE
USING (
  public.is_super_admin(auth.uid())
  OR auth.uid() = investigator_id
  OR public.has_scoped_permission(
       auth.uid(), 'complaint_management', 'edit',
       id, license_holder_id,
       (SELECT l.sector_id FROM public.licensees l WHERE l.id = complaints.license_holder_id),
       complainant_id
     )
);

-- Rewrite conduct_alerts policies.
DROP POLICY IF EXISTS "Read conduct alerts" ON public.conduct_alerts;
CREATE POLICY "Read conduct alerts" ON public.conduct_alerts FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR public.has_scoped_permission(
       auth.uid(), 'conduct_alerts', 'view',
       id, licensee_id,
       (SELECT l.sector_id FROM public.licensees l WHERE l.id = conduct_alerts.licensee_id),
       NULL
     )
  OR public.has_scoped_permission(
       auth.uid(), 'market_conduct', 'view',
       NULL, licensee_id,
       (SELECT l.sector_id FROM public.licensees l WHERE l.id = conduct_alerts.licensee_id),
       NULL
     )
);

DROP POLICY IF EXISTS "Manage conduct alerts" ON public.conduct_alerts;
CREATE POLICY "Manage conduct alerts" ON public.conduct_alerts FOR ALL
USING (
  public.is_super_admin(auth.uid())
  OR public.has_scoped_permission(
       auth.uid(), 'conduct_alerts', 'edit',
       id, licensee_id,
       (SELECT l.sector_id FROM public.licensees l WHERE l.id = conduct_alerts.licensee_id),
       NULL
     )
  OR public.has_scoped_permission(
       auth.uid(), 'market_conduct', 'manage_complaints',
       NULL, licensee_id,
       (SELECT l.sector_id FROM public.licensees l WHERE l.id = conduct_alerts.licensee_id),
       NULL
     )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_scoped_permission(
       auth.uid(), 'conduct_alerts', 'edit',
       id, licensee_id,
       (SELECT l.sector_id FROM public.licensees l WHERE l.id = conduct_alerts.licensee_id),
       NULL
     )
  OR public.has_scoped_permission(
       auth.uid(), 'market_conduct', 'manage_complaints',
       NULL, licensee_id,
       (SELECT l.sector_id FROM public.licensees l WHERE l.id = conduct_alerts.licensee_id),
       NULL
     )
);

-- Rewrite conduct_investigations policies.
DROP POLICY IF EXISTS ci_read ON public.conduct_investigations;
CREATE POLICY ci_read ON public.conduct_investigations FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR public.has_scoped_permission(
       auth.uid(), 'conduct_investigations', 'view',
       id, licensee_id,
       (SELECT l.sector_id FROM public.licensees l WHERE l.id = conduct_investigations.licensee_id),
       NULL
     )
  OR public.has_scoped_permission(
       auth.uid(), 'market_conduct_investigation', 'view',
       id, licensee_id,
       (SELECT l.sector_id FROM public.licensees l WHERE l.id = conduct_investigations.licensee_id),
       NULL
     )
  OR public.has_scoped_permission(
       auth.uid(), 'market_conduct_investigation', 'access_investigation_workspace',
       id, licensee_id,
       (SELECT l.sector_id FROM public.licensees l WHERE l.id = conduct_investigations.licensee_id),
       NULL
     )
);

DROP POLICY IF EXISTS ci_write ON public.conduct_investigations;
CREATE POLICY ci_write ON public.conduct_investigations FOR ALL
USING (
  public.is_super_admin(auth.uid())
  OR public.has_scoped_permission(
       auth.uid(), 'market_conduct_investigation', 'access_investigation_workspace',
       id, licensee_id,
       (SELECT l.sector_id FROM public.licensees l WHERE l.id = conduct_investigations.licensee_id),
       NULL
     )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_scoped_permission(
       auth.uid(), 'market_conduct_investigation', 'access_investigation_workspace',
       id, licensee_id,
       (SELECT l.sector_id FROM public.licensees l WHERE l.id = conduct_investigations.licensee_id),
       NULL
     )
);
