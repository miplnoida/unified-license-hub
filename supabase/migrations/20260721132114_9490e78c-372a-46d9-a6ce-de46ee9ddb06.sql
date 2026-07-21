
-- =============================================================
-- RBAC Slice 6 — Licenses & Licensees lifecycle lockdown
-- =============================================================

-- ---------- Permission catalog additions ----------------------
INSERT INTO public.permissions (module, name, description) VALUES
  ('license_management', 'view_all_entities', 'View licenses across all entities'),
  ('license_management', 'workflow_action',   'Perform license workflow actions (renew/suspend/revoke/reinstate)'),
  ('license_management', 'delete',            'Delete license records'),
  ('license_management', 'manage_config',     'Manage license configuration (types, action configs)'),
  ('license_management', 'manage_certificates','Issue and dispatch license certificates'),
  ('license_management', 'manage_conditions', 'Create and satisfy license conditions'),
  ('licensee_management','view',              'View licensee records'),
  ('licensee_management','create',            'Create licensee records'),
  ('licensee_management','edit',              'Edit licensee records'),
  ('licensee_management','delete',            'Delete licensee records'),
  ('licensee_management','view_all_entities', 'View licensees across all entities'),
  ('licensee_management','manage_products_channels','Manage licensee product/channel mapping'),
  ('licensee_management','manage_pre_license','Manage pre-license user records')
ON CONFLICT (module, name) DO NOTHING;

