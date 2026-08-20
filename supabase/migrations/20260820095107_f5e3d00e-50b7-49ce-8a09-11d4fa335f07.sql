
-- ============================================================
-- RDM-ENTITY-001 WAVE C — CANONICAL RETURNS / OBLIGATIONS / METRICS SCHEMA
-- ============================================================

-- Membership capability helper (external filing authority) ----------------
CREATE OR REPLACE FUNCTION public.entity_membership_capability(
  _user_id uuid, _entity_id uuid, _capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.entity_user_memberships m
      JOIN public.entity_membership_roles r ON r.id = m.membership_role_id
      LEFT JOIN public.entity_membership_role_permissions p ON p.membership_role_id = r.id
     WHERE m.user_id = _user_id
       AND m.entity_id = _entity_id
       AND m.status = 'APPROVED'
       AND (m.effective_to IS NULL OR m.effective_to > now())
       AND (p.capability = _capability OR r.is_primary_representative)
  );
$$;
REVOKE ALL ON FUNCTION public.entity_membership_capability(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.entity_membership_capability(uuid, uuid, text) TO authenticated;

-- 1. RETURN DEFINITIONS ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.return_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE RESTRICT,
  frequency text NOT NULL DEFAULT 'QUARTERLY'
    CHECK (frequency IN ('MONTHLY','QUARTERLY','SEMI_ANNUAL','ANNUAL','EVENT_DRIVEN','AD_HOC')),
  filing_basis text NOT NULL DEFAULT 'SOLO' CHECK (filing_basis IN ('SOLO','CONSOLIDATED','BOTH')),
  consolidation_basis text,
  currency_basis text,
  due_days_after_period_end integer NOT NULL DEFAULT 30 CHECK (due_days_after_period_end >= 0),
  requires_declaration boolean NOT NULL DEFAULT true,
  declaration_text text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','SUSPENDED','RETIRED')),
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  legacy_return_type_id uuid REFERENCES public.return_types(id) ON DELETE SET NULL,
  legacy_return_config_id uuid REFERENCES public.return_configs(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. RETURN DEFINITION FORMS ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.return_definition_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_definition_id uuid NOT NULL REFERENCES public.return_definitions(id) ON DELETE CASCADE,
  form_template_id uuid NOT NULL REFERENCES public.form_templates(id) ON DELETE RESTRICT,
  sequence integer NOT NULL DEFAULT 1,
  is_required boolean NOT NULL DEFAULT true,
  section_label text,
  tab_name text,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (return_definition_id, form_template_id, effective_from)
);

-- 3. REPORTING OBLIGATION RULES ------------------------------------------
CREATE TABLE IF NOT EXISTS public.reporting_obligation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_definition_id uuid NOT NULL REFERENCES public.return_definitions(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE RESTRICT,
  sector_id uuid REFERENCES public.sectors(id) ON DELETE RESTRICT,
  sub_sector_id uuid,
  category_id uuid REFERENCES public.categories(id) ON DELETE RESTRICT,
  license_type_id uuid,
  classification_value_id uuid REFERENCES public.classification_values(id) ON DELETE RESTRICT,
  lifecycle_stage_id uuid,
  requires_active_license boolean NOT NULL DEFAULT true,
  jurisdiction text,
  priority integer NOT NULL DEFAULT 100,
  frequency_override text CHECK (frequency_override IS NULL OR frequency_override IN
    ('MONTHLY','QUARTERLY','SEMI_ANNUAL','ANNUAL','EVENT_DRIVEN','AD_HOC')),
  due_days_override integer,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. ENTITY REPORTING OBLIGATIONS ----------------------------------------
CREATE TABLE IF NOT EXISTS public.entity_reporting_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE RESTRICT,
  return_definition_id uuid NOT NULL REFERENCES public.return_definitions(id) ON DELETE RESTRICT,
  source_rule_id uuid REFERENCES public.reporting_obligation_rules(id) ON DELETE SET NULL,
  origin text NOT NULL DEFAULT 'RULE' CHECK (origin IN ('RULE','AD_HOC','LEGACY_MIGRATION')),
  frequency text NOT NULL,
  due_days_after_period_end integer NOT NULL DEFAULT 30,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
  closed_reason text,
  next_due_date date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ero_open
  ON public.entity_reporting_obligations(entity_id, return_definition_id, effective_from);
CREATE INDEX IF NOT EXISTS idx_ero_entity ON public.entity_reporting_obligations(entity_id, status);

-- 5. REPORTING PERIODS ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reporting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_reporting_obligation_id uuid NOT NULL REFERENCES public.entity_reporting_obligations(id) ON DELETE RESTRICT,
  period_label text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('SCHEDULED','OPEN','CLOSED','WAIVED')),
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  UNIQUE (entity_reporting_obligation_id, period_start, period_end)
);
CREATE INDEX IF NOT EXISTS idx_rp_due ON public.reporting_periods(due_date, status);

