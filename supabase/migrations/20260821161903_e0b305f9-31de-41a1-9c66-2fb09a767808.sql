-- =====================================================================
-- P04 CONFIGURATION SEED — fee catalogue, fee bindings, verification tpl
-- =====================================================================

/* -------------------------- 1. fee type catalogue -------------------- */
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('REGISTRATION_FEE','Registration Fee'),
    ('APPLICATION_FEE','Application Fee'),
    ('APPLICATION_PROCESSING_FEE','Application Processing Fee'),
    ('VERIFICATION_FEE','Verification Fee'),
    ('DUE_DILIGENCE_FEE','Due Diligence Fee'),
    ('FIT_AND_PROPER_FEE','Fit and Proper Fee'),
    ('KEY_PERSON_ASSESSMENT_FEE','Key Person Assessment Fee'),
    ('LICENCE_GRANT_FEE','Licence Grant Fee'),
    ('LICENCE_ISSUANCE_FEE','Licence Issuance Fee'),
    ('ANNUAL_LICENCE_FEE','Annual Licence Fee'),
    ('RENEWAL_FEE','Renewal Fee'),
    ('VARIATION_FEE','Variation Fee'),
    ('AMENDMENT_FEE','Amendment Fee'),
    ('REINSTATEMENT_FEE','Reinstatement Fee'),
    ('APPEAL_REVIEW_FEE','Appeal Review Fee'),
    ('INSPECTION_FEE','Inspection Fee'),
    ('REINSPECTION_FEE','Reinspection Fee'),
    ('CERTIFICATE_REPLACEMENT_FEE','Certificate Replacement Fee'),
    ('LATE_FEE','Late Fee'),
    ('PENALTY','Penalty'),
    ('OTHER_REGULATORY_FEE','Other Regulatory Fee')
  ) AS t(code, name)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.fee_types f WHERE upper(COALESCE(f.code,'')) = r.code) THEN
      INSERT INTO public.fee_types(code, name, status) VALUES (r.code, r.name, 'active');
    END IF;
  END LOOP;
END $$;

/* ---- 2/3. disabled lifecycle fee binding TEMPLATES (no amounts) ----- */
INSERT INTO public.license_fee_bindings
  (binding_key, purpose, matter_kind, action_key, fee_type_code, description,
   amount_override, currency, trigger_event, trigger_timing, workflow_step_key,
   gate_policy, blocking, payment_verification_required, due_days, charge_basis,
   is_active, notes)
SELECT v.binding_key, 'TEMPLATE', v.matter_kind, NULL, v.fee_type_code, v.description,
       NULL, 'JMD', v.trigger_event, v.trigger_timing, v.step_key,
       v.gate_policy, true, true, 30, 'FLAT',
       false, 'Reusable disabled template. No authoritative amount configured — configure a fee schedule and activate before use.'
  FROM (VALUES
    ('TPL_RENEWAL_FEE','renewal','RENEWAL_FEE','Renewal fee','Renewal Submission','ON_ENTER','renewal_submission','BLOCK_UNTIL_VERIFIED'),
    ('TPL_VERIFICATION_FEE','renewal','VERIFICATION_FEE','Verification fee','Verification','ON_ENTER','verification','BLOCK_UNTIL_VERIFIED'),
    ('TPL_ANNUAL_LICENCE_FEE','renewal','ANNUAL_LICENCE_FEE','Annual licence fee','Term Activation','BEFORE_EXIT','term_activation','BLOCK_UNTIL_VERIFIED'),
    ('TPL_VARIATION_FEE','variation','VARIATION_FEE','Variation fee','Variation Submission','ON_ENTER','variation_submission','BLOCK_UNTIL_VERIFIED'),
    ('TPL_REINSTATEMENT_FEE','reinstatement','REINSTATEMENT_FEE','Reinstatement fee','Reinstatement Request','ON_ENTER','reinstatement_request','BLOCK_UNTIL_VERIFIED')
  ) AS v(binding_key, matter_kind, fee_type_code, description, trigger_event, trigger_timing, step_key, gate_policy)
 WHERE NOT EXISTS (SELECT 1 FROM public.license_fee_bindings b WHERE b.binding_key = v.binding_key);

/* ---- 4. certification-only ACTIVE fee schedule + bindings ----------- */
DO $$
DECLARE
  v_reg  uuid := '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3';  -- certification regulator
  v_sect uuid := '7171f40e-19cd-4a0c-be3d-6f13e7cd9213';  -- certification sector
  v_type text := 'Securities Dealer Licence';             -- certification licence type
  v_ren  uuid; v_ver uuid;
