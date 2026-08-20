
-- ============ 29. ENTITY CHANGE SETS ============
CREATE TABLE public.entity_change_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_set_number text NOT NULL UNIQUE DEFAULT ('ECS-' || to_char(now(),'YYYY') || '-' || lpad((floor(random()*1000000))::text, 6, '0')),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE RESTRICT,
  origin_type text NOT NULL DEFAULT 'FORM_SUBMISSION'
    CHECK (origin_type IN ('FORM_SUBMISSION','REGULATORY_REQUEST','APPLICATION','DATA_CORRECTION','REGISTRY_SYNC')),
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  regulatory_request_id uuid REFERENCES public.regulatory_requests(id) ON DELETE SET NULL,
  source_submission_id uuid REFERENCES public.form_responses(id) ON DELETE SET NULL,
  source_form_version_id uuid REFERENCES public.form_versions(id) ON DELETE SET NULL,
  workflow_instance_id uuid,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','RECOMMENDED','APPROVED','REJECTED','APPLIED','SUPERSEDED','CANCELLED')),
  effective_date date,
  baseline_version integer NOT NULL DEFAULT 0,
  summary text,
  submitted_by uuid,
  submitted_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  applied_by uuid,
  applied_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_change_sets_entity ON public.entity_change_sets(entity_id, status);

CREATE TABLE public.entity_change_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_set_id uuid NOT NULL REFERENCES public.entity_change_sets(id) ON DELETE CASCADE,
  change_type text NOT NULL CHECK (change_type IN (
    'ENTITY_FACT','ORGANIZATION_NAME','CLASSIFICATION','RELATIONSHIP','OWNERSHIP','APPOINTMENT')),
  operation text NOT NULL DEFAULT 'UPSERT' CHECK (operation IN ('UPSERT','CLOSE','CORRECT')),
  data_concept_id uuid REFERENCES public.data_concepts(id) ON DELETE SET NULL,
  target_table text,
  target_record_id uuid,
  current_value jsonb,
  proposed_value jsonb NOT NULL,
  effective_from timestamptz,
  effective_to timestamptz,
  source_submission_id uuid REFERENCES public.form_responses(id) ON DELETE SET NULL,
  form_field_definition_id uuid REFERENCES public.form_field_definitions(id) ON DELETE SET NULL,
  apply_status text NOT NULL DEFAULT 'PENDING'
    CHECK (apply_status IN ('PENDING','APPLIED','SKIPPED','FAILED')),
  apply_error text,
  applied_record_id uuid,
  sequence integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_change_items_set ON public.entity_change_items(change_set_id);

ALTER TABLE public.entity_facts
  ADD CONSTRAINT entity_facts_change_set_fk FOREIGN KEY (source_change_set_id)
  REFERENCES public.entity_change_sets(id) ON DELETE SET NULL;
ALTER TABLE public.regulatory_requests
  ADD CONSTRAINT regulatory_requests_change_set_fk FOREIGN KEY (change_set_id)
  REFERENCES public.entity_change_sets(id) ON DELETE SET NULL;

-- ============ 22. ORGANIZATION NAME HISTORY ============
CREATE TABLE public.organization_names (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES public.organizations(party_id) ON DELETE CASCADE,
  name_type text NOT NULL DEFAULT 'LEGAL'
    CHECK (name_type IN ('LEGAL','FORMER_LEGAL','TRADING','OTHER')),
  name text NOT NULL,
  normalized_name text GENERATED ALWAYS AS (upper(regexp_replace(name, '[^A-Za-z0-9]', '', 'g'))) STORED,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  is_current boolean NOT NULL DEFAULT true,
  source_submission_id uuid REFERENCES public.form_responses(id) ON DELETE SET NULL,
  source_change_set_id uuid REFERENCES public.entity_change_sets(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_org_names_party ON public.organization_names(party_id, name_type);
CREATE INDEX idx_org_names_normalized ON public.organization_names(normalized_name);

-- seed current legal names as the first effective-dated record
INSERT INTO public.organization_names (party_id, name_type, name, effective_from, is_current)
SELECT o.party_id, 'LEGAL', o.legal_name, COALESCE(o.created_at, now()), true
  FROM public.organizations o
 WHERE COALESCE(o.legal_name,'') <> '';

-- ============ 23. PARTY RELATIONSHIPS ============
CREATE TABLE public.party_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE RESTRICT,
  target_party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE RESTRICT,
  relationship_type_id uuid NOT NULL REFERENCES public.relationship_types(id) ON DELETE RESTRICT,
  entity_id uuid REFERENCES public.licensees(id) ON DELETE SET NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PROPOSED','ACTIVE','ENDED','REJECTED')),
  notes text,
  source_submission_id uuid REFERENCES public.form_responses(id) ON DELETE SET NULL,
  source_form_version_id uuid REFERENCES public.form_versions(id) ON DELETE SET NULL,
  source_change_set_id uuid REFERENCES public.entity_change_sets(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_party_id <> target_party_id)
);
CREATE INDEX idx_party_rel_source ON public.party_relationships(source_party_id);
CREATE INDEX idx_party_rel_entity ON public.party_relationships(entity_id);

-- ============ 24/25/26. OWNERSHIP ============
CREATE TABLE public.ownership_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  is_direct_default boolean NOT NULL DEFAULT true,
  confers_control boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.share_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES public.licensees(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  votes_per_share numeric NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, key)
);

