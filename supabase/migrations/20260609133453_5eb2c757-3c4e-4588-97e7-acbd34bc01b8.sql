
-- ============ Reporting views (security_invoker preserves RLS) ============

CREATE OR REPLACE VIEW public.report_view_licenses
WITH (security_invoker = true) AS
SELECT
  l.id,
  l.license_number,
  l.license_type,
  l.status,
  l.application_id,
  a.application_number,
  l.holder_id,
  hp.full_name AS holder_name,
  a.applicant_id,
  ap.full_name AS applicant_name,
  ap.entity_name AS entity_name,
  hp.licensee_id,
  li.name AS licensee_name,
  COALESCE(
    NULLIF(li.name, ''),
    NULLIF(hp.entity_name, ''),
    NULLIF(hp.full_name, ''),
    NULLIF(ap.entity_name, ''),
    NULLIF(ap.full_name, ''),
    NULLIF(ap.email, ''),
    'Unknown'
  ) AS applicant_entity_name,
  l.sector_id,
  s.name AS sector_name,
  l.sub_sector_id,
  ss.name AS sub_sector_name,
  l.regulator_id,
  r.name AS regulator_name,
  l.issued_at,
  l.valid_from,
  l.valid_until,
  l.valid_until AS expiry_date,
  CASE WHEN l.valid_until IS NULL THEN NULL
       ELSE EXTRACT(DAY FROM (l.valid_until - now()))::int END AS days_to_expiry,
  l.created_at,
  l.updated_at
FROM public.licenses l
LEFT JOIN public.applications a ON a.id = l.application_id
LEFT JOIN public.profiles hp ON hp.id = l.holder_id
LEFT JOIN public.profiles ap ON ap.id = a.applicant_id
LEFT JOIN public.licensees li ON li.id = hp.licensee_id
LEFT JOIN public.sectors s ON s.id = l.sector_id
LEFT JOIN public.sub_sectors ss ON ss.id = l.sub_sector_id
LEFT JOIN public.regulators r ON r.id = l.regulator_id;

CREATE OR REPLACE VIEW public.report_view_applications
WITH (security_invoker = true) AS
SELECT
  a.id,
  a.application_number,
  a.applicant_id,
  p.full_name AS applicant_name,
  p.entity_name AS entity_name,
  COALESCE(
    NULLIF(p.entity_name, ''),
    NULLIF(p.full_name, ''),
    NULLIF(p.email, ''),
    'Unknown'
  ) AS applicant_entity_name,
  a.license_type,
  a.status,
  a.regulator_id,
  r.name AS regulator_name,
  a.ack_by AS assigned_officer_id,
  op.full_name AS assigned_officer_name,
  a.submitted_at,
  a.approved_at,
  a.rejected_at,
  a.created_at,
  a.updated_at,
  EXTRACT(DAY FROM (now() - COALESCE(a.submitted_at, a.created_at)))::int AS aging_days
FROM public.applications a
LEFT JOIN public.profiles p ON p.id = a.applicant_id
LEFT JOIN public.profiles op ON op.id = a.ack_by
LEFT JOIN public.regulators r ON r.id = a.regulator_id;

CREATE OR REPLACE VIEW public.report_view_payments
WITH (security_invoker = true) AS
SELECT
  pm.id,
  pm.transaction_ref AS payment_reference,
  pm.transaction_ref AS transaction_id,
  pm.amount,
  pm.currency,
  pm.status,
  pm.paid_at AS payment_date,
  pm.created_at,
  pm.application_id,
  a.application_number,
  pm.user_id AS payer_id,
  up.full_name AS payer_name,
  COALESCE(
    NULLIF(up.entity_name, ''),
    NULLIF(up.full_name, ''),
    NULLIF(up.email, ''),
    NULLIF(ap.entity_name, ''),
    NULLIF(ap.full_name, ''),
    'Unknown'
  ) AS applicant_entity_name,
  a.regulator_id,
  r.name AS regulator_name
