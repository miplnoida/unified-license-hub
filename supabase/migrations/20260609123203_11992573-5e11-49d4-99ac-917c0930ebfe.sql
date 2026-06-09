
-- ---------- report_sources ----------
CREATE TABLE IF NOT EXISTS public.report_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text UNIQUE NOT NULL,
  label text NOT NULL,
  table_name text NOT NULL,
  description text,
  module text NOT NULL,
  default_date_column text DEFAULT 'created_at',
  is_active boolean NOT NULL DEFAULT true,
  supports_ad_hoc boolean NOT NULL DEFAULT true,
  supports_scheduling boolean NOT NULL DEFAULT true,
  max_preview_rows integer NOT NULL DEFAULT 100,
  max_generate_rows integer NOT NULL DEFAULT 10000,
  safe_columns text[] NOT NULL DEFAULT '{}',
  default_columns text[] NOT NULL DEFAULT '{}',
  sensitive_columns text[] NOT NULL DEFAULT '{}',
  search_columns text[] NOT NULL DEFAULT '{}',
  source_routes jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.report_sources TO authenticated;
GRANT ALL ON public.report_sources TO service_role;
ALTER TABLE public.report_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "report_sources read" ON public.report_sources;
CREATE POLICY "report_sources read" ON public.report_sources FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "report_sources admin write" ON public.report_sources;
CREATE POLICY "report_sources admin write" ON public.report_sources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ---------- report_source_filters (separate from existing report_filters) ----------
CREATE TABLE IF NOT EXISTS public.report_source_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL REFERENCES public.report_sources(source_key) ON DELETE CASCADE,
  filter_key text NOT NULL,
  label text NOT NULL,
  filter_type text NOT NULL,
  column_name text,
  operator text NOT NULL DEFAULT 'eq',
  options_source text,
  options_static jsonb NOT NULL DEFAULT '[]'::jsonb,
  options_table text,
  options_value_column text,
  options_label_column text,
  depends_on_filter text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_key, filter_key)
);
GRANT SELECT ON public.report_source_filters TO authenticated;
GRANT ALL ON public.report_source_filters TO service_role;
ALTER TABLE public.report_source_filters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "report_source_filters read" ON public.report_source_filters;
CREATE POLICY "report_source_filters read" ON public.report_source_filters FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "report_source_filters admin write" ON public.report_source_filters;
CREATE POLICY "report_source_filters admin write" ON public.report_source_filters FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ---------- report_status_options ----------
CREATE TABLE IF NOT EXISTS public.report_status_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL,
  filter_key text NOT NULL DEFAULT 'status',
  value text NOT NULL,
  label text NOT NULL,
  color text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_key, filter_key, value)
);
GRANT SELECT ON public.report_status_options TO authenticated;
GRANT ALL ON public.report_status_options TO service_role;
ALTER TABLE public.report_status_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "report_status_options read" ON public.report_status_options;
CREATE POLICY "report_status_options read" ON public.report_status_options FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "report_status_options admin write" ON public.report_status_options;
CREATE POLICY "report_status_options admin write" ON public.report_status_options FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ---------- extend existing report_definitions ----------
ALTER TABLE public.report_definitions
  ADD COLUMN IF NOT EXISTS source_key text,
  ADD COLUMN IF NOT EXISTS report_type text DEFAULT 'predefined',
  ADD COLUMN IF NOT EXISTS query_config jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS filter_config jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS default_filters jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS required_computed_columns text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS default_sort_by text,
  ADD COLUMN IF NOT EXISTS default_sort_dir text DEFAULT 'asc',
  ADD COLUMN IF NOT EXISTS supports_preview boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS supports_schedule boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- Backfill source_key from existing `source` column
UPDATE public.report_definitions SET source_key = source WHERE source_key IS NULL AND source IS NOT NULL;

