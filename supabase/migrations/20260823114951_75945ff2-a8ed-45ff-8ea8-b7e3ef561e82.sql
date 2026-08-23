-- WAVE 3B / GAP-3A-002 (P0): external audiences must never read another entity's returns graph.

CREATE OR REPLACE FUNCTION public.sec_is_internal_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id IS NOT NULL AND (
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.sec_user_roles ur
      JOIN public.sec_roles r ON r.id = ur.role_id
      WHERE ur.user_id = _user_id
        AND ur.status = 'active'
        AND r.status = 'active'
        AND r.role_type = 'internal'
        AND (ur.effective_from IS NULL OR ur.effective_from <= now())
        AND (ur.effective_until IS NULL OR ur.effective_until > now())
    )
  );
$$;

-- Object-level authority of an EXTERNAL user over one entity.
CREATE OR REPLACE FUNCTION public.entity_external_read_access(_user_id uuid, _entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id IS NOT NULL AND _entity_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.entity_user_access ea
      WHERE ea.user_id = _user_id
        AND ea.entity_id = _entity_id
        AND ea.is_active = true
        AND (ea.end_date IS NULL OR ea.end_date >= CURRENT_DATE)
    )
    OR public.entity_membership_capability(_user_id, _entity_id, 'returns.view')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _user_id AND p.licensee_id = _entity_id
    )
  );
$$;

-- Canonical audience-aware read predicate for the returns graph.
CREATE OR REPLACE FUNCTION public.can_read_entity_returns(_user_id uuid, _entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id IS NOT NULL AND (
    public.is_super_admin(_user_id)
    OR (
      public.sec_is_internal_user(_user_id)
      AND (
        public.has_permission(_user_id, 'returns_management', 'view')
        OR public.user_has_entity_assignment(_user_id, _entity_id)
      )
    )
    OR (
      NOT public.sec_is_internal_user(_user_id)
      AND public.entity_external_read_access(_user_id, _entity_id)
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.sec_is_internal_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.entity_external_read_access(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_entity_returns(uuid, uuid) TO authenticated, service_role;

-- return_filings
DROP POLICY IF EXISTS rf_read ON public.return_filings;
CREATE POLICY rf_read ON public.return_filings FOR SELECT TO authenticated
USING (public.can_read_entity_returns(auth.uid(), entity_id));

-- return_metric_values
DROP POLICY IF EXISTS rmv_read ON public.return_metric_values;
CREATE POLICY rmv_read ON public.return_metric_values FOR SELECT TO authenticated
USING (public.can_read_entity_returns(auth.uid(), entity_id));

-- entity_reporting_obligations
DROP POLICY IF EXISTS ero_read ON public.entity_reporting_obligations;
CREATE POLICY ero_read ON public.entity_reporting_obligations FOR SELECT TO authenticated
USING (public.can_read_entity_returns(auth.uid(), entity_id));

-- reporting_periods (scoped through the obligation)
DROP POLICY IF EXISTS rp_read ON public.reporting_periods;
CREATE POLICY rp_read ON public.reporting_periods FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.entity_reporting_obligations o
  WHERE o.id = reporting_periods.entity_reporting_obligation_id
    AND public.can_read_entity_returns(auth.uid(), o.entity_id)
));

-- return_filing_versions
DROP POLICY IF EXISTS rfv_read ON public.return_filing_versions;
CREATE POLICY rfv_read ON public.return_filing_versions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.return_filings f
  WHERE f.id = return_filing_versions.return_filing_id
    AND public.can_read_entity_returns(auth.uid(), f.entity_id)
));

-- return_filing_form_requirements
DROP POLICY IF EXISTS rffr_read ON public.return_filing_form_requirements;
CREATE POLICY rffr_read ON public.return_filing_form_requirements FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.return_filing_versions v
  JOIN public.return_filings f ON f.id = v.return_filing_id
  WHERE v.id = return_filing_form_requirements.return_filing_version_id
    AND public.can_read_entity_returns(auth.uid(), f.entity_id)
));

-- return_filing_validation_results
DROP POLICY IF EXISTS rfvr_read ON public.return_filing_validation_results;
CREATE POLICY rfvr_read ON public.return_filing_validation_results FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.return_filings f
  WHERE f.id = return_filing_validation_results.return_filing_id
    AND public.can_read_entity_returns(auth.uid(), f.entity_id)
));

-- return_filing_requests
DROP POLICY IF EXISTS rfreq_read ON public.return_filing_requests;
CREATE POLICY rfreq_read ON public.return_filing_requests FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.return_filings f
  WHERE f.id = return_filing_requests.return_filing_id
    AND public.can_read_entity_returns(auth.uid(), f.entity_id)
));