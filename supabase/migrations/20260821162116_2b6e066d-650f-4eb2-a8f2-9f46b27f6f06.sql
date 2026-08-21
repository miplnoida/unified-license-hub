-- =====================================================================
-- P04 CONFIGURATION CLOSURE — process templates, preview, simulators
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.process_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key  text NOT NULL,
  version       integer NOT NULL DEFAULT 1,
  name          text NOT NULL,
  process_code  text NOT NULL,
  description   text,
  purpose       text NOT NULL DEFAULT 'TEMPLATE'
                  CHECK (purpose IN ('PRODUCTION','CERTIFICATION','TEMPLATE')),
  regulator_id  uuid REFERENCES public.regulators(id) ON DELETE CASCADE,
  sector_id     uuid,
  sub_sector_id uuid,
  category_id   uuid,
  service_id    uuid,
  license_type  text,
  steps         jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active     boolean NOT NULL DEFAULT false,
  effective_from date NOT NULL DEFAULT current_date,
  effective_to   date,
  notes         text,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_process_templates_key_version
  ON public.process_templates(template_key, version);

GRANT SELECT ON public.process_templates TO authenticated;
GRANT ALL ON public.process_templates TO service_role;
ALTER TABLE public.process_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "process templates readable by internal staff"
    ON public.process_templates FOR SELECT TO authenticated
    USING (public.is_internal_staff_user(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/* ---------------- 15/16 seeded inactive process templates ------------ */
INSERT INTO public.process_templates(template_key, version, name, process_code, description, purpose, steps, is_active, notes)
SELECT 'REGISTRATION_PROCESS_V1', 1, 'Registration Process', 'REGISTRATION',
  'Reusable registration process template. Inactive — not applied to live registrations until explicitly activated.',
  'TEMPLATE',
  '[{"order":1,"key":"representative_details","name":"Account / Representative Details","kind":"data_capture","role":"applicant","sla_days":null,"fee":null,"verification":false,"forms":true,"documents":false,"rfi":false,"maker_checker":false,"notifications":["registration_started"],"entry_blockers":[],"exit_blockers":["representative_details_complete"],"conditional":false},
    {"order":2,"key":"organisation_details","name":"Organisation / Entity Details","kind":"data_capture","role":"applicant","sla_days":null,"fee":null,"verification":false,"forms":true,"documents":false,"rfi":false,"maker_checker":false,"notifications":[],"entry_blockers":[],"exit_blockers":["organisation_details_complete"],"conditional":false},
    {"order":3,"key":"document_submission","name":"Document Submission","kind":"documents","role":"applicant","sla_days":null,"fee":null,"verification":false,"forms":false,"documents":true,"rfi":false,"maker_checker":false,"notifications":[],"entry_blockers":[],"exit_blockers":["mandatory_documents_present"],"conditional":false},
    {"order":4,"key":"registration_fee","name":"Registration Fee","kind":"fee","role":"applicant","sla_days":null,"fee":{"fee_type_code":"REGISTRATION_FEE","optional":true,"gate_policy":"BLOCK_UNTIL_VERIFIED"},"verification":false,"forms":false,"documents":false,"rfi":false,"maker_checker":false,"notifications":["fee_assessed"],"entry_blockers":[],"exit_blockers":["fee_verified_if_enabled"],"conditional":true},
    {"order":5,"key":"verification","name":"Verification","kind":"verification","role":"licensing_officer","sla_days":5,"fee":null,"verification":true,"forms":false,"documents":false,"rfi":true,"maker_checker":false,"notifications":["verification_started"],"entry_blockers":["fee_verified_if_enabled"],"exit_blockers":["required_verification_items_recorded"],"conditional":false},
    {"order":6,"key":"registration_review","name":"Registration Review","kind":"review","role":"supervisor","sla_days":5,"fee":null,"verification":false,"forms":false,"documents":false,"rfi":true,"maker_checker":true,"notifications":["review_started"],"entry_blockers":["verification_complete"],"exit_blockers":["review_recommendation_recorded"],"conditional":false},
    {"order":7,"key":"approval","name":"Approval","kind":"decision","role":"admin","sla_days":3,"fee":null,"verification":false,"forms":false,"documents":false,"rfi":false,"maker_checker":true,"notifications":["decision_issued"],"entry_blockers":["review_recommendation_recorded"],"exit_blockers":["decision_rationale_recorded"],"conditional":false},
    {"order":8,"key":"entity_activation","name":"Entity + Membership Activation","kind":"provisioning","role":"system","sla_days":1,"fee":null,"verification":false,"forms":false,"documents":false,"rfi":false,"maker_checker":false,"notifications":["account_activated"],"entry_blockers":["decision_approved"],"exit_blockers":[],"conditional":false}]'::jsonb,
  false, 'Seeded for later P01 reuse. Do not activate for live registrations without configuration review.'
 WHERE NOT EXISTS (SELECT 1 FROM public.process_templates WHERE template_key='REGISTRATION_PROCESS_V1' AND version=1);

INSERT INTO public.process_templates(template_key, version, name, process_code, description, purpose, steps, is_active, notes)
SELECT 'LICENCE_APPLICATION_PROCESS_V1', 1, 'Licence Application Process', 'LICENCE_APPLICATION',
  'Reusable licence application process template. Inactive until explicitly activated.',
  'TEMPLATE',
  '[{"order":1,"key":"application_preparation","name":"Application Preparation","kind":"data_capture","role":"applicant","sla_days":null,"fee":null,"verification":false,"forms":true,"documents":true,"rfi":false,"maker_checker":false,"notifications":[],"entry_blockers":[],"exit_blockers":["all_required_forms_complete"],"conditional":false},
    {"order":2,"key":"application_submission","name":"Application Submission","kind":"submission","role":"applicant","sla_days":null,"fee":null,"verification":false,"forms":true,"documents":true,"rfi":false,"maker_checker":false,"notifications":["application_submitted"],"entry_blockers":["all_required_forms_complete"],"exit_blockers":[],"conditional":false},
    {"order":3,"key":"application_fee","name":"Application Fee","kind":"fee","role":"applicant","sla_days":null,"fee":{"fee_type_code":"APPLICATION_FEE","optional":true,"gate_policy":"BLOCK_UNTIL_VERIFIED"},"verification":false,"forms":false,"documents":false,"rfi":false,"maker_checker":false,"notifications":["fee_assessed"],"entry_blockers":[],"exit_blockers":["fee_verified_if_enabled"],"conditional":true},
    {"order":4,"key":"intake_triage","name":"Intake / Triage","kind":"triage","role":"licensing_officer","sla_days":3,"fee":null,"verification":false,"forms":false,"documents":false,"rfi":false,"maker_checker":false,"notifications":["assigned"],"entry_blockers":["fee_verified_if_enabled"],"exit_blockers":["case_assigned"],"conditional":false},
    {"order":5,"key":"sufficiency_review","name":"Sufficiency Review","kind":"review","role":"licensing_officer","sla_days":5,"fee":null,"verification":false,"forms":false,"documents":false,"rfi":true,"maker_checker":false,"notifications":[],"entry_blockers":["case_assigned"],"exit_blockers":["sufficiency_recorded"],"conditional":false},
    {"order":6,"key":"verification","name":"Verification","kind":"verification","role":"licensing_officer","sla_days":10,"fee":{"fee_type_code":"VERIFICATION_FEE","optional":true,"gate_policy":"BLOCK_UNTIL_VERIFIED"},"verification":true,"forms":false,"documents":true,"rfi":true,"maker_checker":false,"notifications":["verification_started"],"entry_blockers":["sufficiency_recorded"],"exit_blockers":["required_verification_items_recorded"],"conditional":false},
    {"order":7,"key":"rfi","name":"RFI / Applicant Response","kind":"rfi","role":"applicant","sla_days":14,"fee":null,"verification":false,"forms":false,"documents":true,"rfi":true,"maker_checker":false,"notifications":["rfi_issued"],"entry_blockers":[],"exit_blockers":["rfi_responses_received"],"conditional":true},
    {"order":8,"key":"fit_and_proper","name":"Fit & Proper","kind":"assessment","role":"analyst","sla_days":20,"fee":{"fee_type_code":"FIT_AND_PROPER_FEE","optional":true,"gate_policy":"ADVISORY"},"verification":false,"forms":true,"documents":true,"rfi":true,"maker_checker":true,"notifications":["fp_case_opened"],"entry_blockers":[],"exit_blockers":["fp_assessments_decided"],"conditional":true},
    {"order":9,"key":"specialist_review","name":"Specialist Review","kind":"review","role":"supervisor","sla_days":15,"fee":null,"verification":false,"forms":false,"documents":false,"rfi":true,"maker_checker":false,"notifications":[],"entry_blockers":[],"exit_blockers":["specialist_opinion_recorded"],"conditional":true},
    {"order":10,"key":"decision_preparation","name":"Decision Preparation","kind":"review","role":"licensing_officer","sla_days":5,"fee":null,"verification":false,"forms":false,"documents":false,"rfi":false,"maker_checker":true,"notifications":[],"entry_blockers":["required_verification_items_recorded"],"exit_blockers":["decision_pack_complete"],"conditional":false},
    {"order":11,"key":"decision_approval","name":"Decision / Approval","kind":"decision","role":"admin","sla_days":5,"fee":null,"verification":false,"forms":false,"documents":false,"rfi":false,"maker_checker":true,"notifications":["decision_issued"],"entry_blockers":["decision_pack_complete"],"exit_blockers":["decision_rationale_recorded"],"conditional":false},
    {"order":12,"key":"licence_grant_fee","name":"Licence Grant Fee","kind":"fee","role":"applicant","sla_days":null,"fee":{"fee_type_code":"LICENCE_GRANT_FEE","optional":true,"gate_policy":"BLOCK_UNTIL_VERIFIED"},"verification":false,"forms":false,"documents":false,"rfi":false,"maker_checker":false,"notifications":["fee_assessed"],"entry_blockers":["decision_approved"],"exit_blockers":["fee_verified_if_enabled"],"conditional":true},
    {"order":13,"key":"payment_verification","name":"Payment Verification","kind":"verification","role":"licensing_officer","sla_days":3,"fee":null,"verification":true,"forms":false,"documents":true,"rfi":false,"maker_checker":true,"notifications":[],"entry_blockers":["fee_payment_recorded"],"exit_blockers":["fee_verified"],"conditional":true},
    {"order":14,"key":"licence_issuance","name":"Licence Issuance","kind":"issuance","role":"licensing_officer","sla_days":3,"fee":null,"verification":false,"forms":false,"documents":true,"rfi":false,"maker_checker":true,"notifications":["licence_issued"],"entry_blockers":["fee_verified_if_enabled"],"exit_blockers":["licence_record_created"],"conditional":false},
    {"order":15,"key":"completed","name":"Completed","kind":"terminal","role":"system","sla_days":null,"fee":null,"verification":false,"forms":false,"documents":false,"rfi":false,"maker_checker":false,"notifications":[],"entry_blockers":[],"exit_blockers":[],"conditional":false}]'::jsonb,
  false, 'Seeded for later P03 certification. Inactive.'
 WHERE NOT EXISTS (SELECT 1 FROM public.process_templates WHERE template_key='LICENCE_APPLICATION_PROCESS_V1' AND version=1);