-- 6. RETURN FILINGS ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.return_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_reference text NOT NULL UNIQUE,
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE RESTRICT,
  entity_reporting_obligation_id uuid NOT NULL REFERENCES public.entity_reporting_obligations(id) ON DELETE RESTRICT,
  reporting_period_id uuid NOT NULL REFERENCES public.reporting_periods(id) ON DELETE RESTRICT,
  return_definition_id uuid NOT NULL REFERENCES public.return_definitions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN
    ('DRAFT','SUBMITTED','UNDER_REVIEW','CORRECTION_REQUESTED','ACCEPTED','REJECTED','WITHDRAWN')),
  current_version_number integer NOT NULL DEFAULT 0,
  accepted_version_id uuid,
  assigned_reviewer_id uuid,
  submitted_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  legacy_return_filed_id uuid REFERENCES public.returns_filed(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_reporting_obligation_id, reporting_period_id)
);
CREATE INDEX IF NOT EXISTS idx_rf_status ON public.return_filings(status, entity_id);

-- 7. FILING VERSIONS -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.return_filing_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_filing_id uuid NOT NULL REFERENCES public.return_filings(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN
    ('DRAFT','SUBMITTED','UNDER_REVIEW','CORRECTION_REQUESTED','ACCEPTED','REJECTED','SUPERSEDED')),
  is_immutable boolean NOT NULL DEFAULT false,
  legacy_origin text CHECK (legacy_origin IS NULL OR legacy_origin IN ('LEGACY_SINGLE_VERSION')),
  submitted_at timestamptz,
  submitted_by uuid,
  accepted_at timestamptz,
  accepted_by uuid,
  rejected_at timestamptz,
  rejected_by uuid,
  rejection_reason text,
  declaration_accepted_at timestamptz,
  declaration_accepted_by uuid,
  supersedes_version_id uuid REFERENCES public.return_filing_versions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (return_filing_id, version_number)
);

ALTER TABLE public.return_filings
  DROP CONSTRAINT IF EXISTS return_filings_accepted_version_fk;
ALTER TABLE public.return_filings
  ADD CONSTRAINT return_filings_accepted_version_fk
  FOREIGN KEY (accepted_version_id) REFERENCES public.return_filing_versions(id) ON DELETE SET NULL;

-- 8. PINNED FORM REQUIREMENTS -------------------------------------------
CREATE TABLE IF NOT EXISTS public.return_filing_form_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_filing_version_id uuid NOT NULL REFERENCES public.return_filing_versions(id) ON DELETE CASCADE,
  form_template_id uuid NOT NULL REFERENCES public.form_templates(id) ON DELETE RESTRICT,
  form_version_id uuid NOT NULL REFERENCES public.form_versions(id) ON DELETE RESTRICT,
  is_required boolean NOT NULL DEFAULT true,
  sequence integer NOT NULL DEFAULT 1,
  tab_name text,
  form_response_id uuid REFERENCES public.form_responses(id) ON DELETE SET NULL,
  completion_status text NOT NULL DEFAULT 'PENDING'
    CHECK (completion_status IN ('PENDING','IN_PROGRESS','COMPLETED')),
  pinned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (return_filing_version_id, form_template_id)
);

