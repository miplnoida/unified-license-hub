
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
    WHERE name = 'Life Insurance License Application'
      AND sector = 'Insurance'
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
    (v_template_id, 'Life Insurance License Application',
     'Application form for licensing a Life Insurance company',
     'pre_license', 'Insurance', 'Life Insurance', 'Life Insurer License', '',
     v_regulator_id, false, 'published');

  INSERT INTO public.form_versions
    (id, template_id, version, semantic_version, status, published_at, change_notes)
  VALUES
    (v_version_id, v_template_id, 1, '1.0.0', 'published', now(),
     'Initial Life Insurance application form');

  -- Section 1 — Company Structure
  INSERT INTO public.form_fields
    (id, version_id, section_id, section_title, section_order,
     field_type, label, field_name, required, placeholder, sort_order, options)
  VALUES
    (gen_random_uuid(), v_version_id, s1, 'Company Structure', 0, 'text',
     'Legal Entity Name', 'legal_entity_name', true, 'Enter legal entity name', 0, NULL),
    (gen_random_uuid(), v_version_id, s1, 'Company Structure', 0, 'text',
     'Registration Number', 'registration_number', true, 'Enter registration number', 1, NULL),
    (gen_random_uuid(), v_version_id, s1, 'Company Structure', 0, 'date',
     'Date of Incorporation', 'date_of_incorporation', true, NULL, 2, NULL),
    (gen_random_uuid(), v_version_id, s1, 'Company Structure', 0, 'select',
     'Company Type', 'company_type', true, 'Select company type', 3,
     '["Public Limited","Private Limited","Mutual","Subsidiary","Branch"]'::jsonb),
    (gen_random_uuid(), v_version_id, s1, 'Company Structure', 0, 'textarea',
     'Registered Address', 'registered_address', true, 'Enter registered address', 4, NULL),
    (gen_random_uuid(), v_version_id, s1, 'Company Structure', 0, 'textarea',
     'Ownership Structure', 'ownership_structure', true,
     'Describe shareholders and ownership %', 5, NULL),
    (gen_random_uuid(), v_version_id, s1, 'Company Structure', 0, 'textarea',
     'Group / Holding Structure', 'group_structure', false,
     'Describe parent / group entities', 6, NULL);

  -- Section 2 — Long-term Liability Strategy
  INSERT INTO public.form_fields
    (id, version_id, section_id, section_title, section_order,
     field_type, label, field_name, required, placeholder, sort_order, options)
  VALUES
    (gen_random_uuid(), v_version_id, s2, 'Long-term Liability Strategy', 1, 'textarea',
     'Liability Management Philosophy', 'liability_philosophy', true,
     'Outline approach to managing long-term liabilities', 0, NULL),
    (gen_random_uuid(), v_version_id, s2, 'Long-term Liability Strategy', 1, 'multi_select',
     'Product Categories Driving Liabilities', 'liability_product_categories', true,
     'Select product categories', 1,
     '["Whole Life","Term Life","Endowment","Annuities","Unit-Linked","Pension Plans","Group Life"]'::jsonb),
    (gen_random_uuid(), v_version_id, s2, 'Long-term Liability Strategy', 1, 'textarea',
     'Asset-Liability Matching Approach', 'alm_approach', true,
     'Describe ALM framework, duration matching and cash-flow strategy', 2, NULL),
    (gen_random_uuid(), v_version_id, s2, 'Long-term Liability Strategy', 1, 'textarea',
     'Stress Testing & Scenario Analysis', 'stress_testing', true,
     'Describe stress tests applied to long-term liabilities', 3, NULL),
    (gen_random_uuid(), v_version_id, s2, 'Long-term Liability Strategy', 1, 'number',
     'Projected Liability Reserves Year 1 (JMD)', 'projected_reserves_y1', true,
     'Enter projected reserves', 4, NULL),
    (gen_random_uuid(), v_version_id, s2, 'Long-term Liability Strategy', 1, 'number',
     'Projected Liability Reserves Year 5 (JMD)', 'projected_reserves_y5', true,
     'Enter projected reserves', 5, NULL),
    (gen_random_uuid(), v_version_id, s2, 'Long-term Liability Strategy', 1, 'file',
     'Liability Strategy Document', 'liability_strategy_doc', true, NULL, 6, NULL);

  -- Section 3 — Actuarial Reserve Methodology
  INSERT INTO public.form_fields
    (id, version_id, section_id, section_title, section_order,
     field_type, label, field_name, required, placeholder, sort_order, options)
  VALUES
    (gen_random_uuid(), v_version_id, s3, 'Actuarial Reserve Methodology', 2, 'text',
     'Appointed Actuary Name', 'actuary_name', true, 'Enter actuary name', 0, NULL),
    (gen_random_uuid(), v_version_id, s3, 'Actuarial Reserve Methodology', 2, 'text',
     'Actuary Registration Number', 'actuary_registration', true,
     'Enter registration number', 1, NULL),
    (gen_random_uuid(), v_version_id, s3, 'Actuarial Reserve Methodology', 2, 'text',
     'Professional Body', 'actuary_professional_body', true,
     'e.g., Institute of Actuaries', 2, NULL),
    (gen_random_uuid(), v_version_id, s3, 'Actuarial Reserve Methodology', 2, 'select',
     'Primary Reserving Method', 'reserving_method', true, 'Select method', 3,
     '["Net Premium Valuation","Gross Premium Valuation","Bonus Reserve Valuation","Embedded Value","Other"]'::jsonb),
    (gen_random_uuid(), v_version_id, s3, 'Actuarial Reserve Methodology', 2, 'textarea',
     'Mortality Assumptions', 'mortality_assumptions', true,
     'Describe mortality tables and assumptions used', 4, NULL),
    (gen_random_uuid(), v_version_id, s3, 'Actuarial Reserve Methodology', 2, 'textarea',
     'Interest Rate / Discount Assumptions', 'discount_assumptions', true,
     'Describe discount rate basis', 5, NULL),
    (gen_random_uuid(), v_version_id, s3, 'Actuarial Reserve Methodology', 2, 'textarea',
     'Lapse & Persistency Assumptions', 'lapse_assumptions', true,
     'Describe lapse and persistency assumptions', 6, NULL),
    (gen_random_uuid(), v_version_id, s3, 'Actuarial Reserve Methodology', 2, 'textarea',
     'Expense Assumptions', 'expense_assumptions', true,
     'Describe expense loadings used in valuation', 7, NULL),
    (gen_random_uuid(), v_version_id, s3, 'Actuarial Reserve Methodology', 2, 'file',
     'Actuarial Methodology Report', 'actuarial_methodology_report', true, NULL, 8, NULL);

  -- Section 4 — Investment Policy
  INSERT INTO public.form_fields
    (id, version_id, section_id, section_title, section_order,
     field_type, label, field_name, required, placeholder, sort_order, options, table_columns)
  VALUES
    (gen_random_uuid(), v_version_id, s4, 'Investment Policy', 3, 'textarea',
     'Investment Objectives', 'investment_objectives', true,
     'Describe overall investment objectives', 0, NULL, NULL),
    (gen_random_uuid(), v_version_id, s4, 'Investment Policy', 3, 'select',
     'Risk Appetite', 'investment_risk_appetite', true, 'Select risk appetite', 1,
     '["Conservative","Moderate","Balanced","Aggressive"]'::jsonb, NULL),
    (gen_random_uuid(), v_version_id, s4, 'Investment Policy', 3, 'table',
     'Strategic Asset Allocation', 'strategic_asset_allocation', true, NULL, 2, NULL,
     '[
        {"id":"col_asset_class","label":"Asset Class","type":"text"},
        {"id":"col_min_pct","label":"Min %","type":"number"},
        {"id":"col_target_pct","label":"Target %","type":"number"},
        {"id":"col_max_pct","label":"Max %","type":"number"},
        {"id":"col_benchmark","label":"Benchmark","type":"text"}
      ]'::jsonb),
    (gen_random_uuid(), v_version_id, s4, 'Investment Policy', 3, 'textarea',
     'Investment Governance Structure', 'investment_governance', true,
     'Describe investment committee, mandates and oversight', 3, NULL, NULL),
    (gen_random_uuid(), v_version_id, s4, 'Investment Policy', 3, 'textarea',
     'Risk Management & Limits', 'investment_risk_limits', true,
     'Describe credit, concentration, currency, and liquidity limits', 4, NULL, NULL),
    (gen_random_uuid(), v_version_id, s4, 'Investment Policy', 3, 'file',
     'Investment Policy Statement', 'investment_policy_document', true, NULL, 5, NULL, NULL);

  -- Section 5 — Directors / Officers
  INSERT INTO public.form_fields
    (id, version_id, section_id, section_title, section_order,
     field_type, label, field_name, required, placeholder, sort_order, options, table_columns)
  VALUES
    (gen_random_uuid(), v_version_id, s5, 'Directors / Officers', 4, 'table',
     'Directors List', 'directors_list', true, NULL, 0, NULL,
     '[
        {"id":"col_dir_name","label":"Name","type":"text"},
        {"id":"col_dir_din","label":"DIN / ID","type":"text"},
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
     'Provide fit and proper declaration', 2, NULL, NULL),
    (gen_random_uuid(), v_version_id, s5, 'Directors / Officers', 4, 'file',
     'Directors & Officers CVs', 'directors_officers_cvs', true, NULL, 3, NULL, NULL);
END $$;
