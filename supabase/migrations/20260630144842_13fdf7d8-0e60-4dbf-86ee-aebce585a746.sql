
-- 1. Mapping table: which internal form is required for which license action
CREATE TABLE public.license_action_form_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id UUID REFERENCES public.regulators(id) ON DELETE CASCADE,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE CASCADE,
  sub_sector_id UUID REFERENCES public.sub_sectors(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  license_action_type TEXT NOT NULL CHECK (license_action_type IN (
    'suspension','revocation','cancellation','reinstatement','status_change'
  )),
  form_template_id UUID NOT NULL REFERENCES public.form_templates(id) ON DELETE RESTRICT,
  is_required BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.license_action_form_configs TO authenticated;
GRANT ALL ON public.license_action_form_configs TO service_role;

ALTER TABLE public.license_action_form_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read license action form configs"
  ON public.license_action_form_configs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage license action form configs"
  ON public.license_action_form_configs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX idx_laf_configs_action_active
  ON public.license_action_form_configs(license_action_type, is_active);

CREATE OR REPLACE FUNCTION public.set_updated_at_laf_configs()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_laf_configs_updated_at
  BEFORE UPDATE ON public.license_action_form_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_laf_configs();

-- 2. Link submitted internal form to the license action row
ALTER TABLE public.license_actions
  ADD COLUMN IF NOT EXISTS form_response_id UUID,
  ADD COLUMN IF NOT EXISTS form_template_id UUID,
  ADD COLUMN IF NOT EXISTS form_version_id  UUID;

-- 3. Resolver: most-specific active config wins (category > sub_sector > sector > regulator > global)
CREATE OR REPLACE FUNCTION public.resolve_license_action_form(
  _action_type TEXT,
  _regulator_id UUID,
  _sector_id UUID,
  _sub_sector_id UUID,
  _category_id UUID
) RETURNS TABLE (
  id UUID,
  form_template_id UUID,
  is_required BOOLEAN,
  match_score INT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.form_template_id, c.is_required,
    ( (CASE WHEN c.category_id   IS NOT NULL AND c.category_id   = _category_id   THEN 8 ELSE 0 END)
    + (CASE WHEN c.sub_sector_id IS NOT NULL AND c.sub_sector_id = _sub_sector_id THEN 4 ELSE 0 END)
    + (CASE WHEN c.sector_id     IS NOT NULL AND c.sector_id     = _sector_id     THEN 2 ELSE 0 END)
    + (CASE WHEN c.regulator_id  IS NOT NULL AND c.regulator_id  = _regulator_id  THEN 1 ELSE 0 END)
    ) AS match_score
  FROM public.license_action_form_configs c
  WHERE c.is_active = true
    AND c.license_action_type = _action_type
    AND (c.category_id   IS NULL OR c.category_id   = _category_id)
    AND (c.sub_sector_id IS NULL OR c.sub_sector_id = _sub_sector_id)
    AND (c.sector_id     IS NULL OR c.sector_id     = _sector_id)
    AND (c.regulator_id  IS NULL OR c.regulator_id  = _regulator_id)
  ORDER BY match_score DESC, c.updated_at DESC
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.resolve_license_action_form(TEXT, UUID, UUID, UUID, UUID) TO authenticated, anon, service_role;

-- 4. Allow internal staff to read internal license-action form responses
CREATE POLICY "Internal staff read license_action form responses"
  ON public.form_responses FOR SELECT TO authenticated
  USING (
    entity_type = 'license_action' AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'supervisor')
      OR public.has_role(auth.uid(), 'analyst')
      OR public.has_role(auth.uid(), 'licensing_officer')
      OR public.has_role(auth.uid(), 'legal_compliance')
    )
  );
