
ALTER TABLE public.forms
ADD COLUMN IF NOT EXISTS description text DEFAULT '',
ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS parent_form_id uuid REFERENCES public.forms(id) ON DELETE SET NULL;
