-- Tighten workflow version snapshot visibility
DROP POLICY IF EXISTS "Authenticated read workflow versions" ON public.approval_workflow_versions;
CREATE POLICY "Internal staff read workflow versions"
ON public.approval_workflow_versions
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  OR public.has_role(auth.uid(), 'licensing_officer'::public.app_role)
  OR public.has_role(auth.uid(), 'analyst'::public.app_role)
  OR public.has_role(auth.uid(), 'legal_compliance'::public.app_role)
);

-- Restrict document extraction reads to internal staff or the requesting user
DROP POLICY IF EXISTS "Staff can read all document extractions" ON public.document_extractions;
CREATE POLICY "Internal staff read document extractions"
ON public.document_extractions
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  OR public.has_role(auth.uid(), 'licensing_officer'::public.app_role)
  OR public.has_role(auth.uid(), 'analyst'::public.app_role)
  OR public.has_role(auth.uid(), 'legal_compliance'::public.app_role)
);
CREATE POLICY "Users read own document extractions"
ON public.document_extractions
FOR SELECT
TO authenticated
USING (requested_by = auth.uid());

-- Remove public digest-log writes; service role bypasses RLS for backend jobs
DROP POLICY IF EXISTS "Service inserts digest log" ON public.notification_digest_log;

-- Scope reinsurance contract reads to internal staff or users mapped to that entity
DROP POLICY IF EXISTS "Authenticated read reinsurance contracts" ON public.reinsurance_contracts;
CREATE POLICY "Internal staff read reinsurance contracts"
ON public.reinsurance_contracts
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  OR public.has_role(auth.uid(), 'licensing_officer'::public.app_role)
  OR public.has_role(auth.uid(), 'analyst'::public.app_role)
  OR public.has_role(auth.uid(), 'legal_compliance'::public.app_role)
);
CREATE POLICY "Entity users read own reinsurance contracts"
ON public.reinsurance_contracts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.entity_user_access eua
    WHERE eua.user_id = auth.uid()
      AND eua.entity_id = reinsurance_contracts.entity_id
      AND eua.is_active = true
      AND (eua.end_date IS NULL OR eua.end_date > now())
  )
);

-- Scope calculated ratio reads to internal staff or users allowed to view the related return
DROP POLICY IF EXISTS "authenticated read calculated ratios" ON public.return_calculated_ratios;
CREATE POLICY "Internal staff read calculated ratios"
ON public.return_calculated_ratios
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  OR public.has_role(auth.uid(), 'licensing_officer'::public.app_role)
  OR public.has_role(auth.uid(), 'analyst'::public.app_role)
  OR public.has_role(auth.uid(), 'legal_compliance'::public.app_role)
);
CREATE POLICY "Scoped users read calculated ratios"
ON public.return_calculated_ratios
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.returns_filed r
    WHERE r.id = return_calculated_ratios.return_id
      AND (
        r.created_by = auth.uid()
        OR public.external_can_access_return_filed(auth.uid(), r.id, 'can_view_status')
        OR public.external_can_access_return_filed(auth.uid(), r.id, 'can_submit_returns')
        OR r.entity_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
        OR r.on_behalf_of_licensee_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
        OR EXISTS (
          SELECT 1
          FROM public.entity_user_access eua
          WHERE eua.user_id = auth.uid()
            AND eua.is_active = true
            AND (eua.end_date IS NULL OR eua.end_date > now())
            AND eua.entity_id IN (r.entity_id, r.on_behalf_of_licensee_id)
        )
      )
  )
);