-- ---------- Canonical helpers ---------------------------------
CREATE OR REPLACE FUNCTION public.can_read_license(_user uuid, _license_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user IS NULL OR _license_id IS NULL THEN false
    WHEN public.is_super_admin(_user) THEN true
    WHEN public.has_permission(_user, 'license_management', 'view_all_entities') THEN true
    WHEN public.has_permission(_user, 'license_management', 'view')
         AND NOT public.has_external_role(_user) THEN true
    WHEN EXISTS (
      SELECT 1 FROM public.licenses l
      WHERE l.id = _license_id
        AND (
          l.holder_id = _user
          OR (public.user_licensee_id(_user) IS NOT NULL
              AND (l.id IN (SELECT public.license_ids_for_licensee(public.user_licensee_id(_user)))
                   OR l.holder_id = public.user_licensee_id(_user)))
          OR l.id IN (SELECT public.ppoc_accessible_license_ids(_user))
        )
    ) THEN true
    WHEN public.has_external_role(_user)
         AND public.external_can_access_license(_user, _license_id, 'can_view_status') THEN true
    ELSE false
  END;
$$;
REVOKE EXECUTE ON FUNCTION public.can_read_license(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.can_read_license(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_mutate_license(_user uuid, _license_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user IS NULL THEN false
    WHEN public.is_super_admin(_user) THEN true
    WHEN public.has_permission(_user, 'license_management', 'edit') THEN true
    WHEN public.has_permission(_user, 'license_management', 'workflow_action') THEN true
    ELSE false
  END;
$$;
REVOKE EXECUTE ON FUNCTION public.can_mutate_license(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.can_mutate_license(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_read_licensee(_user uuid, _licensee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user IS NULL OR _licensee_id IS NULL THEN false
    WHEN public.is_super_admin(_user) THEN true
    WHEN public.has_permission(_user, 'licensee_management', 'view_all_entities') THEN true
    WHEN public.has_permission(_user, 'licensee_management', 'view')
         AND NOT public.has_external_role(_user) THEN true
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _user AND p.licensee_id = _licensee_id
    ) THEN true
    WHEN EXISTS (
      SELECT 1 FROM public.ppoc_entity_mappings m
      WHERE m.ppoc_user_id = _user
        AND m.licensee_id = _licensee_id
        AND m.is_active = true
    ) THEN true
    WHEN EXISTS (
      SELECT 1 FROM public.licensees lc
      WHERE lc.id = _licensee_id
        AND (lc.lead_regulator_id = _user
             OR lc.regulator_officer_id = _user
             OR lc.alternate_regulator_id = _user
             OR lc.assigned_supervisor_id = _user)
    ) THEN true
    ELSE false
  END;
$$;
REVOKE EXECUTE ON FUNCTION public.can_read_licensee(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.can_read_licensee(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_mutate_licensee(_user uuid, _licensee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user IS NULL THEN false
    WHEN public.is_super_admin(_user) THEN true
    WHEN public.has_permission(_user, 'licensee_management', 'edit') THEN true
    ELSE false
  END;
$$;
REVOKE EXECUTE ON FUNCTION public.can_mutate_licensee(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.can_mutate_licensee(uuid, uuid) TO authenticated, service_role;

-- ---------- licenses -----------------------------------------
DROP POLICY IF EXISTS "Admins manage licenses" ON public.licenses;
DROP POLICY IF EXISTS "Holders read own licenses" ON public.licenses;
DROP POLICY IF EXISTS "Licensee users read linked licenses" ON public.licenses;
DROP POLICY IF EXISTS "PPOC read mapped licenses" ON public.licenses;
DROP POLICY IF EXISTS "external_licenses_select_capability_gate" ON public.licenses;

CREATE POLICY licenses_read ON public.licenses
  FOR SELECT TO authenticated
  USING (public.can_read_license(auth.uid(), id));

CREATE POLICY licenses_insert ON public.licenses
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid())
              OR public.has_permission(auth.uid(), 'license_management', 'create'));

CREATE POLICY licenses_update ON public.licenses
  FOR UPDATE TO authenticated
  USING (public.can_mutate_license(auth.uid(), id))
  WITH CHECK (public.can_mutate_license(auth.uid(), id));

CREATE POLICY licenses_delete ON public.licenses
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'license_management', 'delete'));

-- ---------- license_actions ----------------------------------
DROP POLICY IF EXISTS "Insert license actions" ON public.license_actions;
DROP POLICY IF EXISTS "Licensees read own license actions" ON public.license_actions;
DROP POLICY IF EXISTS "Read license actions" ON public.license_actions;

CREATE POLICY license_actions_read ON public.license_actions
  FOR SELECT TO authenticated
  USING (public.can_read_license(auth.uid(), license_id));

CREATE POLICY license_actions_insert ON public.license_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'license_management', 'workflow_action')
         OR public.has_permission(auth.uid(), 'license_management', 'manage_license_actions'))
  );

-- ---------- license_renewals ---------------------------------
DROP POLICY IF EXISTS "renewals insertable by stakeholders" ON public.license_renewals;
DROP POLICY IF EXISTS "renewals readable by stakeholders" ON public.license_renewals;
DROP POLICY IF EXISTS "renewals updatable by officers" ON public.license_renewals;

CREATE POLICY license_renewals_read ON public.license_renewals
  FOR SELECT TO authenticated
  USING (
    public.can_read_license(auth.uid(), license_id)
    OR initiated_by = auth.uid()
  );

CREATE POLICY license_renewals_insert ON public.license_renewals
  FOR INSERT TO authenticated
  WITH CHECK (
    initiated_by = auth.uid()
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(), 'license_management', 'workflow_action')
      OR EXISTS (
        SELECT 1 FROM public.licenses l
        JOIN public.licensees lic ON lic.license_id = l.id
        JOIN public.entity_user_access eua ON eua.entity_id = lic.id
        WHERE l.id = license_renewals.license_id
          AND eua.user_id = auth.uid()
          AND eua.is_active = true
      )
    )
  );

CREATE POLICY license_renewals_update ON public.license_renewals
  FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'license_management', 'workflow_action'))
  WITH CHECK (public.is_super_admin(auth.uid())
              OR public.has_permission(auth.uid(), 'license_management', 'workflow_action'));

-- ---------- license_conditions -------------------------------
DROP POLICY IF EXISTS "Holder can view own license conditions" ON public.license_conditions;
DROP POLICY IF EXISTS "Internal can manage license conditions" ON public.license_conditions;

CREATE POLICY license_conditions_read ON public.license_conditions
  FOR SELECT TO authenticated
  USING (public.can_read_license(auth.uid(), license_id));

CREATE POLICY license_conditions_write ON public.license_conditions
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'license_management', 'manage_conditions'))
  WITH CHECK (public.is_super_admin(auth.uid())
              OR public.has_permission(auth.uid(), 'license_management', 'manage_conditions'));

-- ---------- license_certificates -----------------------------
DROP POLICY IF EXISTS "internal staff read certificates" ON public.license_certificates;

CREATE POLICY license_certificates_read ON public.license_certificates
  FOR SELECT TO authenticated
  USING (public.can_read_license(auth.uid(), license_id));

CREATE POLICY license_certificates_write ON public.license_certificates
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'license_management', 'manage_certificates'))
  WITH CHECK (public.is_super_admin(auth.uid())
              OR public.has_permission(auth.uid(), 'license_management', 'manage_certificates'));