FROM public.payments pm
LEFT JOIN public.applications a ON a.id = pm.application_id
LEFT JOIN public.profiles up ON up.id = pm.user_id
LEFT JOIN public.profiles ap ON ap.id = a.applicant_id
LEFT JOIN public.regulators r ON r.id = a.regulator_id;

CREATE OR REPLACE VIEW public.report_view_compliance_returns
WITH (security_invoker = true) AS
SELECT
  cr.id,
  (to_char(cr.period_start, 'YYYY-MM-DD') || ' to ' || to_char(cr.period_end, 'YYYY-MM-DD')) AS return_period,
  cr.period_start,
  cr.period_end,
  cr.license_id,
  l.license_number,
  hp.licensee_id,
  li.name AS licensee_name,
  COALESCE(
    NULLIF(li.name, ''),
    NULLIF(hp.entity_name, ''),
    NULLIF(hp.full_name, ''),
    'Unknown'
  ) AS applicant_entity_name,
  l.sector_id,
  s.name AS sector_name,
  l.regulator_id,
  r.name AS regulator_name,
  cr.status,
  cr.due_date,
  cr.submitted_at,
  CASE WHEN cr.submitted_at IS NULL AND cr.due_date < CURRENT_DATE
       THEN (CURRENT_DATE - cr.due_date)::int ELSE 0 END AS days_overdue,
  cr.created_at,
  cr.updated_at
FROM public.compliance_returns cr
LEFT JOIN public.licenses l ON l.id = cr.license_id
LEFT JOIN public.profiles hp ON hp.id = l.holder_id
LEFT JOIN public.licensees li ON li.id = hp.licensee_id
LEFT JOIN public.sectors s ON s.id = l.sector_id
LEFT JOIN public.regulators r ON r.id = l.regulator_id;

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
  EXTRACT(DAY FROM (COALESCE(c.updated_at, now()) - c.created_at))::int AS resolution_days
FROM public.complaints c
LEFT JOIN public.profiles cp ON cp.id = c.complainant_id
LEFT JOIN public.profiles ip ON ip.id = c.investigator_id
LEFT JOIN public.complaint_types ct ON ct.id = c.complaint_type_id
LEFT JOIN public.regulators r ON r.id = c.regulator_id;

GRANT SELECT ON public.report_view_licenses TO authenticated, service_role;
GRANT SELECT ON public.report_view_applications TO authenticated, service_role;
GRANT SELECT ON public.report_view_payments TO authenticated, service_role;
GRANT SELECT ON public.report_view_compliance_returns TO authenticated, service_role;
GRANT SELECT ON public.report_view_complaints TO authenticated, service_role;

-- ============ Column metadata table ============

CREATE TABLE IF NOT EXISTS public.report_source_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL,
  column_key text NOT NULL,
  label text NOT NULL,
  data_type text,
  is_default boolean NOT NULL DEFAULT false,
  is_sensitive boolean NOT NULL DEFAULT false,
  is_raw_id boolean NOT NULL DEFAULT false,
  is_enriched boolean NOT NULL DEFAULT false,
  is_computed boolean NOT NULL DEFAULT false,
  format text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_key, column_key)
);

GRANT SELECT ON public.report_source_columns TO authenticated;
GRANT ALL ON public.report_source_columns TO service_role;

ALTER TABLE public.report_source_columns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_source_columns read" ON public.report_source_columns;
CREATE POLICY "report_source_columns read" ON public.report_source_columns
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "report_source_columns admin write" ON public.report_source_columns;
CREATE POLICY "report_source_columns admin write" ON public.report_source_columns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============ Update report_sources to point at reporting views ============