BEGIN
  -- certification fee schedule rows (clearly marked, certification scope)
  SELECT id INTO v_ren FROM public.fee_configurations WHERE name = 'CERT Renewal Fee (TEST/DEMO ONLY)';
  IF v_ren IS NULL THEN
    INSERT INTO public.fee_configurations(name, fee_type, amount, currency, is_active, regulator_id, sector_id, calculation_type)
    VALUES ('CERT Renewal Fee (TEST/DEMO ONLY)','RENEWAL_FEE', 500, 'JMD', true, v_reg, v_sect, 'fixed')
    RETURNING id INTO v_ren;
  END IF;
  SELECT id INTO v_ver FROM public.fee_configurations WHERE name = 'CERT Verification Fee (TEST/DEMO ONLY)';
  IF v_ver IS NULL THEN
    INSERT INTO public.fee_configurations(name, fee_type, amount, currency, is_active, regulator_id, sector_id, calculation_type)
    VALUES ('CERT Verification Fee (TEST/DEMO ONLY)','VERIFICATION_FEE', 150, 'JMD', true, v_reg, v_sect, 'fixed')
    RETURNING id INTO v_ver;
  END IF;

  -- CERT Fee A: enabled at Renewal Submission
  IF NOT EXISTS (SELECT 1 FROM public.license_fee_bindings WHERE binding_key='CERT_RENEWAL_FEE') THEN
    INSERT INTO public.license_fee_bindings
      (binding_key, purpose, regulator_id, sector_id, license_type, matter_kind, fee_type_code,
       description, fee_configuration_id, currency, trigger_event, trigger_timing, workflow_step_key,
       gate_policy, blocking, payment_verification_required, due_days, is_active, notes)
    VALUES ('CERT_RENEWAL_FEE','CERTIFICATION', v_reg, v_sect, v_type, 'renewal','RENEWAL_FEE',
       'CERT Renewal Fee', v_ren, 'JMD', 'Renewal Submission','ON_ENTER','renewal_submission',
       'BLOCK_UNTIL_VERIFIED', true, true, 30, true, 'CERTIFICATION — TEST / DEMO ONLY');
  END IF;

  -- CERT Fee A2: second stage (multi-stage resolution proof)
  IF NOT EXISTS (SELECT 1 FROM public.license_fee_bindings WHERE binding_key='CERT_VERIFICATION_FEE') THEN
    INSERT INTO public.license_fee_bindings
      (binding_key, purpose, regulator_id, sector_id, license_type, matter_kind, fee_type_code,
       description, fee_configuration_id, currency, trigger_event, trigger_timing, workflow_step_key,
       gate_policy, blocking, payment_verification_required, due_days, is_active, notes)
    VALUES ('CERT_VERIFICATION_FEE','CERTIFICATION', v_reg, v_sect, v_type, 'renewal','VERIFICATION_FEE',
       'CERT Verification Fee', v_ver, 'JMD', 'Verification','ON_ENTER','verification',
       'BLOCK_UNTIL_VERIFIED', true, true, 30, true, 'CERTIFICATION — TEST / DEMO ONLY');
  END IF;

  -- CERT Fee B: disabled → must never assess
  IF NOT EXISTS (SELECT 1 FROM public.license_fee_bindings WHERE binding_key='CERT_DISABLED_FEE') THEN
    INSERT INTO public.license_fee_bindings
      (binding_key, purpose, regulator_id, sector_id, license_type, matter_kind, fee_type_code,
       description, amount_override, currency, trigger_event, gate_policy, is_active, notes)
    VALUES ('CERT_DISABLED_FEE','CERTIFICATION', v_reg, v_sect, v_type, 'renewal','LATE_FEE',
       'CERT Disabled Late Fee', 99, 'JMD', 'Renewal Submission','ADVISORY', false,
       'CERTIFICATION — TEST / DEMO ONLY: disabled fixture, proves disabled bindings never assess');
  END IF;

  -- CERT Fee C: wrong licence type → must never assess for the cert licence type
  IF NOT EXISTS (SELECT 1 FROM public.license_fee_bindings WHERE binding_key='CERT_WRONG_SCOPE_FEE') THEN
    INSERT INTO public.license_fee_bindings
      (binding_key, purpose, regulator_id, sector_id, license_type, matter_kind, fee_type_code,
       description, amount_override, currency, trigger_event, gate_policy, is_active, notes)
    VALUES ('CERT_WRONG_SCOPE_FEE','CERTIFICATION', v_reg, v_sect, 'Deposit Taking Licence', 'renewal','AMENDMENT_FEE',
       'CERT Out-of-scope Fee', 250, 'JMD', 'Renewal Submission','ADVISORY', true,
       'CERTIFICATION — TEST / DEMO ONLY: scope fixture, proves licence-type scoping');
  END IF;

  -- CERT Fee D: future dated → must not assess before effective date
  IF NOT EXISTS (SELECT 1 FROM public.license_fee_bindings WHERE binding_key='CERT_FUTURE_FEE') THEN
    INSERT INTO public.license_fee_bindings
      (binding_key, purpose, regulator_id, sector_id, license_type, matter_kind, fee_type_code,
       description, amount_override, currency, trigger_event, gate_policy, is_active,
       effective_from, notes)
    VALUES ('CERT_FUTURE_FEE','CERTIFICATION', v_reg, v_sect, v_type, 'renewal','INSPECTION_FEE',
       'CERT Future-dated Fee', 300, 'JMD', 'Renewal Submission','ADVISORY', true,
       current_date + 365,
       'CERTIFICATION — TEST / DEMO ONLY: effective-date fixture');
  END IF;
