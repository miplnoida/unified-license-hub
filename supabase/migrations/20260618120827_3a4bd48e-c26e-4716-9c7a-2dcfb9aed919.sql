ALTER TABLE public.fee_configurations
  ADD COLUMN IF NOT EXISTS form_id uuid NULL REFERENCES public.form_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fee_configurations_form_id ON public.fee_configurations(form_id);