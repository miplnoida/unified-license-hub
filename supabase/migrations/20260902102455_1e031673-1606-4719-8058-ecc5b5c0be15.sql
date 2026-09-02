-- =====================================================================
-- DMS Phase 1 — canonical schema (additive only)
-- =====================================================================

CREATE SEQUENCE IF NOT EXISTS public.dms_document_reference_seq;

CREATE OR REPLACE FUNCTION public.dms_next_document_reference()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'DOC-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.dms_document_reference_seq')::text, 6, '0');
$$;

-- ---------------------------------------------------------------- retention
CREATE TABLE IF NOT EXISTS public.document_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  retention_years integer,
  retention_trigger text NOT NULL DEFAULT 'document_date',
  disposition_action text NOT NULL DEFAULT 'review',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.document_retention_policies TO authenticated;
GRANT ALL ON public.document_retention_policies TO service_role;
ALTER TABLE public.document_retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_retention_policies_read
  ON public.document_retention_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY document_retention_policies_admin_write
  ON public.document_retention_policies FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- --------------------------------------------------------------- categories
CREATE TABLE IF NOT EXISTS public.document_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  parent_id uuid REFERENCES public.document_categories(id) ON DELETE SET NULL,
  domain text,
  default_confidentiality text NOT NULL DEFAULT 'entity',
  default_publication_eligibility text NOT NULL DEFAULT 'not_publishable',
  default_retention_policy_id uuid REFERENCES public.document_retention_policies(id) ON DELETE SET NULL,
  requires_verification boolean NOT NULL DEFAULT false,
  requires_acceptance boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_categories_conf_chk CHECK (default_confidentiality IN
    ('public','entity','regulator_internal','restricted','confidential','legal_privileged')),
  CONSTRAINT document_categories_pub_chk CHECK (default_publication_eligibility IN
    ('not_publishable','public_eligible'))
);

GRANT SELECT ON public.document_categories TO authenticated;
GRANT ALL ON public.document_categories TO service_role;
ALTER TABLE public.document_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_categories_read
  ON public.document_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY document_categories_admin_write
  ON public.document_categories FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- -------------------------------------------------------------------- types
CREATE TABLE IF NOT EXISTS public.document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.document_categories(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  default_confidentiality text,
  default_publication_eligibility text,
  default_retention_policy_id uuid REFERENCES public.document_retention_policies(id) ON DELETE SET NULL,
  metadata_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  requires_verification boolean,
  requires_acceptance boolean,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_types_conf_chk CHECK (default_confidentiality IS NULL OR default_confidentiality IN
    ('public','entity','regulator_internal','restricted','confidential','legal_privileged')),
  CONSTRAINT document_types_pub_chk CHECK (default_publication_eligibility IS NULL OR default_publication_eligibility IN
    ('not_publishable','public_eligible'))
);

GRANT SELECT ON public.document_types TO authenticated;
GRANT ALL ON public.document_types TO service_role;
ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_types_read
  ON public.document_types FOR SELECT TO authenticated USING (true);
CREATE POLICY document_types_admin_write
  ON public.document_types FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ------------------------------------------------------------ document_groups
ALTER TABLE public.document_groups
  ADD COLUMN IF NOT EXISTS document_reference text,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.document_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS document_type_id uuid REFERENCES public.document_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primary_entity_id uuid,
  ADD COLUMN IF NOT EXISTS owner_type text,
  ADD COLUMN IF NOT EXISTS owner_party_id uuid,
  ADD COLUMN IF NOT EXISTS sector_id uuid,
  ADD COLUMN IF NOT EXISTS license_id uuid,
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS source_record_type text,
  ADD COLUMN IF NOT EXISTS source_record_id text,
  ADD COLUMN IF NOT EXISTS source_reference text,
  ADD COLUMN IF NOT EXISTS document_status text,
  ADD COLUMN IF NOT EXISTS verification_status text,
  ADD COLUMN IF NOT EXISTS acceptance_status text,
  ADD COLUMN IF NOT EXISTS confidentiality_classification text,
  ADD COLUMN IF NOT EXISTS publication_eligibility text,
  ADD COLUMN IF NOT EXISTS publication_status text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_by uuid,
  ADD COLUMN IF NOT EXISTS document_date date,
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS effective_until date,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS reporting_period_start date,
  ADD COLUMN IF NOT EXISTS reporting_period_end date,
  ADD COLUMN IF NOT EXISTS retention_policy_id uuid REFERENCES public.document_retention_policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retention_start_date date,
  ADD COLUMN IF NOT EXISTS retention_until date,
  ADD COLUMN IF NOT EXISTS disposition_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS legal_hold_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS classification_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- ---------------------------------------------------------- document_versions
ALTER TABLE public.document_versions
  ADD COLUMN IF NOT EXISTS version_status text,
  ADD COLUMN IF NOT EXISTS effective_from timestamptz,
  ADD COLUMN IF NOT EXISTS effective_until timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

