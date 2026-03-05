
CREATE TABLE public.forms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  form_type TEXT NOT NULL CHECK (form_type IN ('pre_license', 'post_license')),
  category TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL DEFAULT '',
  sector TEXT NOT NULL DEFAULT '',
  sub_sector TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read forms
CREATE POLICY "Authenticated users can read forms"
  ON public.forms FOR SELECT TO authenticated
  USING (true);

-- Allow all authenticated users to manage forms (admin check can be added later)
CREATE POLICY "Authenticated users can insert forms"
  ON public.forms FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update forms"
  ON public.forms FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete forms"
  ON public.forms FOR DELETE TO authenticated
  USING (true);