END $$;

/* ---- 6–11. verification template catalogue (version 1) ------------- */
INSERT INTO public.license_verification_templates
  (template_key, version, purpose, name, description, matter_kind, items, is_active)
SELECT v.template_key, 1, 'PRODUCTION', v.name, v.description, v.matter_kind, v.items::jsonb, false
  FROM (VALUES
  ('REGISTRATION_VERIFICATION','Registration Verification','Configuration template for registration verification. Inactive until adopted.','registration',
   '[{"key":"representative_identity","label":"Representative identity checked","required":true},
     {"key":"organisation_details","label":"Organisation details checked","required":true},
     {"key":"incorporation_document","label":"Incorporation / registration document checked","required":true},
     {"key":"registered_address","label":"Registered address checked","required":true},
     {"key":"controllers_identified","label":"Controllers / beneficial owners identified where applicable","required":false},
     {"key":"supporting_documents","label":"Required supporting documents present","required":true},
     {"key":"declarations_complete","label":"Declarations completed","required":true},
     {"key":"fee_verified","label":"Fee / payment verified if configured","required":false}]'),
  ('LICENCE_APPLICATION_VERIFICATION','Licence Application Verification','Configuration template for licence application verification. Inactive until adopted.','application',
   '[{"key":"package_complete","label":"Application package complete","required":true},
     {"key":"forms_match_package","label":"Submitted forms correspond to pinned package / version","required":true},
     {"key":"legal_documents","label":"Required legal documents verified","required":true},
     {"key":"entity_reconciled","label":"Entity details reconciled","required":true},
     {"key":"key_persons_identified","label":"Controllers / key persons identified","required":true},
     {"key":"fp_assessments_linked","label":"Required fit and proper assessments linked","required":false},
     {"key":"application_fee_status","label":"Application fee status checked","required":false},
     {"key":"verification_fee_status","label":"Verification fee status checked","required":false},
     {"key":"declarations_complete","label":"Mandatory declarations complete","required":true},
     {"key":"inconsistencies_resolved","label":"Major inconsistencies resolved","required":true}]'),
  ('LICENCE_RENEWAL_VERIFICATION','Licence Renewal Verification','Configuration template for renewal verification. Inactive until adopted.','renewal',
   '[{"key":"current_term_verified","label":"Current licence / term verified","required":true},
     {"key":"filed_in_window","label":"Renewal filed in permitted window","required":true},
     {"key":"renewal_forms_complete","label":"Required renewal forms complete","required":true},
     {"key":"supporting_documents","label":"Supporting documents verified","required":true},
     {"key":"entity_reconciled","label":"Current entity details reconciled","required":true},
     {"key":"open_conditions_reviewed","label":"Open licence conditions reviewed","required":true},
     {"key":"fee_requirements","label":"Fee / payment requirements checked","required":false},
     {"key":"fp_reassessment","label":"Fit and proper reassessment requirement evaluated","required":false},
     {"key":"material_changes","label":"Material licence changes identified","required":true}]'),
  ('LICENCE_VARIATION_VERIFICATION','Licence Variation Verification','Configuration template for variation verification. Inactive until adopted.','variation',
   '[{"key":"source_licence","label":"Source licence verified","required":true},
     {"key":"change_classified","label":"Requested change classified","required":true},
     {"key":"evidence_present","label":"Supporting evidence present","required":true},
     {"key":"affected_attributes","label":"Affected licence attributes identified","required":true},
     {"key":"entity_vs_licence","label":"Entity-master changes separated from licence changes","required":true},
     {"key":"key_persons_affected","label":"Affected key persons / controllers identified","required":false},
     {"key":"fp_requirement","label":"Fit and proper requirement evaluated","required":false},
     {"key":"variation_fee","label":"Variation fee checked where enabled","required":false}]'),
  ('LICENCE_REINSTATEMENT_VERIFICATION','Licence Reinstatement Verification','Configuration template for reinstatement verification. Inactive until adopted.','reinstatement',
   '[{"key":"suspension_matter","label":"Suspension matter identified","required":true},
     {"key":"prerequisites_resolved","label":"Reinstatement prerequisites resolved","required":true},
     {"key":"remediation_evidence","label":"Remediation evidence reviewed","required":true},
     {"key":"open_conditions","label":"Open conditions assessed","required":true},
     {"key":"outstanding_obligations","label":"Outstanding obligations checked","required":true},
     {"key":"reinstatement_fee","label":"Reinstatement fee checked if enabled","required":false},
     {"key":"fp_requirement","label":"Fit and proper requirement checked","required":false},
     {"key":"decision_ready","label":"Decision-ready evidence complete","required":true}]'),
  ('PAYMENT_VERIFICATION','Payment Verification','Configuration template for payment verification. Inactive until adopted.','payment',
   '[{"key":"assessment_identified","label":"Fee assessment identified","required":true},
     {"key":"payment_reference","label":"Payment reference recorded","required":true},
     {"key":"amount_matches","label":"Amount matches the assessed fee","required":true},
     {"key":"currency_matches","label":"Currency matches the assessed fee","required":true},
     {"key":"evidence_attached","label":"Payment evidence attached","required":false},
     {"key":"maker_checker","label":"Recorded and verified by different officers","required":true}]')
  ) AS v(template_key, name, description, matter_kind, items)
 WHERE NOT EXISTS (SELECT 1 FROM public.license_verification_templates t
                    WHERE t.template_key = v.template_key AND t.version = 1);