-- 9. REGULATORY METRIC REGISTRY -----------------------------------------
CREATE TABLE IF NOT EXISTS public.regulatory_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  data_domain_id uuid REFERENCES public.data_domains(id) ON DELETE RESTRICT,
  data_type text NOT NULL DEFAULT 'NUMERIC' CHECK (data_type IN ('NUMERIC','INTEGER','PERCENTAGE','CURRENCY','BOOLEAN','TEXT','DATE')),
  unit text,
  aggregation_type text NOT NULL DEFAULT 'POINT_IN_TIME'
    CHECK (aggregation_type IN ('POINT_IN_TIME','SUM','AVERAGE','MAX','MIN','RATIO','COUNT')),
  frequency_compatibility text[] NOT NULL DEFAULT ARRAY['MONTHLY','QUARTERLY','SEMI_ANNUAL','ANNUAL']::text[],
  sensitivity text NOT NULL DEFAULT 'INTERNAL' CHECK (sensitivity IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED')),
  is_calculated boolean NOT NULL DEFAULT false,
  calculation_strategy text,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 10. CALCULATION RULES (governed expression engine) --------------------
CREATE TABLE IF NOT EXISTS public.metric_calculation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulatory_metric_id uuid NOT NULL REFERENCES public.regulatory_metrics(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  expression text NOT NULL,
  dependency_metric_codes text[] NOT NULL DEFAULT '{}'::text[],
  on_missing_dependency text NOT NULL DEFAULT 'ERROR'
    CHECK (on_missing_dependency IN ('ERROR','NOT_AVAILABLE')),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (regulatory_metric_id, version)
);

-- 11. METRIC VALUES -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.return_metric_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_filing_version_id uuid NOT NULL REFERENCES public.return_filing_versions(id) ON DELETE RESTRICT,
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE RESTRICT,
  regulatory_metric_id uuid NOT NULL REFERENCES public.regulatory_metrics(id) ON DELETE RESTRICT,
  reporting_period_id uuid NOT NULL REFERENCES public.reporting_periods(id) ON DELETE RESTRICT,
  value_numeric numeric,
  value_text text,
  value_boolean boolean,
  value_date date,
  availability text NOT NULL DEFAULT 'AVAILABLE'
    CHECK (availability IN ('AVAILABLE','NOT_AVAILABLE','ERROR')),
  availability_reason text,
  source_kind text NOT NULL DEFAULT 'REPORTED' CHECK (source_kind IN ('REPORTED','CALCULATED','LEGACY_EVIDENCE')),
  source_form_response_id uuid REFERENCES public.form_responses(id) ON DELETE SET NULL,
  source_form_version_id uuid REFERENCES public.form_versions(id) ON DELETE SET NULL,
  source_field_definition_id uuid REFERENCES public.form_field_definitions(id) ON DELETE SET NULL,
  calculation_rule_id uuid REFERENCES public.metric_calculation_rules(id) ON DELETE SET NULL,
  calculation_inputs jsonb,
  calculated_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (return_filing_version_id, regulatory_metric_id)
);
CREATE INDEX IF NOT EXISTS idx_rmv_series
  ON public.return_metric_values(entity_id, regulatory_metric_id, reporting_period_id);

-- 12. FIELD → METRIC BINDING (semantic, label-independent) --------------
ALTER TABLE public.form_field_definitions
  ADD COLUMN IF NOT EXISTS regulatory_metric_id uuid REFERENCES public.regulatory_metrics(id) ON DELETE SET NULL;

-- 13. VALIDATION RESULTS ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.return_filing_validation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_filing_id uuid NOT NULL REFERENCES public.return_filings(id) ON DELETE CASCADE,
  return_filing_version_id uuid REFERENCES public.return_filing_versions(id) ON DELETE CASCADE,
  severity text NOT NULL CHECK (severity IN ('ERROR','WARNING','INFORMATION')),
  rule_code text NOT NULL,
  scope text NOT NULL DEFAULT 'FILING' CHECK (scope IN ('FIELD','FORM','CROSS_FORM','METRIC','PERIOD','FILING')),
  form_template_id uuid,
  regulatory_metric_id uuid REFERENCES public.regulatory_metrics(id) ON DELETE SET NULL,
  message text NOT NULL,
  is_blocking boolean NOT NULL DEFAULT false,
  detected_at timestamptz NOT NULL DEFAULT now()
);

