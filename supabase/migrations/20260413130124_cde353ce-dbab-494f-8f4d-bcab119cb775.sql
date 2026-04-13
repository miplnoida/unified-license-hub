
-- Fee Types master table
CREATE TABLE public.fee_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fee_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage fee types"
  ON public.fee_types FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read fee types"
  ON public.fee_types FOR SELECT TO authenticated
  USING (true);

-- Fee Components table (multiple fees per application)
CREATE TABLE public.fee_components (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  fee_type_id UUID NOT NULL REFERENCES public.fee_types(id),
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fee_components ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_fee_components_application ON public.fee_components(application_id);

CREATE POLICY "Admins manage fee components"
  ON public.fee_components FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Applicants read own fee components"
  ON public.fee_components FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = fee_components.application_id AND a.applicant_id = auth.uid()
    )
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
  );

CREATE POLICY "Applicants insert own fee components"
  ON public.fee_components FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = fee_components.application_id AND a.applicant_id = auth.uid()
    )
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Applicants update own fee components"
  ON public.fee_components FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = fee_components.application_id AND a.applicant_id = auth.uid()
    )
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Applicants delete own fee components"
  ON public.fee_components FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = fee_components.application_id AND a.applicant_id = auth.uid()
    )
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );
