
ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS tab_name text;
ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS form_order integer NOT NULL DEFAULT 0;
