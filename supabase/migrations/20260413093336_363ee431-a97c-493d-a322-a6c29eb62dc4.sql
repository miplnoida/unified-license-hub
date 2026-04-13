ALTER TABLE public.registration_form_configs
ADD COLUMN form_schema jsonb NOT NULL DEFAULT '[]'::jsonb;