-- ---------------------------------------------------------------- seed master
INSERT INTO public.document_retention_policies (code, name, description, retention_years, retention_trigger, disposition_action, sort_order)
VALUES
  ('default_review','Default review','Reviewed manually before any disposal.',NULL,'document_date','review',10),
  ('regulatory_7y','Regulatory record — 7 years','Standard regulatory retention.',7,'document_date','review',20),
  ('financial_10y','Financial record — 10 years','Financial and audited records.',10,'reporting_period_end','review',30),
  ('permanent','Permanent','Never disposed.',NULL,'document_date','retain_permanently',40)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.document_categories
  (code, name, domain, default_confidentiality, default_publication_eligibility, requires_verification, requires_acceptance, sort_order)
VALUES
  ('corporate_registration','Corporate & Registration','registration','entity','not_publishable',true,true,10),
  ('licensing','Licensing','licensing','entity','not_publishable',true,true,20),
  ('licence_certificates','Licence Certificates','licensing','entity','public_eligible',false,false,30),
  ('fit_and_proper','Fit & Proper','fit_and_proper','confidential','not_publishable',true,true,40),
  ('returns','Returns','returns','entity','not_publishable',true,true,50),
  ('prudential_supervision','Prudential Supervision','prudential','regulator_internal','not_publishable',false,false,60),
  ('market_conduct','Market Conduct','conduct','regulator_internal','not_publishable',false,false,70),
  ('complaints','Complaints','complaints','restricted','not_publishable',false,false,80),
  ('enforcement','Enforcement','enforcement','legal_privileged','not_publishable',false,false,90),
  ('correspondence','Correspondence','correspondence','entity','not_publishable',false,false,100),
  ('regulatory_decisions','Regulatory Decisions','licensing','entity','public_eligible',false,false,110),
  ('financial_payment','Financial / Payment','payments','entity','not_publishable',false,false,120),
  ('internal_regulatory','Internal Regulatory','internal','regulator_internal','not_publishable',false,false,130),
  ('public_notices','Public Notices','public','public','public_eligible',false,false,140),
  ('other','Other',NULL,'entity','not_publishable',false,false,150)
ON CONFLICT (code) DO NOTHING;

UPDATE public.document_categories c
   SET default_retention_policy_id = p.id
  FROM public.document_retention_policies p
 WHERE p.code = 'regulatory_7y' AND c.default_retention_policy_id IS NULL;

INSERT INTO public.document_types (category_id, code, name, sort_order)
SELECT c.id, t.code, t.name, t.sort_order
  FROM (VALUES
    ('other','general_document','General Document',10),
    ('corporate_registration','certificate_of_incorporation','Certificate of Incorporation',20),
    ('corporate_registration','constitutional_documents','Constitutional Documents',30),
    ('licensing','application_supporting_document','Application Supporting Document',40),
    ('licence_certificates','licence_certificate','Licence Certificate',50),
    ('returns','audited_financial_statements','Audited Financial Statements',60)
  ) AS t(category_code, code, name, sort_order)
  JOIN public.document_categories c ON c.code = t.category_code
ON CONFLICT (code) DO NOTHING;

-- -------------------------------------------------------------------- backfill
UPDATE public.document_groups g
   SET document_reference = COALESCE(g.document_reference, public.dms_next_document_reference()),
       category_id = COALESCE(g.category_id, (SELECT id FROM public.document_categories WHERE code = 'other')),
       confidentiality_classification = COALESCE(g.confidentiality_classification, 'entity'),
       publication_eligibility = COALESCE(g.publication_eligibility, 'not_publishable'),
       publication_status = COALESCE(g.publication_status, 'not_requested'),
       verification_status = COALESCE(g.verification_status, 'not_required'),
       acceptance_status = COALESCE(g.acceptance_status, 'not_required'),
       document_status = COALESCE(
         g.document_status,
         CASE
           WHEN g.is_deleted THEN 'archived'
           WHEN g.status IN ('active','current') THEN 'available'
           WHEN g.status = 'archived' THEN 'archived'
           ELSE 'available'
         END),
       owner_type = COALESCE(g.owner_type, 'entity'),
       source_module = COALESCE(g.source_module, g.entity_type),
       source_record_type = COALESCE(g.source_record_type, g.entity_type),
       source_record_id = COALESCE(g.source_record_id, g.entity_id),
       created_by = COALESCE(g.created_by, g.owner_id),
       updated_by = COALESCE(g.updated_by, g.owner_id);

UPDATE public.document_versions v
   SET version_status = COALESCE(
         v.version_status,
         CASE WHEN v.is_deleted THEN 'deleted'
              WHEN g.current_version_id = v.id THEN 'current'
              ELSE 'superseded' END)
  FROM public.document_groups g
 WHERE g.id = v.group_id;

-- ------------------------------------------------------------------ constraints
ALTER TABLE public.document_groups
  ALTER COLUMN document_reference SET DEFAULT public.dms_next_document_reference(),
  ALTER COLUMN confidentiality_classification SET DEFAULT 'entity',
  ALTER COLUMN publication_eligibility SET DEFAULT 'not_publishable',
  ALTER COLUMN publication_status SET DEFAULT 'not_requested',
  ALTER COLUMN verification_status SET DEFAULT 'not_required',
  ALTER COLUMN acceptance_status SET DEFAULT 'not_required',
  ALTER COLUMN document_status SET DEFAULT 'available';