-- ---------- report_dashboard_layouts ----------
CREATE TABLE IF NOT EXISTS public.report_dashboard_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_key text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  module text NOT NULL DEFAULT 'report_management',
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.report_dashboard_layouts TO authenticated;
GRANT ALL ON public.report_dashboard_layouts TO service_role;
ALTER TABLE public.report_dashboard_layouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "report_dashboard_layouts read" ON public.report_dashboard_layouts;
CREATE POLICY "report_dashboard_layouts read" ON public.report_dashboard_layouts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "report_dashboard_layouts admin write" ON public.report_dashboard_layouts;
CREATE POLICY "report_dashboard_layouts admin write" ON public.report_dashboard_layouts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ---------- report_dashboard_widgets ----------
CREATE TABLE IF NOT EXISTS public.report_dashboard_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_key text NOT NULL REFERENCES public.report_dashboard_layouts(layout_key) ON DELETE CASCADE,
  widget_key text NOT NULL,
  title text NOT NULL,
  description text,
  widget_type text NOT NULL,
  source_key text,
  metric_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  query_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  chart_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  drilldown_report_slug text,
  drilldown_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  icon text,
  variant text,
  width text NOT NULL DEFAULT 'md',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (layout_key, widget_key)
);
GRANT SELECT ON public.report_dashboard_widgets TO authenticated;
GRANT ALL ON public.report_dashboard_widgets TO service_role;
ALTER TABLE public.report_dashboard_widgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "report_dashboard_widgets read" ON public.report_dashboard_widgets;
CREATE POLICY "report_dashboard_widgets read" ON public.report_dashboard_widgets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "report_dashboard_widgets admin write" ON public.report_dashboard_widgets;
CREATE POLICY "report_dashboard_widgets admin write" ON public.report_dashboard_widgets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ---------- report_option_sets ----------
CREATE TABLE IF NOT EXISTS public.report_option_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_set_key text NOT NULL,
  value text NOT NULL,
  label text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (option_set_key, value)
);
GRANT SELECT ON public.report_option_sets TO authenticated;
GRANT ALL ON public.report_option_sets TO service_role;
ALTER TABLE public.report_option_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "report_option_sets read" ON public.report_option_sets;
CREATE POLICY "report_option_sets read" ON public.report_option_sets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "report_option_sets admin write" ON public.report_option_sets;
CREATE POLICY "report_option_sets admin write" ON public.report_option_sets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ---------- report_runtime_config ----------
CREATE TABLE IF NOT EXISTS public.report_runtime_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.report_runtime_config TO authenticated;
GRANT ALL ON public.report_runtime_config TO service_role;
ALTER TABLE public.report_runtime_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "report_runtime_config read" ON public.report_runtime_config;
CREATE POLICY "report_runtime_config read" ON public.report_runtime_config FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "report_runtime_config admin write" ON public.report_runtime_config;
CREATE POLICY "report_runtime_config admin write" ON public.report_runtime_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- =====================================================================
-- SEEDS
-- =====================================================================
INSERT INTO public.report_sources (source_key, label, table_name, module, default_columns, safe_columns, sensitive_columns, source_routes, sort_order) VALUES
('applications','Applications','applications','application_management',
  ARRAY['application_number','license_type','status','created_at','submitted_at'],
  ARRAY['id','application_number','license_type','status','created_at','submitted_at','approved_at','rejected_at','updated_at','regulator_id','current_step_id','assigned_to'],
  ARRAY['raw_app_meta_data','raw_user_meta_data']::text[],
  '{"detailPath":"/applications/:id","idColumn":"id"}'::jsonb, 10),
('licenses','Licenses','licenses','license_management',
  ARRAY['license_number','license_type','status','issued_at','valid_until'],
  ARRAY['id','license_number','license_type','status','issued_at','valid_from','valid_until','sector_id','sub_sector_id','created_at','updated_at'],
  ARRAY[]::text[],
  '{"detailPath":"/licenses/:id","idColumn":"id"}'::jsonb, 20),
('payments','Payments','payments','fee_management',
  ARRAY['amount','status','created_at'],
  ARRAY['id','amount','status','currency','payment_method','transaction_ref','receipt_number','paid_at','created_at'],
  ARRAY[]::text[], '{}'::jsonb, 30),