UPDATE public.report_sources SET
  table_name = 'report_view_licenses',
  safe_columns = ARRAY['id','license_number','license_type','status','application_id','application_number','holder_id','holder_name','applicant_id','applicant_name','entity_name','licensee_id','licensee_name','applicant_entity_name','sector_id','sector_name','sub_sector_id','sub_sector_name','regulator_id','regulator_name','issued_at','valid_from','valid_until','expiry_date','days_to_expiry','created_at','updated_at'],
  default_columns = ARRAY['license_number','applicant_entity_name','license_type','status','sector_name','regulator_name','issued_at','valid_until','days_to_expiry'],
  search_columns = ARRAY['license_number','application_number','applicant_entity_name','licensee_name','sector_name','regulator_name'],
  updated_at = now()
WHERE source_key = 'licenses';

UPDATE public.report_sources SET
  table_name = 'report_view_applications',
  safe_columns = ARRAY['id','application_number','applicant_id','applicant_name','entity_name','applicant_entity_name','license_type','status','regulator_id','regulator_name','assigned_officer_id','assigned_officer_name','submitted_at','approved_at','rejected_at','created_at','updated_at','aging_days'],
  default_columns = ARRAY['application_number','applicant_entity_name','license_type','status','regulator_name','assigned_officer_name','submitted_at','created_at'],
  search_columns = ARRAY['application_number','applicant_entity_name','applicant_name','entity_name','regulator_name'],
  updated_at = now()
WHERE source_key = 'applications';

UPDATE public.report_sources SET
  table_name = 'report_view_payments',
  safe_columns = ARRAY['id','payment_reference','transaction_id','amount','currency','status','payment_date','created_at','application_id','application_number','payer_id','payer_name','applicant_entity_name','regulator_id','regulator_name'],
  default_columns = ARRAY['payment_reference','payer_name','applicant_entity_name','application_number','amount','status','payment_date','created_at'],
  search_columns = ARRAY['payment_reference','application_number','payer_name','applicant_entity_name'],
  updated_at = now()
WHERE source_key = 'payments';

UPDATE public.report_sources SET
  table_name = 'report_view_compliance_returns',
  safe_columns = ARRAY['id','return_period','period_start','period_end','license_id','license_number','licensee_id','licensee_name','applicant_entity_name','sector_id','sector_name','regulator_id','regulator_name','status','due_date','submitted_at','days_overdue','created_at','updated_at'],
  default_columns = ARRAY['return_period','license_number','applicant_entity_name','status','due_date','submitted_at','days_overdue'],
  search_columns = ARRAY['license_number','applicant_entity_name','licensee_name','sector_name','regulator_name'],
  updated_at = now()
WHERE source_key = 'compliance_returns';

UPDATE public.report_sources SET
  table_name = 'report_view_complaints',
  safe_columns = ARRAY['id','complaint_number','complainant_id','complainant_name','applicant_entity_name','category_id','category_name','complaint_type','regulator_id','regulator_name','assigned_officer_id','assigned_officer_name','status','subject','created_at','updated_at','resolution_days'],
  default_columns = ARRAY['complaint_number','complainant_name','category_name','regulator_name','assigned_officer_name','status','created_at'],
  search_columns = ARRAY['complaint_number','complainant_name','applicant_entity_name','category_name','regulator_name'],
  updated_at = now()
WHERE source_key = 'complaints';

-- ============ Seed report_source_columns ============

-- helper macro pattern: use INSERT ... ON CONFLICT for idempotency.

