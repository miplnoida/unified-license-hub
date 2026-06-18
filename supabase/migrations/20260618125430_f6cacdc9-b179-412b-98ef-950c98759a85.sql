
DO $mig$
DECLARE
  v_sector_id uuid;
  v_template_id uuid := gen_random_uuid();
  v_version_id uuid := gen_random_uuid();
  v_schema jsonb;
  s1 uuid := gen_random_uuid(); s2 uuid := gen_random_uuid(); s3 uuid := gen_random_uuid();
  s4 uuid := gen_random_uuid(); s5 uuid := gen_random_uuid(); s6 uuid := gen_random_uuid();
  s7 uuid := gen_random_uuid(); s8 uuid := gen_random_uuid();
BEGIN
  SELECT id INTO v_sector_id FROM public.sectors WHERE name = 'Commercial Bank' LIMIT 1;

  -- Skip if already exists
  IF EXISTS (SELECT 1 FROM public.form_templates WHERE name = 'Commercial Bank License Application') THEN
    RAISE NOTICE 'Form already exists, skipping';
    RETURN;
  END IF;

  INSERT INTO public.form_templates (id, name, description, form_type, sector, sector_id, status, is_reusable)
  VALUES (v_template_id, 'Commercial Bank License Application',
          'Application form for a Commercial Bank license. Provide the required information and supporting documents.',
          'pre_license', 'Commercial Bank', v_sector_id, 'published', true);

  v_schema := jsonb_build_array(
    jsonb_build_object('id', s1, 'title', 'Corporate Structure & Ownership', 'sortOrder', 0, 'isRepeatable', false,
      'description', 'Provide details of shareholders, ownership percentages, subsidiaries, and related entities.',
      'rows', jsonb_build_array(
        jsonb_build_object('id', gen_random_uuid(), 'columns', 1, 'fields', jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid(), 'type', 'textarea', 'label', 'Corporate Structure Details', 'fieldName', 'corporate_structure_details', 'required', true, 'placeholder', 'Enter details here...'),
          jsonb_build_object('id', gen_random_uuid(), 'type', 'file', 'label', 'Supporting Documents', 'fieldName', 'corporate_structure_documents', 'required', true, 'helpText', 'PDF, DOC, DOCX, XLS, XLSX. Max 10MB each.')
        ))
      )),
    jsonb_build_object('id', s2, 'title', 'Business Plan & 5-Year Financial Projections', 'sortOrder', 1, 'isRepeatable', false,
      'description', 'Describe business strategy, products, market analysis, and financial assumptions.',
      'rows', jsonb_build_array(
        jsonb_build_object('id', gen_random_uuid(), 'columns', 1, 'fields', jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid(), 'type', 'textarea', 'label', 'Business Plan Details', 'fieldName', 'business_plan_details', 'required', true, 'placeholder', 'Enter details here...')
        )),
        jsonb_build_object('id', gen_random_uuid(), 'columns', 2, 'fields', jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid(), 'type', 'number', 'label', 'Projected Revenue (Year 1) (JMD)', 'fieldName', 'projected_revenue_year1', 'required', true, 'placeholder', 'Enter amount'),
          jsonb_build_object('id', gen_random_uuid(), 'type', 'number', 'label', 'Projected Net Profit (Year 1) (JMD)', 'fieldName', 'projected_net_profit_year1', 'required', true, 'placeholder', 'Enter amount')
        )),
        jsonb_build_object('id', gen_random_uuid(), 'columns', 1, 'fields', jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid(), 'type', 'file', 'label', 'Upload Business Plan & Financial Projection Documents', 'fieldName', 'business_plan_documents', 'required', true, 'helpText', 'PDF, DOC, DOCX, XLS, XLSX. Max 10MB each.')
        ))
      )),
    jsonb_build_object('id', s3, 'title', 'Minimum Paid-Up Capital Evidence', 'sortOrder', 2, 'isRepeatable', false,
      'description', 'Minimum required capital: JMD 500 Million',
      'rows', jsonb_build_array(
        jsonb_build_object('id', gen_random_uuid(), 'columns', 1, 'fields', jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid(), 'type', 'number', 'label', 'Minimum required capital (JMD)', 'fieldName', 'minimum_paid_up_capital', 'required', true, 'defaultValue', '500000000', 'helpText', 'Minimum required capital: JMD 500 Million'),
          jsonb_build_object('id', gen_random_uuid(), 'type', 'file', 'label', 'Supporting Evidence', 'fieldName', 'paid_up_capital_evidence', 'required', true, 'helpText', 'PDF, DOC, DOCX, XLS, XLSX. Max 10MB each.')
        ))
      )),
    jsonb_build_object('id', s4, 'title', 'Proposed Directors and Officers List', 'sortOrder', 3, 'isRepeatable', false,
      'rows', jsonb_build_array(
        jsonb_build_object('id', gen_random_uuid(), 'columns', 1, 'fields', jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid(), 'type', 'table', 'label', 'Proposed Directors and Officers', 'fieldName', 'directors_officers', 'required', true, 'newRow', true,
            'tableColumns', jsonb_build_array(
              jsonb_build_object('id', gen_random_uuid(), 'type', 'text', 'label', 'Name'),
              jsonb_build_object('id', gen_random_uuid(), 'type', 'text', 'label', 'Position'),
              jsonb_build_object('id', gen_random_uuid(), 'type', 'text', 'label', 'Nationality'),
              jsonb_build_object('id', gen_random_uuid(), 'type', 'number', 'label', 'Years Experience')
            ))
        ))
      )),
    jsonb_build_object('id', s5, 'title', 'AML/CFT Programme Framework', 'sortOrder', 4, 'isRepeatable', false,
      'description', 'Describe AML/CFT policies, risk assessment, monitoring procedures, and compliance arrangements.',
      'rows', jsonb_build_array(
        jsonb_build_object('id', gen_random_uuid(), 'columns', 1, 'fields', jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid(), 'type', 'textarea', 'label', 'AML/CFT Framework Details', 'fieldName', 'aml_cft_details', 'required', true, 'placeholder', 'Enter details here...'),
          jsonb_build_object('id', gen_random_uuid(), 'type', 'file', 'label', 'Upload AML/CFT Documents', 'fieldName', 'aml_cft_documents', 'required', true, 'helpText', 'PDF, DOC, DOCX, XLS, XLSX. Max 10MB each.')
        ))
      )),
    jsonb_build_object('id', s6, 'title', 'IT Systems Assessment', 'sortOrder', 5, 'isRepeatable', false,
      'description', 'Describe software systems, cybersecurity controls, backup arrangements, and disaster recovery.',
      'rows', jsonb_build_array(
        jsonb_build_object('id', gen_random_uuid(), 'columns', 1, 'fields', jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid(), 'type', 'textarea', 'label', 'IT Systems Details', 'fieldName', 'it_systems_details', 'required', true, 'placeholder', 'Enter details here...'),
          jsonb_build_object('id', gen_random_uuid(), 'type', 'file', 'label', 'Upload IT Assessment Documents', 'fieldName', 'it_assessment_documents', 'required', true, 'helpText', 'PDF, DOC, DOCX, XLS, XLSX. Max 10MB each.')
        ))
      )),
    jsonb_build_object('id', s7, 'title', 'Premises & Infrastructure Plan', 'sortOrder', 6, 'isRepeatable', false,
      'description', 'Describe office location, facilities, staffing arrangements, and operational infrastructure.',
      'rows', jsonb_build_array(
        jsonb_build_object('id', gen_random_uuid(), 'columns', 1, 'fields', jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid(), 'type', 'textarea', 'label', 'Premises & Infrastructure Details', 'fieldName', 'premises_infrastructure_details', 'required', true, 'placeholder', 'Enter details here...'),
          jsonb_build_object('id', gen_random_uuid(), 'type', 'file', 'label', 'Supporting Documents', 'fieldName', 'premises_documents', 'required', true, 'helpText', 'PDF, DOC, DOCX, XLS, XLSX. Max 10MB each.')
        ))
      )),
    jsonb_build_object('id', s8, 'title', 'Fee Payment Confirmation', 'sortOrder', 7, 'isRepeatable', false,
      'rows', jsonb_build_array(
        jsonb_build_object('id', gen_random_uuid(), 'columns', 3, 'fields', jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid(), 'type', 'text', 'label', 'Payment Reference Number', 'fieldName', 'payment_reference_number', 'required', true, 'placeholder', 'Enter reference number'),
          jsonb_build_object('id', gen_random_uuid(), 'type', 'date', 'label', 'Payment Date', 'fieldName', 'payment_date', 'required', true),
          jsonb_build_object('id', gen_random_uuid(), 'type', 'number', 'label', 'Amount Paid (JMD)', 'fieldName', 'amount_paid', 'required', true, 'placeholder', 'Enter amount')
        )),
        jsonb_build_object('id', gen_random_uuid(), 'columns', 1, 'fields', jsonb_build_array(
          jsonb_build_object('id', gen_random_uuid(), 'type', 'file', 'label', 'Upload Payment Confirmation / Receipt', 'fieldName', 'payment_receipt', 'required', true, 'helpText', 'PDF, JPG, PNG. Max 10MB.')
        ))
      ))
  );

  INSERT INTO public.form_versions (id, template_id, version, schema_snapshot, status, published_at, semantic_version, effective_from)
  VALUES (v_version_id, v_template_id, 1, v_schema, 'published', now(), '1.0', now());

  -- Insert flat form_fields rows from schema
  INSERT INTO public.form_fields (version_id, section_id, section_title, section_order, section_description, section_is_repeatable, field_type, label, field_name, required, placeholder, help_text, default_value, table_columns, sort_order)
  SELECT
    v_version_id,
    (section->>'id'),
    (section->>'title'),
    (section->>'sortOrder')::int,
    section->>'description',
    COALESCE((section->>'isRepeatable')::bool, false),
    field->>'type',
    field->>'label',
    field->>'fieldName',
    COALESCE((field->>'required')::bool, false),
    field->>'placeholder',
    field->>'helpText',
    field->>'defaultValue',
    field->'tableColumns',
    (field_ord - 1) + (row_ord - 1) * 10
  FROM jsonb_array_elements(v_schema) WITH ORDINALITY AS s(section, sec_ord)
  CROSS JOIN LATERAL jsonb_array_elements(section->'rows') WITH ORDINALITY AS r(row, row_ord)
  CROSS JOIN LATERAL jsonb_array_elements(row->'fields') WITH ORDINALITY AS f(field, field_ord);

END $mig$;