CREATE TABLE public.ownership_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE RESTRICT,
  owned_entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE RESTRICT,
  ownership_type_id uuid REFERENCES public.ownership_types(id) ON DELETE RESTRICT,
  share_class_id uuid REFERENCES public.share_classes(id) ON DELETE SET NULL,
  shares_held numeric,
  total_shares numeric,
  economic_interest_percentage numeric CHECK (economic_interest_percentage IS NULL OR (economic_interest_percentage >= 0 AND economic_interest_percentage <= 100)),
  voting_rights_percentage numeric CHECK (voting_rights_percentage IS NULL OR (voting_rights_percentage >= 0 AND voting_rights_percentage <= 100)),
  beneficial_interest_percentage numeric CHECK (beneficial_interest_percentage IS NULL OR (beneficial_interest_percentage >= 0 AND beneficial_interest_percentage <= 100)),
  is_direct boolean NOT NULL DEFAULT true,
  is_controller boolean NOT NULL DEFAULT false,
  is_ubo boolean NOT NULL DEFAULT false,
  control_determination text CHECK (control_determination IS NULL OR control_determination IN ('VERIFIED','DERIVED','NOT_ASSESSED')),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  approval_status text NOT NULL DEFAULT 'APPROVED'
    CHECK (approval_status IN ('PROPOSED','APPROVED','REJECTED','SUPERSEDED')),
  approved_by uuid,
  approved_at timestamptz,
  verified_by uuid,
  verified_at timestamptz,
  source_submission_id uuid REFERENCES public.form_responses(id) ON DELETE SET NULL,
  source_form_version_id uuid REFERENCES public.form_versions(id) ON DELETE SET NULL,
  source_change_set_id uuid REFERENCES public.entity_change_sets(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ownership_entity ON public.ownership_interests(owned_entity_id, effective_to);
CREATE INDEX idx_ownership_owner ON public.ownership_interests(owner_party_id);

-- ============ 27. GOVERNANCE / APPOINTMENTS ============
CREATE TABLE public.entity_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE RESTRICT,
  person_party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE RESTRICT,
  role_type_id uuid NOT NULL REFERENCES public.role_types(id) ON DELETE RESTRICT,
  appointment_date date,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  is_executive boolean,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('PROPOSED','ACTIVE','ENDED','WITHDRAWN','REJECTED')),
  regulatory_approval_status text NOT NULL DEFAULT 'NOT_REQUIRED'
    CHECK (regulatory_approval_status IN ('NOT_REQUIRED','PENDING','APPROVED','REJECTED','WITHDRAWN')),
  fp_individual_id uuid REFERENCES public.fp_individuals(id) ON DELETE SET NULL,
  source_submission_id uuid REFERENCES public.form_responses(id) ON DELETE SET NULL,
  source_form_version_id uuid REFERENCES public.form_versions(id) ON DELETE SET NULL,
  source_change_set_id uuid REFERENCES public.entity_change_sets(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_appointments_entity ON public.entity_appointments(entity_id, effective_to);
CREATE INDEX idx_appointments_person ON public.entity_appointments(person_party_id);

-- ============ 20. PERSON FOUNDATION MAPPING ============
CREATE TABLE public.fp_individual_party_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fp_individual_id uuid NOT NULL UNIQUE REFERENCES public.fp_individuals(id) ON DELETE CASCADE,
  person_party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE RESTRICT,
  match_method text NOT NULL CHECK (match_method IN ('NATIONAL_ID','PASSPORT','USER_ACCOUNT','MANUAL')),
  match_confidence text NOT NULL DEFAULT 'DETERMINISTIC'
    CHECK (match_confidence IN ('DETERMINISTIC','MANUAL')),
  linked_by uuid,
  linked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ seeds (configuration, not code) ============
INSERT INTO public.ownership_types (key,label,description,is_direct_default,confers_control,sort_order,is_system)
VALUES
 ('DIRECT_SHAREHOLDING','Direct shareholding','Legal shareholding held directly in the entity',true,false,10,true),
 ('INDIRECT_SHAREHOLDING','Indirect shareholding','Shareholding held through one or more intermediaries',false,false,20,true),
 ('BENEFICIAL_INTEREST','Beneficial interest','Ultimate economic benefit irrespective of legal title',false,true,30,true),
 ('VOTING_CONTROL','Voting control','Control of voting rights, including by agreement',true,true,40,true),
 ('TRUST_INTEREST','Trust interest','Interest held via a trust arrangement',false,true,50,true)
ON CONFLICT (key) DO NOTHING;

-- ============ grants + RLS ============
DO $g$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['entity_change_sets','entity_change_items','organization_names',
    'party_relationships','ownership_types','share_classes','ownership_interests',
    'entity_appointments','fp_individual_party_links']
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $g$;

CREATE POLICY "change sets readable" ON public.entity_change_sets
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(),'entity_structure','view')
    OR public.wb_entity_member(entity_id));
