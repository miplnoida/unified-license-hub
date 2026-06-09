
-- ============ Helper: updated_at trigger (reuse if exists) ============
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============ Extend existing reports table (used as report_runs) ============
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS report_definition_id uuid;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS report_slug text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS selected_columns text[] DEFAULT '{}';
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS group_by text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS sort_by text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS sort_dir text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS result_summary jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS filters_json jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS duration_ms integer;

CREATE INDEX IF NOT EXISTS idx_reports_created_at_desc ON public.reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_report_slug ON public.reports (report_slug);
CREATE INDEX IF NOT EXISTS idx_reports_source ON public.reports (source);

-- ============ Extend report_schedules ============
ALTER TABLE public.report_schedules ADD COLUMN IF NOT EXISTS report_definition_id uuid;
ALTER TABLE public.report_schedules ADD COLUMN IF NOT EXISTS report_slug text;
ALTER TABLE public.report_schedules ADD COLUMN IF NOT EXISTS report_name text;
ALTER TABLE public.report_schedules ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.report_schedules ADD COLUMN IF NOT EXISTS filters_json jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.report_schedules ADD COLUMN IF NOT EXISTS selected_columns text[] DEFAULT '{}';
ALTER TABLE public.report_schedules ADD COLUMN IF NOT EXISTS group_by text;
ALTER TABLE public.report_schedules ADD COLUMN IF NOT EXISTS sort_by text;
ALTER TABLE public.report_schedules ADD COLUMN IF NOT EXISTS recipient_roles text[] DEFAULT '{}';
ALTER TABLE public.report_schedules ADD COLUMN IF NOT EXISTS last_status text;
ALTER TABLE public.report_schedules ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE public.report_schedules ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;
-- allow report_id to be optional now that slug/source supports schedules without a saved run
ALTER TABLE public.report_schedules ALTER COLUMN report_id DROP NOT NULL;

-- ============ Extend report_logs ============
ALTER TABLE public.report_logs ADD COLUMN IF NOT EXISTS schedule_id uuid;
ALTER TABLE public.report_logs ADD COLUMN IF NOT EXISTS report_name text;
ALTER TABLE public.report_logs ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.report_logs ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.report_logs
  ADD CONSTRAINT report_logs_schedule_id_fkey FOREIGN KEY (schedule_id)
  REFERENCES public.report_schedules(id) ON DELETE SET NULL
  NOT VALID;
ALTER TABLE public.report_logs VALIDATE CONSTRAINT report_logs_schedule_id_fkey;

CREATE INDEX IF NOT EXISTS idx_report_logs_created_at_desc ON public.report_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_logs_action ON public.report_logs (action);

-- ============ report_definitions ============
CREATE TABLE IF NOT EXISTS public.report_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  module text NOT NULL,
  source text NOT NULL,
  description text,
  definition_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_columns text[] DEFAULT '{}',
  default_group_by text,
  export_formats text[] DEFAULT ARRAY['csv','xlsx','json'],
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.report_definitions TO authenticated;
GRANT ALL ON public.report_definitions TO service_role;
ALTER TABLE public.report_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read report definitions"
  ON public.report_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage report definitions"
  ON public.report_definitions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
DROP TRIGGER IF EXISTS trg_report_definitions_updated_at ON public.report_definitions;
CREATE TRIGGER trg_report_definitions_updated_at BEFORE UPDATE ON public.report_definitions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ report_run_rows ============
CREATE TABLE IF NOT EXISTS public.report_run_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_run_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  row_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(report_run_id, row_index)
);
GRANT SELECT, INSERT, DELETE ON public.report_run_rows TO authenticated;
GRANT ALL ON public.report_run_rows TO service_role;
ALTER TABLE public.report_run_rows ENABLE ROW LEVEL SECURITY;
-- Visibility follows the parent report row
CREATE POLICY "Read rows of accessible runs"
  ON public.report_run_rows FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = report_run_rows.report_run_id
      AND (r.created_by = auth.uid()
        OR has_role(auth.uid(), 'super_admin'::app_role)
        OR has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'supervisor'::app_role)
        OR has_role(auth.uid(), 'analyst'::app_role))
  ));
