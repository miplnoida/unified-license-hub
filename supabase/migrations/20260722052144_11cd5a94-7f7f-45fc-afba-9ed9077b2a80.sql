
-- 1) Scope-aware permission helper
CREATE OR REPLACE FUNCTION public.has_scoped_permission(
  _user_id uuid, _module text, _action text,
  _licensee_id uuid DEFAULT NULL, _sector_id uuid DEFAULT NULL, _owner_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE scope jsonb; s text;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_user_id) THEN RETURN true; END IF;
  IF NOT public.has_permission(_user_id, _module, _action) THEN RETURN false; END IF;
  scope := public.user_scope_for(_user_id, _module);
  s := COALESCE(scope ->> 'scope', 'all');
  IF s = 'all' THEN RETURN true; END IF;
  IF s = 'none' THEN RETURN false; END IF;
  IF s = 'own' THEN RETURN _owner_id IS NOT NULL AND _owner_id = _user_id; END IF;
  IF s = 'assigned' THEN
    IF _licensee_id IS NULL THEN RETURN false; END IF;
    RETURN public.user_has_entity_assignment(_user_id, _licensee_id);
  END IF;
  IF s = 'sector' THEN
    IF _sector_id IS NULL THEN RETURN false; END IF;
    RETURN _sector_id::text IN (SELECT jsonb_array_elements_text(scope -> 'sectors'));
  END IF;
  IF s = 'institution' THEN
    IF _licensee_id IS NULL THEN RETURN false; END IF;
    RETURN _licensee_id::text IN (SELECT jsonb_array_elements_text(scope -> 'licensees'));
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.has_scoped_permission(uuid,text,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_scoped_permission(uuid,text,text,uuid,uuid,uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.has_scoped_permission(uuid,text,text,uuid,uuid,uuid) IS
'Authoritative scope-aware permission check. Combines has_permission with user_scope_for.';

-- 2) Licensee helpers
CREATE OR REPLACE FUNCTION public.can_read_licensee(_user uuid, _licensee_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE s_id uuid;
BEGIN
  IF _user IS NULL OR _licensee_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_user) THEN RETURN true; END IF;
  IF public.has_permission(_user, 'licensee_management', 'view_all_entities') THEN RETURN true; END IF;
  SELECT sector_id INTO s_id FROM public.licensees WHERE id = _licensee_id;
  IF NOT public.has_external_role(_user)
     AND public.has_scoped_permission(_user, 'licensee_management', 'view', _licensee_id, s_id, NULL)
  THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user AND p.licensee_id = _licensee_id) THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.ppoc_entity_mappings m
             WHERE m.ppoc_user_id = _user AND m.licensee_id = _licensee_id AND m.is_active = true) THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.licensees lc WHERE lc.id = _licensee_id
             AND (lc.lead_regulator_id = _user OR lc.regulator_officer_id = _user
                  OR lc.alternate_regulator_id = _user OR lc.assigned_supervisor_id = _user)) THEN RETURN true; END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_mutate_licensee(_user uuid, _licensee_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE s_id uuid;
BEGIN
  IF _user IS NULL OR _licensee_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_user) THEN RETURN true; END IF;
  SELECT sector_id INTO s_id FROM public.licensees WHERE id = _licensee_id;
  RETURN public.has_scoped_permission(_user, 'licensee_management', 'edit', _licensee_id, s_id, NULL);
END;
$$;

-- 3) License helpers
CREATE OR REPLACE FUNCTION public.can_read_license(_user uuid, _license_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE h_id uuid; s_id uuid;
BEGIN
  IF _user IS NULL OR _license_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_user) THEN RETURN true; END IF;
  SELECT holder_id, sector_id INTO h_id, s_id FROM public.licenses WHERE id = _license_id;
  IF public.has_scoped_permission(_user, 'license_management', 'view', h_id, s_id, NULL) THEN RETURN true; END IF;
  IF h_id IS NOT NULL AND public.can_read_licensee(_user, h_id) THEN RETURN true; END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_mutate_license(_user uuid, _license_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE h_id uuid; s_id uuid;
BEGIN
  IF _user IS NULL OR _license_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_user) THEN RETURN true; END IF;
  SELECT holder_id, sector_id INTO h_id, s_id FROM public.licenses WHERE id = _license_id;
  RETURN public.has_scoped_permission(_user, 'license_management', 'edit', h_id, s_id, NULL)
      OR public.has_scoped_permission(_user, 'license_management', 'workflow_action', h_id, s_id, NULL);
END;
$$;

