ALTER TABLE public.registration_form_configs
  ADD COLUMN IF NOT EXISTS documents_section_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS declarations_section_visible boolean NOT NULL DEFAULT true;