('compliance_returns','Compliance Returns','compliance_returns','returns_management',
  ARRAY['license_id','period_start','period_end','status','submitted_at'],
  ARRAY['id','license_id','period_start','period_end','due_date','status','submitted_at','reviewed_at'],
  ARRAY[]::text[],
  '{"detailPath":"/returns-management/:id","idColumn":"id"}'::jsonb, 40),
('complaints','Complaints','complaints','complaint_management',
  ARRAY['complaint_number','status','created_at'],
  ARRAY['id','complaint_number','subject','status','complaint_type_id','created_at','updated_at'],
  ARRAY[]::text[],
  '{"detailPath":"/complaints","idColumn":"id"}'::jsonb, 50),
('users','Users','profiles','user_management',
  ARRAY['email','full_name','created_at'],
  ARRAY['id','email','full_name','created_at'],
  ARRAY['password','password_hash','encrypted_password','raw_app_meta_data','raw_user_meta_data','otp','otp_code','mfa_secret']::text[],
  '{}'::jsonb, 60),
('audit_logs','Audit Logs','audit_logs','settings',
  ARRAY['user_id','action','created_at'],
  ARRAY['id','user_id','action','entity_type','entity_id','created_at'],
  ARRAY[]::text[], '{}'::jsonb, 70),
('report_logs','Report Logs','report_logs','report_management',
  ARRAY['action','executed_by','export_format','created_at'],
  ARRAY['id','action','executed_by','export_format','record_count','report_id','report_run_id','schedule_id','created_at'],
  ARRAY[]::text[], '{}'::jsonb, 80)
ON CONFLICT (source_key) DO UPDATE SET
  label=EXCLUDED.label, table_name=EXCLUDED.table_name, module=EXCLUDED.module,
  default_columns=EXCLUDED.default_columns, safe_columns=EXCLUDED.safe_columns,
  sensitive_columns=EXCLUDED.sensitive_columns, source_routes=EXCLUDED.source_routes,
  sort_order=EXCLUDED.sort_order, updated_at=now();

INSERT INTO public.report_source_filters (source_key, filter_key, label, filter_type, column_name, operator, options_source, sort_order) VALUES
('applications','preset','Date Preset','select',NULL,'eq','option_set:date_preset',1),
('applications','dateFrom','From','date','created_at','gte',NULL,2),
('applications','dateTo','To','date','created_at','lte',NULL,3),
('applications','status','Status','select','status','eq','status_options',4),
('applications','regulator','Regulator','select','regulator_id','eq','table:regulators',5),
('applications','sector','Sector','select','sector_id','eq','table:sectors',6),
('applications','subSector','Sub-Sector','select','sub_sector_id','eq','table:sub_sectors',7),
('applications','service','Service','select','service_id','eq','table:services',8),
('applications','officer','Officer','text','assigned_to','eq',NULL,9),
('applications','slaStatus','SLA Status','select',NULL,'eq','static',10),
('applications','riskLevel','Risk Level','select','risk_level','eq','static',11),
('licenses','preset','Date Preset','select',NULL,'eq','option_set:date_preset',1),
('licenses','dateFrom','From','date','created_at','gte',NULL,2),
('licenses','dateTo','To','date','created_at','lte',NULL,3),
('licenses','status','Status','select','status','eq','status_options',4),
('licenses','sector','Sector','select','sector_id','eq','table:sectors',5),
('licenses','expiryFrom','Expiry From','date','valid_until','gte',NULL,6),
('licenses','expiryTo','Expiry To','date','valid_until','lte',NULL,7),
('payments','preset','Date Preset','select',NULL,'eq','option_set:date_preset',1),
('payments','dateFrom','From','date','created_at','gte',NULL,2),
('payments','dateTo','To','date','created_at','lte',NULL,3),
('payments','status','Payment Status','select','status','eq','status_options',4),
('compliance_returns','preset','Date Preset','select',NULL,'eq','option_set:date_preset',1),
('compliance_returns','dateFrom','From','date','created_at','gte',NULL,2),
('compliance_returns','dateTo','To','date','created_at','lte',NULL,3),
('compliance_returns','status','Status','select','status','eq','status_options',4),
('compliance_returns','licensee','Licensee','text','license_id','eq',NULL,5),
('compliance_returns','dueFrom','Due From','date','due_date','gte',NULL,6),
('compliance_returns','dueTo','Due To','date','due_date','lte',NULL,7),
('complaints','preset','Date Preset','select',NULL,'eq','option_set:date_preset',1),
('complaints','dateFrom','From','date','created_at','gte',NULL,2),
('complaints','dateTo','To','date','created_at','lte',NULL,3),
('complaints','status','Status','select','status','eq','status_options',4),
('complaints','riskLevel','Risk Level','select','risk_level','eq','static',5),
('audit_logs','preset','Date Preset','select',NULL,'eq','option_set:date_preset',1),
('audit_logs','dateFrom','From','date','created_at','gte',NULL,2),
('audit_logs','dateTo','To','date','created_at','lte',NULL,3),
('audit_logs','action','Action','text','action','ilike',NULL,4),
('report_logs','preset','Date Preset','select',NULL,'eq','option_set:date_preset',1),
('report_logs','dateFrom','From','date','created_at','gte',NULL,2),
('report_logs','dateTo','To','date','created_at','lte',NULL,3),
('report_logs','exportFormat','Export Format','select','export_format','eq','option_set:export_format',4)
ON CONFLICT (source_key, filter_key) DO UPDATE SET
  label=EXCLUDED.label, filter_type=EXCLUDED.filter_type, column_name=EXCLUDED.column_name,
  operator=EXCLUDED.operator, options_source=EXCLUDED.options_source, sort_order=EXCLUDED.sort_order,
  updated_at=now();