-- 14. CORRECTION / RFI LINKAGE ------------------------------------------
CREATE TABLE IF NOT EXISTS public.return_filing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_filing_id uuid NOT NULL REFERENCES public.return_filings(id) ON DELETE CASCADE,
  return_filing_version_id uuid REFERENCES public.return_filing_versions(id) ON DELETE SET NULL,
  request_kind text NOT NULL DEFAULT 'CORRECTION' CHECK (request_kind IN ('CORRECTION','RFI','COMMENT')),
  form_template_id uuid,
  regulatory_metric_id uuid REFERENCES public.regulatory_metrics(id) ON DELETE SET NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESPONDED','RESOLVED','CANCELLED')),
  response_text text,
  responded_at timestamptz,
  responded_by uuid,
  legacy_return_request_id uuid REFERENCES public.return_requests(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 15. LEGACY MAPPING LEDGER ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.returns_legacy_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_table text NOT NULL,
  legacy_id uuid NOT NULL,
  canonical_table text,
  canonical_id uuid,
  classification text NOT NULL CHECK (classification IN
    ('EXACT_CANONICAL_MAPPING','DERIVABLE_WITH_EVIDENCE','AMBIGUOUS','LEGACY_ONLY')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (legacy_table, legacy_id)
);

-- ------------------------- GRANTS + RLS --------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'return_definitions','return_definition_forms','reporting_obligation_rules',
    'entity_reporting_obligations','reporting_periods','return_filings',
    'return_filing_versions','return_filing_form_requirements','regulatory_metrics',
    'metric_calculation_rules','return_metric_values','return_filing_validation_results',
    'return_filing_requests','returns_legacy_mappings']
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Configuration tables: internal read by permission, public-ish definitions
CREATE POLICY rd_read ON public.return_definitions FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'returns_management','view')
         OR EXISTS (SELECT 1 FROM public.entity_reporting_obligations o
                     WHERE o.return_definition_id = return_definitions.id
                       AND public.entity_membership_capability(auth.uid(), o.entity_id, 'returns.view')));

CREATE POLICY rdf_read ON public.return_definition_forms FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'returns_management','view'));

CREATE POLICY ror_read ON public.reporting_obligation_rules FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'returns_management','view'));

CREATE POLICY ero_read ON public.entity_reporting_obligations FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'returns_management','view')
         OR public.entity_membership_capability(auth.uid(), entity_id, 'returns.view')
         OR public.user_has_entity_assignment(auth.uid(), entity_id));

CREATE POLICY rp_read ON public.reporting_periods FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'returns_management','view')
         OR EXISTS (SELECT 1 FROM public.entity_reporting_obligations o
                     WHERE o.id = reporting_periods.entity_reporting_obligation_id
                       AND (public.entity_membership_capability(auth.uid(), o.entity_id, 'returns.view')
                            OR public.user_has_entity_assignment(auth.uid(), o.entity_id))));

CREATE POLICY rf_read ON public.return_filings FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'returns_management','view')
         OR public.entity_membership_capability(auth.uid(), entity_id, 'returns.view')
         OR public.user_has_entity_assignment(auth.uid(), entity_id)
         OR created_by = auth.uid());

CREATE POLICY rfv_read ON public.return_filing_versions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.return_filings f
                  WHERE f.id = return_filing_versions.return_filing_id
                    AND (public.is_super_admin(auth.uid())
                         OR public.has_permission(auth.uid(),'returns_management','view')
                         OR public.entity_membership_capability(auth.uid(), f.entity_id, 'returns.view')
                         OR public.user_has_entity_assignment(auth.uid(), f.entity_id)
                         OR f.created_by = auth.uid())));

