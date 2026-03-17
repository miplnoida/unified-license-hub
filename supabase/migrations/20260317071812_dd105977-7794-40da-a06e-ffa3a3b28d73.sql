
-- 1. Create regulators table
CREATE TABLE public.regulators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  description text,
  logo_url text,
  status text NOT NULL DEFAULT 'active',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.regulators ENABLE ROW LEVEL SECURITY;

-- Public read (all authenticated users can see regulators)
CREATE POLICY "Authenticated users can read regulators"
  ON public.regulators FOR SELECT TO authenticated
  USING (true);

-- Admins manage regulators
CREATE POLICY "Admins manage regulators"
  ON public.regulators FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- 3. Add regulator_id to sectors
ALTER TABLE public.sectors ADD COLUMN regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE;

-- 4. Add regulator_id to forms
ALTER TABLE public.forms ADD COLUMN regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE;

-- 5. Add regulator_id to fee_configurations
ALTER TABLE public.fee_configurations ADD COLUMN regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE;

-- 6. Add regulator_id to approval_workflows
ALTER TABLE public.approval_workflows ADD COLUMN regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE;

-- 7. Add regulator_id to return_configurations
ALTER TABLE public.return_configurations ADD COLUMN regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE;

-- 8. Add regulator_id to applications
ALTER TABLE public.applications ADD COLUMN regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE;

-- 9. Add regulator_id to licenses
ALTER TABLE public.licenses ADD COLUMN regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE;

-- 10. Add regulator_id to complaints
ALTER TABLE public.complaints ADD COLUMN regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE;

-- 11. Create indexes for performance
CREATE INDEX idx_sectors_regulator ON public.sectors(regulator_id);
CREATE INDEX idx_forms_regulator ON public.forms(regulator_id);
CREATE INDEX idx_fee_configurations_regulator ON public.fee_configurations(regulator_id);
CREATE INDEX idx_approval_workflows_regulator ON public.approval_workflows(regulator_id);
CREATE INDEX idx_return_configurations_regulator ON public.return_configurations(regulator_id);
CREATE INDEX idx_applications_regulator ON public.applications(regulator_id);
CREATE INDEX idx_licenses_regulator ON public.licenses(regulator_id);
CREATE INDEX idx_complaints_regulator ON public.complaints(regulator_id);