-- ---------- license_certificate_signatures -------------------
DROP POLICY IF EXISTS "Internal staff can read certificate signatures" ON public.license_certificate_signatures;
DROP POLICY IF EXISTS "Service role writes certificate signatures" ON public.license_certificate_signatures;

CREATE POLICY license_certificate_signatures_read ON public.license_certificate_signatures
  FOR SELECT TO authenticated
  USING (public.can_read_license(auth.uid(), license_id));

-- Signatures written by service_role/worker only (bypasses RLS); leave no
-- authenticated INSERT policy so no user session can forge signatures.

-- ---------- licensees ----------------------------------------
DROP POLICY IF EXISTS "Admins manage licensees" ON public.licensees;
DROP POLICY IF EXISTS "Internal staff read licensees" ON public.licensees;
DROP POLICY IF EXISTS "Licensee users read own" ON public.licensees;
DROP POLICY IF EXISTS "PPOC read mapped licensees" ON public.licensees;

CREATE POLICY licensees_read ON public.licensees
  FOR SELECT TO authenticated
  USING (public.can_read_licensee(auth.uid(), id));

CREATE POLICY licensees_insert ON public.licensees
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid())
              OR public.has_permission(auth.uid(), 'licensee_management', 'create'));

CREATE POLICY licensees_update ON public.licensees
  FOR UPDATE TO authenticated
  USING (public.can_mutate_licensee(auth.uid(), id))
  WITH CHECK (public.can_mutate_licensee(auth.uid(), id));

CREATE POLICY licensees_delete ON public.licensees
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'licensee_management', 'delete'));

-- ---------- licensee_products --------------------------------
DROP POLICY IF EXISTS "Licensee users read own product mapping" ON public.licensee_products;
DROP POLICY IF EXISTS "Regulator staff manage licensee products" ON public.licensee_products;

CREATE POLICY licensee_products_read ON public.licensee_products
  FOR SELECT TO authenticated
  USING (public.can_read_licensee(auth.uid(), licensee_id));

CREATE POLICY licensee_products_write ON public.licensee_products
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'licensee_management', 'manage_products_channels'))
  WITH CHECK (public.is_super_admin(auth.uid())
              OR public.has_permission(auth.uid(), 'licensee_management', 'manage_products_channels'));

-- ---------- licensee_channels --------------------------------
DROP POLICY IF EXISTS "Licensee users read own channel mapping" ON public.licensee_channels;
DROP POLICY IF EXISTS "Regulator staff manage licensee channels" ON public.licensee_channels;

CREATE POLICY licensee_channels_read ON public.licensee_channels
  FOR SELECT TO authenticated
  USING (public.can_read_licensee(auth.uid(), licensee_id));

CREATE POLICY licensee_channels_write ON public.licensee_channels
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'licensee_management', 'manage_products_channels'))
  WITH CHECK (public.is_super_admin(auth.uid())
              OR public.has_permission(auth.uid(), 'licensee_management', 'manage_products_channels'));

-- ---------- pre_license_users --------------------------------
DROP POLICY IF EXISTS "Admins manage pre-license users" ON public.pre_license_users;
DROP POLICY IF EXISTS "Insert own pre-license profile" ON public.pre_license_users;
DROP POLICY IF EXISTS "Internal staff can read pre_license_users for triage" ON public.pre_license_users;
DROP POLICY IF EXISTS "Pre-license users read own" ON public.pre_license_users;
DROP POLICY IF EXISTS "Pre-license users update own" ON public.pre_license_users;

CREATE POLICY pre_license_users_read ON public.pre_license_users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'licensee_management', 'manage_pre_license')
    OR public.has_permission(auth.uid(), 'licensee_management', 'view_all_entities')
  );

CREATE POLICY pre_license_users_insert_self ON public.pre_license_users
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY pre_license_users_update_self ON public.pre_license_users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY pre_license_users_admin_write ON public.pre_license_users
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'licensee_management', 'manage_pre_license'))
  WITH CHECK (public.is_super_admin(auth.uid())
              OR public.has_permission(auth.uid(), 'licensee_management', 'manage_pre_license'));

-- ---------- Grants (reassert) --------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'licenses','license_actions','license_renewals','license_conditions',
    'license_certificates','license_certificate_signatures','licensees',
    'licensee_products','licensee_channels','pre_license_users'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
