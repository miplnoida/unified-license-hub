
DO $$
DECLARE
  v_template_id uuid := gen_random_uuid();
  v_version_id  uuid := gen_random_uuid();
  v_regulator_id uuid := '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3';
  s1 text := gen_random_uuid()::text;
  s2 text := gen_random_uuid()::text;
  s3 text := gen_random_uuid()::text;
  s4 text := gen_random_uuid()::text;
  s5 text := gen_random_uuid()::text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.form_templates
    WHERE name = 'Building Society License Application'
      AND sector = 'Building Society'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.form_templates
    (id, name, description, form_type, sector, sub_sector, category, service,
     regulator_id, is_reusable, status)
  VALUES
    (v_template_id, 'Building Society License Application',
     'Application form for licensing a Building Society',
     'pre_license', 'Building Society', 'Building Society', 'Building Society', '',
     v_regulator_id, false, 'published');

  INSERT INTO public.form_versions
    (id, template_id, version, semantic_version, status, published_at, change_notes)
  VALUES
    (v_version_id, v_template_id, 1, '1.0.0', 'published', now(),
     'Initial Building Society application form');

  -- Section 1 — Corporate Structure
  INSERT INTO public.form_fields
    (id, version_id, section_id, section_title, section_order,
     field_type, label, field_name, required, placeholder, sort_order, options)
  VALUES
    (gen_random_uuid(), v_version_id, s1, 'Corporate Structure', 0,
     'textarea', 'Describe the legal structure of the organization',
     'corporate_structure_details', false, 'e.g., Company limited by guarantee', 0, NULL),
    (gen_random_uuid(), v_version_id, s1, 'Corporate Structure', 0,
     'text', 'Legal Entity Name', 'legal_entity_name', true, 'Enter legal entity name', 1, NULL),
    (gen_random_uuid(), v_version_id, s1, 'Corporate Structure', 0,
     'text', 'Registration Number', 'registration_number', true, 'Enter registration number', 2, NULL),
    (gen_random_uuid(), v_version_id, s1, 'Corporate Structure', 0,
     'date', 'Date of Incorporation', 'date_of_incorporation', true, NULL, 3, NULL),
    (gen_random_uuid(), v_version_id, s1, 'Corporate Structure', 0,
     'textarea', 'Registered Address', 'registered_address', true, 'Enter registered address', 4, NULL);

  -- Section 2 — Mortgage Lending Framework
  INSERT INTO public.form_fields
    (id, version_id, section_id, section_title, section_order, field_type, label,
     field_name, required, placeholder, sort_order, options)
  VALUES
    (gen_random_uuid(), v_version_id, s2, 'Mortgage Lending Framework', 1,
     'select', 'Lending Purpose', 'lending_purpose', true, 'Select purpose', 0,
     '["Residential","Commercial","Mixed-use"]'::jsonb),
    (gen_random_uuid(), v_version_id, s2, 'Mortgage Lending Framework', 1,
     'number', 'Maximum LTV Ratio (%)', 'maximum_ltv_ratio', true, 'Enter percentage', 1, NULL),
    (gen_random_uuid(), v_version_id, s2, 'Mortgage Lending Framework', 1,
     'select', 'Interest Rate Type', 'interest_rate_type', true, 'Select type', 2,
     '["Fixed","Variable","Hybrid"]'::jsonb),
    (gen_random_uuid(), v_version_id, s2, 'Mortgage Lending Framework', 1,
     'number', 'Interest Rate Range From (%)', 'interest_rate_range_from', true, 'From', 3, NULL),
    (gen_random_uuid(), v_version_id, s2, 'Mortgage Lending Framework', 1,
     'number', 'Interest Rate Range To (%)', 'interest_rate_range_to', true, 'To', 4, NULL),
    (gen_random_uuid(), v_version_id, s2, 'Mortgage Lending Framework', 1,
     'number', 'Loan Tenure From (Months)', 'loan_tenure_from', true, 'From', 5, NULL),
    (gen_random_uuid(), v_version_id, s2, 'Mortgage Lending Framework', 1,
     'number', 'Loan Tenure To (Months)', 'loan_tenure_to', true, 'To', 6, NULL),
    (gen_random_uuid(), v_version_id, s2, 'Mortgage Lending Framework', 1,
     'select', 'Repayment Type', 'repayment_type', true, 'Select repayment type', 7,
     '["EMI","Bullet","Interest-only","Graduated"]'::jsonb),
    (gen_random_uuid(), v_version_id, s2, 'Mortgage Lending Framework', 1,
     'textarea', 'Credit Assessment Approach', 'credit_assessment_approach', true,
     'Describe credit assessment approach', 8, NULL),
    (gen_random_uuid(), v_version_id, s2, 'Mortgage Lending Framework', 1,
     'textarea', 'Key Policies & Procedures', 'key_policies_procedures', true,
     'Describe key policies and procedures', 9, NULL);

  -- Section 3 — Member Share Structure
  INSERT INTO public.form_fields
    (id, version_id, section_id, section_title, section_order, field_type, label,
     field_name, required, sort_order, table_columns)
  VALUES
    (gen_random_uuid(), v_version_id, s3, 'Member Share Structure', 2,
     'table', 'Member Share Structure', 'member_share_structure', true, 0,
     '[
        {"id":"col_share_class","label":"Share Class","type":"text"},
        {"id":"col_eligible_members","label":"Eligible Members","type":"text"},
        {"id":"col_voting_rights","label":"Voting Rights","type":"text"},
        {"id":"col_share_value","label":"Share Value (JMD)","type":"number"},
        {"id":"col_percentage","label":"Percentage (%)","type":"number"}
      ]'::jsonb);

  -- Section 4 — Liquidity Arrangements
  INSERT INTO public.form_fields
    (id, version_id, section_id, section_title, section_order, field_type, label,
     field_name, required, placeholder, sort_order, options)
  VALUES
    (gen_random_uuid(), v_version_id, s4, 'Liquidity Arrangements', 3,
     'select', 'Primary Liquidity Source', 'primary_liquidity_source', true,
     'Select source', 0,
     '["Internal Reserves","Bank Credit Line","Money Market","Interbank Borrowing"]'::jsonb),
    (gen_random_uuid(), v_version_id, s4, 'Liquidity Arrangements', 3,
     'number', 'Committed Credit Line (JMD)', 'committed_credit_line', true, 'Enter amount', 1, NULL),
    (gen_random_uuid(), v_version_id, s4, 'Liquidity Arrangements', 3,
     'date', 'Availability Period (End Date)', 'availability_period', false, NULL, 2, NULL),
    (gen_random_uuid(), v_version_id, s4, 'Liquidity Arrangements', 3,
     'number', 'Minimum Liquidity Buffer (JMD)', 'minimum_liquidity_buffer', true, 'Enter amount', 3, NULL),
    (gen_random_uuid(), v_version_id, s4, 'Liquidity Arrangements', 3,
     'select', 'Liquidity Monitoring Frequency', 'liquidity_monitoring_frequency', true,
     'Select frequency', 4,
     '["Daily","Weekly","Monthly","Quarterly"]'::jsonb),
    (gen_random_uuid(), v_version_id, s4, 'Liquidity Arrangements', 3,
     'textarea', 'Contingency Funding Plan', 'contingency_funding_plan', true,
     'Describe contingency funding plan', 5, NULL);

  -- Section 5 — Directors List
  INSERT INTO public.form_fields
    (id, version_id, section_id, section_title, section_order, field_type, label,
     field_name, required, sort_order, table_columns)
  VALUES
    (gen_random_uuid(), v_version_id, s5, 'Directors List', 4,
     'table', 'Directors List', 'directors_list', true, 0,
     '[
        {"id":"col_director_name","label":"Name","type":"text"},
        {"id":"col_din_id","label":"DIN / ID Number","type":"text"},
        {"id":"col_designation","label":"Designation","type":"text"},
        {"id":"col_appointment_date","label":"Date of Appointment","type":"date"}
      ]'::jsonb);
END $$;
