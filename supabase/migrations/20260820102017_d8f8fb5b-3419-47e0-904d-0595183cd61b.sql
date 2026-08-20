-- ============================================================
-- CERTIFICATION DATASET v1 — foundation: helpers, manifest, reference data
-- ============================================================

CREATE OR REPLACE FUNCTION public.cert_uuid(_key text)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (substr(m,1,8)||'-'||substr(m,9,4)||'-4'||substr(m,14,3)||'-8'||substr(m,18,3)||'-'||substr(m,21,12))::uuid
  FROM md5('CERTv1:'||coalesce(_key,'')) m;
$$;

COMMENT ON FUNCTION public.cert_uuid(text) IS 'Deterministic UUID for CERTIFICATION DATASET v1 scenario keys. Same key always yields the same identity across reset/seed cycles.';

CREATE TABLE IF NOT EXISTS public.certification_seed_manifest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_key text NOT NULL DEFAULT 'CERTIFICATION_DATASET_V1',
  scenario_key text NOT NULL,
  record_kind text NOT NULL,
  display_name text,
  party_id uuid,
  organization_party_id uuid,
  entity_id uuid,
  public_slug text,
  entity_email text,
  primary_identifiers jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dataset_key, scenario_key, record_kind)
);

GRANT SELECT ON public.certification_seed_manifest TO authenticated;
GRANT ALL ON public.certification_seed_manifest TO service_role;
ALTER TABLE public.certification_seed_manifest ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='certification_seed_manifest'
      AND policyname='Admins read certification seed manifest'
  ) THEN
    CREATE POLICY "Admins read certification seed manifest"
      ON public.certification_seed_manifest FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));
  END IF;
END $$;

-- ------------------------------------------------------------
-- Regulatory metrics (reference data — intentional addition)
-- ------------------------------------------------------------
INSERT INTO public.regulatory_metrics
  (id, code, name, description, data_domain_id, data_type, unit, aggregation_type,
   frequency_compatibility, sensitivity, is_calculated, calculation_strategy, is_active, is_system)
SELECT public.cert_uuid('metric:'||m.code), m.code, m.name, m.description,
       (SELECT id FROM public.data_domains WHERE key='prudential' LIMIT 1),
       m.data_type, m.unit, m.aggregation_type,
       ARRAY['MONTHLY','QUARTERLY','SEMI_ANNUAL','ANNUAL']::text[],
       'INTERNAL', m.is_calculated,
       CASE WHEN m.is_calculated THEN 'EXPRESSION' ELSE NULL END, true, true
