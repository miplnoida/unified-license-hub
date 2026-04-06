
-- Enums for workflow and other statuses
DO $$ BEGIN
  CREATE TYPE public.return_workflow_status AS ENUM ('TEMP','WIP','SUB','VAL','TBR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ontime_status_enum AS ENUM ('ON_TIME','LATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.return_audit_action AS ENUM ('created','draft_saved','submitted','validated','rejected','resubmitted','comment_added','comment_edited','comment_deleted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.cutoff_unit_enum AS ENUM ('days','weeks','months');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_status_enum AS ENUM ('pending','sent','failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.return_request_status AS ENUM ('active','resolved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Sequence for return unique IDs
CREATE SEQUENCE IF NOT EXISTS return_unique_id_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_return_unique_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE seq_val bigint;
BEGIN
  SELECT nextval('return_unique_id_seq') INTO seq_val;
  RETURN 'RET-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(seq_val::text, 5, '0');
END;
$$;

-- 1. return_types
CREATE TABLE public.return_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.return_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage return_types" ON public.return_types FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Auth read return_types" ON public.return_types FOR SELECT TO authenticated USING (true);

-- 2. return_configs
CREATE TABLE public.return_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sector_id uuid REFERENCES public.sectors(id),
  subsector_id uuid REFERENCES public.sub_sectors(id),
  return_type_id uuid NOT NULL REFERENCES public.return_types(id),
  version text NOT NULL DEFAULT '1.0',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.return_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage return_configs" ON public.return_configs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Auth read return_configs" ON public.return_configs FOR SELECT TO authenticated USING (true);

-- 3. return_config_forms
CREATE TABLE public.return_config_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_configuration_id uuid NOT NULL REFERENCES public.return_configs(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.form_templates(id),
  tab_name text NOT NULL DEFAULT 'General',
  display_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.return_config_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage return_config_forms" ON public.return_config_forms FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Auth read return_config_forms" ON public.return_config_forms FOR SELECT TO authenticated USING (true);

-- 4. returns_filed
CREATE TABLE public.returns_filed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unique_id text NOT NULL DEFAULT generate_return_unique_id(),
  entity_id uuid REFERENCES public.licensees(id),
  return_configuration_id uuid NOT NULL REFERENCES public.return_configs(id),
  sector_id uuid REFERENCES public.sectors(id),
  subsector_id uuid REFERENCES public.sub_sectors(id),
  return_year integer NOT NULL,
  return_period text NOT NULL,
  period_start_date date NOT NULL,
  period_end_date date NOT NULL,
  workflow_status return_workflow_status NOT NULL DEFAULT 'TEMP',
  submit_date timestamptz,
  ontime_status ontime_status_enum,
  due_date date,
  version text DEFAULT '1.0',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active',
  UNIQUE (entity_id, return_configuration_id, return_year, return_period)
);
ALTER TABLE public.returns_filed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own returns" ON public.returns_filed FOR ALL TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'analyst') OR has_role(auth.uid(), 'licensing_officer'))
  WITH CHECK (auth.uid() = created_by OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'));

-- 5. return_form_data
CREATE TABLE public.return_form_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.returns_filed(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.form_templates(id),
  field_id text NOT NULL,
  field_name text NOT NULL,
  field_value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (return_id, form_id, field_id)
);
ALTER TABLE public.return_form_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own return data" ON public.return_form_data FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.returns_filed r WHERE r.id = return_id AND (r.created_by = auth.uid() OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'analyst'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.returns_filed r WHERE r.id = return_id AND (r.created_by = auth.uid() OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))));

-- 6. return_documents
CREATE TABLE public.return_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.returns_filed(id) ON DELETE CASCADE,
  document_name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  file_size bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.return_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own return docs" ON public.return_documents FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.returns_filed r WHERE r.id = return_id AND (r.created_by = auth.uid() OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'))))
  WITH CHECK (auth.uid() = uploaded_by);

-- 7. return_comments
CREATE TABLE public.return_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.returns_filed(id) ON DELETE CASCADE,
  form_id uuid REFERENCES public.form_templates(id),
  tab_name text,
  comment_text text NOT NULL,
  commented_by uuid,
  is_editable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.return_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manage return comments" ON public.return_comments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.returns_filed r WHERE r.id = return_id AND (r.created_by = auth.uid() OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'analyst'))))
  WITH CHECK (true);

-- 8. return_audit_log
CREATE TABLE public.return_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.returns_filed(id) ON DELETE CASCADE,
  action return_audit_action NOT NULL,
  previous_status text,
  new_status text,
  comments text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.return_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Insert audit log" ON public.return_audit_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Read audit log" ON public.return_audit_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.returns_filed r WHERE r.id = return_id AND (r.created_by = auth.uid() OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'analyst'))));

-- 9. return_requests
CREATE TABLE public.return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.returns_filed(id) ON DELETE CASCADE,
  reasons text NOT NULL,
  status return_request_status NOT NULL DEFAULT 'active',
  requested_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manage return requests" ON public.return_requests FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.returns_filed r WHERE r.id = return_id AND (r.created_by = auth.uid() OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'))))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'));

-- 10. return_due_dates
CREATE TABLE public.return_due_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES public.licensees(id),
  return_configuration_id uuid NOT NULL REFERENCES public.return_configs(id),
  return_year integer NOT NULL,
  return_period text NOT NULL,
  due_date date NOT NULL,
  notification_date date,
  notification_sent boolean NOT NULL DEFAULT false,
  reminder_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.return_due_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage due dates" ON public.return_due_dates FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor'));
CREATE POLICY "Users read own due dates" ON public.return_due_dates FOR SELECT TO authenticated USING (true);

-- 11. return_cutoff_config
CREATE TABLE public.return_cutoff_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id uuid REFERENCES public.sectors(id),
  return_type_id uuid NOT NULL REFERENCES public.return_types(id),
  cutoff_days integer NOT NULL DEFAULT 30,
  cutoff_unit cutoff_unit_enum NOT NULL DEFAULT 'days',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.return_cutoff_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage cutoff" ON public.return_cutoff_config FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Auth read cutoff" ON public.return_cutoff_config FOR SELECT TO authenticated USING (true);

-- 12. late_fee_structures
CREATE TABLE public.late_fee_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id uuid REFERENCES public.sectors(id),
  return_type_id uuid REFERENCES public.return_types(id),
  fee_name text NOT NULL,
  base_amount numeric(10,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.late_fee_structures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage late fees" ON public.late_fee_structures FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Auth read late fees" ON public.late_fee_structures FOR SELECT TO authenticated USING (true);

-- 13. late_fee_penalty_tiers
CREATE TABLE public.late_fee_penalty_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  late_fee_structure_id uuid NOT NULL REFERENCES public.late_fee_structures(id) ON DELETE CASCADE,
  tier_label text NOT NULL,
  days_from integer NOT NULL,
  days_to integer NOT NULL,
  penalty_percentage numeric(5,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.late_fee_penalty_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage penalty tiers" ON public.late_fee_penalty_tiers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Auth read penalty tiers" ON public.late_fee_penalty_tiers FOR SELECT TO authenticated USING (true);

-- 14. return_notification_templates
CREATE TABLE public.return_notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code text NOT NULL UNIQUE,
  name text NOT NULL,
  subject_template text,
  body_template text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.return_notification_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage notif templates" ON public.return_notification_templates FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Auth read notif templates" ON public.return_notification_templates FOR SELECT TO authenticated USING (true);

-- 15. return_notifications_log
CREATE TABLE public.return_notifications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code text,
  return_id uuid REFERENCES public.returns_filed(id),
  recipient_email text,
  recipient_user_id uuid,
  subject text,
  body text,
  status notification_status_enum NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.return_notifications_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage notif log" ON public.return_notifications_log FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Users read own notif log" ON public.return_notifications_log FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid() OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));

-- Indexes for performance
CREATE INDEX idx_returns_filed_entity ON public.returns_filed(entity_id);
CREATE INDEX idx_returns_filed_config ON public.returns_filed(return_configuration_id);
CREATE INDEX idx_returns_filed_status ON public.returns_filed(workflow_status);
CREATE INDEX idx_returns_filed_year ON public.returns_filed(return_year);
CREATE INDEX idx_return_form_data_return ON public.return_form_data(return_id);
CREATE INDEX idx_return_due_dates_entity ON public.return_due_dates(entity_id);
CREATE INDEX idx_return_due_dates_due ON public.return_due_dates(due_date);
CREATE INDEX idx_return_audit_log_return ON public.return_audit_log(return_id);
CREATE INDEX idx_return_config_forms_config ON public.return_config_forms(return_configuration_id);