UPDATE public.report_source_filters SET options_static = '[{"value":"on_track","label":"On track"},{"value":"at_risk","label":"At risk"},{"value":"breached","label":"Breached"}]'::jsonb WHERE filter_key='slaStatus';
UPDATE public.report_source_filters SET options_static = '[{"value":"low","label":"Low"},{"value":"medium","label":"Medium"},{"value":"high","label":"High"},{"value":"critical","label":"Critical"}]'::jsonb WHERE filter_key='riskLevel';
UPDATE public.report_source_filters SET depends_on_filter='sector' WHERE filter_key IN ('subSector','service');
UPDATE public.report_source_filters SET options_table='regulators', options_value_column='id', options_label_column='name' WHERE options_source='table:regulators';
UPDATE public.report_source_filters SET options_table='sectors', options_value_column='id', options_label_column='name' WHERE options_source='table:sectors';
UPDATE public.report_source_filters SET options_table='sub_sectors', options_value_column='id', options_label_column='name' WHERE options_source='table:sub_sectors';
UPDATE public.report_source_filters SET options_table='services', options_value_column='id', options_label_column='name' WHERE options_source='table:services';

INSERT INTO public.report_status_options (source_key, filter_key, value, label, sort_order) VALUES
('applications','status','draft','Draft',1),('applications','status','submitted','Submitted',2),('applications','status','in_review','In Review',3),('applications','status','approved','Approved',4),('applications','status','rejected','Rejected',5),('applications','status','pending','Pending',6),
('licenses','status','active','Active',1),('licenses','status','expired','Expired',2),('licenses','status','suspended','Suspended',3),('licenses','status','revoked','Revoked',4),('licenses','status','pending','Pending',5),
('payments','status','pending','Pending',1),('payments','status','completed','Completed',2),('payments','status','paid','Paid',3),('payments','status','failed','Failed',4),('payments','status','refunded','Refunded',5),
('compliance_returns','status','pending','Pending',1),('compliance_returns','status','submitted','Submitted',2),('compliance_returns','status','validated','Validated',3),('compliance_returns','status','rejected','Rejected',4),('compliance_returns','status','tbr','To Be Reviewed',5),
('complaints','status','open','Open',1),('complaints','status','in_review','In Review',2),('complaints','status','escalated','Escalated',3),('complaints','status','resolved','Resolved',4),('complaints','status','closed','Closed',5),('complaints','status','dismissed','Dismissed',6)
ON CONFLICT (source_key, filter_key, value) DO UPDATE SET label=EXCLUDED.label, sort_order=EXCLUDED.sort_order;