/* ---- 13. one ACTIVE certification-scoped verification template ------ */
INSERT INTO public.license_verification_templates
  (template_key, version, purpose, name, description, matter_kind, regulator_id, sector_id, license_type, items, is_active)
SELECT 'CERT_LICENCE_RENEWAL_VERIFICATION', 1, 'CERTIFICATION',
       'CERT Licence Renewal Verification (TEST/DEMO ONLY)',
       'CERTIFICATION — TEST / DEMO ONLY. Scoped to the certification dataset.',
       'renewal',
       '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3'::uuid,
       '7171f40e-19cd-4a0c-be3d-6f13e7cd9213'::uuid,
       'Securities Dealer Licence',
   '[{"key":"current_term_verified","label":"Current licence / term verified","required":true},
     {"key":"filed_in_window","label":"Renewal filed in permitted window","required":true},
     {"key":"renewal_forms_complete","label":"Required renewal forms complete","required":true},
     {"key":"open_conditions_reviewed","label":"Open licence conditions reviewed","required":true},
     {"key":"fee_requirements","label":"Fee / payment requirements checked","required":false},
     {"key":"material_changes","label":"Material licence changes identified","required":false}]'::jsonb,
       true
 WHERE NOT EXISTS (SELECT 1 FROM public.license_verification_templates t
                    WHERE t.template_key = 'CERT_LICENCE_RENEWAL_VERIFICATION' AND t.version = 1);

/* ---- 22. process fee switches (production off until configured) ----- */
INSERT INTO public.license_fee_process_settings(regulator_id, matter_kind, fees_enabled, purpose, notes)
SELECT NULL, k, false, 'TEMPLATE',
       'Global default: licence lifecycle fees remain disabled until a regulator explicitly enables the process.'
  FROM unnest(ARRAY['variation','reinstatement','surrender','condition_review']) AS k
 WHERE NOT EXISTS (SELECT 1 FROM public.license_fee_process_settings s
                    WHERE s.regulator_id IS NULL AND s.matter_kind = k);

INSERT INTO public.license_fee_process_settings(regulator_id, matter_kind, fees_enabled, purpose, notes)
SELECT '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3'::uuid, 'renewal', true, 'CERTIFICATION',
       'CERTIFICATION — TEST / DEMO ONLY: renewal fees enabled for the certification regulator.'
 WHERE NOT EXISTS (SELECT 1 FROM public.license_fee_process_settings s
                    WHERE s.regulator_id = '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3'::uuid
                      AND s.matter_kind = 'renewal');