-- Licenses
INSERT INTO public.report_source_columns (source_key,column_key,label,data_type,is_default,is_raw_id,is_enriched,is_computed,format,sort_order)
VALUES
 ('licenses','license_number','License Number','text',true,false,false,false,null,10),
 ('licenses','applicant_entity_name','Applicant / Entity Name','text',true,false,true,false,null,20),
 ('licenses','licensee_name','Licensee Name','text',false,false,true,false,null,30),
 ('licenses','application_number','Application Number','text',true,false,true,false,null,40),
 ('licenses','license_type','License Type','text',true,false,false,false,null,50),
 ('licenses','status','Status','text',true,false,false,false,null,60),
 ('licenses','sector_name','Sector','text',true,false,true,false,null,70),
 ('licenses','sub_sector_name','Sub-Sector','text',false,false,true,false,null,75),
 ('licenses','regulator_name','Regulator','text',true,false,true,false,null,80),
 ('licenses','issued_at','Issue Date','timestamp',true,false,false,false,'date',90),
 ('licenses','valid_from','Valid From','timestamp',false,false,false,false,'date',95),
 ('licenses','valid_until','Expiry Date','timestamp',true,false,false,false,'date',100),
 ('licenses','expiry_date','Expiry Date','timestamp',false,false,false,false,'date',105),
 ('licenses','days_to_expiry','Days to Expiry','integer',true,false,false,true,'number',110),
 ('licenses','applicant_name','Applicant Name','text',false,false,true,false,null,120),
 ('licenses','entity_name','Entity Name','text',false,false,true,false,null,125),
 ('licenses','holder_name','Holder Name','text',false,false,true,false,null,130),
 ('licenses','created_at','Created','timestamp',false,false,false,false,'datetime',200),
 ('licenses','updated_at','Updated','timestamp',false,false,false,false,'datetime',210),
 ('licenses','id','License ID','uuid',false,true,false,false,null,900),
 ('licenses','licensee_id','Licensee ID','uuid',false,true,false,false,null,910),
 ('licenses','application_id','Application ID','uuid',false,true,false,false,null,920),
 ('licenses','holder_id','Holder ID','uuid',false,true,false,false,null,930),
 ('licenses','applicant_id','Applicant ID','uuid',false,true,false,false,null,940),
 ('licenses','sector_id','Sector ID','uuid',false,true,false,false,null,950),
 ('licenses','sub_sector_id','Sub-Sector ID','uuid',false,true,false,false,null,960),
 ('licenses','regulator_id','Regulator ID','uuid',false,true,false,false,null,970)
ON CONFLICT (source_key,column_key) DO UPDATE SET
  label=EXCLUDED.label, is_default=EXCLUDED.is_default, is_raw_id=EXCLUDED.is_raw_id,
  is_enriched=EXCLUDED.is_enriched, is_computed=EXCLUDED.is_computed, format=EXCLUDED.format,
  sort_order=EXCLUDED.sort_order, updated_at=now();

-- Applications
INSERT INTO public.report_source_columns (source_key,column_key,label,data_type,is_default,is_raw_id,is_enriched,is_computed,format,sort_order)
VALUES
 ('applications','application_number','Application Number','text',true,false,false,false,null,10),
 ('applications','applicant_entity_name','Applicant / Entity Name','text',true,false,true,false,null,20),
 ('applications','applicant_name','Applicant Name','text',false,false,true,false,null,30),
 ('applications','entity_name','Entity Name','text',false,false,true,false,null,40),
 ('applications','license_type','License Type','text',true,false,false,false,null,50),
 ('applications','status','Status','text',true,false,false,false,null,60),
 ('applications','regulator_name','Regulator','text',true,false,true,false,null,70),
 ('applications','assigned_officer_name','Assigned Officer','text',true,false,true,false,null,80),
 ('applications','submitted_at','Submitted','timestamp',true,false,false,false,'datetime',90),
 ('applications','approved_at','Approved','timestamp',false,false,false,false,'datetime',100),
 ('applications','rejected_at','Rejected','timestamp',false,false,false,false,'datetime',110),
 ('applications','created_at','Created','timestamp',true,false,false,false,'datetime',120),
 ('applications','updated_at','Updated','timestamp',false,false,false,false,'datetime',130),
 ('applications','aging_days','Aging (days)','integer',false,false,false,true,'number',140),
 ('applications','id','Application ID','uuid',false,true,false,false,null,900),
 ('applications','applicant_id','Applicant ID','uuid',false,true,false,false,null,910),
 ('applications','assigned_officer_id','Officer ID','uuid',false,true,false,false,null,920),
 ('applications','regulator_id','Regulator ID','uuid',false,true,false,false,null,930)
