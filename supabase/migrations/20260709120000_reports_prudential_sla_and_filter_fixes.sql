-- ─────────────────────────────────────────────────────────────────────────────
-- Reports & Analytics: close gaps found against the "Operational Reports" and
-- "Ad-Hoc & Exportable Reporting" demo requirements.
--
--  1. Add `return_threshold_breaches` as a report source — this is the table
--     that actually holds prudential threshold-breach data (real risk_level/
--     level/metric_key/detected_at columns); nothing today lets a user report
--     on it at all, only on return *submission* status.
--  2. Enrich `report_view_complaints` with sla_days/sla_due_at (the view
--     introduced in 20260609133453_...sql replaced the raw `complaints` table
--     as this source's backing relation but never carried these two real
--     columns through), then add two new SLA reports — Complaint SLA and
--     Return Submission SLA — using the exact `app-sla` decorate() pattern.
--  3. Deactivate three report_source_filters rows that are silent no-ops:
--     applications.sector and applications.riskLevel / complaints.riskLevel
--     all reference columns that were never in that source's safe_columns —
--     executeQuery() has always silently dropped them. getReportFilters()
--     already filters on is_active=true, so this removes the dead controls
--     from the Ad-Hoc Builder UI immediately, not just the backend check.
-- ─────────────────────────────────────────────────────────────────────────────

-- ---------- 1. Enrich report_view_complaints with real SLA columns ----------
CREATE OR REPLACE VIEW public.report_view_complaints
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.complaint_number,
  c.complainant_id,
  cp.full_name AS complainant_name,
  COALESCE(
    NULLIF(cp.entity_name, ''),
    NULLIF(cp.full_name, ''),
    NULLIF(cp.email, ''),
    NULLIF(c.email, ''),
    'Unknown'
  ) AS applicant_entity_name,
  c.complaint_type_id AS category_id,
  ct.name AS category_name,
  ct.name AS complaint_type,
  c.regulator_id,
  r.name AS regulator_name,
  c.investigator_id AS assigned_officer_id,
  ip.full_name AS assigned_officer_name,
  c.status,
  c.subject,
  c.created_at,
  c.updated_at,
  EXTRACT(DAY FROM (COALESCE(c.updated_at, now()) - c.created_at))::int AS resolution_days,
  c.sla_days,
  c.sla_due_at
FROM public.complaints c
LEFT JOIN public.profiles cp ON cp.id = c.complainant_id
LEFT JOIN public.profiles ip ON ip.id = c.investigator_id
LEFT JOIN public.complaint_types ct ON ct.id = c.complaint_type_id
LEFT JOIN public.regulators r ON r.id = c.regulator_id;

GRANT SELECT ON public.report_view_complaints TO authenticated, service_role;

UPDATE public.report_sources
SET safe_columns = array_append(array_append(safe_columns, 'sla_days'), 'sla_due_at'),
    updated_at = now()
WHERE source_key = 'complaints'
  AND NOT ('sla_days' = ANY(safe_columns));

-- ---------- 2. New report source: return_threshold_breaches ----------
INSERT INTO public.report_sources (source_key, label, table_name, module, default_columns, safe_columns, sensitive_columns, source_routes, sort_order) VALUES
('return_threshold_breaches','Prudential Return Threshold Breaches','return_threshold_breaches','prudential_supervision',
  ARRAY['metric_key','value','threshold_value','level','risk_level','detected_at'],
  ARRAY['id','return_id','return_config_id','metric_key','value','threshold_value','threshold_version','comparator','level','risk_level','detected_at','notified','acknowledged_at','acknowledged_by','acknowledgement_note','escalated_at','escalated_by','escalated_enforcement_id'],
  ARRAY[]::text[], '{}'::jsonb, 90)
ON CONFLICT (source_key) DO UPDATE SET
  label=EXCLUDED.label, table_name=EXCLUDED.table_name, module=EXCLUDED.module,
  default_columns=EXCLUDED.default_columns, safe_columns=EXCLUDED.safe_columns,
  sensitive_columns=EXCLUDED.sensitive_columns, source_routes=EXCLUDED.source_routes,
  sort_order=EXCLUDED.sort_order, updated_at=now();

INSERT INTO public.report_source_filters (source_key, filter_key, label, filter_type, column_name, operator, options_source, sort_order) VALUES
('return_threshold_breaches','preset','Date Preset','select',NULL,'eq','option_set:date_preset',1),
('return_threshold_breaches','dateFrom','From','date','detected_at','gte',NULL,2),
('return_threshold_breaches','dateTo','To','date','detected_at','lte',NULL,3),
('return_threshold_breaches','riskLevel','Risk Level','select','risk_level','eq','static',4)
ON CONFLICT (source_key, filter_key) DO UPDATE SET
  label=EXCLUDED.label, filter_type=EXCLUDED.filter_type, column_name=EXCLUDED.column_name,
  operator=EXCLUDED.operator, options_source=EXCLUDED.options_source, sort_order=EXCLUDED.sort_order,
  updated_at=now();