CREATE POLICY "change items readable" ON public.entity_change_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.entity_change_sets cs WHERE cs.id = change_set_id
             AND (public.has_permission(auth.uid(),'entity_structure','view')
                  OR public.wb_entity_member(cs.entity_id))));

CREATE POLICY "organization names readable" ON public.organization_names
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(),'entity_structure','view')
    OR public.has_permission(auth.uid(),'licensee_management','view')
    OR EXISTS (SELECT 1 FROM public.licensees l WHERE l.party_id = organization_names.party_id
                AND public.wb_entity_member(l.id)));

CREATE POLICY "party relationships readable" ON public.party_relationships
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(),'entity_structure','view')
    OR (entity_id IS NOT NULL AND public.wb_entity_member(entity_id)));

CREATE POLICY "ownership types readable" ON public.ownership_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "share classes readable" ON public.share_classes
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(),'entity_structure','view')
    OR (entity_id IS NOT NULL AND public.wb_entity_member(entity_id)));

CREATE POLICY "ownership readable" ON public.ownership_interests
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(),'entity_structure','view')
    OR public.wb_entity_member(owned_entity_id));

CREATE POLICY "appointments readable" ON public.entity_appointments
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(),'entity_structure','view')
    OR public.has_permission(auth.uid(),'fit_and_proper','view')
    OR public.wb_entity_member(entity_id));

CREATE POLICY "fp person links readable" ON public.fp_individual_party_links
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(),'fit_and_proper','view')
    OR public.has_permission(auth.uid(),'entity_structure','view'));

-- 21. Person identity (name only) visible to those who supervise or represent an
-- entity where the person holds an appointment. Confidential F&P evidence keeps
-- its own restrictive policies elsewhere.
CREATE POLICY "person identity via appointment context" ON public.persons
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(),'entity_structure','view')
    OR EXISTS (SELECT 1 FROM public.entity_appointments a
                WHERE a.person_party_id = persons.party_id
                  AND public.wb_entity_member(a.entity_id)));

CREATE POLICY "party identity via appointment context" ON public.parties
  FOR SELECT TO authenticated USING (
    public.has_permission(auth.uid(),'entity_structure','view')
    OR EXISTS (SELECT 1 FROM public.entity_appointments a
                WHERE a.person_party_id = parties.id
                  AND public.wb_entity_member(a.entity_id))
    OR EXISTS (SELECT 1 FROM public.ownership_interests o
                WHERE o.owner_party_id = parties.id
                  AND public.wb_entity_member(o.owned_entity_id)));
