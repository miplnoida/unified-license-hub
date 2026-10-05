-- SEC-CRIT-01A residual closure
-- 1) Authorization catalogues: only browser consumer is the internal classification admin (useClassificationTree).
DROP POLICY IF EXISTS auth_class_read ON public.authorization_classes;
DROP POLICY IF EXISTS auth_class_act_read ON public.authorization_class_activities;
DROP POLICY IF EXISTS auth_scheme_read ON public.authorization_schemes;
CREATE POLICY sec_crit01_internal_read ON public.authorization_classes FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.authorization_class_activities FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
CREATE POLICY sec_crit01_internal_read ON public.authorization_schemes FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
REVOKE SELECT ON public.authorization_classes, public.authorization_class_activities, public.authorization_schemes FROM anon;

-- 2) identity_governed_tables: security-governance metadata, no browser consumer -> super admin only.
DROP POLICY IF EXISTS identity_governed_tables_read ON public.identity_governed_tables;
CREATE POLICY sec_crit01_security_admin_read ON public.identity_governed_tables FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));
REVOKE SELECT ON public.identity_governed_tables FROM anon;

-- 3) Return validation rules: consumers are internal returns-management/prudential screens; edge uses service role.
DROP POLICY IF EXISTS return_validation_rules_read ON public.return_validation_rules;
CREATE POLICY sec_crit01_internal_read ON public.return_validation_rules FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));
DROP POLICY IF EXISTS return_validation_rule_versions_read ON public.return_validation_rule_versions;
CREATE POLICY sec_crit01_internal_read ON public.return_validation_rule_versions FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));

-- 4) roles: internal staff need the catalogue (workflow, rule editor, PPOC mapping, role admin);
-- every other signed-in user sees only the role(s) assigned to them.
CREATE OR REPLACE FUNCTION public.sec_own_role_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role_id FROM public.user_dynamic_roles WHERE user_id = _user_id AND role_id IS NOT NULL
  UNION
  SELECT role_id FROM public.profiles WHERE id = _user_id AND role_id IS NOT NULL
$$;
REVOKE EXECUTE ON FUNCTION public.sec_own_role_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sec_own_role_ids(uuid) TO authenticated;

DROP POLICY IF EXISTS "Anyone reads roles" ON public.roles;
CREATE POLICY sec_crit01_roles_read ON public.roles FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid())
         OR id IN (SELECT public.sec_own_role_ids(auth.uid())));
REVOKE SELECT ON public.roles FROM anon;

-- 5) Pre-registration file capability (server-side only).
CREATE TABLE public.registration_upload_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  revoked_at timestamptz
);
GRANT ALL ON public.registration_upload_capabilities TO service_role;
ALTER TABLE public.registration_upload_capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY reg_upload_cap_service_only ON public.registration_upload_capabilities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6) Remove anonymous raw read of registration uploads (previews now go through the capability function).
DROP POLICY IF EXISTS "Allow anon read registration uploads" ON storage.objects;