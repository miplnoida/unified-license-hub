
-- form_templates: master form definition
CREATE TABLE public.form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  form_type text NOT NULL DEFAULT 'pre_license',
  sector text NOT NULL DEFAULT '',
  sub_sector text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  service text NOT NULL DEFAULT '',
  regulator_id uuid REFERENCES public.regulators(id),
  is_reusable boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- form_versions: version history
CREATE TABLE public.form_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  schema_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_by uuid,
  change_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id, version)
);

-- form_fields: normalized field definitions
CREATE TABLE public.form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.form_versions(id) ON DELETE CASCADE,
  section_id text NOT NULL,
  section_title text NOT NULL DEFAULT 'Section 1',
  section_order integer NOT NULL DEFAULT 0,
  section_description text,
  section_is_repeatable boolean NOT NULL DEFAULT false,
  field_type text NOT NULL DEFAULT 'text',
  label text NOT NULL,
  field_name text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  placeholder text,
  help_text text,
  default_value text,
  options jsonb,
  validation jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  content text,
  table_columns jsonb,
  calculated_expression text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- field_conditions: conditional logic rules
CREATE TABLE public.field_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL REFERENCES public.form_fields(id) ON DELETE CASCADE,
  watch_field_id text NOT NULL,
  operator text NOT NULL DEFAULT 'equals',
  value text,
  action text NOT NULL DEFAULT 'show',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- form_responses: submitted form data
CREATE TABLE public.form_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.form_templates(id),
  version_id uuid NOT NULL REFERENCES public.form_versions(id),
  user_id uuid NOT NULL,
  response_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  entity_type text,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_responses ENABLE ROW LEVEL SECURITY;

-- form_templates policies
CREATE POLICY "Admins manage form templates" ON public.form_templates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone reads form templates" ON public.form_templates
  FOR SELECT TO authenticated USING (true);

-- form_versions policies
CREATE POLICY "Admins manage form versions" ON public.form_versions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone reads form versions" ON public.form_versions
  FOR SELECT TO authenticated USING (true);

-- form_fields policies
CREATE POLICY "Admins manage form fields" ON public.form_fields
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone reads form fields" ON public.form_fields
  FOR SELECT TO authenticated USING (true);

-- field_conditions policies
CREATE POLICY "Admins manage field conditions" ON public.field_conditions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone reads field conditions" ON public.field_conditions
  FOR SELECT TO authenticated USING (true);

-- form_responses policies
CREATE POLICY "Users manage own responses" ON public.form_responses
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins read all responses" ON public.form_responses
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'analyst'));

-- Create indexes for performance
CREATE INDEX idx_form_versions_template ON public.form_versions(template_id);
CREATE INDEX idx_form_fields_version ON public.form_fields(version_id);
CREATE INDEX idx_field_conditions_field ON public.field_conditions(field_id);
CREATE INDEX idx_form_responses_template ON public.form_responses(template_id);
CREATE INDEX idx_form_responses_user ON public.form_responses(user_id);
CREATE INDEX idx_form_templates_regulator ON public.form_templates(regulator_id);
CREATE INDEX idx_form_templates_type ON public.form_templates(form_type);