-- 4) Returns row helper (scope-aware)
CREATE OR REPLACE FUNCTION public.can_read_return_filed_row(
  _user_id uuid, _entity_id uuid, _on_behalf_of_licensee_id uuid, _created_by uuid, _return_id uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE s_id uuid; lic uuid := COALESCE(_entity_id, _on_behalf_of_licensee_id);
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_user_id) THEN RETURN true; END IF;
  IF public.has_permission(_user_id, 'returns_management', 'view_all_entities') THEN RETURN true; END IF;
  IF _created_by = _user_id THEN RETURN true; END IF;
  IF lic IS NOT NULL THEN
    SELECT sector_id INTO s_id FROM public.licensees WHERE id = lic;
    IF public.has_scoped_permission(_user_id, 'returns_management', 'view', lic, s_id, _created_by) THEN RETURN true; END IF;
  END IF;
  IF public.user_has_entity_assignment(_user_id, _entity_id)
     OR public.user_has_entity_assignment(_user_id, _on_behalf_of_licensee_id) THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.licensee_id IS NOT NULL
             AND (p.licensee_id = _entity_id OR p.licensee_id = _on_behalf_of_licensee_id)) THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.entity_user_access eua
             WHERE eua.user_id = _user_id AND eua.is_active = true
               AND (eua.end_date IS NULL OR eua.end_date > now())
               AND eua.entity_id = ANY (ARRAY[_entity_id, _on_behalf_of_licensee_id])) THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.ppoc_mapped_licensee_ids(_user_id) AS m(licensee_id)
             WHERE m.licensee_id = _entity_id OR m.licensee_id = _on_behalf_of_licensee_id) THEN RETURN true; END IF;
  IF _return_id IS NOT NULL AND (
       public.external_can_access_return_filed(_user_id, _return_id, 'can_view_status')
    OR public.external_can_access_return_filed(_user_id, _return_id, 'can_submit_returns')
  ) THEN RETURN true; END IF;
  RETURN false;
END;
$$;

-- 5) Complaints policies (owner column = complainant_id)
DROP POLICY IF EXISTS "Read complaints" ON public.complaints;
CREATE POLICY "Read complaints" ON public.complaints FOR SELECT TO public
USING (
  public.is_super_admin(auth.uid())
  OR auth.uid() = complainant_id
  OR public.has_scoped_permission(
       auth.uid(), 'complaint_management', 'view',
       license_holder_id,
       (SELECT sector_id FROM public.licensees WHERE id = complaints.license_holder_id),
       complainant_id
     )
);

DROP POLICY IF EXISTS "Update complaints" ON public.complaints;
CREATE POLICY "Update complaints" ON public.complaints FOR UPDATE TO public
USING (
  public.is_super_admin(auth.uid())
  OR auth.uid() = investigator_id
  OR public.has_scoped_permission(
       auth.uid(), 'complaint_management', 'edit',
       license_holder_id,
       (SELECT sector_id FROM public.licensees WHERE id = complaints.license_holder_id),
       complainant_id
     )
) WITH CHECK (true);

-- 6) Conduct alerts
DROP POLICY IF EXISTS "Read conduct alerts" ON public.conduct_alerts;
CREATE POLICY "Read conduct alerts" ON public.conduct_alerts FOR SELECT TO public
USING (
  public.is_super_admin(auth.uid())
  OR public.has_scoped_permission(
       auth.uid(), 'market_conduct', 'view',
       licensee_id,
       (SELECT sector_id FROM public.licensees WHERE id = conduct_alerts.licensee_id),
       NULL
     )
);

DROP POLICY IF EXISTS "Manage conduct alerts" ON public.conduct_alerts;
CREATE POLICY "Manage conduct alerts" ON public.conduct_alerts FOR ALL TO public
USING (
  public.is_super_admin(auth.uid())
  OR public.has_scoped_permission(
       auth.uid(), 'market_conduct', 'manage_complaints',
       licensee_id,
       (SELECT sector_id FROM public.licensees WHERE id = conduct_alerts.licensee_id),
       NULL
     )
) WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_scoped_permission(
       auth.uid(), 'market_conduct', 'manage_complaints',
       licensee_id,
       (SELECT sector_id FROM public.licensees WHERE id = conduct_alerts.licensee_id),
       NULL
     )
);

-- 7) Conduct investigations
DROP POLICY IF EXISTS "ci_read" ON public.conduct_investigations;
CREATE POLICY "ci_read" ON public.conduct_investigations FOR SELECT TO public
USING (
  public.is_super_admin(auth.uid())
  OR public.has_scoped_permission(
       auth.uid(), 'market_conduct_investigation', 'view',
       licensee_id,
       (SELECT sector_id FROM public.licensees WHERE id = conduct_investigations.licensee_id),
       NULL
     )
  OR public.has_scoped_permission(
       auth.uid(), 'market_conduct_investigation', 'access_investigation_workspace',
       licensee_id,
       (SELECT sector_id FROM public.licensees WHERE id = conduct_investigations.licensee_id),
       NULL
     )
);

DROP POLICY IF EXISTS "ci_write" ON public.conduct_investigations;
CREATE POLICY "ci_write" ON public.conduct_investigations FOR ALL TO public
USING (
  public.is_super_admin(auth.uid())
  OR public.has_scoped_permission(
       auth.uid(), 'market_conduct_investigation', 'access_investigation_workspace',
       licensee_id,
       (SELECT sector_id FROM public.licensees WHERE id = conduct_investigations.licensee_id),
       NULL
     )
) WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_scoped_permission(
       auth.uid(), 'market_conduct_investigation', 'access_investigation_workspace',
       licensee_id,
       (SELECT sector_id FROM public.licensees WHERE id = conduct_investigations.licensee_id),
       NULL
     )
);

-- 8) Form templates
DROP POLICY IF EXISTS "Anyone reads form templates" ON public.form_templates;
CREATE POLICY "Read form templates" ON public.form_templates FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_scoped_permission(auth.uid(), 'form_management', 'view', NULL, sector_id, created_by)
);

DROP POLICY IF EXISTS "Admins manage form templates" ON public.form_templates;
CREATE POLICY "Manage form templates" ON public.form_templates FOR ALL TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_scoped_permission(auth.uid(), 'form_management', 'edit', NULL, sector_id, created_by)
) WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_scoped_permission(auth.uid(), 'form_management', 'edit', NULL, sector_id, created_by)
);