UPDATE public.report_source_filters SET options_static = '[{"value":"low","label":"Low"},{"value":"medium","label":"Medium"},{"value":"high","label":"High"},{"value":"critical","label":"Critical"}]'::jsonb
WHERE source_key = 'return_threshold_breaches' AND filter_key = 'riskLevel';

INSERT INTO public.report_source_columns (source_key,column_key,label,data_type,is_default,is_raw_id,is_enriched,is_computed,format,sort_order)
VALUES
 ('return_threshold_breaches','metric_key','Metric','text',true,false,false,false,null,10),
 ('return_threshold_breaches','value','Value','numeric',true,false,false,false,'number',20),
 ('return_threshold_breaches','threshold_value','Threshold','numeric',true,false,false,false,'number',30),
 ('return_threshold_breaches','comparator','Comparator','text',false,false,false,false,null,40),
 ('return_threshold_breaches','level','Breach Level','text',true,false,false,false,null,50),
 ('return_threshold_breaches','risk_level','Risk Level','text',true,false,false,false,null,60),
 ('return_threshold_breaches','detected_at','Detected','timestamp',true,false,false,false,'datetime',70),
 ('return_threshold_breaches','acknowledged_at','Acknowledged','timestamp',false,false,false,false,'datetime',80),
 ('return_threshold_breaches','escalated_at','Escalated','timestamp',false,false,false,false,'datetime',90),
 ('return_threshold_breaches','notified','Notified','boolean',false,false,false,false,null,100),
 ('return_threshold_breaches','id','Breach ID','uuid',false,true,false,false,null,900),
 ('return_threshold_breaches','return_id','Return ID','uuid',false,true,false,false,null,910),
 ('return_threshold_breaches','return_config_id','Return Config ID','uuid',false,true,false,false,null,920)
ON CONFLICT (source_key,column_key) DO UPDATE SET
  label=EXCLUDED.label, is_default=EXCLUDED.is_default, is_raw_id=EXCLUDED.is_raw_id,
  is_enriched=EXCLUDED.is_enriched, is_computed=EXCLUDED.is_computed, format=EXCLUDED.format,
  sort_order=EXCLUDED.sort_order, updated_at=now();

-- ---------- 3. New predefined report definitions ----------
INSERT INTO public.report_definitions (slug, name, category, module, source, source_key, description, default_columns, default_group_by, export_formats, sort_order, is_active) VALUES
('prud-breach','Prudential Return Threshold Breaches','Returns & Compliance','prudential_supervision','return_threshold_breaches','return_threshold_breaches','Prudential return metrics that have breached configured thresholds.',ARRAY['metric_key','value','threshold_value','level','risk_level','detected_at'],'risk_level',ARRAY['csv','xlsx','json','pdf'],27,true),
('cmp-sla','Complaint SLA Compliance Report','Complaints','complaint_management','complaints','complaints','Complaints measured against their SLA window.',ARRAY['complaint_number','status','sla_days','created_at','sla_due_at'],NULL,ARRAY['csv','xlsx','json','pdf'],55,true),
('ret-sla','Return Submission SLA Report','Returns & Compliance','returns_management','compliance_returns','compliance_returns','Returns measured against their due-date SLA window.',ARRAY['license_id','due_date','submitted_at','status'],NULL,ARRAY['csv','xlsx','json','pdf'],28,true)
ON CONFLICT (slug) DO UPDATE SET
  name=EXCLUDED.name, category=EXCLUDED.category, module=EXCLUDED.module,
  source=EXCLUDED.source, source_key=EXCLUDED.source_key, description=EXCLUDED.description,
  default_columns=EXCLUDED.default_columns, default_group_by=EXCLUDED.default_group_by,
  export_formats=EXCLUDED.export_formats, sort_order=EXCLUDED.sort_order,
  is_active=true, updated_at=now();

-- ---------- 4. Add 'pdf' to every existing predefined report's export_formats ----------
UPDATE public.report_definitions
SET export_formats = array_append(export_formats, 'pdf'), updated_at = now()
WHERE NOT ('pdf' = ANY(export_formats));

-- ---------- 5. Deactivate broken filters (silent no-ops today) ----------
UPDATE public.report_source_filters SET is_active = false, updated_at = now()
WHERE (source_key, filter_key) IN (
  ('applications', 'sector'),
  ('applications', 'riskLevel'),
  ('complaints', 'riskLevel')
);
