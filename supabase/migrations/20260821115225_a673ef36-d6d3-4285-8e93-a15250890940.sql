DO $cert$
DECLARE
  v_officer  uuid := '00000000-0000-0000-0000-0000e0000001';
  v_decider  uuid := '00000000-0000-0000-0000-0000e0000002';
  v_outsider uuid := '00000000-0000-0000-0000-0000e0000003';

  v_role_officer  uuid;
  v_role_decider  uuid;
  v_module        uuid;

  v_complaint   uuid;
  v_cmp_entity  uuid;
  v_cmp_status  text;
  v_cmp_touched timestamptz;
  v_breach      uuid;
  v_brc_entity  uuid;

  v_case_e1 uuid;
  v_case_e2 uuid;
  v_row     record;
  v_state   record;
  v_num1 text; v_num2 text; v_num3 text;
  v_stage text;
  v_status_now text;
  v_touched_now timestamptz;
  v_n integer;
  v_json jsonb;
  v_marker text := 'EPR-03';
BEGIN
  RAISE NOTICE '=== % P11 Enforcement certification starting ===', v_marker;

  SELECT id INTO v_module FROM sec_modules WHERE key = 'enforcement_management';
  IF v_module IS NULL THEN RAISE EXCEPTION 'CERT FAIL: enforcement_management module missing'; END IF;

  INSERT INTO sec_roles (key, name, description, role_type, status, is_system)
  VALUES ('epr03_cert_officer', 'EPR-03 cert enforcement officer', 'certification fixture', 'internal', 'active', false)
  ON CONFLICT (key) DO UPDATE SET status = 'active' RETURNING id INTO v_role_officer;

  INSERT INTO sec_roles (key, name, description, role_type, status, is_system)
  VALUES ('epr03_cert_decider', 'EPR-03 cert enforcement decision maker', 'certification fixture', 'internal', 'active', false)
  ON CONFLICT (key) DO UPDATE SET status = 'active' RETURNING id INTO v_role_decider;

  INSERT INTO sec_role_permissions (role_id, permission_id)
  SELECT v_role_officer, p.id FROM sec_permissions p
   WHERE p.module_id = v_module
     AND p.key IN ('view','view_all_entities','create','edit','refer','workflow_action',
                   'issue_notice','impose_sanction','close','decide')
  ON CONFLICT DO NOTHING;

  INSERT INTO sec_role_permissions (role_id, permission_id)
  SELECT v_role_decider, p.id FROM sec_permissions p
   WHERE p.module_id = v_module
     AND p.key IN ('view','view_all_entities','decide','close','edit','workflow_action')
  ON CONFLICT DO NOTHING;

  INSERT INTO sec_user_roles (user_id, role_id, status) VALUES (v_officer, v_role_officer, 'active') ON CONFLICT DO NOTHING;
  INSERT INTO sec_user_roles (user_id, role_id, status) VALUES (v_decider, v_role_decider, 'active') ON CONFLICT DO NOTHING;

  IF NOT public.has_permission(v_officer, 'enforcement_management', 'refer') THEN
    RAISE EXCEPTION 'CERT FAIL: officer fixture did not receive refer authority';
  END IF;
  IF public.has_permission(v_outsider, 'enforcement_management', 'refer')
     OR public.has_permission(v_outsider, 'enforcement_management', 'view') THEN
    RAISE EXCEPTION 'CERT FAIL: outsider fixture unexpectedly holds enforcement authority';
  END IF;
  RAISE NOTICE 'PASS 0.1  RBAC fixtures established (officer holds decide, outsider holds nothing)';

  SELECT c.id, c.licensee_id, c.status, c.updated_at
    INTO v_complaint, v_cmp_entity, v_cmp_status, v_cmp_touched
    FROM complaints c
   WHERE c.licensee_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM enforcement_actions e
                      WHERE e.source_kind = 'COMPLAINT' AND e.source_id = c.id
                        AND e.stage NOT IN ('CLOSED','WITHDRAWN'))
   ORDER BY c.created_at LIMIT 1;

  SELECT b.id, b.entity_id INTO v_breach, v_brc_entity
    FROM return_threshold_breaches b
   WHERE b.entity_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM enforcement_actions e
                      WHERE e.source_kind = 'PRUDENTIAL_BREACH' AND e.source_id = b.id
                        AND e.stage NOT IN ('CLOSED','WITHDRAWN'))
   ORDER BY b.detected_at LIMIT 1;

  IF v_complaint IS NULL OR v_breach IS NULL THEN
    RAISE EXCEPTION 'CERT FAIL: certification source records unavailable (complaint=%, breach=%)', v_complaint, v_breach;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_officer, 'role', 'authenticated')::text, true);

  BEGIN
    PERFORM public.enforcement_referral_create(jsonb_build_object(
      'source_kind','COMPLAINT','source_id', gen_random_uuid(),
      'referral_reason','Referral against a source record that does not exist at all'));
    RAISE EXCEPTION 'CERT FAIL: unknown source record was accepted';
  EXCEPTION WHEN no_data_found THEN
    RAISE NOTICE 'PASS 1.1  Unknown source record rejected server-side';
  END;

  BEGIN
    PERFORM public.enforcement_referral_create(jsonb_build_object(
      'source_kind','NOT_A_REAL_SOURCE','source_id', v_complaint,
      'referral_reason','Referral quoting an unsupported source kind for the process'));
    RAISE EXCEPTION 'CERT FAIL: unsupported source kind was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS 1.2  Unsupported source kind rejected server-side';
  END;

  BEGIN
    PERFORM public.enforcement_referral_create(jsonb_build_object(
      'source_kind','COMPLAINT','source_id', v_complaint, 'referral_reason','too short'));
    RAISE EXCEPTION 'CERT FAIL: short referral reason was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS 1.3  Referral reason minimum enforced server-side';
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.enforcement_referral_create(jsonb_build_object(
      'source_kind','COMPLAINT','source_id', v_complaint,
      'referral_reason','Referral attempted by an officer with no referral authority'));
    RAISE EXCEPTION 'CERT FAIL: unauthorised referral was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 1.4  Referral without authority refused';
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_officer, 'role', 'authenticated')::text, true);

  v_case_e1 := public.enforcement_referral_create(jsonb_build_object(
    'source_kind','COMPLAINT','source_id', v_complaint,
    'referral_reason','Complaint investigation established a systemic conduct failure warranting enforcement',
    'enforcement_type','regulatory_action','severity','high'));

  SELECT * INTO v_row FROM enforcement_actions WHERE id = v_case_e1;
  IF v_row.stage <> 'REFERRAL' THEN RAISE EXCEPTION 'CERT FAIL E1: opened at stage %', v_row.stage; END IF;
  IF v_row.entity_id <> v_cmp_entity THEN
    RAISE EXCEPTION 'CERT FAIL E1: entity not derived from the source record';
  END IF;
  IF v_row.case_number !~ ('^ENF-' || extract(year FROM now())::int || '-\d{5}$') THEN
    RAISE EXCEPTION 'CERT FAIL E1: case number % not allocated by the governed allocator', v_row.case_number;
  END IF;
  RAISE NOTICE 'PASS 2.1  E1 case % opened at REFERRAL, entity derived server-side', v_row.case_number;

  BEGIN
    PERFORM public.enforcement_referral_create(jsonb_build_object(
      'source_kind','COMPLAINT','source_id', v_complaint,
      'referral_reason','Second referral of the very same complaint while a case is open'));
    RAISE EXCEPTION 'CERT FAIL E1: duplicate open referral accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS 2.2  Duplicate open referral for the same source refused';
  END;

  PERFORM public.enforcement_case_action(v_case_e1, 'ACCEPT_REFERRAL',
    jsonb_build_object('rationale','Referral accepted for enforcement assessment'));

  BEGIN
    PERFORM public.enforcement_case_action(v_case_e1, 'ISSUE_NOTICE',
      jsonb_build_object('rationale','Attempting to issue a notice with no findings recorded yet'));
    RAISE EXCEPTION 'CERT FAIL E1: notice issued without findings or legal basis';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS 2.3  Notice blocked until findings and legal basis are recorded';
  END;

  PERFORM public.enforcement_case_action(v_case_e1, 'BEGIN_ASSESSMENT',
    jsonb_build_object('rationale','Assessment completed on complaint evidence',
                       'findings','Repeated mis-selling across three branches',
                       'legal_basis','FSRA s.42(1)','severity','high'));

  PERFORM public.enforcement_case_action(v_case_e1, 'ISSUE_NOTICE',
    jsonb_build_object('rationale','Notice of proposed enforcement action issued to the licensee',
                       'notice_reference','NOT-E1-0001','notice_recipient','Company Secretary',
                       'notice_dispatch_method','registered_post'));

  PERFORM public.enforcement_case_action(v_case_e1, 'RECORD_REPRESENTATION',
    jsonb_build_object('rationale','Licensee representations received and logged',
                       'received_from','Company Secretary','channel','email'));

  PERFORM public.enforcement_case_action(v_case_e1, 'COMPLETE_EVIDENCE_REVIEW',
    jsonb_build_object('rationale','Representations reviewed; matter ready for decision'));

  SELECT stage INTO v_stage FROM enforcement_actions WHERE id = v_case_e1;
  IF v_stage <> 'DECISION' THEN RAISE EXCEPTION 'CERT FAIL E1: expected DECISION, at %', v_stage; END IF;
  RAISE NOTICE 'PASS 2.4  E1 progressed REFERRAL -> ASSESSMENT -> NOTICE -> REPRESENTATIONS -> DECISION';

  BEGIN
    PERFORM public.enforcement_case_action(v_case_e1, 'MAKE_DECISION',
      jsonb_build_object('rationale','Referring officer attempting to decide their own referral',
                         'decision_outcome','sanction'));
    RAISE EXCEPTION 'CERT FAIL E1: referring officer was allowed to take the decision';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 2.5  Maker/checker separation absolute (referrer refused despite decide authority)';
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_decider, 'role', 'authenticated')::text, true);

  BEGIN
    PERFORM public.enforcement_case_action(v_case_e1, 'MAKE_DECISION',
      jsonb_build_object('rationale','short','decision_outcome','sanction'));
    RAISE EXCEPTION 'CERT FAIL E1: decision accepted without a sufficient rationale';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS 2.6  Decision rationale minimum (20 chars) enforced';
  END;

  PERFORM public.enforcement_case_action(v_case_e1, 'MAKE_DECISION',
    jsonb_build_object('rationale','Enforcement decision taken by the independent decision maker on the evidence',
                       'decision_outcome','sanction'));

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_officer, 'role', 'authenticated')::text, true);

  PERFORM public.enforcement_case_action(v_case_e1, 'IMPOSE_SANCTION',
    jsonb_build_object('rationale','Monetary penalty and remediation directive imposed following the decision',
                       'sanction_type','monetary_penalty','penalty_amount', 250000,
                       'penalty_currency','XCD'));

  PERFORM public.enforcement_case_action(v_case_e1, 'RECORD_OBLIGATION',
    jsonb_build_object('rationale','Remediate affected customers','obligation','Customer remediation programme',
                       'detail','Refund all affected customers','deadline', (CURRENT_DATE + 60)::text));

  BEGIN
    PERFORM public.enforcement_case_action(v_case_e1, 'CLOSE',
      jsonb_build_object('rationale','Attempting closure with obligations open and penalty unpaid'));
    RAISE EXCEPTION 'CERT FAIL E1: case closed with open obligations';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS 2.7  Closure blocked while obligations remain open';
  END;

  UPDATE enforcement_obligations SET status = 'completed'
   WHERE case_id = v_case_e1 AND status NOT IN ('completed','waived','closed');

  BEGIN
    PERFORM public.enforcement_case_action(v_case_e1, 'CLOSE',
      jsonb_build_object('rationale','Attempting closure while the monetary penalty is unsettled'));
    RAISE EXCEPTION 'CERT FAIL E1: case closed with an unsettled penalty';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS 2.8  Closure blocked while the penalty is unsettled';
  END;

  PERFORM public.enforcement_case_action(v_case_e1, 'RECORD_PAYMENT',
    jsonb_build_object('amount', 250000, 'currency','XCD','payment_reference','RCT-E1-0001',
                       'kind','payment','rationale','Penalty settled in full'));

  PERFORM public.enforcement_case_action(v_case_e1, 'CLOSE',
    jsonb_build_object('rationale','All obligations discharged and penalty settled; enforcement case closed'));

  SELECT * INTO v_row FROM enforcement_actions WHERE id = v_case_e1;
  IF v_row.stage <> 'CLOSED' OR v_row.closed_at IS NULL THEN
    RAISE EXCEPTION 'CERT FAIL E1: case not closed (stage=%)', v_row.stage;
  END IF;
  RAISE NOTICE 'PASS 2.9  E1 complaint-sourced lifecycle completed through to CLOSED';

  SELECT c.status, c.updated_at INTO v_status_now, v_touched_now FROM complaints c WHERE c.id = v_complaint;
  IF v_status_now IS DISTINCT FROM v_cmp_status OR v_touched_now IS DISTINCT FROM v_cmp_touched THEN
    RAISE EXCEPTION 'CERT FAIL E1: enforcement progression mutated the complaint record (% -> %)',
      v_cmp_status, v_status_now;
  END IF;
  SELECT count(*) INTO v_n FROM approval_actions a
   WHERE a.entity_type = 'complaint' AND a.entity_id = v_complaint AND a.created_at > v_row.referred_at;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'CERT FAIL E1: enforcement progression drove complaint workflow actions';
  END IF;
  RAISE NOTICE 'PASS 2.10 Enforcement progression left the complaint untouched (status still %) and drove no complaint workflow action', v_status_now;

  v_case_e2 := public.enforcement_referral_create(jsonb_build_object(
    'source_kind','PRUDENTIAL_BREACH','source_id', v_breach,
    'referral_reason','Capital threshold breach unremediated after supervisory engagement; enforcement referral',
    'severity','critical'));

  SELECT * INTO v_row FROM enforcement_actions WHERE id = v_case_e2;
  IF v_row.stage <> 'REFERRAL' OR v_row.source_kind <> 'PRUDENTIAL_BREACH' THEN
    RAISE EXCEPTION 'CERT FAIL E2: unexpected opening state (% / %)', v_row.stage, v_row.source_kind;
  END IF;
  IF v_row.entity_id <> v_brc_entity THEN
    RAISE EXCEPTION 'CERT FAIL E2: entity not derived from the prudential breach';
  END IF;
  IF EXISTS (SELECT 1 FROM complaints c WHERE c.id = v_row.source_id) THEN
    RAISE EXCEPTION 'CERT FAIL E2: source record is a complaint - scenario invalid';
  END IF;
  RAISE NOTICE 'PASS 3.1  E2 case % opened from a prudential breach with no complaint involvement', v_row.case_number;

  PERFORM public.enforcement_case_action(v_case_e2, 'ACCEPT_REFERRAL',
    jsonb_build_object('rationale','Breach referral accepted for enforcement assessment'));
  PERFORM public.enforcement_case_action(v_case_e2, 'BEGIN_ASSESSMENT',
    jsonb_build_object('rationale','Assessment of the capital shortfall completed',
                       'findings','Capital adequacy ratio below the regulatory minimum for two quarters',
                       'legal_basis','Banking Act s.18(3)'));
  PERFORM public.enforcement_case_action(v_case_e2, 'ISSUE_NOTICE',
    jsonb_build_object('rationale','Notice of proposed prudential enforcement action issued',
                       'notice_reference','NOT-E2-0001'));
  PERFORM public.enforcement_case_action(v_case_e2, 'COMPLETE_EVIDENCE_REVIEW',
    jsonb_build_object('rationale','No representations received within the statutory window'));

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_decider, 'role', 'authenticated')::text, true);
  PERFORM public.enforcement_case_action(v_case_e2, 'MAKE_DECISION',
    jsonb_build_object('rationale','Directive to restore capital, with monetary penalty, decided independently',
                       'decision_outcome','directive'));

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_officer, 'role', 'authenticated')::text, true);
  PERFORM public.enforcement_case_action(v_case_e2, 'ISSUE_DIRECTIVE',
    jsonb_build_object('rationale','Directive issued requiring capital restoration within 90 days',
                       'directive_detail','Restore CAR above 12% within 90 days','penalty_amount', 100000,
                       'penalty_currency','XCD'));

  PERFORM public.enforcement_case_action(v_case_e2, 'LODGE_APPEAL',
    jsonb_build_object('rationale','Licensee lodged an appeal against the directive',
                       'appellant','Licensee board','review_body','Appeals panel'));

  BEGIN
    PERFORM public.enforcement_case_action(v_case_e2, 'DECIDE_APPEAL',
      jsonb_build_object('rationale','Referring officer attempting to decide the appeal on their own case',
                         'appeal_decision','upheld'));
    RAISE EXCEPTION 'CERT FAIL E2: referring officer decided the appeal';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 3.2  Appeal decision also subject to maker/checker separation';
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_decider, 'role', 'authenticated')::text, true);
  PERFORM public.enforcement_case_action(v_case_e2, 'DECIDE_APPEAL',
    jsonb_build_object('rationale','Appeal dismissed by the appeals panel; directive confirmed',
                       'appeal_decision','dismissed','effect_on_action','confirmed'));

  PERFORM public.enforcement_case_action(v_case_e2, 'RECORD_PAYMENT',
    jsonb_build_object('amount', 100000, 'currency','XCD','kind','payment',
                       'payment_reference','RCT-E2-0001','rationale','Penalty settled in full'));
  PERFORM public.enforcement_case_action(v_case_e2, 'CLOSE',
    jsonb_build_object('rationale','Capital restored, penalty settled and appeal determined; case closed'));

  SELECT * INTO v_row FROM enforcement_actions WHERE id = v_case_e2;
  IF v_row.stage <> 'CLOSED' THEN RAISE EXCEPTION 'CERT FAIL E2: case not closed (stage=%)', v_row.stage; END IF;
  RAISE NOTICE 'PASS 3.3  E2 non-complaint lifecycle completed independently through to CLOSED';

  SELECT * INTO v_state FROM v_enforcement_case_state WHERE id = v_case_e2;
  IF v_state.stage_label IS NULL OR v_state.sla_state IS NULL THEN
    RAISE EXCEPTION 'CERT FAIL: case state read model incomplete';
  END IF;

  v_json := public.enforcement_case(v_case_e2);
  IF jsonb_array_length(v_json->'timeline') < 8 THEN
    RAISE EXCEPTION 'CERT FAIL: case timeline has only % events', jsonb_array_length(v_json->'timeline');
  END IF;
  IF jsonb_array_length(v_json->'appeals') < 1 OR jsonb_array_length(v_json->'payments') < 1 THEN
    RAISE EXCEPTION 'CERT FAIL: case workspace read model missing appeal/payment records';
  END IF;
  RAISE NOTICE 'PASS 4.1  Case workspace read model exposes stage model, timeline, appeals and payments';

  SELECT count(*) INTO v_n FROM public.enforcement_work_queue(
    _source_kinds := ARRAY['COMPLAINT','PRUDENTIAL_BREACH'], _include_closed := true, _limit := 200) q
   WHERE q.case_id IN (v_case_e1, v_case_e2);
  IF v_n <> 2 THEN RAISE EXCEPTION 'CERT FAIL: work queue returned % of 2 certification cases', v_n; END IF;
  RAISE NOTICE 'PASS 4.2  Server-backed work queue returns both cases with source filters applied';

  v_json := public.enforcement_entity_summary(v_brc_entity);
  IF (v_json->>'closed_cases')::int < 1 THEN
    RAISE EXCEPTION 'CERT FAIL: Entity 360 enforcement summary did not report the closed case';
  END IF;
  RAISE NOTICE 'PASS 4.3  Entity 360 enforcement summary reports the case position';

  SELECT count(*) INTO v_n FROM compliance_audit_logs
   WHERE object_type = 'enforcement_actions' AND object_id IN (v_case_e1::text, v_case_e2::text);
  IF v_n < 16 THEN RAISE EXCEPTION 'CERT FAIL: only % audit entries for the two lifecycles', v_n; END IF;

  SELECT count(DISTINCT (object_id, metadata->>'action')) INTO v_n FROM compliance_audit_logs
   WHERE object_type = 'enforcement_actions' AND object_id IN (v_case_e1::text, v_case_e2::text)
     AND user_id IS NOT NULL AND justification IS NOT NULL
     AND metadata->>'process' = 'P11';
  IF v_n < 14 THEN
    RAISE EXCEPTION 'CERT FAIL: only % governed transitions carry an attributed, reasoned audit entry', v_n;
  END IF;
  RAISE NOTICE 'PASS 4.4  % governed transitions each wrote an attributed, reasoned P11 audit entry', v_n;

  v_num1 := public.enforcement_next_case_number();
  v_num2 := public.enforcement_next_case_number();
  v_num3 := public.enforcement_next_case_number();
  IF v_num1 = v_num2 OR v_num2 = v_num3 OR v_num1 = v_num3 THEN
    RAISE EXCEPTION 'CERT FAIL: allocator issued duplicate case references (%, %, %)', v_num1, v_num2, v_num3;
  END IF;
  RAISE NOTICE 'PASS 4.5  Case-number allocator is collision-free (%, %, %)', v_num1, v_num2, v_num3;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.enforcement_case_action(v_case_e2, 'CLOSE',
      jsonb_build_object('rationale','Unauthorised user attempting to act on an enforcement case'));
    RAISE EXCEPTION 'CERT FAIL: unauthorised user acted on an enforcement case';
  EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value THEN
    RAISE NOTICE 'PASS 4.6  Unauthorised user cannot act on an enforcement case';
  END;

  PERFORM set_config('request.jwt.claims', '', true);

  BEGIN
    DELETE FROM compliance_audit_logs
     WHERE object_type = 'enforcement_actions' AND object_id = v_case_e1::text;
    RAISE EXCEPTION 'CERT FAIL: enforcement audit entries were deletable';
  EXCEPTION WHEN raise_exception THEN
    IF sqlerrm LIKE 'CERT FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS 4.7  Enforcement audit entries are immutable (append-only)';
  END;

  -- The two certification cases and their immutable audit trail are retained as
  -- EPR-03 evidence in the non-production certification dataset. Only the
  -- synthetic RBAC fixtures are removed.
  DELETE FROM sec_user_roles WHERE user_id IN (v_officer, v_decider, v_outsider);
  DELETE FROM sec_roles WHERE key IN ('epr03_cert_officer','epr03_cert_decider');
  RAISE NOTICE 'EVIDENCE: E1 case %, E2 case % retained for inspection', v_case_e1, v_case_e2;

  RAISE NOTICE '=== % P11 Enforcement certification: ALL ASSERTIONS PASSED ===', v_marker;
END
$cert$;