-- Scope threshold breach reads to internal staff or users allowed to view the related return
DROP POLICY IF EXISTS "authenticated read breaches" ON public.return_threshold_breaches;
CREATE POLICY "Internal staff read threshold breaches"
ON public.return_threshold_breaches
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  OR public.has_role(auth.uid(), 'licensing_officer'::public.app_role)
  OR public.has_role(auth.uid(), 'analyst'::public.app_role)
  OR public.has_role(auth.uid(), 'legal_compliance'::public.app_role)
);
CREATE POLICY "Scoped users read threshold breaches"
ON public.return_threshold_breaches
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.returns_filed r
    WHERE r.id = return_threshold_breaches.return_id
      AND (
        r.created_by = auth.uid()
        OR public.external_can_access_return_filed(auth.uid(), r.id, 'can_view_status')
        OR public.external_can_access_return_filed(auth.uid(), r.id, 'can_submit_returns')
        OR r.entity_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
        OR r.on_behalf_of_licensee_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
        OR EXISTS (
          SELECT 1
          FROM public.entity_user_access eua
          WHERE eua.user_id = auth.uid()
            AND eua.is_active = true
            AND (eua.end_date IS NULL OR eua.end_date > now())
            AND eua.entity_id IN (r.entity_id, r.on_behalf_of_licensee_id)
        )
      )
  )
);

-- Scope validation log reads to internal staff or users allowed to view the related return
DROP POLICY IF EXISTS "auth read run log" ON public.return_validation_run_log;
CREATE POLICY "Internal staff read validation run log"
ON public.return_validation_run_log
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  OR public.has_role(auth.uid(), 'licensing_officer'::public.app_role)
  OR public.has_role(auth.uid(), 'analyst'::public.app_role)
  OR public.has_role(auth.uid(), 'legal_compliance'::public.app_role)
);
CREATE POLICY "Scoped users read validation run log"
ON public.return_validation_run_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.returns_filed r
    WHERE r.id = return_validation_run_log.return_id
      AND (
        r.created_by = auth.uid()
        OR public.external_can_access_return_filed(auth.uid(), r.id, 'can_view_status')
        OR public.external_can_access_return_filed(auth.uid(), r.id, 'can_submit_returns')
        OR r.entity_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
        OR r.on_behalf_of_licensee_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
        OR EXISTS (
          SELECT 1
          FROM public.entity_user_access eua
          WHERE eua.user_id = auth.uid()
            AND eua.is_active = true
            AND (eua.end_date IS NULL OR eua.end_date > now())
            AND eua.entity_id IN (r.entity_id, r.on_behalf_of_licensee_id)
        )
      )
  )
);

-- Restrict returns_filed external capability gate to signed-in users only
DROP POLICY IF EXISTS "external_returns_filed_select_capability_gate" ON public.returns_filed;
CREATE POLICY "external_returns_filed_select_capability_gate"
ON public.returns_filed
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    NOT public.has_external_role(auth.uid())
    OR public.external_can_access_return_filed_values(auth.uid(), entity_id, on_behalf_of_licensee_id, created_by, 'can_view_status')
    OR public.external_can_access_return_filed_values(auth.uid(), entity_id, on_behalf_of_licensee_id, created_by, 'can_submit_returns')
  )
);

-- Remove anonymous and broad authenticated deletion of registration uploads
DROP POLICY IF EXISTS "Allow anon delete registration uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete registration uploads" ON storage.objects;

-- Restrict internal sufficiency configuration/override reads
DROP POLICY IF EXISTS "Internal read overrides" ON public.sufficiency_overrides;
CREATE POLICY "Internal staff read sufficiency overrides"
ON public.sufficiency_overrides
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  OR public.has_role(auth.uid(), 'licensing_officer'::public.app_role)
  OR public.has_role(auth.uid(), 'analyst'::public.app_role)
  OR public.has_role(auth.uid(), 'legal_compliance'::public.app_role)
);

DROP POLICY IF EXISTS "Internal can read rule sets" ON public.sufficiency_rule_sets;
CREATE POLICY "Internal staff read sufficiency rule sets"
ON public.sufficiency_rule_sets
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  OR public.has_role(auth.uid(), 'licensing_officer'::public.app_role)
  OR public.has_role(auth.uid(), 'analyst'::public.app_role)
  OR public.has_role(auth.uid(), 'legal_compliance'::public.app_role)
);

DROP POLICY IF EXISTS "Internal can read sufficiency rules" ON public.sufficiency_rules;
CREATE POLICY "Internal staff read sufficiency rules"
ON public.sufficiency_rules
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  OR public.has_role(auth.uid(), 'licensing_officer'::public.app_role)
  OR public.has_role(auth.uid(), 'analyst'::public.app_role)
  OR public.has_role(auth.uid(), 'legal_compliance'::public.app_role)
);