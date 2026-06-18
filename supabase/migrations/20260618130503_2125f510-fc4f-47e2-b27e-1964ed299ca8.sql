
INSERT INTO public.forms (id, name, description, form_type, category, service, sector, sub_sector, status, version, parent_form_id, regulator_id, rows)
SELECT
  gen_random_uuid(),
  'Commercial Bank License Application',
  'Application form to obtain a Commercial Bank license under the Commercial Bank sector.',
  'pre_license',
  'Commercial Bank',
  '',
  'Commercial Bank',
  'Commercial Bank',
  'published',
  1,
  NULL,
  '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3'::uuid,
  '[
    {"id":"sec-1","title":"Corporate Structure & Ownership","fields":[
      {"id":"f1-1","type":"textarea","label":"Corporate Structure & Ownership Details","fieldName":"corporate_structure_details","required":true,"colSpan":4},
      {"id":"f1-2","type":"file","label":"Upload Corporate Structure Documents","fieldName":"corporate_structure_docs","required":true,"colSpan":4,"allowMultiple":true}
    ]},
    {"id":"sec-2","title":"Business Plan & 5-Year Financial Projections","fields":[
      {"id":"f2-1","type":"textarea","label":"Business Plan Summary","fieldName":"business_plan_summary","required":true,"colSpan":4},
      {"id":"f2-2","type":"number","label":"Year 1 Projected Revenue (JMD)","fieldName":"year1_revenue_jmd","required":true,"colSpan":2},
      {"id":"f2-3","type":"number","label":"Year 1 Projected Profit (JMD)","fieldName":"year1_profit_jmd","required":true,"colSpan":2},
      {"id":"f2-4","type":"file","label":"Upload Business Plan & Projections","fieldName":"business_plan_docs","required":true,"colSpan":4,"allowMultiple":true}
    ]},
    {"id":"sec-3","title":"Minimum Paid-Up Capital Evidence","fields":[
      {"id":"f3-1","type":"number","label":"Paid-Up Capital (JMD)","fieldName":"paid_up_capital_jmd","required":true,"defaultValue":"500000000","colSpan":2},
      {"id":"f3-2","type":"file","label":"Upload Capital Evidence","fieldName":"capital_evidence_docs","required":true,"colSpan":4,"allowMultiple":true}
    ]},
    {"id":"sec-4","title":"Proposed Directors and Officers List","fields":[
      {"id":"f4-1","type":"table","label":"Directors and Officers","fieldName":"directors_officers","required":true,"colSpan":4,
        "tableColumns":[
          {"id":"c1","label":"Name","type":"text"},
          {"id":"c2","label":"Position","type":"text"},
          {"id":"c3","label":"Nationality","type":"text"},
          {"id":"c4","label":"Years of Experience","type":"number"}
        ]}
    ]},
    {"id":"sec-5","title":"AML/CFT Programme Framework","fields":[
      {"id":"f5-1","type":"textarea","label":"AML/CFT Programme Description","fieldName":"aml_cft_description","required":true,"colSpan":4},
      {"id":"f5-2","type":"file","label":"Upload AML/CFT Programme Document","fieldName":"aml_cft_docs","required":true,"colSpan":4,"allowMultiple":true}
    ]},
    {"id":"sec-6","title":"IT Systems Assessment","fields":[
      {"id":"f6-1","type":"textarea","label":"IT Systems Assessment Details","fieldName":"it_systems_details","required":true,"colSpan":4},
      {"id":"f6-2","type":"file","label":"Upload IT Systems Assessment Report","fieldName":"it_systems_docs","required":true,"colSpan":4,"allowMultiple":true}
    ]},
    {"id":"sec-7","title":"Premises & Infrastructure Plan","fields":[
      {"id":"f7-1","type":"textarea","label":"Premises & Infrastructure Plan","fieldName":"premises_plan","required":true,"colSpan":4},
      {"id":"f7-2","type":"file","label":"Upload Premises & Infrastructure Documents","fieldName":"premises_docs","required":true,"colSpan":4,"allowMultiple":true}
    ]},
    {"id":"sec-8","title":"Fee Payment Confirmation","fields":[
      {"id":"f8-1","type":"text","label":"Payment Reference Number","fieldName":"payment_reference_no","required":true,"colSpan":2},
      {"id":"f8-2","type":"date","label":"Payment Date","fieldName":"payment_date","required":true,"colSpan":2},
      {"id":"f8-3","type":"number","label":"Amount Paid (JMD)","fieldName":"payment_amount_jmd","required":true,"colSpan":2},
      {"id":"f8-4","type":"file","label":"Upload Payment Receipt","fieldName":"payment_receipt_docs","required":true,"colSpan":4,"allowMultiple":true}
    ]}
  ]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.forms WHERE name = 'Commercial Bank License Application' AND sector = 'Commercial Bank'
);
