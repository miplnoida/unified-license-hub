
-- Entity Relationships
CREATE TABLE public.entity_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  related_entity_id uuid REFERENCES public.licensees(id) ON DELETE SET NULL,
  related_entity_name text NOT NULL,
  relationship_type text NOT NULL DEFAULT 'associate',
  ownership_percentage numeric,
  effective_date date,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.entity_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage entity relationships" ON public.entity_relationships FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated read entity relationships" ON public.entity_relationships FOR SELECT TO authenticated USING (true);

-- Enforcement Actions
CREATE TABLE public.enforcement_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  case_number text NOT NULL DEFAULT '',
  enforcement_type text NOT NULL DEFAULT 'warning',
  date_opened date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'open',
  penalty_amount numeric DEFAULT 0,
  resolution_date date,
  description text,
  findings text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.enforcement_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage enforcement actions" ON public.enforcement_actions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'));
CREATE POLICY "Authenticated read enforcement actions" ON public.enforcement_actions FOR SELECT TO authenticated USING (true);

-- Risk Ratings
CREATE TABLE public.risk_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  overall_rating text NOT NULL DEFAULT 'medium',
  risk_score numeric NOT NULL DEFAULT 50,
  assessment_date date NOT NULL DEFAULT CURRENT_DATE,
  assessor_id uuid,
  risk_factors jsonb DEFAULT '[]'::jsonb,
  mitigation_measures text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.risk_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage risk ratings" ON public.risk_ratings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'));
CREATE POLICY "Authenticated read risk ratings" ON public.risk_ratings FOR SELECT TO authenticated USING (true);

-- Inspections
CREATE TABLE public.inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  inspection_type text NOT NULL DEFAULT 'on-site',
  date_conducted date NOT NULL DEFAULT CURRENT_DATE,
  inspector_id uuid,
  inspector_name text,
  findings_summary text,
  compliance_rating text DEFAULT 'satisfactory',
  follow_up_actions text,
  report_url text,
  status text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage inspections" ON public.inspections FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'));
CREATE POLICY "Authenticated read inspections" ON public.inspections FOR SELECT TO authenticated USING (true);

-- Reinsurance Contracts
CREATE TABLE public.reinsurance_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  reinsurer_name text NOT NULL,
  contract_number text,
  coverage_type text NOT NULL DEFAULT 'proportional',
  coverage_amount numeric DEFAULT 0,
  premium_amount numeric DEFAULT 0,
  effective_from date,
  effective_to date,
  terms text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reinsurance_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage reinsurance contracts" ON public.reinsurance_contracts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated read reinsurance contracts" ON public.reinsurance_contracts FOR SELECT TO authenticated USING (true);