ON CONFLICT (source_key,column_key) DO UPDATE SET
  label=EXCLUDED.label, is_default=EXCLUDED.is_default, is_raw_id=EXCLUDED.is_raw_id,
  is_enriched=EXCLUDED.is_enriched, is_computed=EXCLUDED.is_computed, format=EXCLUDED.format,
  sort_order=EXCLUDED.sort_order, updated_at=now();

-- Payments
INSERT INTO public.report_source_columns (source_key,column_key,label,data_type,is_default,is_raw_id,is_enriched,is_computed,format,sort_order)
VALUES
 ('payments','payment_reference','Payment Reference','text',true,false,false,false,null,10),
 ('payments','payer_name','Payer Name','text',true,false,true,false,null,20),
 ('payments','applicant_entity_name','Applicant / Entity Name','text',true,false,true,false,null,30),
 ('payments','application_number','Application Number','text',true,false,true,false,null,40),
 ('payments','amount','Amount','numeric',true,false,false,false,'number',50),
 ('payments','currency','Currency','text',false,false,false,false,null,55),
 ('payments','status','Status','text',true,false,false,false,null,60),
 ('payments','payment_date','Payment Date','timestamp',true,false,false,false,'datetime',70),
 ('payments','regulator_name','Regulator','text',false,false,true,false,null,80),
 ('payments','created_at','Created','timestamp',true,false,false,false,'datetime',90),
 ('payments','transaction_id','Transaction ID','text',false,false,false,false,null,100),
 ('payments','id','Payment ID','uuid',false,true,false,false,null,900),
 ('payments','application_id','Application ID','uuid',false,true,false,false,null,910),
 ('payments','payer_id','Payer ID','uuid',false,true,false,false,null,920),
 ('payments','regulator_id','Regulator ID','uuid',false,true,false,false,null,930)
ON CONFLICT (source_key,column_key) DO UPDATE SET
  label=EXCLUDED.label, is_default=EXCLUDED.is_default, is_raw_id=EXCLUDED.is_raw_id,
  is_enriched=EXCLUDED.is_enriched, is_computed=EXCLUDED.is_computed, format=EXCLUDED.format,
  sort_order=EXCLUDED.sort_order, updated_at=now();

-- Compliance Returns
INSERT INTO public.report_source_columns (source_key,column_key,label,data_type,is_default,is_raw_id,is_enriched,is_computed,format,sort_order)
VALUES
 ('compliance_returns','return_period','Return Period','text',true,false,true,false,null,10),
 ('compliance_returns','license_number','License Number','text',true,false,true,false,null,20),
 ('compliance_returns','applicant_entity_name','Applicant / Entity Name','text',true,false,true,false,null,30),
 ('compliance_returns','licensee_name','Licensee Name','text',false,false,true,false,null,40),
 ('compliance_returns','sector_name','Sector','text',false,false,true,false,null,50),
 ('compliance_returns','regulator_name','Regulator','text',false,false,true,false,null,60),
 ('compliance_returns','status','Status','text',true,false,false,false,null,70),
 ('compliance_returns','due_date','Due Date','date',true,false,false,false,'date',80),
 ('compliance_returns','submitted_at','Submitted','timestamp',true,false,false,false,'datetime',90),
 ('compliance_returns','days_overdue','Days Overdue','integer',true,false,false,true,'number',100),
 ('compliance_returns','period_start','Period Start','date',false,false,false,false,'date',110),
 ('compliance_returns','period_end','Period End','date',false,false,false,false,'date',120),
 ('compliance_returns','created_at','Created','timestamp',false,false,false,false,'datetime',130),
 ('compliance_returns','id','Return ID','uuid',false,true,false,false,null,900),
 ('compliance_returns','license_id','License ID','uuid',false,true,false,false,null,910),
 ('compliance_returns','licensee_id','Licensee ID','uuid',false,true,false,false,null,920),
 ('compliance_returns','sector_id','Sector ID','uuid',false,true,false,false,null,930),
 ('compliance_returns','regulator_id','Regulator ID','uuid',false,true,false,false,null,940)
