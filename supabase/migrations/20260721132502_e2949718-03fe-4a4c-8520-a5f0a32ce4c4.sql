
-- =============================================================
-- RBAC Slice 7 — Compliance Returns lifecycle lockdown
-- =============================================================

-- ---------- Permission catalog additions ----------------------
INSERT INTO public.permissions (module, name, description) VALUES
  ('compliance_management','view',              'View compliance returns'),
  ('compliance_management','create',            'Create compliance returns'),
  ('compliance_management','edit',              'Edit compliance returns'),
  ('compliance_management','delete',            'Delete compliance returns'),
  ('compliance_management','view_all_entities', 'View compliance returns across all entities'),
  ('compliance_management','workflow_action',   'Review/approve/reject compliance returns'),
  ('compliance_management','manage_config',     'Manage compliance configuration'),
  ('compliance_management','respond',           'Respond to compliance queries/RFIs'),
  ('compliance_management','view_audit_logs',   'View compliance audit logs')
ON CONFLICT (module, name) DO NOTHING;

-- ---------- Canonical helpers ---------------------------------
CREATE OR REPLACE FUNCTION public.can_read_compliance_return(_user uuid, _return_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user IS NULL OR _return_id IS NULL THEN false
    WHEN public.is_super_admin(_user) THEN true
    WHEN public.has_permission(_user, 'compliance_management', 'view_all_entities') THEN true
    WHEN public.has_permission(_user, 'compliance_management', 'view')
         AND NOT public.has_external_role(_user) THEN true
    WHEN EXISTS (
      SELECT 1 FROM public.compliance_returns r
      WHERE r.id = _return_id
        AND (
          r.submitter_id = _user
          OR r.on_behalf_of_licensee_id IN (SELECT public.ppoc_mapped_licensee_ids(_user))
          OR r.license_id IN (SELECT public.ppoc_accessible_license_ids(_user))
        )
    ) THEN true
    WHEN public.has_external_role(_user)
         AND (public.external_can_access_compliance_return(_user, _return_id, 'can_view_status')
              OR public.external_can_access_compliance_return(_user, _return_id, 'can_submit_returns'))
      THEN true
    ELSE false
  END;
$$;
REVOKE EXECUTE ON FUNCTION public.can_read_compliance_return(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.can_read_compliance_return(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_mutate_compliance_return(_user uuid, _return_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user IS NULL OR _return_id IS NULL THEN false
    WHEN public.is_super_admin(_user) THEN true
    WHEN public.has_permission(_user, 'compliance_management', 'edit') THEN true
    WHEN public.has_permission(_user, 'compliance_management', 'workflow_action') THEN true
    WHEN EXISTS (
      SELECT 1 FROM public.compliance_returns r
      WHERE r.id = _return_id
        AND r.submitter_id = _user
        AND r.status = ANY (ARRAY['draft','pending','resubmission_requested','rejected'])
    ) THEN true
    WHEN public.has_external_role(_user)
         AND public.external_can_access_compliance_return(_user, _return_id, 'can_submit_returns')
      THEN true
    ELSE false
  END;
$$;
REVOKE EXECUTE ON FUNCTION public.can_mutate_compliance_return(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.can_mutate_compliance_return(uuid, uuid) TO authenticated, service_role;

-- ---------- compliance_returns policies ----------------------
DROP POLICY IF EXISTS "PPOC insert returns for mapped licensee" ON public.compliance_returns;
DROP POLICY IF EXISTS "PPOC read mapped licensee returns" ON public.compliance_returns;
DROP POLICY IF EXISTS "PPOC update own draft returns" ON public.compliance_returns;
DROP POLICY IF EXISTS "Submitters insert returns" ON public.compliance_returns;
DROP POLICY IF EXISTS "Submitters read own returns" ON public.compliance_returns;
DROP POLICY IF EXISTS "Submitters update draft returns" ON public.compliance_returns;
DROP POLICY IF EXISTS "external_compliance_returns_insert_capability_gate" ON public.compliance_returns;
DROP POLICY IF EXISTS "external_compliance_returns_select_capability_gate" ON public.compliance_returns;
DROP POLICY IF EXISTS "external_compliance_returns_update_capability_gate" ON public.compliance_returns;

CREATE POLICY compliance_returns_read ON public.compliance_returns
  FOR SELECT TO authenticated
  USING (public.can_read_compliance_return(auth.uid(), id));

CREATE POLICY compliance_returns_insert ON public.compliance_returns
  FOR INSERT TO authenticated
  WITH CHECK (
    submitter_id = auth.uid()
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(), 'compliance_management', 'create')
      OR (
        -- PPOC on behalf of mapped licensee
        on_behalf_of_licensee_id IS NOT NULL
        AND on_behalf_of_licensee_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
        AND (license_id IS NULL
             OR license_id IN (SELECT public.ppoc_accessible_license_ids(auth.uid())))
      )
      OR (
        -- External capability gate (licensee_primary/secondary via external_can_access)
        public.has_external_role(auth.uid())
        AND public.external_can_access_compliance_return_values(
              auth.uid(), license_id, on_behalf_of_licensee_id, submitter_id, 'can_submit_returns')
      )
    )
  );

CREATE POLICY compliance_returns_update ON public.compliance_returns
  FOR UPDATE TO authenticated
  USING (public.can_mutate_compliance_return(auth.uid(), id))
  WITH CHECK (
    public.can_mutate_compliance_return(auth.uid(), id)
    AND (
      -- External writers cannot re-target another licensee/license/submitter
      NOT public.has_external_role(auth.uid())
      OR public.external_can_access_compliance_return_values(
           auth.uid(), license_id, on_behalf_of_licensee_id, submitter_id, 'can_submit_returns')
    )
  );

CREATE POLICY compliance_returns_delete ON public.compliance_returns
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'compliance_management', 'delete'));

-- ---------- compliance_audit_logs policies -------------------
DROP POLICY IF EXISTS "cal_admin_read" ON public.compliance_audit_logs;
DROP POLICY IF EXISTS "external_users_denied_compliance_audit_logs" ON public.compliance_audit_logs;

CREATE POLICY compliance_audit_logs_read ON public.compliance_audit_logs
  FOR SELECT TO authenticated
  USING (
    NOT public.has_external_role(auth.uid())
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(), 'compliance_management', 'view_audit_logs')
      OR public.has_permission(auth.uid(), 'compliance_management', 'view_all_entities')
    )
  );

-- No authenticated INSERT/UPDATE/DELETE policy — audit records written by
-- service_role/worker only, so no user session can forge audit entries.

-- ---------- Grants (reassert) --------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['compliance_returns','compliance_audit_logs'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
