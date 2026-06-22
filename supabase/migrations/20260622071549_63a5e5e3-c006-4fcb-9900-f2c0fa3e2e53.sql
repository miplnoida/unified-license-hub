
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
    WHERE name = 'Micro-Credit Institution License Application'
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
    (v_template_id, 'Micro-Credit Institution License Application',
     'Application form for licensing a Micro-Credit Institution under the MCA 2021',
     'pre_license', 'Banking', 'Commercial Banking', 'Microfinance Institution', '',
     v_regulator_id, false, 'published');

  INSERT INTO public.form_versions
    (id, template_id, version, semantic_version, status, published_at, change_notes)
  VALUES
    (v_version_id, v_template_id, 1, '1.0.0', 'published', now(),
     'Initial Micro-Credit Institution application form');

  -- Section 1 — MCA 2021 Compliance Checklist
  INSERT INTO public.form_fields
    (id, version_id, section_id, section_title, section_order,
     field_type, label, field_name, required, placeholder, sort_order, options, table_columns)
  VALUES
    (gen_random_uuid(), v_version_id, s1, 'MCA 2021 Compliance Checklist', 0, 'text',
     'Legal Entity Name', 'legal_entity_name', true, 'Enter legal entity name', 0, NULL, NULL),
    (gen_random_uuid(), v_version_id, s1, 'MCA 2021 Compliance Checklist', 0, 'text',
     'Company Registration Number', 'registration_number', true, 'Enter registration number', 1, NULL, NULL),
    (gen_random_uuid(), v_version_id, s1, 'MCA 2021 Compliance Checklist', 0, 'table',
     'MCA 2021 Compliance Items', 'mca_compliance_checklist', true, NULL, 2, NULL,
     '[
        {"id":"col_mca_section","label":"MCA 2021 Section","type":"text"},
        {"id":"col_mca_requirement","label":"Requirement","type":"text"},
        {"id":"col_mca_status","label":"Compliance Status","type":"select","options":["Compliant","Partially Compliant","Non-Compliant","N/A"]},
        {"id":"col_mca_evidence","label":"Evidence Reference","type":"text"},
        {"id":"col_mca_remarks","label":"Remarks","type":"text"}
      ]'::jsonb),
    (gen_random_uuid(), v_version_id, s1, 'MCA 2021 Compliance Checklist', 0, 'textarea',
     'Statement of Compliance', 'compliance_statement', true,
     'Provide a statement confirming adherence to MCA 2021', 3, NULL, NULL),
    (gen_random_uuid(), v_version_id, s1, 'MCA 2021 Compliance Checklist', 0, 'file',
     'Supporting Compliance Evidence', 'mca_compliance_evidence_file', true, NULL, 4, NULL, NULL);

  -- Section 2 — Proposed Interest Rate Schedule
  INSERT INTO public.form_fields
    (id, version_id, section_id, section_title, section_order,
     field_type, label, field_name, required, placeholder, sort_order, options, table_columns)
  VALUES
    (gen_random_uuid(), v_version_id, s2, 'Proposed Interest Rate Schedule', 1, 'select',
     'Interest Calculation Basis', 'interest_calculation_basis', true, 'Select basis', 0,
     '["Reducing Balance","Flat Rate","Compound","Other"]'::jsonb, NULL),
    (gen_random_uuid(), v_version_id, s2, 'Proposed Interest Rate Schedule', 1, 'table',
     'Loan Products & Rates', 'interest_rate_schedule', true, NULL, 1, NULL,
     '[
        {"id":"col_prod_name","label":"Loan Product","type":"text"},
        {"id":"col_prod_min_amt","label":"Min Amount (JMD)","type":"number"},
        {"id":"col_prod_max_amt","label":"Max Amount (JMD)","type":"number"},
        {"id":"col_prod_tenure_min","label":"Min Tenure (Months)","type":"number"},
        {"id":"col_prod_tenure_max","label":"Max Tenure (Months)","type":"number"},
        {"id":"col_prod_rate_min","label":"Interest Rate Min (%)","type":"number"},
        {"id":"col_prod_rate_max","label":"Interest Rate Max (%)","type":"number"},
        {"id":"col_prod_apr","label":"Effective APR (%)","type":"number"}
      ]'::jsonb),
    (gen_random_uuid(), v_version_id, s2, 'Proposed Interest Rate Schedule', 1, 'table',
     'Fees & Charges', 'fees_and_charges', true, NULL, 2, NULL,
     '[
        {"id":"col_fee_name","label":"Fee / Charge","type":"text"},
        {"id":"col_fee_basis","label":"Basis","type":"text"},
        {"id":"col_fee_amount","label":"Amount / Rate","type":"text"},
        {"id":"col_fee_when","label":"When Charged","type":"text"}
      ]'::jsonb),
    (gen_random_uuid(), v_version_id, s2, 'Proposed Interest Rate Schedule', 1, 'textarea',
     'Rate Setting Methodology', 'rate_setting_methodology', true,
     'Describe how interest rates and fees are determined', 3, NULL, NULL),
    (gen_random_uuid(), v_version_id, s2, 'Proposed Interest Rate Schedule', 1, 'file',
     'Interest Rate Schedule Document', 'interest_rate_schedule_doc', true, NULL, 4, NULL, NULL);

  -- Section 3 — Consumer Protection Framework
  INSERT INTO public.form_fields
    (id, version_id, section_id, section_title, section_order,
     field_type, label, field_name, required, placeholder, sort_order, options, table_columns)
  VALUES
    (gen_random_uuid(), v_version_id, s3, 'Consumer Protection Framework', 2, 'textarea',
     'Disclosure & Transparency Policy', 'disclosure_policy', true,
     'Describe pre-contract disclosure and Key Facts Statement practices', 0, NULL, NULL),
    (gen_random_uuid(), v_version_id, s3, 'Consumer Protection Framework', 2, 'textarea',
     'Fair Treatment & Responsible Lending Policy', 'responsible_lending_policy', true,
     'Describe affordability assessment and fair treatment practices', 1, NULL, NULL),
    (gen_random_uuid(), v_version_id, s3, 'Consumer Protection Framework', 2, 'textarea',
     'Complaints Handling Procedure', 'complaints_handling_procedure', true,
     'Describe complaint intake, resolution timelines, and escalation', 2, NULL, NULL),
    (gen_random_uuid(), v_version_id, s3, 'Consumer Protection Framework', 2, 'textarea',
     'Data Protection & Privacy Controls', 'data_protection_controls', true,
     'Describe handling of client data and privacy safeguards', 3, NULL, NULL),
    (gen_random_uuid(), v_version_id, s3, 'Consumer Protection Framework', 2, 'textarea',
     'Collections & Recovery Code of Conduct', 'collections_code_of_conduct', true,
     'Describe ethical collection practices and prohibited conduct', 4, NULL, NULL),
    (gen_random_uuid(), v_version_id, s3, 'Consumer Protection Framework', 2, 'file',
     'Consumer Protection Policy Document', 'consumer_protection_policy_doc', true, NULL, 5, NULL, NULL);

  -- Section 4 — AML/CFT
  INSERT INTO public.form_fields
    (id, version_id, section_id, section_title, section_order,
     field_type, label, field_name, required, placeholder, sort_order, options, table_columns)
  VALUES
    (gen_random_uuid(), v_version_id, s4, 'AML/CFT', 3, 'text',
     'Nominated Officer / MLRO Name', 'mlro_name', true, 'Enter MLRO name', 0, NULL, NULL),
    (gen_random_uuid(), v_version_id, s4, 'AML/CFT', 3, 'text',
     'MLRO Contact', 'mlro_contact', true, 'Enter email / phone', 1, NULL, NULL),
    (gen_random_uuid(), v_version_id, s4, 'AML/CFT', 3, 'textarea',
     'Customer Due Diligence (CDD) Procedures', 'cdd_procedures', true,
     'Describe CDD and EDD procedures', 2, NULL, NULL),
    (gen_random_uuid(), v_version_id, s4, 'AML/CFT', 3, 'textarea',
     'Sanctions & PEP Screening', 'sanctions_pep_screening', true,
     'Describe screening tools, frequency and escalation', 3, NULL, NULL),
    (gen_random_uuid(), v_version_id, s4, 'AML/CFT', 3, 'textarea',
     'Transaction Monitoring & Suspicious Activity Reporting', 'transaction_monitoring', true,
     'Describe monitoring rules, thresholds and STR/SAR process', 4, NULL, NULL),
    (gen_random_uuid(), v_version_id, s4, 'AML/CFT', 3, 'textarea',
     'AML Training & Awareness Program', 'aml_training_program', true,
     'Describe staff training frequency, content and tracking', 5, NULL, NULL),
    (gen_random_uuid(), v_version_id, s4, 'AML/CFT', 3, 'select',
     'Independent AML Audit Performed', 'aml_audit_performed', true, 'Select option', 6,
     '["Yes","No","Planned"]'::jsonb, NULL),
    (gen_random_uuid(), v_version_id, s4, 'AML/CFT', 3, 'file',
     'AML/CFT Policy & Procedures', 'aml_cft_policy_doc', true, NULL, 7, NULL, NULL),
    (gen_random_uuid(), v_version_id, s4, 'AML/CFT', 3, 'file',
     'AML Risk Assessment', 'aml_risk_assessment_doc', true, NULL, 8, NULL, NULL);

  -- Section 5 — Directors / Officers
  INSERT INTO public.form_fields
    (id, version_id, section_id, section_title, section_order,
     field_type, label, field_name, required, placeholder, sort_order, options, table_columns)
  VALUES
    (gen_random_uuid(), v_version_id, s5, 'Directors / Officers', 4, 'table',
     'Directors List', 'directors_list', true, NULL, 0, NULL,
     '[
        {"id":"col_dir_name","label":"Name","type":"text"},
        {"id":"col_dir_id","label":"ID / DIN","type":"text"},
        {"id":"col_dir_designation","label":"Designation","type":"text"},
        {"id":"col_dir_nationality","label":"Nationality","type":"text"},
        {"id":"col_dir_appointment","label":"Appointment Date","type":"date"},
        {"id":"col_dir_independent","label":"Independent (Y/N)","type":"text"}
      ]'::jsonb),
    (gen_random_uuid(), v_version_id, s5, 'Directors / Officers', 4, 'table',
     'Senior Officers List', 'officers_list', true, NULL, 1, NULL,
     '[
        {"id":"col_off_name","label":"Name","type":"text"},
        {"id":"col_off_position","label":"Position","type":"text"},
        {"id":"col_off_qualifications","label":"Qualifications","type":"text"},
        {"id":"col_off_experience","label":"Experience (Years)","type":"number"},
        {"id":"col_off_appointment","label":"Appointment Date","type":"date"}
      ]'::jsonb),
    (gen_random_uuid(), v_version_id, s5, 'Directors / Officers', 4, 'textarea',
     'Fit & Proper Declaration', 'fit_and_proper_declaration', true,
     'Provide fit and proper declaration for directors and officers', 2, NULL, NULL),
    (gen_random_uuid(), v_version_id, s5, 'Directors / Officers', 4, 'file',
     'Directors & Officers CVs', 'directors_officers_cvs', true, NULL, 3, NULL, NULL),
    (gen_random_uuid(), v_version_id, s5, 'Directors / Officers', 4, 'file',
     'Police / Background Clearance Reports', 'background_clearance_docs', true, NULL, 4, NULL, NULL);
END $$;