FROM (VALUES
  ('TOTAL_ASSETS','Total Assets','Total assets reported on the balance sheet','CURRENCY','XCD','POINT_IN_TIME',false),
  ('TOTAL_LIABILITIES','Total Liabilities','Total liabilities reported on the balance sheet','CURRENCY','XCD','POINT_IN_TIME',false),
  ('TOTAL_EQUITY','Total Equity','Total shareholders equity','CURRENCY','XCD','POINT_IN_TIME',false),
  ('TOTAL_CAPITAL','Total Regulatory Capital','Total qualifying regulatory capital','CURRENCY','XCD','POINT_IN_TIME',false),
  ('RWA','Risk Weighted Assets','Total risk weighted assets','CURRENCY','XCD','POINT_IN_TIME',false),
  ('GROSS_LOANS','Gross Loans and Advances','Gross loans and advances to customers','CURRENCY','XCD','POINT_IN_TIME',false),
  ('NON_PERFORMING_LOANS','Non-Performing Loans','Loans classified as non-performing','CURRENCY','XCD','POINT_IN_TIME',false),
  ('CUSTOMER_DEPOSITS','Customer Deposits','Total customer deposit liabilities','CURRENCY','XCD','POINT_IN_TIME',false),
  ('LIQUID_ASSETS','Liquid Assets','Total liquid assets held','CURRENCY','XCD','POINT_IN_TIME',false),
  ('SHORT_TERM_LIABILITIES','Short Term Liabilities','Liabilities maturing within 30 days','CURRENCY','XCD','POINT_IN_TIME',false),
  ('NET_INTEREST_INCOME','Net Interest Income','Interest income less interest expense','CURRENCY','XCD','SUM',false),
  ('OPERATING_EXPENSES','Operating Expenses','Total operating expenses for the period','CURRENCY','XCD','SUM',false),
  ('NET_PROFIT','Net Profit After Tax','Net profit after tax for the period','CURRENCY','XCD','SUM',false),
  ('GROSS_WRITTEN_PREMIUM','Gross Written Premium','Gross written premium for the period','CURRENCY','XCD','SUM',false),
  ('CLAIMS_INCURRED','Claims Incurred','Claims incurred during the period','CURRENCY','XCD','SUM',false),
  ('TECHNICAL_PROVISIONS','Technical Provisions','Insurance technical provisions held','CURRENCY','XCD','POINT_IN_TIME',false),
  ('TRANSACTION_VALUE','Transaction Value','Total value of transactions processed','CURRENCY','XCD','SUM',false),
  ('TRANSACTION_COUNT','Transaction Count','Number of transactions processed','INTEGER','count','COUNT',false),
  ('BRANCH_COUNT','Branch Count','Number of operating branches or agent locations','INTEGER','count','COUNT',false),
  ('STAFF_COUNT','Staff Count','Number of employees at period end','INTEGER','count','COUNT',false),
  ('CAPITAL_ADEQUACY_RATIO','Capital Adequacy Ratio','Total regulatory capital as a percentage of risk weighted assets','PERCENTAGE','%','RATIO',true),
  ('NPL_RATIO','Non-Performing Loan Ratio','Non-performing loans as a percentage of gross loans','PERCENTAGE','%','RATIO',true),
  ('LIQUIDITY_RATIO','Liquidity Ratio','Liquid assets as a percentage of short term liabilities','PERCENTAGE','%','RATIO',true),
  ('COST_INCOME_RATIO','Cost to Income Ratio','Operating expenses as a percentage of net interest income','PERCENTAGE','%','RATIO',true),
  ('LOSS_RATIO','Loss Ratio','Claims incurred as a percentage of gross written premium','PERCENTAGE','%','RATIO',true)
) AS m(code,name,description,data_type,unit,aggregation_type,is_calculated)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.metric_calculation_rules
  (id, regulatory_metric_id, version, expression, dependency_metric_codes, on_missing_dependency, notes, is_active)
SELECT public.cert_uuid('metricrule:'||r.code), public.cert_uuid('metric:'||r.code), 1,
       r.expression, r.deps, 'NOT_AVAILABLE', 'CERTIFICATION DATASET v1 reference calculation', true
FROM (VALUES
  ('CAPITAL_ADEQUACY_RATIO','(TOTAL_CAPITAL / RWA) * 100', ARRAY['TOTAL_CAPITAL','RWA']),
  ('NPL_RATIO','(NON_PERFORMING_LOANS / GROSS_LOANS) * 100', ARRAY['NON_PERFORMING_LOANS','GROSS_LOANS']),
  ('LIQUIDITY_RATIO','(LIQUID_ASSETS / SHORT_TERM_LIABILITIES) * 100', ARRAY['LIQUID_ASSETS','SHORT_TERM_LIABILITIES']),
  ('COST_INCOME_RATIO','(OPERATING_EXPENSES / NET_INTEREST_INCOME) * 100', ARRAY['OPERATING_EXPENSES','NET_INTEREST_INCOME']),
  ('LOSS_RATIO','(CLAIMS_INCURRED / GROSS_WRITTEN_PREMIUM) * 100', ARRAY['CLAIMS_INCURRED','GROSS_WRITTEN_PREMIUM'])
) AS r(code,expression,deps)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- Return definitions (reference data — intentional addition)
-- ------------------------------------------------------------
INSERT INTO public.return_definitions
  (id, code, name, description, frequency, filing_basis, due_days_after_period_end,
   requires_declaration, declaration_text, status, is_active, effective_from)
SELECT public.cert_uuid('rd:'||d.code), d.code, d.name, d.description, d.frequency, 'SOLO',
       d.due_days, true,
       'I confirm that the information in this return is complete and accurate to the best of my knowledge.',
       'ACTIVE', true, DATE '2024-01-01'