INSERT INTO public.process_templates(template_key, version, name, process_code, description, purpose, steps, is_active, notes)
SELECT 'LICENCE_RENEWAL_PROCESS_V1', 1, 'Licence Renewal Process', 'LICENCE_RENEWAL',
  'Reusable renewal process template showing fee and verification bindings.', 'TEMPLATE',
  '[{"order":1,"key":"renewal_submission","name":"Renewal Submission","kind":"submission","role":"licensee_primary","sla_days":null,"fee":null,"verification":false,"forms":true,"documents":true,"rfi":false,"maker_checker":false,"notifications":["renewal_submitted"],"entry_blockers":[],"exit_blockers":["renewal_forms_complete"],"conditional":false},
    {"order":2,"key":"renewal_fee","name":"Renewal Fee","kind":"fee","role":"licensee_primary","sla_days":null,"fee":{"fee_type_code":"RENEWAL_FEE","optional":true,"gate_policy":"BLOCK_UNTIL_VERIFIED"},"verification":false,"forms":false,"documents":false,"rfi":false,"maker_checker":false,"notifications":["fee_assessed"],"entry_blockers":[],"exit_blockers":["fee_verified_if_enabled"],"conditional":true},
    {"order":3,"key":"verification","name":"Verification","kind":"verification","role":"licensing_officer","sla_days":10,"fee":{"fee_type_code":"VERIFICATION_FEE","optional":true,"gate_policy":"BLOCK_UNTIL_VERIFIED"},"verification":true,"forms":false,"documents":true,"rfi":true,"maker_checker":false,"notifications":["verification_started"],"entry_blockers":["fee_verified_if_enabled"],"exit_blockers":["required_verification_items_recorded"],"conditional":false},
    {"order":4,"key":"regulatory_review","name":"Regulatory Review","kind":"review","role":"supervisor","sla_days":10,"fee":null,"verification":false,"forms":false,"documents":false,"rfi":true,"maker_checker":false,"notifications":[],"entry_blockers":["verification_complete"],"exit_blockers":["review_recommendation_recorded"],"conditional":false},
    {"order":5,"key":"renewal_decision","name":"Renewal Decision","kind":"decision","role":"admin","sla_days":5,"fee":null,"verification":false,"forms":false,"documents":false,"rfi":false,"maker_checker":true,"notifications":["decision_issued"],"entry_blockers":["review_recommendation_recorded"],"exit_blockers":["decision_rationale_recorded"],"conditional":false},
    {"order":6,"key":"annual_fee","name":"Annual Fee","kind":"fee","role":"licensee_primary","sla_days":null,"fee":{"fee_type_code":"ANNUAL_LICENCE_FEE","optional":true,"gate_policy":"BLOCK_UNTIL_VERIFIED"},"verification":false,"forms":false,"documents":false,"rfi":false,"maker_checker":false,"notifications":["fee_assessed"],"entry_blockers":["decision_approved"],"exit_blockers":["fee_verified_if_enabled"],"conditional":true},
    {"order":7,"key":"term_activation","name":"Term Activation","kind":"provisioning","role":"system","sla_days":1,"fee":null,"verification":false,"forms":false,"documents":false,"rfi":false,"maker_checker":false,"notifications":["term_activated"],"entry_blockers":["fee_verified_if_enabled"],"exit_blockers":[],"conditional":false}]'::jsonb,
  false, 'Renewal reference process. Fee steps are conditional on configuration.'
 WHERE NOT EXISTS (SELECT 1 FROM public.process_templates WHERE template_key='LICENCE_RENEWAL_PROCESS_V1' AND version=1);

