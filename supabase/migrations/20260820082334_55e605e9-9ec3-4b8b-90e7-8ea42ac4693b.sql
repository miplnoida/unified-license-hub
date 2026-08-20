
-- ============ helpers ============
CREATE OR REPLACE FUNCTION public.wb_entity_member(_entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.entity_user_memberships m
     WHERE m.entity_id = _entity_id AND m.user_id = auth.uid()
       AND upper(COALESCE(m.status,'')) = 'APPROVED'
  );
$$;
REVOKE EXECUTE ON FUNCTION public.wb_entity_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wb_entity_member(uuid) TO authenticated, service_role;

-- ============ 3. DATA CONCEPT REGISTRY ============
CREATE TABLE public.data_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  data_domain_id uuid REFERENCES public.data_domains(id) ON DELETE RESTRICT,
  data_type text NOT NULL DEFAULT 'TEXT'
    CHECK (data_type IN ('TEXT','NUMBER','DATE','DATETIME','BOOLEAN','UUID','JSON','ENUM','MONEY','PERCENTAGE')),
  cardinality text NOT NULL DEFAULT 'SINGLE' CHECK (cardinality IN ('SINGLE','MULTIPLE')),
  sensitivity_classification text NOT NULL DEFAULT 'INTERNAL'
    CHECK (sensitivity_classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED')),
  value_source_type text NOT NULL DEFAULT 'FREE_INPUT'
    CHECK (value_source_type IN ('FREE_INPUT','MASTER_DATA','CLASSIFICATION','DERIVED','DOCUMENT')),
  master_data_source text,
  canonical_target text,
  projection_strategy text NOT NULL DEFAULT 'CAPTURE_ONLY'
    CHECK (projection_strategy IN ('CAPTURE_ONLY','PROPOSE_ENTITY_FACT','PROPOSE_ORGANIZATION_NAME',
      'PROPOSE_CLASSIFICATION','PROPOSE_RELATIONSHIP','PROPOSE_OWNERSHIP','PROPOSE_APPOINTMENT',
      'CREATE_REGULATORY_EVENT')),
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ 6. STABLE FORM FIELD IDENTITY ============
CREATE TABLE public.form_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  data_concept_id uuid REFERENCES public.data_concepts(id) ON DELETE RESTRICT,
  label_hint text,
  is_published boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, field_key)
);

-- immutability of published logical identity
CREATE OR REPLACE FUNCTION public.form_field_definition_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.is_published THEN
    IF NEW.field_key IS DISTINCT FROM OLD.field_key THEN
      RAISE EXCEPTION 'field_key is immutable after publication (%).', OLD.field_key;
    END IF;
    IF NEW.data_concept_id IS DISTINCT FROM OLD.data_concept_id THEN
      RAISE EXCEPTION 'data_concept_id is immutable for a published logical field; create a new field definition instead';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_form_field_definition_guard BEFORE UPDATE ON public.form_field_definitions
FOR EACH ROW EXECUTE FUNCTION public.form_field_definition_guard();

-- 7. version-specific field references stable identity
ALTER TABLE public.form_fields
  ADD COLUMN IF NOT EXISTS form_field_definition_id uuid
    REFERENCES public.form_field_definitions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_form_fields_field_definition
  ON public.form_fields(form_field_definition_id);

-- ============ 10/11. FORM DIMENSIONS ============
ALTER TABLE public.form_templates
  ADD COLUMN IF NOT EXISTS form_purpose_id uuid REFERENCES public.form_purposes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trigger_type_id uuid REFERENCES public.form_trigger_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_mapping_status text NOT NULL DEFAULT 'LEGACY_ONLY'
    CHECK (legacy_mapping_status IN ('EXACTLY_MAPPED','PARTIALLY_MAPPED','AMBIGUOUS','LEGACY_ONLY'));

CREATE TABLE public.form_data_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
  data_domain_id uuid NOT NULL REFERENCES public.data_domains(id) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, data_domain_id)
);

