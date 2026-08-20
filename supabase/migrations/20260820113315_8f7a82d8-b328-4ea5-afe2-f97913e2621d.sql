
-- ============================================================
-- WAVE D — canonical supervisory additive layer
-- ============================================================

-- 1. Supervision ownership -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entity_supervision_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE RESTRICT,
  supervisor_id uuid,
  supervisor_name text,
  team text,
  supervisory_cycle text,
  cycle_start date,
  cycle_end date,
  status text NOT NULL DEFAULT 'active',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. AML / CFT -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.aml_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE RESTRICT,
  reference text NOT NULL UNIQUE,
  assessment_date date NOT NULL,
  inherent_rating text,
  control_rating text,
  residual_rating text,
  status text NOT NULL DEFAULT 'draft',
  summary text,
  confidential_notes text,
  inspection_status text,
  approved_by uuid,
  approved_at timestamptz,
  next_review_date date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aml_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aml_assessment_id uuid REFERENCES public.aml_assessments(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE RESTRICT,
  reference text NOT NULL UNIQUE,
  severity text NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  detail text,
  status text NOT NULL DEFAULT 'open',
  remediation_due date,
  remediation_status text,
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Operational resilience ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.resilience_arrangements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE RESTRICT,
  arrangement_type text NOT NULL,
  provider_party_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  provider_name text,
  service_description text,
  criticality text,
  status text NOT NULL DEFAULT 'active',
  effective_from date,
  effective_to date,
  last_assessed_at timestamptz,
  assessment_state text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resilience_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE RESTRICT,
  reference text NOT NULL UNIQUE,
  incident_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  occurred_at timestamptz NOT NULL,
  reported_at timestamptz,
  resolved_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  summary text,
  remediation_status text,
  arrangement_id uuid REFERENCES public.resilience_arrangements(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes (query patterns: entity-scoped reads, timeline ordering)
CREATE INDEX IF NOT EXISTS idx_esa_entity ON public.entity_supervision_assignments(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_aml_assess_entity ON public.aml_assessments(entity_id, assessment_date DESC);
CREATE INDEX IF NOT EXISTS idx_aml_find_entity ON public.aml_findings(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_res_arr_entity ON public.resilience_arrangements(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_res_inc_entity ON public.resilience_incidents(entity_id, occurred_at DESC);

-- Grants ------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_supervision_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aml_assessments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aml_findings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resilience_arrangements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resilience_incidents TO authenticated;
GRANT ALL ON public.entity_supervision_assignments TO service_role;
GRANT ALL ON public.aml_assessments TO service_role;
GRANT ALL ON public.aml_findings TO service_role;
GRANT ALL ON public.resilience_arrangements TO service_role;
GRANT ALL ON public.resilience_incidents TO service_role;

ALTER TABLE public.entity_supervision_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aml_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aml_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resilience_arrangements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resilience_incidents ENABLE ROW LEVEL SECURITY;

-- Modules + permissions ---------------------------------------------------
INSERT INTO public.sec_modules (key, label, description, module_type, audience, sort_order, is_system)
VALUES
  ('aml_supervision', 'AML/CFT Supervision', 'Anti-money-laundering and counter-terrorist-financing supervision', 'business', 'internal', 320, true),
  ('operational_resilience', 'Operational Resilience', 'Outsourcing, critical providers, operational and cyber incidents', 'business', 'internal', 330, true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.sec_permissions (module_id, key, label, is_sensitive, is_system)
SELECT m.id, p.key, p.label, p.sensitive, true
FROM public.sec_modules m
CROSS JOIN (VALUES
  ('view', 'View', false),
  ('view_confidential', 'View confidential material', true),
  ('edit', 'Edit', false),
  ('approve', 'Approve', false)
) AS p(key, label, sensitive)
WHERE m.key IN ('aml_supervision', 'operational_resilience')
ON CONFLICT DO NOTHING;

-- Seed role grants: mirror existing supervisory reach
INSERT INTO public.sec_role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, np.id
FROM public.sec_role_permissions rp
JOIN public.sec_permissions ep ON ep.id = rp.permission_id
JOIN public.sec_modules em ON em.id = ep.module_id
JOIN public.sec_permissions np ON np.key = ep.key
JOIN public.sec_modules nm ON nm.id = np.module_id
WHERE ep.key IN ('view', 'edit', 'approve')
  AND (
    (em.key = 'market_conduct' AND nm.key = 'aml_supervision')
    OR (em.key = 'prudential_supervision' AND nm.key = 'operational_resilience')
  )
ON CONFLICT DO NOTHING;

-- Policies ----------------------------------------------------------------
CREATE POLICY esa_read ON public.entity_supervision_assignments FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'prudential_supervision', 'view')
  OR public.has_permission(auth.uid(), 'market_conduct', 'view')
  OR public.has_permission(auth.uid(), 'licensee_management', 'view')
);
CREATE POLICY esa_write ON public.entity_supervision_assignments FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'prudential_supervision', 'edit'))
WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'prudential_supervision', 'edit'));

CREATE POLICY aml_assess_read ON public.aml_assessments FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'aml_supervision', 'view'));
CREATE POLICY aml_assess_write ON public.aml_assessments FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'aml_supervision', 'edit'))
WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'aml_supervision', 'edit'));

CREATE POLICY aml_find_read ON public.aml_findings FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'aml_supervision', 'view'));
CREATE POLICY aml_find_write ON public.aml_findings FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'aml_supervision', 'edit'))
WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'aml_supervision', 'edit'));

CREATE POLICY res_arr_read ON public.resilience_arrangements FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'operational_resilience', 'view')
  OR public.has_permission(auth.uid(), 'prudential_supervision', 'view')
);
CREATE POLICY res_arr_write ON public.resilience_arrangements FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'operational_resilience', 'edit'))
WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'operational_resilience', 'edit'));

CREATE POLICY res_inc_read ON public.resilience_incidents FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), 'operational_resilience', 'view')
  OR public.has_permission(auth.uid(), 'prudential_supervision', 'view')
);
CREATE POLICY res_inc_write ON public.resilience_incidents FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'operational_resilience', 'edit'))
WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'operational_resilience', 'edit'));

-- updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['entity_supervision_assignments','aml_assessments','aml_findings','resilience_arrangements','resilience_incidents']
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$s;
       CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$s
       FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();', t);
  END LOOP;
END $$;
