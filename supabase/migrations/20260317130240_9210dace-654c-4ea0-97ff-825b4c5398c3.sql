
-- Return Templates: groups multiple forms from one Excel workbook
CREATE TABLE public.return_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  source_file_name TEXT,
  sheet_count INTEGER NOT NULL DEFAULT 0,
  regulator_id UUID REFERENCES public.regulators(id),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.return_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage return templates" ON public.return_templates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone reads return templates" ON public.return_templates
  FOR SELECT TO authenticated
  USING (true);

-- Add return_template_id and sheet_name to form_templates
ALTER TABLE public.form_templates
  ADD COLUMN return_template_id UUID REFERENCES public.return_templates(id) ON DELETE SET NULL,
  ADD COLUMN sheet_name TEXT;

-- Form Field Dependencies: cross-sheet/form references
CREATE TABLE public.form_field_dependencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_form_id UUID NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
  source_field_id TEXT NOT NULL,
  dependent_form_id UUID NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
  dependent_field_id TEXT NOT NULL,
  formula_reference TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.form_field_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage field dependencies" ON public.form_field_dependencies
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone reads field dependencies" ON public.form_field_dependencies
  FOR SELECT TO authenticated
  USING (true);