CREATE POLICY rffr_read ON public.return_filing_form_requirements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.return_filing_versions v
                  JOIN public.return_filings f ON f.id = v.return_filing_id
                  WHERE v.id = return_filing_form_requirements.return_filing_version_id
                    AND (public.is_super_admin(auth.uid())
                         OR public.has_permission(auth.uid(),'returns_management','view')
                         OR public.entity_membership_capability(auth.uid(), f.entity_id, 'returns.view')
                         OR public.user_has_entity_assignment(auth.uid(), f.entity_id))));

CREATE POLICY rm_read ON public.regulatory_metrics FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.is_internal_staff(auth.uid())
         OR sensitivity = 'PUBLIC');

CREATE POLICY mcr_read ON public.metric_calculation_rules FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_internal_staff(auth.uid()));

CREATE POLICY rmv_read ON public.return_metric_values FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'returns_management','view')
         OR public.entity_membership_capability(auth.uid(), entity_id, 'returns.view')
         OR public.user_has_entity_assignment(auth.uid(), entity_id));

CREATE POLICY rfvr_read ON public.return_filing_validation_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.return_filings f
                  WHERE f.id = return_filing_validation_results.return_filing_id
                    AND (public.is_super_admin(auth.uid())
                         OR public.has_permission(auth.uid(),'returns_management','view')
                         OR public.entity_membership_capability(auth.uid(), f.entity_id, 'returns.view'))));

CREATE POLICY rfreq_read ON public.return_filing_requests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.return_filings f
                  WHERE f.id = return_filing_requests.return_filing_id
                    AND (public.is_super_admin(auth.uid())
                         OR public.has_permission(auth.uid(),'returns_management','view')
                         OR public.entity_membership_capability(auth.uid(), f.entity_id, 'returns.view'))));

CREATE POLICY rlm_read ON public.returns_legacy_mappings FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(),'returns_management','manage_config'));

-- Immutability guards ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.return_filing_version_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_immutable THEN
      RAISE EXCEPTION 'Submitted filing versions are durable regulatory evidence and cannot be deleted'
        USING ERRCODE='42501';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.is_immutable AND OLD.status IN ('ACCEPTED','REJECTED','SUPERSEDED')
     AND (NEW.version_number <> OLD.version_number OR NEW.return_filing_id <> OLD.return_filing_id
          OR NEW.submitted_at <> OLD.submitted_at) THEN
    RAISE EXCEPTION 'Accepted filing version content is immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_rfv_immutable ON public.return_filing_versions;
CREATE TRIGGER trg_rfv_immutable BEFORE UPDATE OR DELETE ON public.return_filing_versions
  FOR EACH ROW EXECUTE FUNCTION public.return_filing_version_immutable();

CREATE OR REPLACE FUNCTION public.return_metric_value_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.return_filing_versions
   WHERE id = COALESCE(OLD.return_filing_version_id, NEW.return_filing_version_id);
  IF v_status IN ('ACCEPTED','SUPERSEDED','REJECTED') THEN
    RAISE EXCEPTION 'Metric values of an accepted filing version are immutable' USING ERRCODE='42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_rmv_immutable ON public.return_metric_values;
CREATE TRIGGER trg_rmv_immutable BEFORE UPDATE OR DELETE ON public.return_metric_values
  FOR EACH ROW EXECUTE FUNCTION public.return_metric_value_immutable();

CREATE OR REPLACE FUNCTION public.regulatory_metric_code_locked()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.code <> OLD.code AND EXISTS (
      SELECT 1 FROM public.return_metric_values WHERE regulatory_metric_id = OLD.id) THEN
    RAISE EXCEPTION 'Metric code is immutable once values exist' USING ERRCODE='42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_rm_code_locked ON public.regulatory_metrics;
CREATE TRIGGER trg_rm_code_locked BEFORE UPDATE ON public.regulatory_metrics
  FOR EACH ROW EXECUTE FUNCTION public.regulatory_metric_code_locked();

-- updated_at touch triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['return_definitions','reporting_obligation_rules',
      'entity_reporting_obligations','return_filings','return_filing_requests'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_touch ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_touch BEFORE UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.onboarding_touch()', t, t);
  END LOOP;
END $$;