CREATE POLICY "Insert rows for own runs"
  ON public.report_run_rows FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = report_run_rows.report_run_id
      AND (r.created_by = auth.uid()
        OR has_role(auth.uid(), 'super_admin'::app_role)
        OR has_role(auth.uid(), 'admin'::app_role))
  ));
CREATE POLICY "Delete rows for own runs"
  ON public.report_run_rows FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = report_run_rows.report_run_id
      AND (r.created_by = auth.uid()
        OR has_role(auth.uid(), 'super_admin'::app_role)
        OR has_role(auth.uid(), 'admin'::app_role))
  ));
CREATE INDEX IF NOT EXISTS idx_report_run_rows_run_id_index
  ON public.report_run_rows (report_run_id, row_index);

-- ============ report_run_files ============
CREATE TABLE IF NOT EXISTS public.report_run_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_run_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  format text NOT NULL,
  storage_path text,
  file_size bigint,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.report_run_files TO authenticated;
GRANT ALL ON public.report_run_files TO service_role;
ALTER TABLE public.report_run_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read files of accessible runs"
  ON public.report_run_files FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = report_run_files.report_run_id
      AND (r.created_by = auth.uid()
        OR has_role(auth.uid(), 'super_admin'::app_role)
        OR has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'supervisor'::app_role)
        OR has_role(auth.uid(), 'analyst'::app_role))
  ));
CREATE POLICY "Insert files for own runs"
  ON public.report_run_files FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = report_run_files.report_run_id
      AND (r.created_by = auth.uid()
        OR has_role(auth.uid(), 'super_admin'::app_role)
        OR has_role(auth.uid(), 'admin'::app_role))
  ));

-- ============ report_favorites ============
CREATE TABLE IF NOT EXISTS public.report_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_slug text NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(report_slug, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.report_favorites TO authenticated;
GRANT ALL ON public.report_favorites TO service_role;
ALTER TABLE public.report_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own favorites"
  ON public.report_favorites FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Insert own favorites"
  ON public.report_favorites FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Delete own favorites"
  ON public.report_favorites FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_report_favorites_user_id ON public.report_favorites (user_id);

-- ============ report_templates ============
CREATE TABLE IF NOT EXISTS public.report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  source text NOT NULL,
  filters_json jsonb DEFAULT '{}'::jsonb,
  selected_columns text[] DEFAULT '{}',
  group_by text,
  sort_by text,
  sort_dir text,
  visibility text DEFAULT 'private',
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_templates TO authenticated;
GRANT ALL ON public.report_templates TO service_role;
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own or shared templates"
  ON public.report_templates FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR visibility = 'shared'
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );
CREATE POLICY "Insert own templates"
  ON public.report_templates FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Update own templates"
  ON public.report_templates FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (created_by = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Delete own templates"
  ON public.report_templates FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));
DROP TRIGGER IF EXISTS trg_report_templates_updated_at ON public.report_templates;
CREATE TRIGGER trg_report_templates_updated_at BEFORE UPDATE ON public.report_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ Compatibility view: report_runs ============
CREATE OR REPLACE VIEW public.report_runs
WITH (security_invoker=on) AS
  SELECT
    id,
    report_definition_id,
    report_slug,
    name AS report_name,
    category,
    source,
    COALESCE(filters_json, COALESCE(query_config->'filters', '{}'::jsonb)) AS filters_json,
    selected_columns,
    group_by,
    sort_by,
    sort_dir,
    result_summary,
    status,
    COALESCE(result_count, 0) AS row_count,
    created_by AS generated_by,
    generated_at,
    started_at,
    completed_at,
    error_message,
    duration_ms,
    created_at
  FROM public.reports;
GRANT SELECT ON public.report_runs TO authenticated;

-- ============ Scheduler note ============
-- To actually run scheduled reports, schedule the run-scheduled-reports edge function
-- via Supabase cron (pg_cron + pg_net). Example (substitute project ref + anon key):
--   select cron.schedule(
--     'run-scheduled-reports-5m',
--     '*/5 * * * *',
--     $$ select net.http_post(
--          url:='https://<project-ref>.supabase.co/functions/v1/run-scheduled-reports',
--          headers:='{"Content-Type":"application/json","apikey":"<anon-key>"}'::jsonb,
--          body:='{}'::jsonb
--        ); $$);