ON CONFLICT (source_key,column_key) DO UPDATE SET
  label=EXCLUDED.label, is_default=EXCLUDED.is_default, is_raw_id=EXCLUDED.is_raw_id,
  is_enriched=EXCLUDED.is_enriched, is_computed=EXCLUDED.is_computed, format=EXCLUDED.format,
  sort_order=EXCLUDED.sort_order, updated_at=now();

-- Complaints
INSERT INTO public.report_source_columns (source_key,column_key,label,data_type,is_default,is_raw_id,is_enriched,is_computed,format,sort_order)
VALUES
 ('complaints','complaint_number','Complaint Number','text',true,false,false,false,null,10),
 ('complaints','complainant_name','Complainant Name','text',true,false,true,false,null,20),
 ('complaints','applicant_entity_name','Applicant / Entity Name','text',false,false,true,false,null,30),
 ('complaints','category_name','Category','text',true,false,true,false,null,40),
 ('complaints','complaint_type','Complaint Type','text',false,false,true,false,null,45),
 ('complaints','regulator_name','Regulator','text',true,false,true,false,null,50),
 ('complaints','assigned_officer_name','Assigned Officer','text',true,false,true,false,null,60),
 ('complaints','status','Status','text',true,false,false,false,null,70),
 ('complaints','subject','Subject','text',false,false,false,false,null,80),
 ('complaints','created_at','Created','timestamp',true,false,false,false,'datetime',90),
 ('complaints','updated_at','Updated','timestamp',false,false,false,false,'datetime',100),
 ('complaints','resolution_days','Resolution (days)','integer',false,false,false,true,'number',110),
 ('complaints','id','Complaint ID','uuid',false,true,false,false,null,900),
 ('complaints','complainant_id','Complainant ID','uuid',false,true,false,false,null,910),
 ('complaints','category_id','Category ID','uuid',false,true,false,false,null,920),
 ('complaints','assigned_officer_id','Officer ID','uuid',false,true,false,false,null,930),
 ('complaints','regulator_id','Regulator ID','uuid',false,true,false,false,null,940)
ON CONFLICT (source_key,column_key) DO UPDATE SET
  label=EXCLUDED.label, is_default=EXCLUDED.is_default, is_raw_id=EXCLUDED.is_raw_id,
  is_enriched=EXCLUDED.is_enriched, is_computed=EXCLUDED.is_computed, format=EXCLUDED.format,
  sort_order=EXCLUDED.sort_order, updated_at=now();

-- ============ Update predefined report_definitions default_columns ============

UPDATE public.report_definitions
SET default_columns = ARRAY['license_number','applicant_entity_name','license_type','status','sector_name','regulator_name','issued_at','valid_until','days_to_expiry']
WHERE slug IN ('lic-issuance','lic-expiry','lic-suspended','lic-distribution');

UPDATE public.report_definitions
SET default_columns = ARRAY['application_number','applicant_entity_name','license_type','status','regulator_name','assigned_officer_name','submitted_at','created_at']
WHERE slug IN ('app-status','app-aging','app-sla','op-workload','op-productivity','op-process-time','op-ratio','op-pending');

UPDATE public.report_definitions
SET default_columns = ARRAY['payment_reference','payer_name','applicant_entity_name','application_number','amount','status','payment_date']
WHERE slug IN ('fee-collection','fee-outstanding','fee-failed','fee-refund','fee-sector','fee-trend');

UPDATE public.report_definitions
SET default_columns = ARRAY['return_period','license_number','applicant_entity_name','status','due_date','submitted_at','days_overdue']
WHERE slug IN ('ret-status','ret-overdue','ret-defaulters','ret-scorecard','ret-latefee','ret-risk','ret-repeat');

UPDATE public.report_definitions
SET default_columns = ARRAY['complaint_number','complainant_name','category_name','regulator_name','assigned_officer_name','status','created_at']
WHERE slug IN ('cmp-volume','cmp-resolution','cmp-pending','cmp-category','cmp-escalated');