FROM (VALUES
  ('PRUD_BS_Q','Quarterly Balance Sheet Return','Quarterly statement of financial position','QUARTERLY',30),
  ('PRUD_PL_Q','Quarterly Profit and Loss Return','Quarterly statement of comprehensive income','QUARTERLY',30),
  ('PRUD_CAP_Q','Quarterly Capital Adequacy Return','Quarterly regulatory capital and risk weighted assets return','QUARTERLY',45),
  ('INS_TECH_Q','Quarterly Insurance Technical Return','Quarterly premium, claims and technical provision return','QUARTERLY',45),
  ('MSB_TXN_M','Monthly Transaction Volume Return','Monthly transaction volume and value return for payments and money services','MONTHLY',15),
  ('ANN_AUD_A','Annual Audited Financial Statements','Annual audited financial statements and auditor report','ANNUAL',120)
) AS d(code,name,description,frequency,due_days)
ON CONFLICT (id) DO NOTHING;

-- Bind existing published financial forms to the balance sheet / P&L definitions
INSERT INTO public.return_definition_forms
  (id, return_definition_id, form_template_id, sequence, is_required, section_label, tab_name, effective_from)
VALUES
  (public.cert_uuid('rdf:PRUD_BS_Q:bs'), public.cert_uuid('rd:PRUD_BS_Q'),
   '59ebe8fc-b5dd-476c-8d6e-2004855227ff', 1, true, 'Statement of Financial Position', 'Balance Sheet', DATE '2024-01-01'),
  (public.cert_uuid('rdf:PRUD_PL_Q:pl'), public.cert_uuid('rd:PRUD_PL_Q'),
   '7ac713bf-4866-4570-988e-8cf3cbd2369d', 1, true, 'Statement of Comprehensive Income', 'P&L', DATE '2024-01-01')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- Reporting obligation rules per sector
-- ------------------------------------------------------------
INSERT INTO public.reporting_obligation_rules
  (id, return_definition_id, code, name, description, sector_id, requires_active_license,
   priority, effective_from, is_active)
SELECT public.cert_uuid('ror:'||r.def_code||':'||r.sector_name),
       public.cert_uuid('rd:'||r.def_code),
       r.def_code||'_'||upper(regexp_replace(r.sector_name,'[^A-Za-z0-9]+','_','g')),
       r.def_code||' — '||r.sector_name,
       'CERTIFICATION DATASET v1 applicability rule',
       s.id, true, 100, DATE '2024-01-01', true
FROM (VALUES
  ('PRUD_BS_Q','Commercial Bank'),('PRUD_BS_Q','Merchant Bank'),('PRUD_BS_Q','Building Society'),
  ('PRUD_BS_Q','Micro-credit Institution'),('PRUD_BS_Q','General Insurance'),('PRUD_BS_Q','Life Insurance'),
  ('PRUD_BS_Q','Securities Dealer'),('PRUD_BS_Q','Payment Service Provider'),('PRUD_BS_Q','Money Service Business'),
  ('PRUD_BS_Q','Financial Holding Company'),('PRUD_BS_Q','Pension Fund Administrator'),
  ('PRUD_PL_Q','Commercial Bank'),('PRUD_PL_Q','Merchant Bank'),('PRUD_PL_Q','Building Society'),
  ('PRUD_PL_Q','Micro-credit Institution'),('PRUD_PL_Q','Securities Dealer'),('PRUD_PL_Q','Financial Holding Company'),
  ('PRUD_CAP_Q','Commercial Bank'),('PRUD_CAP_Q','Merchant Bank'),('PRUD_CAP_Q','Building Society'),
  ('PRUD_CAP_Q','Securities Dealer'),
  ('INS_TECH_Q','General Insurance'),('INS_TECH_Q','Life Insurance'),
  ('MSB_TXN_M','Payment Service Provider'),('MSB_TXN_M','Money Service Business'),
  ('ANN_AUD_A','Commercial Bank'),('ANN_AUD_A','Merchant Bank'),('ANN_AUD_A','Building Society'),
  ('ANN_AUD_A','Micro-credit Institution'),('ANN_AUD_A','General Insurance'),('ANN_AUD_A','Life Insurance'),
  ('ANN_AUD_A','Securities Dealer'),('ANN_AUD_A','Payment Service Provider'),
  ('ANN_AUD_A','Money Service Business'),('ANN_AUD_A','Financial Holding Company'),
  ('ANN_AUD_A','Pension Fund Administrator')
) AS r(def_code,sector_name)
JOIN public.sectors s ON s.name = r.sector_name
ON CONFLICT (id) DO NOTHING;