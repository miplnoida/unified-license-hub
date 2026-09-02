DO $seed$
DECLARE
  v_entity      uuid;
  v_meth        uuid;
  v_officer     uuid := 'b8eaf680-fe66-4d49-b816-1c087f511235';
  v_supervisor  uuid := '0b522724-adcb-48bf-b21d-175339479616';
  v_examiner    uuid := 'd1016d5f-cde5-46dd-a552-0f2f87abc193';
  v_reviewer    uuid := 'b597c405-e0c4-421b-9092-820a444f2429';
  r             jsonb;
  a1            uuid;
  a2            uuid;
  dim_tm        uuid;
  dim_str       uuid;
  att           uuid;
  pl            uuid;
  iv            uuid;
  ex            uuid;
  dr            uuid;
  wp            uuid;
  f1            uuid;
  ra            uuid;
  val           uuid;
BEGIN
  SELECT id INTO v_entity FROM public.licensees
   WHERE name = 'Marigot International Bank Ltd (SAINT-LUCIA-FSRA-DEMO)' LIMIT 1;
  IF v_entity IS NULL THEN
    RAISE NOTICE 'AML demo seed skipped: host entity not found'; RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.supervisory_assessment
              WHERE entity_id = v_entity AND domain_code = 'AML_CFT') THEN
    RAISE NOTICE 'AML demo seed skipped: entity already has an AML/CFT assessment'; RETURN;
  END IF;

  SELECT id INTO v_meth FROM public.supervisory_methodology
   WHERE domain_code = 'AML_CFT' AND status = 'ACTIVE'
   ORDER BY effective_from DESC NULLS LAST LIMIT 1;
  IF v_meth IS NULL THEN
    RAISE EXCEPTION 'AML demo seed: no ACTIVE AML/CFT methodology configured';
  END IF;

  -- supervisory scope for the four personas that work this case
  INSERT INTO public.entity_supervision_assignments(entity_id, lead_supervisor_user_id,
          alternate_supervisor_user_id, status, assignment_reason)
  VALUES (v_entity, v_officer, v_supervisor, 'active',
          'AML/CFT supervision: maker/checker ownership of the AML risk assessment cycle.'),
         (v_entity, v_examiner, v_reviewer, 'active',
          'AML/CFT supervision: examination lead and independent examination reviewer.');

  -- ================= officer: baseline assessment =================
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_officer, 'role', 'authenticated')::text, true);

  r := public.supervisory_assessment_create(
        v_entity, 'AML_CFT', 'INITIAL_BASELINE',
        date_trunc('year', current_date)::date - 365,
        date_trunc('year', current_date)::date - 1,
        v_meth, 'PERIODIC', NULL,
        'Baseline AML/CFT risk assessment: non-resident corporate banking book with material PEP adjacency and untuned transaction monitoring.');
  a1 := (r->>'id')::uuid;

  -- inherent risk
  PERFORM public.supervisory_assessment_dimension_upsert(a1, 'CUSTOMER_RISK', 'INHERENT_RISK',
    'high', NULL, 'high', 0.20, 4,
    'Non-resident corporate and PEP-adjacent customer base concentrated in higher-risk structures.',
    NULL, '[{"kind":"return","ref":"AML-STAT-RETURN-Q4"}]'::jsonb,
    'Customer file analysis over 12 months: 41% non-resident, 6% PEP-connected.',
    NULL, NULL, 'DETERIORATING', 'HIGH', 'HIGH', true, 'high', NULL, 'high', 4, NULL, true);
  PERFORM public.supervisory_assessment_dimension_upsert(a1, 'GEOGRAPHIC_RISK', 'INHERENT_RISK',
    'medium_high', NULL, 'medium_high', 0.18, 3,
    'Correspondent exposure to two higher-risk jurisdictions.',
    NULL, NULL, 'Correspondent flow analysis for the assessment period.',
    NULL, NULL, 'STABLE', 'MEDIUM', 'MEDIUM', true, 'medium_high', NULL, 'medium_high', 3, NULL, false);
  PERFORM public.supervisory_assessment_dimension_upsert(a1, 'PRODUCTS_SERVICES_RISK', 'INHERENT_RISK',
    'medium_high', NULL, 'medium_high', 0.18, 3,
    'International wire services and nominee-held accounts offered to corporate clients.',
    NULL, NULL, 'Product catalogue review against the national risk assessment typologies.',
    NULL, NULL, 'STABLE', 'MEDIUM', 'MEDIUM', true, 'medium_high', NULL, 'medium_high', 3, NULL, false);
  PERFORM public.supervisory_assessment_dimension_upsert(a1, 'DELIVERY_CHANNEL_RISK', 'INHERENT_RISK',
    'moderate', NULL, 'moderate', 0.14, 2,
    'Predominantly intermediated onboarding with limited non-face-to-face acceptance.',
    NULL, NULL, 'Onboarding channel mix reviewed for the period.',
    NULL, NULL, 'STABLE', 'MEDIUM', 'MEDIUM', true, 'moderate', NULL, 'moderate', 2, NULL, false);
  PERFORM public.supervisory_assessment_dimension_upsert(a1, 'TRANSACTION_PROFILE_RISK', 'INHERENT_RISK',
    'high', NULL, 'high', 0.18, 4,
    'High-value cross-border transfers materially above the peer group median.',
    NULL, '[{"kind":"return","ref":"AML-STAT-RETURN-Q4"}]'::jsonb,
    'Cross-border volume 3.2x the peer median for the licence class.',
    NULL, NULL, 'DETERIORATING', 'HIGH', 'HIGH', true, 'high', NULL, 'high', 4, NULL, true);
  PERFORM public.supervisory_assessment_dimension_upsert(a1, 'BUSINESS_MODEL_RISK', 'INHERENT_RISK',
    'moderate', NULL, 'moderate', 0.12, 2,
    'Stable international banking model with no material change in the period.',
    NULL, NULL, 'Business plan and strategy review.',
    NULL, NULL, 'STABLE', 'MEDIUM', 'MEDIUM', true, 'moderate', NULL, 'moderate', 2, NULL, false);

  -- control effectiveness
  PERFORM public.supervisory_assessment_dimension_upsert(a1, 'TRANSACTION_MONITORING', 'CONTROL_EFFECTIVENESS',
    NULL, 'weak', 'high', 0.09, 4,
    'Monitoring thresholds have not been tuned since implementation and the alert backlog is unmanaged.',
    NULL, '[{"kind":"workpaper","ref":"TM-PRE-01"}]'::jsonb,
    'Alert backlog of 1,412 items; 62% aged over 90 days; no tuning evidence produced.',
    'Escalate as targeted examination scope.', 'No model tuning documentation exists.',
    'DETERIORATING', 'HIGH', 'HIGH', true, NULL, 'weak', 'high', 4, NULL, true);
  PERFORM public.supervisory_assessment_dimension_upsert(a1, 'STR_GOVERNANCE', 'CONTROL_EFFECTIVENESS',
    NULL, 'weak', 'high', 0.06, 4,
    'Suspicious transaction decisions are undocumented and reported late.',
    NULL, NULL, 'Sample of 20 alerts: 9 with no documented decision; average reporting lag 34 days.',
    'Include in examination scope.', NULL,
    'DETERIORATING', 'HIGH', 'MEDIUM', true, NULL, 'weak', 'high', 4, NULL, true);
  PERFORM public.supervisory_assessment_dimension_upsert(a1, 'GOVERNANCE', 'CONTROL_EFFECTIVENESS',
    NULL, 'satisfactory', 'moderate', 0.08, 2,
    'Board AML oversight is evidenced but management information is thin on monitoring performance.',
    NULL, NULL, 'Board and risk committee minutes for the period.',
    NULL, NULL, 'STABLE', 'MEDIUM', 'MEDIUM', true, NULL, 'satisfactory', 'moderate', 2, NULL, false);
  PERFORM public.supervisory_assessment_dimension_upsert(a1, 'MLRO_FUNCTION', 'CONTROL_EFFECTIVENESS',
    NULL, 'satisfactory', 'moderate', 0.07, 2,
    'MLRO appointed and independent, but resourcing is stretched against alert volumes.',
    NULL, NULL, 'MLRO interview and resourcing review.',
    NULL, NULL, 'STABLE', 'MEDIUM', 'MEDIUM', true, NULL, 'satisfactory', 'moderate', 2, NULL, false);
  PERFORM public.supervisory_assessment_dimension_upsert(a1, 'CDD_KYC', 'CONTROL_EFFECTIVENESS',
    NULL, 'satisfactory', 'moderate', 0.08, 2,
    'Customer due diligence files are largely complete with isolated refresh delays.',
    NULL, NULL, 'File testing of 25 customer records.',
    NULL, NULL, 'IMPROVING', 'MEDIUM', 'MEDIUM', true, NULL, 'satisfactory', 'moderate', 2, NULL, false);
  PERFORM public.supervisory_assessment_dimension_upsert(a1, 'BENEFICIAL_OWNERSHIP', 'CONTROL_EFFECTIVENESS',
    NULL, 'weak', 'medium_high', 0.06, 3,
    'Beneficial ownership verification is inconsistent for nominee-held corporate structures.',
    NULL, NULL, 'File testing: 7 of 25 corporate files lacked verified ownership evidence.',
    NULL, NULL, 'STABLE', 'MEDIUM', 'MEDIUM', true, NULL, 'weak', 'medium_high', 3, NULL, false);
  PERFORM public.supervisory_assessment_dimension_upsert(a1, 'SANCTIONS_CONTROLS', 'CONTROL_EFFECTIVENESS',
    NULL, 'satisfactory', 'moderate', 0.05, 2,
    'Screening coverage tested against the consolidated lists with compensating manual review.',
    NULL, NULL, 'List coverage testing and manual screening walkthrough.',
    NULL, NULL, 'STABLE', 'MEDIUM', 'MEDIUM', true, NULL, 'satisfactory', 'moderate', 2, NULL, false);
  PERFORM public.supervisory_assessment_dimension_upsert(a1, 'RECORD_KEEPING', 'CONTROL_EFFECTIVENESS',
    NULL, 'satisfactory', 'moderate', 0.04, 2,
    'Records are retained in line with the statutory retention period.',
    NULL, NULL, 'Retention policy and sample retrieval test.',
    NULL, NULL, 'STABLE', 'MEDIUM', 'HIGH', true, NULL, 'satisfactory', 'moderate', 2, NULL, false);

  INSERT INTO public.aml_assessments(entity_id, supervisory_assessment_id, reference, assessment_date,
          methodology_id, assessment_type, summary)
  VALUES (v_entity, a1, 'AML-SLU-2026-0001', current_date, v_meth, 'INITIAL_BASELINE',
          'Baseline AML/CFT risk assessment of the international banking book.');

  PERFORM public.supervisory_assessment_transition(a1, 'submitted',
    'Submitted for AML/CFT supervisory review.');

  SELECT id INTO dim_tm FROM public.supervisory_assessment_dimension
   WHERE assessment_id = a1 AND dimension_code = 'TRANSACTION_MONITORING';
  SELECT id INTO dim_str FROM public.supervisory_assessment_dimension
   WHERE assessment_id = a1 AND dimension_code = 'STR_GOVERNANCE';

  -- ================= supervisor: review and approve =================
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_supervisor, 'role', 'authenticated')::text, true);
  PERFORM public.supervisory_assessment_transition(a1, 'reviewed',
    'Reviewed: ratings are supported by the evidence on file.');
  PERFORM public.supervisory_assessment_transition(a1, 'approved',
    'Approved: residual AML/CFT risk is HIGH, driven by transaction monitoring and suspicious transaction reporting weaknesses.',
    'high', current_date + 365);

  -- ================= attention =================
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_officer, 'role', 'authenticated')::text, true);
  r := public.supervisory_attention_open(
        'AML/CFT transaction monitoring and suspicious transaction reporting weakness', 'AML_CFT',
        'The approved AML/CFT assessment rates transaction monitoring and STR governance HIGH residual risk against high inherent customer and transaction risk.',
        'AML_RISK', ARRAY[v_entity], a1, dim_tm);
  att := (r->>'id')::uuid;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_supervisor, 'role', 'authenticated')::text, true);
  PERFORM public.supervisory_attention_confirm_priority(att, 'IMMEDIATE',
    'Confirmed: monitoring and reporting weaknesses require an immediate targeted AML/CFT engagement.');

  -- ================= plan =================
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_officer, 'role', 'authenticated')::text, true);
  r := public.supervisory_plan_open('AML/CFT supervisory plan — targeted monitoring review', 'AML_CFT',
        'Confirmed immediate AML/CFT attention arising from the approved baseline assessment.',
        'Remediate transaction monitoring tuning and suspicious transaction reporting governance.',
        att, ARRAY[a1], ARRAY[v_entity]);
  pl := (r->>'id')::uuid;
  PERFORM public.supervisory_plan_lifecycle(pl, 'SUBMITTED', 'Submitted for AML/CFT supervisory approval.');

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_supervisor, 'role', 'authenticated')::text, true);
  PERFORM public.supervisory_plan_lifecycle(pl, 'APPROVED', 'Approved by the AML/CFT supervisor.');
  PERFORM public.supervisory_plan_lifecycle(pl, 'ACTIVE', 'Activated for the current supervisory cycle.');

  -- ================= intervention and examination =================
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_officer, 'role', 'authenticated')::text, true);
  r := public.supervisory_intervention_open(pl, 'TARGETED_EXAMINATION',
        'Targeted AML/CFT examination',
        'Plan-authorised targeted AML/CFT examination of transaction monitoring and suspicious transaction reporting.',
        'AML_CFT', v_entity, att);
  iv := (r->>'id')::uuid;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_supervisor, 'role', 'authenticated')::text, true);
  PERFORM public.supervisory_intervention_decide(iv, 'ENDORSED', 'Endorsed: proceed with the targeted AML/CFT examination.');
  PERFORM public.supervisory_intervention_decide(iv, 'ACTIVE', 'Intervention activated for execution.');
  r := public.supervisory_examination_open(iv, 'Targeted AML/CFT examination — transaction monitoring and STR governance',
        'TARGETED_ONSITE', 'AML_CFT', v_entity, ARRAY[a1], ARRAY[dim_tm, dim_str],
        (current_date - 120), (current_date - 30), v_examiner);
  ex := (r->>'id')::uuid;

  -- ================= examiner: scope, RFI, workpaper =================
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_examiner, 'role', 'authenticated')::text, true);
  PERFORM public.examination_scope_from_assessment(ex, ARRAY[dim_tm, dim_str],
    'Scope derived from the HIGH residual dimensions of the approved AML/CFT assessment.');
  PERFORM public.examination_transition_stage(ex, 'scoping', 'Scoping the targeted AML/CFT examination.');
  PERFORM public.examination_team_member_add(ex, v_examiner, 'lead_examiner', 10,
    'AML/CFT transaction monitoring', false);
  PERFORM public.examination_team_member_add(ex, v_reviewer, 'reviewer', 4,
    'Independent examination review', false);

  INSERT INTO public.examination_scoping(examination_id, objectives, risk_focus_areas, legal_basis,
      methodology, budget_days, prepared_by, prepared_at, assessment_dimension_id)
  VALUES (ex, 'Assess transaction monitoring tuning and suspicious transaction reporting governance.',
      ARRAY['TRANSACTION_MONITORING','STR_GOVERNANCE'],
      'Money Laundering (Prevention) Act and AML/CFT Regulations — supervisory examination powers',
      'Risk-based sample testing derived from the approved AML/CFT assessment.', 10,
      v_examiner, now(), dim_tm);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_reviewer, 'role', 'authenticated')::text, true);
  UPDATE public.examination_scoping
     SET approved_by = v_reviewer, approved_at = now(),
         approval_notes = 'Scope agrees with the HIGH residual dimensions of the approved assessment.'
   WHERE examination_id = ex;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_examiner, 'role', 'authenticated')::text, true);
  PERFORM public.examination_transition_stage(ex, 'pre_exam_request', 'Pre-examination information request issued.');
  PERFORM public.examination_transition_stage(ex, 'fieldwork', 'Fieldwork commenced.');

  INSERT INTO public.examination_data_requests(examination_id, item_no, title, description, due_date, status, requested_by)
  VALUES (ex, 1, 'Transaction monitoring tuning evidence',
          'Provide tuning documentation, threshold rationale and the current alert backlog ageing.',
          current_date - 90, 'ISSUED', v_examiner)
  RETURNING id INTO dr;

  INSERT INTO public.examination_workpapers(examination_id, reference, area, procedure_performed,
      evidence_reference, conclusion, status, prepared_by, prepared_at)
  VALUES (ex, 'WP-TM-01', 'TRANSACTION_MONITORING',
          'Tested 20 alerts end to end against the monitoring rule set and escalation policy.',
          'DR-1 tuning pack; alert sample AL-2026-0001..0020',
          'Monitoring rules have not been tuned since implementation; 9 of 20 alerts had no documented decision.',
          'SUBMITTED', v_examiner, now())
  RETURNING id INTO wp;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_reviewer, 'role', 'authenticated')::text, true);
  PERFORM public.examination_signoff_workpaper(wp, 'reviewer',
    'Reviewed: testing is sufficient to support a HIGH finding.');

  -- ================= finding =================
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_officer, 'role', 'authenticated')::text, true);
  f1 := public.supervisory_finding_create(jsonb_build_object(
    'entity_id', v_entity, 'domain_code','AML_CFT', 'severity','HIGH',
    'finding_category','TRANSACTION_MONITORING',
    'title','Transaction monitoring not tuned and suspicious transaction decisions undocumented',
    'observation','Monitoring rules unchanged since implementation; 9 of 20 sampled alerts had no documented decision; backlog of 1,412 alerts.',
    'root_cause','No model tuning governance and no second-line review of alert decisions.',
    'risk_impact','Unmitigated money laundering and terrorist financing exposure with potentially unreported suspicious activity.',
    'regulatory_criterion','AML/CFT Regulations — transaction monitoring and suspicious transaction reporting',
    'required_action','Tune the monitoring model, clear the alert backlog and document every alert decision.',
    'assessment_id', a1, 'assessment_dimension_id', dim_tm, 'attention_id', att,
    'plan_id', pl, 'intervention_id', iv, 'examination_id', ex, 'workpaper_id', wp,
    'confidentiality','CONFIDENTIAL', 'owner_id', v_officer,
    'due_date', (current_date + 30)::text));
  PERFORM public.supervisory_finding_lifecycle(f1, 'REVIEW', 'Submitted for supervisory review before issue.');

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_supervisor, 'role', 'authenticated')::text, true);
  PERFORM public.supervisory_finding_lifecycle(f1, 'ISSUED',
    'Issued to the entity following independent supervisory review.');

  -- ================= management response and remediation =================
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_officer, 'role', 'authenticated')::text, true);
  PERFORM public.supervisory_finding_response(f1, 'ACCEPTED',
    'Accepted. The monitoring model will be retuned, the backlog cleared and all alert decisions documented.',
    'Retune thresholds, clear the backlog and introduce second-line alert review.',
    'Head of Compliance', current_date + 60);

  ra := public.supervisory_remediation_open(f1,
    'Retune the transaction monitoring model, clear the alert backlog and document every alert decision.',
    'Monitoring alerts investigated and documented within policy timeframes.',
    NULL, 'Head of Compliance', current_date + 45);

  PERFORM public.supervisory_remediation_transition(ra, 'ACTION_PLAN_SUBMITTED',
    'Action plan received from the entity.', 'Three-phase tuning and backlog clearance plan.');
  PERFORM public.supervisory_remediation_transition(ra, 'UNDER_REVIEW', 'Supervisor reviewing the action plan.');
  PERFORM public.supervisory_remediation_transition(ra, 'ACCEPTED', 'Action plan accepted as adequate.');
  PERFORM public.supervisory_remediation_transition(ra, 'IMPLEMENTING', 'Implementation underway.');
  PERFORM public.supervisory_remediation_transition(ra, 'EVIDENCE_SUBMITTED',
    'Completion evidence submitted by the entity.', 'Tuning report and backlog clearance evidence.',
    '[{"kind":"document","ref":"TM-TUNING-2026"}]'::jsonb);
  PERFORM public.supervisory_remediation_transition(ra, 'VALIDATION',
    'Evidence accepted for supervisory validation.');

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_reviewer, 'role', 'authenticated')::text, true);
  PERFORM public.supervisory_remediation_validate(ra, 'EFFECTIVE',
    'Tuning report, revised thresholds, cleared backlog and 30 re-tested alert decisions.',
    'Re-performed the original monitoring procedure on a fresh sample of 30 alerts.',
    'Monitoring now detects and documents the previously missed typologies; the backlog is cleared.',
    'Confirm sustained effectiveness at the follow-up assessment.', wp);

  SELECT id INTO val FROM public.supervisory_remediation_validation
   WHERE action_id = ra ORDER BY validated_at DESC LIMIT 1;

  -- ================= reassessment and follow-up =================
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_supervisor, 'role', 'authenticated')::text, true);
  PERFORM public.supervisory_reassessment_require(
    v_entity, 'AML_CFT', 'REMEDIATION_COMPLETED',
    'Transaction monitoring remediation validated as EFFECTIVE; the AML/CFT risk of record must be reassessed.',
    'FOLLOW_UP', current_date + 30, a1, f1, ra, val, ex, NULL, NULL, v_officer);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_officer, 'role', 'authenticated')::text, true);
  r := public.supervisory_assessment_create(
        v_entity, 'AML_CFT', 'FOLLOW_UP', current_date - 180, current_date, v_meth,
        'REASSESSMENT', NULL,
        'Follow-up AML/CFT assessment after validated remediation of transaction monitoring.',
        NULL, a1);
  a2 := (r->>'id')::uuid;

  PERFORM public.supervisory_assessment_dimension_upsert(a2, 'TRANSACTION_MONITORING', 'CONTROL_EFFECTIVENESS',
    NULL, 'satisfactory', 'moderate', 0.09, 2,
    'Model retuned and independently validated; alert decisions documented.',
    NULL, '[{"kind":"validation","ref":"RA-EFFECTIVE"}]'::jsonb,
    'Re-test of 30 alerts: all decisions documented within policy.',
    NULL, NULL, 'IMPROVING', 'HIGH', 'HIGH', true, NULL, 'satisfactory', 'moderate', 2, NULL, false);
  PERFORM public.supervisory_assessment_dimension_upsert(a2, 'STR_GOVERNANCE', 'CONTROL_EFFECTIVENESS',
    NULL, 'satisfactory', 'moderate', 0.06, 2,
    'Suspicious transaction decisions are now documented and reported within the statutory period.',
    NULL, NULL, 'Re-test of 15 reportable cases: all documented and timely.',
    NULL, NULL, 'IMPROVING', 'HIGH', 'MEDIUM', true, NULL, 'satisfactory', 'moderate', 2, NULL, false);
  PERFORM public.supervisory_assessment_dimension_upsert(a2, 'CUSTOMER_RISK', 'INHERENT_RISK',
    'high', NULL, 'medium_high', 0.20, 3,
    'Inherent customer risk unchanged; controls now mitigate more of it.',
    NULL, NULL, 'Customer base composition stable.',
    NULL, NULL, 'STABLE', 'HIGH', 'HIGH', true, 'high', NULL, 'medium_high', 3, NULL, false);

  INSERT INTO public.aml_assessments(entity_id, supervisory_assessment_id, reference, assessment_date,
          methodology_id, assessment_type, summary)
  VALUES (v_entity, a2, 'AML-SLU-2026-0002', current_date, v_meth, 'FOLLOW_UP',
          'Follow-up AML/CFT assessment confirming validated remediation.');

  PERFORM public.supervisory_assessment_transition(a2, 'submitted', 'Follow-up assessment submitted for review.');

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_supervisor, 'role', 'authenticated')::text, true);
  PERFORM public.supervisory_assessment_transition(a2, 'reviewed', 'Reviewed: remediation evidence supports a lower residual rating.');
  PERFORM public.supervisory_assessment_transition(a2, 'approved',
    'Approved: validated remediation reduces residual AML/CFT risk from HIGH to MODERATE.',
    'moderate', current_date + 365);

  PERFORM public.supervisory_finding_lifecycle(f1, 'CLOSED',
    'Closed: corrective action validated as EFFECTIVE and confirmed by the follow-up assessment.');

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  RAISE NOTICE 'AML demo case seeded for entity %: assessments % and %, examination %, finding %', v_entity, a1, a2, ex, f1;
END
$seed$;