INSERT INTO public.report_option_sets (option_set_key, value, label, sort_order) VALUES
('schedule_frequency','daily','Daily',1),('schedule_frequency','weekly','Weekly',2),('schedule_frequency','monthly','Monthly',3),('schedule_frequency','quarterly','Quarterly',4),
('export_format','csv','CSV',1),('export_format','xlsx','Excel (XLSX)',2),('export_format','json','JSON',3),('export_format','pdf','PDF',4),
('sort_direction','asc','Ascending',1),('sort_direction','desc','Descending',2),
('date_preset','today','Today',1),('date_preset','this_week','This Week',2),('date_preset','this_month','This Month',3),('date_preset','this_quarter','This Quarter',4),('date_preset','this_fy','This Financial Year',5),('date_preset','custom','Custom',6),
('report_run_status','ready','Ready',1),('report_run_status','generating','Generating',2),('report_run_status','queued','Queued',3),('report_run_status','failed','Failed',4),('report_run_status','expired','Expired',5)
ON CONFLICT (option_set_key, value) DO UPDATE SET label=EXCLUDED.label, sort_order=EXCLUDED.sort_order;

INSERT INTO public.report_runtime_config (key, value, description) VALUES
('reports.maxPreviewRows','100','Max rows returned in preview mode'),
('reports.maxGenerateRows','10000','Max rows returned/saved in generate mode'),
('reports.enablePdfExport','true','Allow PDF export in UI'),
('reports.enableScheduling','true','Allow scheduling features'),
('reports.enableTemplates','true','Allow saving ad-hoc templates'),
('reports.enableFavorites','true','Allow report favorites'),
('reports.enableDrilldowns','true','Allow Overview drilldowns'),
('reports.useDatabaseDefinitions','true','Prefer DB report_definitions over frontend fallback')
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, description=EXCLUDED.description, updated_at=now();

INSERT INTO public.report_dashboard_layouts (layout_key, name, description, is_default, is_active) VALUES
('executive-overview','Executive Overview','Default Reports & Analytics dashboard',true,true)
ON CONFLICT (layout_key) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, is_default=EXCLUDED.is_default, is_active=EXCLUDED.is_active, updated_at=now();