CREATE TABLE public.form_lifecycle_applicability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
  lifecycle_stage_id uuid REFERENCES public.lifecycle_stages(id) ON DELETE RESTRICT,
  lifecycle_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (lifecycle_stage_id IS NOT NULL OR lifecycle_key IS NOT NULL)
);
CREATE UNIQUE INDEX uq_form_lifecycle_stage
  ON public.form_lifecycle_applicability(template_id, COALESCE(lifecycle_stage_id::text, lifecycle_key));

-- ============ 15. NORMALIZED SUBMISSION VALUES ============
CREATE TABLE public.form_submission_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.form_responses(id) ON DELETE CASCADE,
  form_version_id uuid NOT NULL REFERENCES public.form_versions(id) ON DELETE RESTRICT,
  form_field_definition_id uuid REFERENCES public.form_field_definitions(id) ON DELETE SET NULL,
  data_concept_id uuid REFERENCES public.data_concepts(id) ON DELETE SET NULL,
  legacy_field_name text,
  value_text text,
  value_number numeric,
  value_date date,
  value_datetime timestamptz,
  value_boolean boolean,
  value_uuid uuid,
  value_json jsonb,
  repeat_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fsv_response ON public.form_submission_values(response_id);
CREATE INDEX idx_fsv_concept ON public.form_submission_values(data_concept_id);

-- ============ 5. GENERIC SCALAR ENTITY FACTS ============
CREATE TABLE public.entity_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE RESTRICT,
  data_concept_id uuid NOT NULL REFERENCES public.data_concepts(id) ON DELETE RESTRICT,
  value_text text,
  value_number numeric,
  value_date date,
  value_datetime timestamptz,
  value_boolean boolean,
  value_uuid uuid,
  value_json jsonb,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  source_submission_id uuid REFERENCES public.form_responses(id) ON DELETE SET NULL,
  source_form_version_id uuid REFERENCES public.form_versions(id) ON DELETE SET NULL,
  source_change_set_id uuid,
  verified_by uuid,
  verified_at timestamptz,
  approval_status text NOT NULL DEFAULT 'APPROVED'
    CHECK (approval_status IN ('PROPOSED','APPROVED','REJECTED','SUPERSEDED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_entity_facts_entity ON public.entity_facts(entity_id, data_concept_id);

-- ============ 17. FORM PACKAGES ============
CREATE TABLE public.form_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  regulator_id uuid,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','retired')),
  version integer NOT NULL DEFAULT 1,
  published_at timestamptz,
  published_by uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.form_package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.form_packages(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.form_templates(id) ON DELETE RESTRICT,
  is_required boolean NOT NULL DEFAULT true,
  sequence integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, template_id)
);

CREATE TABLE public.form_applicability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.form_packages(id) ON DELETE CASCADE,
  regulator_id uuid,
  jurisdiction text,
  sector_id uuid,
  sub_sector_id uuid,
  category_id uuid,
  service_id uuid,
  license_type text,
  entity_classification_value_id uuid REFERENCES public.classification_values(id) ON DELETE SET NULL,
  lifecycle_key text,
  request_type_key text,
  application_type text,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ 19. APPLICATION FORM REQUIREMENTS ============
CREATE TABLE public.application_form_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.form_templates(id) ON DELETE RESTRICT,
  form_version_id uuid NOT NULL REFERENCES public.form_versions(id) ON DELETE RESTRICT,
  package_id uuid REFERENCES public.form_packages(id) ON DELETE SET NULL,
  applicability_rule_id uuid REFERENCES public.form_applicability_rules(id) ON DELETE SET NULL,
  is_required boolean NOT NULL DEFAULT true,
  sequence integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','IN_PROGRESS','SUBMITTED','ACCEPTED','WAIVED')),
  response_id uuid REFERENCES public.form_responses(id) ON DELETE SET NULL,
  pinned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, template_id)
);

