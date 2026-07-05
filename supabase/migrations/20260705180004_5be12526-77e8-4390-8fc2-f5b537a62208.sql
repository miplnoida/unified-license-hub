
CREATE TABLE public.licensing_audit_determinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL CHECK (verdict IN ('approve','approve_with_conditions','refer','refuse')),
  rationale TEXT NOT NULL,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  risk_rating_id UUID REFERENCES public.risk_ratings(id) ON DELETE SET NULL,
  issued_by UUID NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.licensing_audit_determinations TO authenticated;
GRANT ALL ON public.licensing_audit_determinations TO service_role;
ALTER TABLE public.licensing_audit_determinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal staff read audit determinations"
ON public.licensing_audit_determinations FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.has_role(auth.uid(),'supervisor'::app_role)
  OR public.has_role(auth.uid(),'licensing_officer'::app_role)
  OR public.has_role(auth.uid(),'analyst'::app_role)
  OR public.has_role(auth.uid(),'legal_compliance'::app_role)
);

CREATE POLICY "Licensing staff write audit determinations"
ON public.licensing_audit_determinations FOR INSERT TO authenticated
WITH CHECK (
  issued_by = auth.uid() AND (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'super_admin'::app_role)
    OR public.has_role(auth.uid(),'supervisor'::app_role)
    OR public.has_role(auth.uid(),'licensing_officer'::app_role)
  )
);

CREATE POLICY "Licensing staff update audit determinations"
ON public.licensing_audit_determinations FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.has_role(auth.uid(),'supervisor'::app_role)
  OR public.has_role(auth.uid(),'licensing_officer'::app_role)
);

CREATE TABLE public.licensing_audit_risk_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  profile_score INTEGER NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('low','medium','high','critical')),
  key_drivers JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_by UUID NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.licensing_audit_risk_profiles TO authenticated;
GRANT ALL ON public.licensing_audit_risk_profiles TO service_role;
ALTER TABLE public.licensing_audit_risk_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal staff read audit risk profiles"
ON public.licensing_audit_risk_profiles FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.has_role(auth.uid(),'supervisor'::app_role)
  OR public.has_role(auth.uid(),'licensing_officer'::app_role)
  OR public.has_role(auth.uid(),'analyst'::app_role)
  OR public.has_role(auth.uid(),'legal_compliance'::app_role)
);

CREATE POLICY "Licensing staff write audit risk profiles"
ON public.licensing_audit_risk_profiles FOR INSERT TO authenticated
WITH CHECK (
  generated_by = auth.uid() AND (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'super_admin'::app_role)
    OR public.has_role(auth.uid(),'supervisor'::app_role)
    OR public.has_role(auth.uid(),'licensing_officer'::app_role)
  )
);

CREATE TRIGGER update_licensing_audit_determinations_updated_at
BEFORE UPDATE ON public.licensing_audit_determinations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER update_licensing_audit_risk_profiles_updated_at
BEFORE UPDATE ON public.licensing_audit_risk_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