INSERT INTO public.report_dashboard_widgets (layout_key, widget_key, title, widget_type, source_key, metric_config, chart_config, drilldown_report_slug, drilldown_filters, icon, variant, width, sort_order) VALUES
('executive-overview','total_applications','Total Applications','kpi','applications','{"type":"count"}'::jsonb,'{}'::jsonb,'app-status','{}'::jsonb,'FileBarChart','default','sm',1),
('executive-overview','pending_applications','Pending Applications','kpi','applications','{"type":"count","filter":{"status_in":["pending","submitted","in_review"]}}'::jsonb,'{}'::jsonb,'app-status','{"status":"pending"}'::jsonb,'Clock','warning','sm',2),
('executive-overview','active_licenses','Active Licenses','kpi','licenses','{"type":"count","filter":{"status":"active"}}'::jsonb,'{}'::jsonb,'lic-distribution','{"status":"active"}'::jsonb,'BarChart3','primary','sm',3),
('executive-overview','total_revenue','Total Revenue','kpi','payments','{"type":"sum","column":"amount","filter":{"status_in":["paid","completed","success"]}}'::jsonb,'{"format":"currency"}'::jsonb,NULL,'{}'::jsonb,'TrendingUp','success','sm',4),
('executive-overview','outstanding_dues','Outstanding Dues','kpi','payments','{"type":"sum","column":"amount","filter":{"status_in":["pending","failed","unpaid","overdue"]}}'::jsonb,'{"format":"currency"}'::jsonb,'fee-outstanding','{}'::jsonb,'DollarSign','warning','sm',5),
('executive-overview','overdue_returns','Overdue Returns','kpi','compliance_returns','{"type":"count","filter":{"overdue":true}}'::jsonb,'{}'::jsonb,'ret-overdue','{}'::jsonb,'AlertTriangle','danger','sm',6),
('executive-overview','compliance_rate','Compliance Rate','kpi','compliance_returns','{"type":"ratio","numerator":{"status_in":["submitted","validated"]},"denominator":{}}'::jsonb,'{"format":"percent"}'::jsonb,NULL,'{}'::jsonb,'CheckCircle2','success','sm',7),
('executive-overview','complaint_backlog','Complaint Backlog','kpi','complaints','{"type":"count","filter":{"status_not_in":["resolved","closed","dismissed"]}}'::jsonb,'{}'::jsonb,'cmp-pending','{}'::jsonb,'MessageSquare','warning','sm',8),
('executive-overview','applications_by_month','Applications by Month','bar_chart','applications','{"type":"group_by_month","column":"created_at"}'::jsonb,'{"xKey":"month","yKey":"count"}'::jsonb,NULL,'{}'::jsonb,NULL,NULL,'lg',9),
('executive-overview','applications_by_status','Applications by Status','pie_chart','applications','{"type":"group_by","column":"status"}'::jsonb,'{"nameKey":"name","valueKey":"value"}'::jsonb,NULL,'{}'::jsonb,NULL,NULL,'lg',10),
('executive-overview','revenue_trend','Revenue Trend','area_chart','payments','{"type":"sum_by_month","column":"amount","filter":{"status_in":["paid","completed","success"]}}'::jsonb,'{"xKey":"month","yKey":"amount","format":"currency"}'::jsonb,NULL,'{}'::jsonb,NULL,NULL,'lg',11),
('executive-overview','compliance_returns_status','Compliance Returns','bar_chart','compliance_returns','{"type":"group_by","column":"status"}'::jsonb,'{"layout":"vertical","xKey":"name","yKey":"value"}'::jsonb,NULL,'{}'::jsonb,NULL,NULL,'lg',12),
('executive-overview','license_expiry_trend','License Expiry Trend','line_chart','licenses','{"type":"group_by_month","column":"valid_until"}'::jsonb,'{"xKey":"month","yKey":"expiring"}'::jsonb,NULL,'{}'::jsonb,NULL,NULL,'lg',13),
('executive-overview','complaints_by_status','Complaints by Status','pie_chart','complaints','{"type":"group_by","column":"status"}'::jsonb,'{"nameKey":"name","valueKey":"value"}'::jsonb,NULL,'{}'::jsonb,NULL,NULL,'lg',14)
ON CONFLICT (layout_key, widget_key) DO UPDATE SET
  title=EXCLUDED.title, widget_type=EXCLUDED.widget_type, source_key=EXCLUDED.source_key,
  metric_config=EXCLUDED.metric_config, chart_config=EXCLUDED.chart_config,
  drilldown_report_slug=EXCLUDED.drilldown_report_slug, drilldown_filters=EXCLUDED.drilldown_filters,
  icon=EXCLUDED.icon, variant=EXCLUDED.variant, width=EXCLUDED.width, sort_order=EXCLUDED.sort_order,
  is_active=true, updated_at=now();

