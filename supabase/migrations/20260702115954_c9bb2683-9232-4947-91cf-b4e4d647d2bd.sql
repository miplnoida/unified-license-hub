
CREATE TABLE public.license_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  due_date DATE,
  monitoring_owner TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','satisfied','waived','overdue')),
  satisfied_at TIMESTAMPTZ,
  satisfied_by UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_license_conditions_license ON public.license_conditions(license_id);
CREATE INDEX idx_license_conditions_status ON public.license_conditions(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.license_conditions TO authenticated;
GRANT ALL ON public.license_conditions TO service_role;

ALTER TABLE public.license_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal can manage license conditions"
  ON public.license_conditions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','supervisor','licensing_officer','analyst')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','supervisor','licensing_officer','analyst')
    )
  );

CREATE POLICY "Holder can view own license conditions"
  ON public.license_conditions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.licenses l
      WHERE l.id = license_conditions.license_id
        AND l.holder_id = auth.uid()
    )
  );

CREATE TRIGGER trg_license_conditions_updated_at
  BEFORE UPDATE ON public.license_conditions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
