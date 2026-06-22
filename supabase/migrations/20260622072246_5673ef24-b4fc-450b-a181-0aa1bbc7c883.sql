
DO $$
DECLARE
  v_template_id uuid := gen_random_uuid();
  v_version_id uuid := gen_random_uuid();
  v_regulator_id uuid;
BEGIN
  SELECT regulator_id INTO v_regulator_id FROM public.form_templates WHERE regulator_id IS NOT NULL LIMIT 1;

  INSERT INTO public.form_templates (id, name, description, form_type, sector, sub_sector, category, status, regulator_id, created_at, updated_at)
  VALUES (v_template_id, 'Financial Holding Company License Application',
    'Pre-license application form for Financial Holding Company applicants.',
    'pre_license', 'Banking', 'Commercial Banking', 'Financial Holding Company',
    'published', v_regulator_id, now(), now());

  INSERT INTO public.form_versions (id, template_id, version, semantic_version, status, published_at, change_notes)
  VALUES (v_version_id, v_template_id, 1, '1.0.0', 'published', now(), 'Initial version');

  INSERT INTO public.form_fields (version_id, section_id, section_title, section_order, section_description, field_type, label, field_name, required, sort_order, help_text, options, table_columns) VALUES
  (v_version_id, 'sec_group_structure', 'Group Structure Diagram', 1, 'Provide the legal and ownership structure of the holding company group.', 'text', 'Holding Company Legal Name', 'holding_company_name', true, 1, NULL, NULL, NULL),
  (v_version_id, 'sec_group_structure', 'Group Structure Diagram', 1, NULL, 'text', 'Group Registration Number', 'group_registration_number', true, 2, NULL, NULL, NULL),
  (v_version_id, 'sec_group_structure', 'Group Structure Diagram', 1, NULL, 'textarea', 'Narrative Description of Group Structure', 'group_structure_narrative', true, 3, 'Describe parent, subsidiaries, branches, SPVs, and ownership percentages.', NULL, NULL),
  (v_version_id, 'sec_group_structure', 'Group Structure Diagram', 1, NULL, 'file', 'Group Structure Diagram (PDF/Image)', 'group_structure_diagram_file', true, 4, 'Upload an organizational chart showing all entities in the group.', NULL, NULL),

  (v_version_id, 'sec_capital_adequacy', 'Consolidated Capital Adequacy', 2, 'Group-level capital adequacy position and computations.', 'number', 'Consolidated Tier 1 Capital (JMD)', 'consolidated_tier1_capital', true, 1, NULL, '{"currency":"JMD"}'::jsonb, NULL),
  (v_version_id, 'sec_capital_adequacy', 'Consolidated Capital Adequacy', 2, NULL, 'number', 'Consolidated Tier 2 Capital (JMD)', 'consolidated_tier2_capital', true, 2, NULL, '{"currency":"JMD"}'::jsonb, NULL),
  (v_version_id, 'sec_capital_adequacy', 'Consolidated Capital Adequacy', 2, NULL, 'number', 'Total Consolidated Regulatory Capital (JMD)', 'total_consolidated_capital', true, 3, NULL, '{"currency":"JMD"}'::jsonb, NULL),
  (v_version_id, 'sec_capital_adequacy', 'Consolidated Capital Adequacy', 2, NULL, 'number', 'Risk-Weighted Assets (JMD)', 'risk_weighted_assets', true, 4, NULL, '{"currency":"JMD"}'::jsonb, NULL),
  (v_version_id, 'sec_capital_adequacy', 'Consolidated Capital Adequacy', 2, NULL, 'number', 'Capital Adequacy Ratio (%)', 'capital_adequacy_ratio_pct', true, 5, NULL, NULL, NULL),
  (v_version_id, 'sec_capital_adequacy', 'Consolidated Capital Adequacy', 2, NULL, 'textarea', 'Capital Computation Methodology', 'capital_computation_methodology', true, 6, 'Explain consolidation basis and any deductions applied.', NULL, NULL),
  (v_version_id, 'sec_capital_adequacy', 'Consolidated Capital Adequacy', 2, NULL, 'file', 'Consolidated Capital Adequacy Report', 'consolidated_capital_report_file', true, 7, NULL, NULL, NULL),

  (v_version_id, 'sec_subsidiaries', 'Subsidiary List', 3, 'List all subsidiaries and significant investees within the group.', 'table', 'Subsidiaries', 'subsidiaries_list', true, 1, NULL, NULL,
    '[{"key":"entity_name","label":"Entity Name","type":"text"},{"key":"jurisdiction","label":"Jurisdiction","type":"text"},{"key":"regulator","label":"Primary Regulator","type":"text"},{"key":"business_activity","label":"Business Activity","type":"text"},{"key":"ownership_pct","label":"Ownership %","type":"number"},{"key":"total_assets_jmd","label":"Total Assets (JMD)","type":"number"},{"key":"consolidation_basis","label":"Consolidation Basis","type":"text"}]'::jsonb),
  (v_version_id, 'sec_subsidiaries', 'Subsidiary List', 3, NULL, 'file', 'Subsidiary Registration Documents', 'subsidiary_registration_docs', false, 2, NULL, NULL, NULL),

  (v_version_id, 'sec_intragroup', 'Intragroup Transaction Policies', 4, 'Policies governing transactions and exposures within the group.', 'textarea', 'Intragroup Transactions Policy Overview', 'intragroup_policy_overview', true, 1, NULL, NULL, NULL),
  (v_version_id, 'sec_intragroup', 'Intragroup Transaction Policies', 4, NULL, 'textarea', 'Arm''s Length Pricing Approach', 'arms_length_pricing', true, 2, NULL, NULL, NULL),
  (v_version_id, 'sec_intragroup', 'Intragroup Transaction Policies', 4, NULL, 'textarea', 'Large Exposure & Concentration Limits', 'large_exposure_limits', true, 3, NULL, NULL, NULL),
  (v_version_id, 'sec_intragroup', 'Intragroup Transaction Policies', 4, NULL, 'table', 'Material Intragroup Exposures', 'intragroup_exposures', false, 4, NULL, NULL,
    '[{"key":"counterparty","label":"Counterparty Entity","type":"text"},{"key":"exposure_type","label":"Exposure Type","type":"text"},{"key":"amount_jmd","label":"Amount (JMD)","type":"number"},{"key":"pct_of_capital","label":"% of Group Capital","type":"number"},{"key":"approval_authority","label":"Approval Authority","type":"text"}]'::jsonb),
  (v_version_id, 'sec_intragroup', 'Intragroup Transaction Policies', 4, NULL, 'file', 'Intragroup Transactions Policy Document', 'intragroup_policy_file', true, 5, NULL, NULL, NULL),

  (v_version_id, 'sec_risk_mgmt', 'Group Risk Management Framework', 5, 'Group-wide risk management governance, processes and controls.', 'textarea', 'Risk Governance Structure', 'risk_governance_structure', true, 1, 'Describe board oversight, risk committees and reporting lines.', NULL, NULL),
  (v_version_id, 'sec_risk_mgmt', 'Group Risk Management Framework', 5, NULL, 'textarea', 'Risk Appetite Statement', 'risk_appetite_statement', true, 2, NULL, NULL, NULL),
  (v_version_id, 'sec_risk_mgmt', 'Group Risk Management Framework', 5, NULL, 'textarea', 'Credit Risk Management', 'credit_risk_mgmt', true, 3, NULL, NULL, NULL),
  (v_version_id, 'sec_risk_mgmt', 'Group Risk Management Framework', 5, NULL, 'textarea', 'Market & Liquidity Risk Management', 'market_liquidity_risk_mgmt', true, 4, NULL, NULL, NULL),
  (v_version_id, 'sec_risk_mgmt', 'Group Risk Management Framework', 5, NULL, 'textarea', 'Operational Risk & Internal Controls', 'operational_risk_mgmt', true, 5, NULL, NULL, NULL),
  (v_version_id, 'sec_risk_mgmt', 'Group Risk Management Framework', 5, NULL, 'textarea', 'Group Recovery & Resolution Planning', 'recovery_resolution_planning', true, 6, NULL, NULL, NULL),
  (v_version_id, 'sec_risk_mgmt', 'Group Risk Management Framework', 5, NULL, 'file', 'Group Risk Management Framework Document', 'risk_mgmt_framework_file', true, 7, NULL, NULL, NULL),

  (v_version_id, 'sec_directors_officers', 'Directors / Officers', 6, 'Group board of directors and senior officers.', 'table', 'Directors', 'directors_list', true, 1, NULL, NULL,
    '[{"key":"full_name","label":"Full Name","type":"text"},{"key":"position","label":"Position","type":"text"},{"key":"nationality","label":"Nationality","type":"text"},{"key":"appointment_date","label":"Appointment Date","type":"date"},{"key":"independent","label":"Independent (Y/N)","type":"text"},{"key":"other_directorships","label":"Other Directorships","type":"text"}]'::jsonb),
  (v_version_id, 'sec_directors_officers', 'Directors / Officers', 6, NULL, 'table', 'Senior Officers', 'officers_list', true, 2, NULL, NULL,
    '[{"key":"full_name","label":"Full Name","type":"text"},{"key":"position","label":"Position","type":"text"},{"key":"qualifications","label":"Qualifications","type":"text"},{"key":"years_experience","label":"Years of Experience","type":"number"},{"key":"appointment_date","label":"Appointment Date","type":"date"}]'::jsonb),
  (v_version_id, 'sec_directors_officers', 'Directors / Officers', 6, NULL, 'textarea', 'Fit and Proper Declaration', 'fit_and_proper_declaration', true, 3, 'Confirm all directors and officers meet fit-and-proper criteria.', NULL, NULL),
  (v_version_id, 'sec_directors_officers', 'Directors / Officers', 6, NULL, 'file', 'CVs of Directors & Officers', 'directors_officers_cvs', true, 4, NULL, NULL, NULL),
  (v_version_id, 'sec_directors_officers', 'Directors / Officers', 6, NULL, 'file', 'Background / Police Clearance', 'background_clearance_docs', true, 5, NULL, NULL, NULL);
END $$;