/* ---------------- 20. fee simulator (no obligation created) ---------- */
CREATE OR REPLACE FUNCTION public.license_fee_simulate(_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  v_matter text := COALESCE(_payload->>'matter_kind','renewal');
  v_action text := NULLIF(_payload->>'action_key','');
  v_reg uuid := NULLIF(_payload->>'regulator_id','')::uuid;
  v_sec uuid := NULLIF(_payload->>'sector_id','')::uuid;
  v_sub uuid := NULLIF(_payload->>'sub_sector_id','')::uuid;
  v_cat uuid := NULLIF(_payload->>'category_id','')::uuid;
  v_type text := NULLIF(_payload->>'license_type','');
  v_purpose text := COALESCE(NULLIF(_payload->>'purpose',''),'PRODUCTION');
  v_qty numeric := COALESCE((_payload->>'quantity')::numeric, 1);
  v_enabled boolean; out jsonb := '[]'::jsonb; b record; v_matched jsonb := '[]'::jsonb;
BEGIN
  IF uid IS NULL OR NOT public.is_internal_staff_user(uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  SELECT s.fees_enabled INTO v_enabled
    FROM public.license_fee_process_settings s
   WHERE s.matter_kind = v_matter
     AND (s.regulator_id IS NULL OR s.regulator_id = v_reg)
   ORDER BY (s.regulator_id IS NOT NULL) DESC LIMIT 1;

  FOR b IN
    SELECT fb.*, fc.amount AS schedule_amount, fc.currency AS schedule_currency, fc.name AS schedule_name,
           fc.is_active AS schedule_active,
           (CASE WHEN fb.category_id  IS NOT NULL THEN 8 ELSE 0 END
          + CASE WHEN fb.sub_sector_id IS NOT NULL THEN 4 ELSE 0 END
          + CASE WHEN fb.sector_id    IS NOT NULL THEN 2 ELSE 0 END
          + CASE WHEN fb.action_key   IS NOT NULL THEN 1 ELSE 0 END) AS specificity
      FROM public.license_fee_bindings fb
      LEFT JOIN public.fee_configurations fc ON fc.id = fb.fee_configuration_id
     WHERE fb.matter_kind = v_matter
       AND fb.purpose = v_purpose
       AND (fb.action_key IS NULL OR v_action IS NULL OR fb.action_key = v_action)
       AND (fb.regulator_id  IS NULL OR v_reg  IS NULL OR fb.regulator_id  = v_reg)
       AND (fb.sector_id     IS NULL OR v_sec  IS NULL OR fb.sector_id     = v_sec)
       AND (fb.sub_sector_id IS NULL OR v_sub  IS NULL OR fb.sub_sector_id = v_sub)
       AND (fb.category_id   IS NULL OR v_cat  IS NULL OR fb.category_id   = v_cat)
       AND (fb.license_type  IS NULL OR v_type IS NULL OR fb.license_type  = v_type)
     ORDER BY specificity DESC, fb.created_at
  LOOP
    DECLARE
      v_amount numeric := COALESCE(b.amount_override, b.schedule_amount, 0);
      v_effective boolean := b.effective_from <= current_date
                         AND (b.effective_to IS NULL OR b.effective_to >= current_date);
      v_dup boolean := EXISTS (SELECT 1 FROM jsonb_array_elements(v_matched) x
                                WHERE x->>'c' = COALESCE(b.fee_type_code,''));
      v_would boolean;
      v_reason text;
    BEGIN
      v_would := b.is_active AND v_effective AND NOT v_dup
                 AND COALESCE(v_enabled, true) AND b.purpose <> 'TEMPLATE';
      v_reason := CASE
        WHEN b.purpose = 'TEMPLATE' THEN 'Configuration template — never resolves at runtime'
        WHEN NOT b.is_active THEN 'Workflow fee binding disabled'
        WHEN NOT v_effective THEN 'Outside effective dates'
        WHEN COALESCE(v_enabled, true) = false THEN 'Fees disabled for this regulator/process'
        WHEN v_dup THEN 'Superseded by a more specific binding for the same fee type'
        ELSE 'Most specific active binding for this fee type at this scope' END;
      IF v_would THEN v_matched := v_matched || jsonb_build_array(jsonb_build_object('c', COALESCE(b.fee_type_code,''))); END IF;

      out := out || jsonb_build_array(jsonb_build_object(
        'binding_id', b.id, 'binding_key', b.binding_key, 'purpose', b.purpose,
        'fee_type_code', b.fee_type_code, 'description', b.description,
        'schedule_name', b.schedule_name, 'schedule_active', b.schedule_active,
        'catalogue_state', CASE WHEN EXISTS (SELECT 1 FROM public.fee_types ft
                                              WHERE upper(COALESCE(ft.code,'')) = b.fee_type_code
                                                AND ft.status = 'active')
                                THEN 'AVAILABLE' ELSE 'NOT_IN_CATALOGUE' END,
        'binding_enabled', b.is_active,
        'unit_amount', v_amount, 'quantity', v_qty,
        'total', ROUND(v_amount * v_qty, 2),
        'currency', COALESCE(b.currency, b.schedule_currency, 'JMD'),
        'charge_basis', b.charge_basis,
        'trigger_event', b.trigger_event, 'trigger_timing', b.trigger_timing,
        'workflow_step_key', b.workflow_step_key,
        'gate_policy', b.gate_policy,
        'payment_verification_required', b.payment_verification_required,
        'effective_from', b.effective_from, 'effective_to', b.effective_to,
        'specificity', b.specificity,
        'would_assess', v_would, 'reason', v_reason));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'simulated_at', now(),
    'creates_obligation', false,
    'matter_kind', v_matter,
    'process_fees_enabled', COALESCE(v_enabled, true),
    'process_fees_setting_present', v_enabled IS NOT NULL,
    'candidates', out);
END $$;

/* ---------------- 19. workflow / process preview --------------------- */
CREATE OR REPLACE FUNCTION public.process_preview(_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  v_code text := COALESCE(_payload->>'process_code','LICENCE_RENEWAL');
  v_matter text := COALESCE(_payload->>'matter_kind', CASE v_code
                     WHEN 'LICENCE_RENEWAL' THEN 'renewal'
                     WHEN 'LICENCE_APPLICATION' THEN 'application'
                     ELSE 'registration' END);
  tpl record; v_fees jsonb; v_steps jsonb := '[]'::jsonb; s jsonb; v_tplv record;
BEGIN
  IF uid IS NULL OR NOT public.is_internal_staff_user(uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  SELECT * INTO tpl FROM public.process_templates
   WHERE process_code = v_code
     AND (regulator_id IS NULL OR regulator_id = NULLIF(_payload->>'regulator_id','')::uuid)
     AND (sector_id    IS NULL OR sector_id    = NULLIF(_payload->>'sector_id','')::uuid)
     AND (license_type IS NULL OR license_type = NULLIF(_payload->>'license_type',''))
     AND effective_from <= current_date
     AND (effective_to IS NULL OR effective_to >= current_date)
   ORDER BY is_active DESC,
            (CASE WHEN license_type IS NOT NULL THEN 4 ELSE 0 END
           + CASE WHEN sector_id    IS NOT NULL THEN 2 ELSE 0 END
           + CASE WHEN regulator_id IS NOT NULL THEN 1 ELSE 0 END) DESC,
            version DESC
   LIMIT 1;
  IF tpl IS NULL THEN
    RETURN jsonb_build_object('resolved', false, 'reason', 'No process template configured for this selection.');
  END IF;

  v_fees := (public.license_fee_simulate(_payload || jsonb_build_object('matter_kind', v_matter)))->'candidates';

  SELECT * INTO v_tplv FROM public.license_verification_templates t
   WHERE t.matter_kind = v_matter
     AND t.superseded_by IS NULL
     AND (t.license_type IS NULL OR t.license_type = NULLIF(_payload->>'license_type',''))
     AND (t.sector_id    IS NULL OR t.sector_id    = NULLIF(_payload->>'sector_id','')::uuid)
     AND (t.regulator_id IS NULL OR t.regulator_id = NULLIF(_payload->>'regulator_id','')::uuid)
   ORDER BY t.is_active DESC, t.version DESC LIMIT 1;

  FOR s IN SELECT value FROM jsonb_array_elements(tpl.steps) LOOP
    DECLARE
      v_code2 text := s->>'key';
      v_fee jsonb := (SELECT x FROM jsonb_array_elements(COALESCE(v_fees,'[]'::jsonb)) x
                       WHERE x->>'workflow_step_key' = v_code2 LIMIT 1);
    BEGIN
      v_steps := v_steps || jsonb_build_array(s || jsonb_build_object(
        'resolved_fee', v_fee,
        'fee_state', CASE
           WHEN v_fee IS NULL AND (s->'fee') IS NULL THEN 'not_applicable'
           WHEN v_fee IS NULL THEN 'not_configured'
           WHEN (v_fee->>'would_assess')::boolean THEN 'enabled'
           ELSE 'disabled' END,
        'resolved_verification', CASE WHEN COALESCE((s->>'verification')::boolean,false) AND v_tplv.id IS NOT NULL
           THEN jsonb_build_object('template_key', v_tplv.template_key, 'version', v_tplv.version,
                                   'active', v_tplv.is_active, 'purpose', v_tplv.purpose,
                                   'mandatory_items', (SELECT count(*) FROM jsonb_array_elements(v_tplv.items) i
                                                        WHERE COALESCE((i->>'required')::boolean,true)),
                                   'total_items', jsonb_array_length(v_tplv.items))
           ELSE NULL END));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'resolved', true,
    'process_code', tpl.process_code,
    'template_key', tpl.template_key,
    'template_version', tpl.version,
    'template_name', tpl.name,
    'template_active', tpl.is_active,
    'purpose', tpl.purpose,
    'matter_kind', v_matter,
    'steps', v_steps);
END $$;

/* -------- verification case pins template key + version -------------- */
CREATE OR REPLACE FUNCTION public.license_verification_operation(_operation text, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); l record; tpl record; c record; it jsonb; v_case_id uuid; v_item record; v_tpl_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF NOT (public.is_super_admin(uid) OR public.has_permission(uid,'license_management','workflow_action')) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  IF _operation = 'start' THEN
    SELECT * INTO l FROM public.licenses WHERE id = (_payload->>'license_id')::uuid;
    IF l IS NULL THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.license_verification_cases
                WHERE license_id=l.id AND matter_id IS NOT DISTINCT FROM NULLIF(_payload->>'matter_id','')::uuid
                  AND status='in_progress') THEN
      RAISE EXCEPTION 'ALREADY_OPEN' USING ERRCODE='22023', DETAIL='A verification case is already open.'; END IF;
    v_tpl_id := public.license_verification_template_resolve(l.id, _payload->>'matter_kind');
    IF v_tpl_id IS NULL THEN RAISE EXCEPTION 'NO_TEMPLATE' USING ERRCODE='22023',
      DETAIL='No active verification template is configured for this licence and matter kind.'; END IF;
    SELECT * INTO tpl FROM public.license_verification_templates WHERE id = v_tpl_id;
    INSERT INTO public.license_verification_cases(license_id, matter_id, matter_kind, template_id,
      template_key, template_version, template_snapshot, started_by)
    VALUES (l.id, NULLIF(_payload->>'matter_id','')::uuid, _payload->>'matter_kind', tpl.id,
      tpl.template_key, tpl.version, to_jsonb(tpl), uid)
    RETURNING id INTO v_case_id;
    FOR it IN SELECT value FROM jsonb_array_elements(tpl.items) LOOP
      INSERT INTO public.license_verification_items(case_id, item_key, label, required)
      VALUES (v_case_id, it->>'key', COALESCE(it->>'label', it->>'key'), COALESCE((it->>'required')::boolean, true));
    END LOOP;
    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
    VALUES (uid, 'license_verification_start', 'license_verification_case', v_case_id,
            jsonb_build_object('license_id', l.id, 'matter_kind', _payload->>'matter_kind',
                               'template_key', tpl.template_key, 'template_version', tpl.version));
    RETURN jsonb_build_object('case_id', v_case_id, 'template_key', tpl.template_key, 'template_version', tpl.version);

  ELSIF _operation = 'record_item' THEN
    SELECT * INTO v_item FROM public.license_verification_items WHERE id = (_payload->>'item_id')::uuid;
    IF v_item IS NULL THEN RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE='22023'; END IF;
    IF COALESCE(_payload->>'result','') NOT IN ('satisfied','not_satisfied','not_applicable') THEN
      RAISE EXCEPTION 'FIELD_REQUIRED' USING ERRCODE='22023', DETAIL='A valid verification result is required.'; END IF;
    UPDATE public.license_verification_items
       SET result = _payload->>'result', note = _payload->>'note',
           evidence_document_id = NULLIF(_payload->>'evidence_document_id','')::uuid,
           recorded_by = uid, recorded_at = now()
     WHERE id = v_item.id;
    RETURN jsonb_build_object('ok', true);

  ELSIF _operation = 'complete' THEN
    SELECT * INTO c FROM public.license_verification_cases WHERE id = (_payload->>'case_id')::uuid;
    IF c IS NULL THEN RAISE EXCEPTION 'CASE_NOT_FOUND' USING ERRCODE='22023'; END IF;
    IF c.status <> 'in_progress' THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.license_verification_items
                WHERE case_id=c.id AND required AND result IS NULL) THEN
      RAISE EXCEPTION 'INCOMPLETE' USING ERRCODE='22023',
        DETAIL='All required verification items must be recorded before completion.'; END IF;
    UPDATE public.license_verification_cases
       SET status='completed', completed_by=uid, completed_at=now(), updated_at=now(),
           outcome = CASE WHEN EXISTS (SELECT 1 FROM public.license_verification_items
                                        WHERE case_id=c.id AND result='not_satisfied')
                          THEN 'deficiencies_identified' ELSE 'satisfied' END
     WHERE id=c.id;
    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
    VALUES (uid, 'license_verification_complete', 'license_verification_case', c.id,
            jsonb_build_object('license_id', c.license_id));
    RETURN jsonb_build_object('ok', true);
  END IF;
  RAISE EXCEPTION 'UNKNOWN_OPERATION' USING ERRCODE='22023';