CREATE UNIQUE INDEX IF NOT EXISTS document_groups_document_reference_key
  ON public.document_groups (document_reference);
CREATE INDEX IF NOT EXISTS document_groups_primary_entity_idx
  ON public.document_groups (primary_entity_id) WHERE primary_entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS document_groups_category_idx ON public.document_groups (category_id);
CREATE INDEX IF NOT EXISTS document_groups_source_record_idx
  ON public.document_groups (source_record_type, source_record_id);

ALTER TABLE public.document_groups
  ADD CONSTRAINT document_groups_confidentiality_chk CHECK (
    confidentiality_classification IS NULL OR confidentiality_classification IN
    ('public','entity','regulator_internal','restricted','confidential','legal_privileged')),
  ADD CONSTRAINT document_groups_pub_eligibility_chk CHECK (
    publication_eligibility IS NULL OR publication_eligibility IN ('not_publishable','public_eligible')),
  ADD CONSTRAINT document_groups_pub_status_chk CHECK (
    publication_status IS NULL OR publication_status IN
    ('not_requested','draft','pending_approval','approved','published','rejected','withdrawn')),
  ADD CONSTRAINT document_groups_doc_status_chk CHECK (
    document_status IS NULL OR document_status IN
    ('draft','uploaded','pending_scan','available','pending_verification','verified','accepted',
     'superseded','archived','rejected','quarantined','expired','withdrawn','on_hold')),
  ADD CONSTRAINT document_groups_verification_chk CHECK (
    verification_status IS NULL OR verification_status IN ('not_required','pending','verified','rejected')),
  ADD CONSTRAINT document_groups_acceptance_chk CHECK (
    acceptance_status IS NULL OR acceptance_status IN
    ('not_required','pending','accepted','conditionally_accepted','rejected')),
  ADD CONSTRAINT document_groups_owner_type_chk CHECK (
    owner_type IS NULL OR owner_type IN ('entity','person','regulator','case')),
  ADD CONSTRAINT document_groups_disposition_chk CHECK (
    disposition_status IN ('active','due_for_review','pending_disposal','disposed')),
  ADD CONSTRAINT document_groups_hold_chk CHECK (
    legal_hold_status IN ('none','on_hold','released'));

ALTER TABLE public.document_versions
  ADD CONSTRAINT document_versions_version_status_chk CHECK (
    version_status IS NULL OR version_status IN ('draft','current','superseded','deleted','withdrawn'));

-- ------------------------------------------------------------- relationships
CREATE TABLE IF NOT EXISTS public.document_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_group_id uuid NOT NULL REFERENCES public.document_groups(id) ON DELETE CASCADE,
  relationship_type text NOT NULL DEFAULT 'attached_to',
  target_type text NOT NULL,
  target_id text NOT NULL,
  target_reference text,
  is_primary boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_relationships_unique UNIQUE (document_group_id, target_type, target_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS document_relationships_target_idx
  ON public.document_relationships (target_type, target_id);

GRANT SELECT ON public.document_relationships TO authenticated;
GRANT ALL ON public.document_relationships TO service_role;
ALTER TABLE public.document_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_relationships_select_via_group
  ON public.document_relationships FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.document_groups g
     WHERE g.id = document_relationships.document_group_id
       AND (g.owner_id = auth.uid() OR public.is_doc_staff(auth.uid()))));

CREATE POLICY document_relationships_staff_write
  ON public.document_relationships FOR ALL TO authenticated
  USING (public.is_doc_staff(auth.uid()))
  WITH CHECK (public.is_doc_staff(auth.uid()));

-- -------------------------------------------------------------------- holds
CREATE TABLE IF NOT EXISTS public.document_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_group_id uuid NOT NULL REFERENCES public.document_groups(id) ON DELETE CASCADE,
  reason text NOT NULL,
  reference text,
  status text NOT NULL DEFAULT 'active',
  placed_by uuid,
  placed_at timestamptz NOT NULL DEFAULT now(),
  released_by uuid,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_holds_status_chk CHECK (status IN ('active','released'))
);

CREATE INDEX IF NOT EXISTS document_holds_group_idx ON public.document_holds (document_group_id);

GRANT SELECT ON public.document_holds TO authenticated;
GRANT ALL ON public.document_holds TO service_role;
ALTER TABLE public.document_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_holds_staff_read
  ON public.document_holds FOR SELECT TO authenticated
  USING (public.is_doc_staff(auth.uid()));
CREATE POLICY document_holds_staff_write
  ON public.document_holds FOR ALL TO authenticated
  USING (public.is_doc_staff(auth.uid()))
  WITH CHECK (public.is_doc_staff(auth.uid()));

-- --------------------------------------------------------- updated_at triggers
CREATE TRIGGER trg_document_categories_updated_at
  BEFORE UPDATE ON public.document_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_document_types_updated_at
  BEFORE UPDATE ON public.document_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_document_retention_policies_updated_at
  BEFORE UPDATE ON public.document_retention_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_document_holds_updated_at
  BEFORE UPDATE ON public.document_holds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