-- Seed/upsert report_definitions (use existing `source` column AND new source_key)
INSERT INTO public.report_definitions (slug, name, category, module, source, source_key, description, default_columns, default_group_by, export_formats, sort_order, is_active) VALUES
('app-status','Application Status Report','Licensing & Applications','application_management','applications','applications','Distribution of applications across all statuses.',ARRAY['application_number','license_type','status','created_at','submitted_at'],'status',ARRAY['csv','xlsx','json'],10,true),
('app-aging','Application Aging Report','Licensing & Applications','application_management','applications','applications','Applications grouped by time-in-status buckets.',ARRAY['application_number','status','created_at','updated_at'],NULL,ARRAY['csv','xlsx'],11,true),
('app-sla','Application SLA Breach Report','Licensing & Applications','application_management','applications','applications','Applications exceeding their SLA windows.',ARRAY['application_number','status','created_at','submitted_at'],NULL,ARRAY['csv','xlsx'],12,true),
('lic-issuance','License Issuance Report','Licensing & Applications','license_management','licenses','licenses','Licenses issued within a chosen window.',ARRAY['license_number','license_type','status','issued_at'],NULL,ARRAY['csv','xlsx'],13,true),
('lic-expiry','License Expiry / Renewal Due Report','Licensing & Applications','license_management','licenses','licenses','Licenses approaching expiry / renewal.',ARRAY['license_number','license_type','valid_until','status'],NULL,ARRAY['csv','xlsx'],14,true),
('lic-suspended','Suspended / Revoked License Report','Licensing & Applications','license_management','licenses','licenses','Licenses in suspended or revoked status.',ARRAY['license_number','license_type','status','updated_at'],NULL,ARRAY['csv','xlsx'],15,true),
('lic-distribution','Sector-wise License Distribution','Licensing & Applications','license_management','licenses','licenses','Active licenses broken down by sector.',ARRAY['license_type','status'],'license_type',ARRAY['csv','xlsx'],16,true),
('ret-status','Return Submission Status Report','Returns & Compliance','returns_management','compliance_returns','compliance_returns','Returns by submission status across periods.',ARRAY['license_id','period_start','period_end','status','submitted_at'],NULL,ARRAY['csv','xlsx'],20,true),
('ret-overdue','Overdue Returns Report','Returns & Compliance','returns_management','compliance_returns','compliance_returns','Returns past their due date and unsubmitted.',ARRAY['license_id','period_end','due_date','status'],NULL,ARRAY['csv','xlsx'],21,true),
('ret-defaulters','Defaulters Report','Returns & Compliance','returns_management','compliance_returns','compliance_returns','Licensees with repeated unsubmitted returns.',ARRAY['license_id','period_end','status'],'license_id',ARRAY['csv','xlsx'],22,true),
('ret-scorecard','Compliance Scorecard','Returns & Compliance','returns_management','compliance_returns','compliance_returns','On-time vs. late vs. missed return ratios.',ARRAY['license_id','status','due_date','submitted_at'],NULL,ARRAY['csv','xlsx'],23,true),
('ret-latefee','Late Fee Exposure Report','Returns & Compliance','returns_management','compliance_returns','compliance_returns','Estimated late-fee exposure by licensee.',ARRAY['license_id','due_date','status'],NULL,ARRAY['csv','xlsx'],24,true),
('ret-risk','Sector-wise Compliance Risk Report','Returns & Compliance','returns_management','compliance_returns','compliance_returns','Compliance risk aggregated by sector.',ARRAY['license_id','status'],NULL,ARRAY['csv','xlsx'],25,true),
('ret-repeat','Repeated Non-compliance Report','Returns & Compliance','returns_management','compliance_returns','compliance_returns','Licensees with recurring non-compliance.',ARRAY['license_id','status'],'license_id',ARRAY['csv','xlsx'],26,true),
('fee-collection','Fee Collection Report','Revenue & Finance','fee_management','payments','payments','Collected fees over time.',ARRAY['amount','status','created_at'],NULL,ARRAY['csv','xlsx'],30,true),
('fee-outstanding','Outstanding Dues Report','Revenue & Finance','fee_management','payments','payments','Unpaid and pending dues.',ARRAY['amount','status','created_at'],NULL,ARRAY['csv','xlsx'],31,true),
('fee-failed','Payment Failure Report','Revenue & Finance','fee_management','payments','payments','Failed payment attempts.',ARRAY['amount','status','created_at'],NULL,ARRAY['csv','xlsx'],32,true),
('fee-refund','Refund / Adjustment Report','Revenue & Finance','fee_management','payments','payments','Refund and adjustment activity.',ARRAY['amount','status','created_at'],NULL,ARRAY['csv','xlsx'],33,true),
('fee-sector','Revenue by Sector / Service / Regulator','Revenue & Finance','fee_management','payments','payments','Revenue grouped by sector/service/regulator.',ARRAY['amount','status'],NULL,ARRAY['csv','xlsx'],34,true),
('fee-trend','Monthly and Quarterly Collection Trend','Revenue & Finance','fee_management','payments','payments','Collections trended monthly / quarterly.',ARRAY['amount','created_at'],NULL,ARRAY['csv','xlsx'],35,true),
('op-workload','Officer Workload Report','Users & Operations','workflow_management','applications','applications','Open tasks per officer.',ARRAY['application_number','status','current_step_id'],NULL,ARRAY['csv','xlsx'],40,true),
('op-productivity','Officer Productivity Report','Users & Operations','workflow_management','applications','applications','Throughput per officer.',ARRAY['application_number','status','approved_at'],NULL,ARRAY['csv','xlsx'],41,true),
('op-process-time','Average Processing Time Report','Users & Operations','workflow_management','applications','applications','Average processing time per stage.',ARRAY['application_number','created_at','approved_at'],NULL,ARRAY['csv','xlsx'],42,true),
('op-ratio','Approval / Rejection Ratio Report','Users & Operations','workflow_management','applications','applications','Approval vs. rejection ratios.',ARRAY['status'],'status',ARRAY['csv','xlsx'],43,true),
('op-pending','Pending Task Aging Report','Users & Operations','workflow_management','applications','applications','Pending tasks bucketed by age.',ARRAY['application_number','status','updated_at'],NULL,ARRAY['csv','xlsx'],44,true),
('op-login','Login / Activity Report','Users & Operations','user_management','audit_logs','audit_logs','User login and activity trail.',ARRAY['user_id','action','created_at'],NULL,ARRAY['csv','xlsx'],45,true),
('cmp-volume','Complaint Volume Report','Complaints','complaint_management','complaints','complaints','Complaint volume over time.',ARRAY['complaint_number','status','created_at'],NULL,ARRAY['csv','xlsx'],50,true),
('cmp-resolution','Complaint Resolution Time Report','Complaints','complaint_management','complaints','complaints','Time-to-resolution per complaint.',ARRAY['complaint_number','status','created_at','updated_at'],NULL,ARRAY['csv','xlsx'],51,true),
('cmp-pending','Pending Complaints Report','Complaints','complaint_management','complaints','complaints','Open and unresolved complaints.',ARRAY['complaint_number','status','created_at'],NULL,ARRAY['csv','xlsx'],52,true),
('cmp-category','Complaint Category Trend Report','Complaints','complaint_management','complaints','complaints','Trending complaint categories.',ARRAY['complaint_number','complaint_type_id'],'complaint_type_id',ARRAY['csv','xlsx'],53,true),
('cmp-escalated','Escalated Complaints Report','Complaints','complaint_management','complaints','complaints','Complaints currently escalated.',ARRAY['complaint_number','status'],NULL,ARRAY['csv','xlsx'],54,true),
('aud-trail','Audit Trail Report','Audit & Governance','settings','audit_logs','audit_logs','Full audit trail of system changes.',ARRAY['user_id','action','entity_type','entity_id','created_at'],NULL,ARRAY['csv','xlsx'],60,true),
('aud-permissions','Permission Change Report','Audit & Governance','role_management','audit_logs','audit_logs','Role / permission change history.',ARRAY['user_id','action','entity_id','created_at'],NULL,ARRAY['csv','xlsx'],61,true),
('aud-export','Data Export Log','Audit & Governance','settings','report_logs','report_logs','Log of all report exports.',ARRAY['executed_by','action','export_format','created_at'],NULL,ARRAY['csv','xlsx'],62,true),
('aud-failed-login','Failed Login / Security Event Report','Audit & Governance','settings','audit_logs','audit_logs','Failed logins and security events.',ARRAY['user_id','action','created_at'],NULL,ARRAY['csv','xlsx'],63,true),
('aud-admin','Admin Activity Report','Audit & Governance','settings','audit_logs','audit_logs','Activity performed by administrators.',ARRAY['user_id','action','entity_type','created_at'],NULL,ARRAY['csv','xlsx'],64,true)
ON CONFLICT (slug) DO UPDATE SET
  name=EXCLUDED.name, category=EXCLUDED.category, module=EXCLUDED.module,
  source=EXCLUDED.source, source_key=EXCLUDED.source_key, description=EXCLUDED.description,
  default_columns=EXCLUDED.default_columns, default_group_by=EXCLUDED.default_group_by,
  export_formats=EXCLUDED.export_formats, sort_order=EXCLUDED.sort_order,
  is_active=true, updated_at=now();