-- ============ 34/35. REGULATORY REQUESTS ============
CREATE TABLE public.regulatory_request_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  data_domain_id uuid REFERENCES public.data_domains(id) ON DELETE SET NULL,
  default_package_id uuid REFERENCES public.form_packages(id) ON DELETE SET NULL,
  workflow_type text,
  requires_change_set boolean NOT NULL DEFAULT true,
  requires_approval boolean NOT NULL DEFAULT true,
  applies_to_lifecycle text NOT NULL DEFAULT 'AUTHORISED',
  external_startable boolean NOT NULL DEFAULT true,
  min_membership_capability text,
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.regulatory_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text NOT NULL UNIQUE DEFAULT ('RR-' || to_char(now(),'YYYY') || '-' || lpad((floor(random()*1000000))::text, 6, '0')),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE RESTRICT,
  request_type_id uuid NOT NULL REFERENCES public.regulatory_request_types(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','INFORMATION_REQUESTED','APPROVED','REJECTED','CLOSED','WITHDRAWN')),
  workflow_instance_id uuid,
  package_id uuid REFERENCES public.form_packages(id) ON DELETE SET NULL,
  change_set_id uuid,
  effective_date date,
  priority smallint,
  submitted_by uuid,
  submitted_at timestamptz,
  assigned_to uuid,
  assigned_by uuid,
  assigned_at timestamptz,
  decided_by uuid,
  decided_at timestamptz,
  decision_rationale text,
  closed_by uuid,
  closed_at timestamptz,
  summary text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reg_requests_entity ON public.regulatory_requests(entity_id, status);

CREATE TABLE public.regulatory_request_form_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.regulatory_requests(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.form_templates(id) ON DELETE RESTRICT,
  form_version_id uuid NOT NULL REFERENCES public.form_versions(id) ON DELETE RESTRICT,
  package_id uuid REFERENCES public.form_packages(id) ON DELETE SET NULL,
  is_required boolean NOT NULL DEFAULT true,
  sequence integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','IN_PROGRESS','SUBMITTED','ACCEPTED','WAIVED')),
  response_id uuid REFERENCES public.form_responses(id) ON DELETE SET NULL,
  pinned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, template_id)
);

-- ============ grants + RLS (read models only; writes via governed RPCs) ============
DO $g$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['data_concepts','form_field_definitions','form_data_domains',
    'form_lifecycle_applicability','form_submission_values','entity_facts','form_packages',
    'form_package_items','form_applicability_rules','application_form_requirements',
    'regulatory_request_types','regulatory_requests','regulatory_request_form_requirements']
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $g$;

CREATE POLICY "rdm config readable by permitted staff" ON public.data_concepts
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(),'regulatory_data_model','view')
    OR public.has_permission(auth.uid(),'form_management','view'));

CREATE POLICY "form field definitions readable" ON public.form_field_definitions
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(),'form_management','view')
    OR public.has_permission(auth.uid(),'regulatory_data_model','view'));

CREATE POLICY "form domains readable" ON public.form_data_domains
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'form_management','view'));
CREATE POLICY "form lifecycle readable" ON public.form_lifecycle_applicability
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'form_management','view'));
CREATE POLICY "form packages readable" ON public.form_packages
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'form_management','view'));
CREATE POLICY "form package items readable" ON public.form_package_items
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'form_management','view'));
CREATE POLICY "form applicability readable" ON public.form_applicability_rules
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'form_management','view'));

CREATE POLICY "submission values readable by staff" ON public.form_submission_values
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(),'form_management','view')
    OR public.has_permission(auth.uid(),'application_management','view')
    OR EXISTS (SELECT 1 FROM public.form_responses r
                WHERE r.id = response_id AND r.user_id = auth.uid()));

CREATE POLICY "entity facts readable" ON public.entity_facts
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(),'entity_structure','view')
    OR public.has_permission(auth.uid(),'licensee_management','view')
    OR public.wb_entity_member(entity_id));

CREATE POLICY "application requirements readable" ON public.application_form_requirements
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(),'application_management','view')
    OR EXISTS (SELECT 1 FROM public.applications a
                WHERE a.id = application_id
                  AND (a.applicant_id = auth.uid() OR public.wb_entity_member(a.entity_id))));

CREATE POLICY "request types readable" ON public.regulatory_request_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "regulatory requests readable" ON public.regulatory_requests
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(),'regulatory_requests','view')
    OR public.wb_entity_member(entity_id));

CREATE POLICY "request requirements readable" ON public.regulatory_request_form_requirements
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(),'regulatory_requests','view')
    OR EXISTS (SELECT 1 FROM public.regulatory_requests rr
                WHERE rr.id = request_id AND public.wb_entity_member(rr.entity_id)));
