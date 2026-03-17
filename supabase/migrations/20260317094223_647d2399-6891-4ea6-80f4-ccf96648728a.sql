
-- Reports table for saved/generated reports
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  report_type text NOT NULL DEFAULT 'ad_hoc', -- ad_hoc, predefined, scheduled
  category text NOT NULL DEFAULT 'general', -- application_status, revenue, compliance, general
  query_config jsonb NOT NULL DEFAULT '{}'::jsonb, -- stores filters, grouping, columns
  result_data jsonb, -- cached result
  result_count integer DEFAULT 0,
  generated_at timestamptz,
  expires_at timestamptz,
  created_by uuid NOT NULL,
  regulator_id uuid REFERENCES public.regulators(id),
  status text NOT NULL DEFAULT 'draft', -- draft, generating, ready, expired, failed
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Report filters (saved filter presets)
CREATE TABLE public.report_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  filter_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_global boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Report schedules for automated email delivery
CREATE TABLE public.report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.reports(id) ON DELETE CASCADE NOT NULL,
  schedule_type text NOT NULL DEFAULT 'weekly', -- daily, weekly, monthly, quarterly
  cron_expression text,
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb, -- array of email addresses
  last_run_at timestamptz,
  next_run_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  export_format text NOT NULL DEFAULT 'pdf', -- pdf, excel, csv
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Report execution logs
CREATE TABLE public.report_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  action text NOT NULL, -- generated, exported, scheduled_run, viewed
  executed_by uuid,
  execution_time_ms integer,
  record_count integer DEFAULT 0,
  export_format text,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_logs ENABLE ROW LEVEL SECURITY;

-- Reports policies
CREATE POLICY "Internal users read reports" ON public.reports FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'analyst'));

CREATE POLICY "Internal users create reports" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'analyst')));

CREATE POLICY "Owners update reports" ON public.reports FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete reports" ON public.reports FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR created_by = auth.uid());

-- Report filters policies
CREATE POLICY "Read report filters" ON public.report_filters FOR SELECT TO authenticated
  USING (is_global = true OR created_by = auth.uid() OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Create report filters" ON public.report_filters FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Update own filters" ON public.report_filters FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Delete own filters" ON public.report_filters FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'super_admin'));

-- Report schedules policies
CREATE POLICY "Read schedules" ON public.report_schedules FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Create schedules" ON public.report_schedules FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'supervisor')));

CREATE POLICY "Update schedules" ON public.report_schedules FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Delete schedules" ON public.report_schedules FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'super_admin'));

-- Report logs policies
CREATE POLICY "Read report logs" ON public.report_logs FOR SELECT TO authenticated
  USING (executed_by = auth.uid() OR has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Insert report logs" ON public.report_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = executed_by);

-- Indexes for performance
CREATE INDEX idx_reports_created_by ON public.reports(created_by);
CREATE INDEX idx_reports_category ON public.reports(category);
CREATE INDEX idx_reports_status ON public.reports(status);
CREATE INDEX idx_report_logs_report_id ON public.report_logs(report_id);
CREATE INDEX idx_report_schedules_next_run ON public.report_schedules(next_run_at) WHERE is_active = true;
