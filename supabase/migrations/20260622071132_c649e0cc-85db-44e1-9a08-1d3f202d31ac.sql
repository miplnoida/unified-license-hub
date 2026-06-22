
DO $$
DECLARE
  v_template_id uuid := gen_random_uuid();
  v_version_id  uuid := gen_random_uuid();
  v_regulator_id uuid;
  s1 text := gen_random_uuid()::text;
  s2 text := gen_random_uuid()::text;
  s3 text := gen_random_uuid()::text;
  s4 text := gen_random_uuid()::text;
  s5 text := gen_random_uuid()::text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.form_templates
    WHERE name = 'Securities Dealer License Application'
  ) THEN
    RETURN;
  END IF;

  SELECT regulator_id INTO v_regulator_id
  FROM public.form_templates
  WHERE regulator_id IS NOT NULL
  LIMIT 1;

  INSERT INTO public.form_templates
    (id, name, description, form_type, sector, sub_sector, category, service,
     regulator_id, is_reusable, status)
  VALUES
    (v_template_id, 'Securities Dealer License Application',
     'Application form for licensing a Securities Dealer / Broker-Dealer',
     'pre_license', 'Capital Markets', 'Securities', 'Broker-Dealer License', '',
     v_regulator_id, false, 'published');

  INSERT INTO public.form_versions
    (id, template_id, version, semantic_version, status, published_at, change_notes)
  VALUES
    (v_version_id, v_template_id, 1, '1.0.0', 'published', now(),
     'Initial Securities Dealer application form');

  -- Section 1 — Qualified Registered Representative Evidence
  INSERT INTO public.form_fields
    (id, version_id, section_id, section_title, section_order,
     field_type, label, field_name, required, placeholder, sort_order, options, table_columns)
  VALUES
    (gen_random_uuid(), v_version_id, s1, 'Qualified Registered Representative Evidence', 0, 'number',
     'Total Number of Registered Representatives', 'total_reg_reps', true, 'Enter count', 0, NULL, NULL),
    (gen_random_uuid(), v_version_id, s1, 'Qualified Registered Representative Evidence', 0, 'table',
     'Registered Representatives', 'registered_representatives', true, NULL, 1, NULL,
     '[
        {"id":"col_rep_name","label":"Full Name","type":"text"},
        {"id":"col_rep_id","label":"National ID / Passport","type":"text"},
        {"id":"col_rep_role","label":"Role / Function","type":"text"},
        {"id":"col_rep_qualification","label":"Qualification","type":"text"},
        {"id":"col_rep_exam","label":"Licensing Exam Passed","type":"text"},
        {"id":"col_rep_exam_date","label":"Exam Date","type":"date"},
        {"id":"col_rep_experience","label":"Experience (Years)","type":"number"}
      ]'::jsonb),
    (gen_random_uuid(), v_version_id, s1, 'Qualified Registered Representative Evidence', 0, 'textarea',
     'Continuing Professional Development Program', 'cpd_program', true,
     'Describe CPD requirements and tracking', 2, NULL, NULL),
    (gen_random_uuid(), v_version_id, s1, 'Qualified Registered Representative Evidence', 0, 'file',
     'Qualification Certificates & Licenses', 'rep_qualification_docs', true, NULL, 3, NULL, NULL);

  -- Section 2 — Client Asset Segregation Procedures
  INSERT INTO public.form_fields
    (id, version_id, section_id, section_title, section_order,
     field_type, label, field_name, required, placeholder, sort_order, options, table_columns)
  VALUES
    (gen_random_uuid(), v_version_id, s2, 'Client Asset Segregation Procedures', 1, 'textarea',
     'Segregation Policy Overview', 'segregation_policy_overview', true,
     'Describe client asset segregation framework', 0, NULL, NULL),
    (gen_random_uuid(), v_version_id, s2, 'Client Asset Segregation Procedures', 1, 'table',
     'Client Bank & Custody Accounts', 'client_segregated_accounts', true, NULL, 1, NULL,
     '[
        {"id":"col_acct_institution","label":"Institution","type":"text"},
        {"id":"col_acct_type","label":"Account Type","type":"text"},
        {"id":"col_acct_number","label":"Account Number","type":"text"},
        {"id":"col_acct_currency","label":"Currency","type":"text"},
        {"id":"col_acct_purpose","label":"Purpose","type":"text"}
      ]'::jsonb),
    (gen_random_uuid(), v_version_id, s2, 'Client Asset Segregation Procedures', 1, 'textarea',
     'Reconciliation Frequency & Process', 'segregation_reconciliation', true,
     'Describe reconciliation cadence and exception handling', 2, NULL, NULL),
    (gen_random_uuid(), v_version_id, s2, 'Client Asset Segregation Procedures', 1, 'textarea',
     'Custodian Arrangements', 'custodian_arrangements', true,
     'Describe custodian(s) and oversight', 3, NULL, NULL),
    (gen_random_uuid(), v_version_id, s2, 'Client Asset Segregation Procedures', 1, 'file',
     'Segregation Policy Document', 'segregation_policy_doc', true, NULL, 4, NULL, NULL);

  -- Section 3 — Market Conduct Attestations
  INSERT INTO public.form_fields
    (id, version_id, section_id, section_title, section_order,
     field_type, label, field_name, required, placeholder, sort_order, options, table_columns)
  VALUES
    (gen_random_uuid(), v_version_id, s3, 'Market Conduct Attestations', 2, 'textarea',
     'Code of Conduct Summary', 'code_of_conduct_summary', true,
     'Describe code of conduct, ethics, and fair dealing policies', 0, NULL, NULL),
    (gen_random_uuid(), v_version_id, s3, 'Market Conduct Attestations', 2, 'textarea',
     'Conflicts of Interest Policy', 'conflicts_of_interest_policy', true,
     'Describe identification, disclosure and mitigation of conflicts', 1, NULL, NULL),
    (gen_random_uuid(), v_version_id, s3, 'Market Conduct Attestations', 2, 'textarea',
     'Insider Trading & Market Abuse Controls', 'market_abuse_controls', true,
     'Describe controls preventing insider trading and market manipulation', 2, NULL, NULL),
    (gen_random_uuid(), v_version_id, s3, 'Market Conduct Attestations', 2, 'textarea',
     'Complaints Handling Procedure', 'complaints_handling_procedure', true,
     'Describe client complaint intake and resolution process', 3, NULL, NULL),
    (gen_random_uuid(), v_version_id, s3, 'Market Conduct Attestations', 2, 'table',
     'Attestations', 'market_conduct_attestations', true, NULL, 4, NULL,
     '[
        {"id":"col_att_topic","label":"Attestation Topic","type":"text"},
        {"id":"col_att_signatory","label":"Authorized Signatory","type":"text"},
        {"id":"col_att_position","label":"Position","type":"text"},
        {"id":"col_att_date","label":"Date","type":"date"}
      ]'::jsonb),
    (gen_random_uuid(), v_version_id, s3, 'Market Conduct Attestations', 2, 'file',
     'Signed Attestation Documents', 'attestation_docs', true, NULL, 5, NULL, NULL);

  -- Section 4 — Trading Systems
  INSERT INTO public.form_fields
    (id, version_id, section_id, section_title, section_order,
     field_type, label, field_name, required, placeholder, sort_order, options, table_columns)
  VALUES
    (gen_random_uuid(), v_version_id, s4, 'Trading Systems', 3, 'table',
     'Trading Platforms', 'trading_platforms', true, NULL, 0, NULL,
     '[
        {"id":"col_sys_name","label":"System Name","type":"text"},
        {"id":"col_sys_vendor","label":"Vendor","type":"text"},
        {"id":"col_sys_version","label":"Version","type":"text"},
        {"id":"col_sys_purpose","label":"Purpose / Asset Class","type":"text"},
        {"id":"col_sys_hosting","label":"Hosting (On-prem/Cloud)","type":"text"}
      ]'::jsonb),
    (gen_random_uuid(), v_version_id, s4, 'Trading Systems', 3, 'multi_select',
     'Markets Connected', 'markets_connected', true, 'Select markets', 1,
     '["Local Stock Exchange","Bond Market","FX","Derivatives","International Exchanges","OTC"]'::jsonb, NULL),
    (gen_random_uuid(), v_version_id, s4, 'Trading Systems', 3, 'textarea',
     'Order Management & Execution Workflow', 'oms_execution_workflow', true,
     'Describe OMS, routing, execution and post-trade workflow', 2, NULL, NULL),
    (gen_random_uuid(), v_version_id, s4, 'Trading Systems', 3, 'textarea',
     'Cybersecurity & Business Continuity Controls', 'trading_cyber_bcp', true,
     'Describe cyber controls, DR, and BCP for trading systems', 3, NULL, NULL),
    (gen_random_uuid(), v_version_id, s4, 'Trading Systems', 3, 'textarea',
     'Audit Trail & Surveillance', 'audit_trail_surveillance', true,
     'Describe trade surveillance and audit trail retention', 4, NULL, NULL),
    (gen_random_uuid(), v_version_id, s4, 'Trading Systems', 3, 'file',
     'Trading System Architecture Document', 'trading_architecture_doc', true, NULL, 5, NULL, NULL);

  -- Section 5 — Capital
  INSERT INTO public.form_fields
    (id, version_id, section_id, section_title, section_order,
     field_type, label, field_name, required, placeholder, sort_order, options, table_columns)
  VALUES
    (gen_random_uuid(), v_version_id, s5, 'Capital', 4, 'number',
     'Paid-up Capital (JMD)', 'paid_up_capital', true, 'Enter amount', 0, NULL, NULL),
    (gen_random_uuid(), v_version_id, s5, 'Capital', 4, 'number',
     'Minimum Required Capital (JMD)', 'minimum_required_capital', true, 'Enter amount', 1, NULL, NULL),
    (gen_random_uuid(), v_version_id, s5, 'Capital', 4, 'number',
     'Net Liquid Capital (JMD)', 'net_liquid_capital', true, 'Enter amount', 2, NULL, NULL),
    (gen_random_uuid(), v_version_id, s5, 'Capital', 4, 'number',
     'Risk-Based Capital Requirement (JMD)', 'risk_based_capital_requirement', true,
     'Enter amount', 3, NULL, NULL),
    (gen_random_uuid(), v_version_id, s5, 'Capital', 4, 'number',
     'Capital Adequacy Ratio (%)', 'capital_adequacy_ratio', true, 'Enter percentage', 4, NULL, NULL),
    (gen_random_uuid(), v_version_id, s5, 'Capital', 4, 'textarea',
     'Source of Capital', 'source_of_capital', true,
     'Describe source(s) of capital', 5, NULL, NULL),
    (gen_random_uuid(), v_version_id, s5, 'Capital', 4, 'textarea',
     'Capital Management & Contingency Plan', 'capital_contingency_plan', true,
     'Describe capital management and contingency plan', 6, NULL, NULL),
    (gen_random_uuid(), v_version_id, s5, 'Capital', 4, 'file',
     'Audited Financial Statements', 'audited_financials_file', true, NULL, 7, NULL, NULL),
    (gen_random_uuid(), v_version_id, s5, 'Capital', 4, 'file',
     'Capital Adequacy Computation', 'capital_adequacy_computation', true, NULL, 8, NULL, NULL);
END $$;
