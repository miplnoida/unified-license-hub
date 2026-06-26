ALTER TABLE public.registration_form_configs
  ADD COLUMN IF NOT EXISTS form_schema_backup jsonb;

UPDATE public.registration_form_configs
SET form_schema_backup = form_schema
WHERE form_schema_backup IS NULL;