END $$;

/* -------------- configuration read model for the admin UI ------------ */
CREATE OR REPLACE FUNCTION public.license_fee_configuration_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.is_internal_staff_user(uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object(
    'fee_types', (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', ft.code, 'name', ft.name, 'status', ft.status)
                                            ORDER BY ft.code), '[]'::jsonb) FROM public.fee_types ft),
    'bindings', (SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.purpose, b.matter_kind, b.fee_type_code), '[]'::jsonb)
                   FROM public.license_fee_bindings b),
    'schedules', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', fc.id, 'name', fc.name, 'fee_type', fc.fee_type,
                                                              'amount', fc.amount, 'currency', fc.currency,
                                                              'is_active', fc.is_active) ORDER BY fc.name), '[]'::jsonb)
                    FROM public.fee_configurations fc),
    'process_settings', (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.matter_kind), '[]'::jsonb)
                           FROM public.license_fee_process_settings s),
    'verification_templates', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                  'id', t.id, 'template_key', t.template_key, 'version', t.version,
                                  'name', t.name, 'matter_kind', t.matter_kind, 'purpose', t.purpose,
                                  'is_active', t.is_active, 'effective_from', t.effective_from,
                                  'effective_to', t.effective_to,
                                  'total_items', jsonb_array_length(t.items),
                                  'mandatory_items', (SELECT count(*) FROM jsonb_array_elements(t.items) i
                                                       WHERE COALESCE((i->>'required')::boolean,true)),
                                  'blocking_semantics', t.blocking_semantics)
                                  ORDER BY t.matter_kind, t.template_key, t.version), '[]'::jsonb)
                                FROM public.license_verification_templates t),
    'process_templates', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                              'id', p.id, 'template_key', p.template_key, 'version', p.version, 'name', p.name,
                              'process_code', p.process_code, 'purpose', p.purpose, 'is_active', p.is_active,
                              'step_count', jsonb_array_length(p.steps)) ORDER BY p.process_code, p.version), '[]'::jsonb)
                            FROM public.process_templates p));
END $$;
