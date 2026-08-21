DO $cert$
DECLARE
  v_officer uuid := '53b18f0d-89e0-44dc-bd23-32104e6565b8';
  v_super   uuid := '7c2ae562-61f3-4960-9f0d-d472ebeec860';
  v_role_off uuid := '62b5be35-c46b-4b8f-af63-72fbd55c3002';
  v_role_sup uuid := 'd49cc9d3-6fdb-436f-b641-aac8afd2d8d5';
  v_entity uuid := '24f18097-3b88-45a0-8c08-3a1ccfecd854';
  v_reg uuid; v_case uuid; v_case2 uuid; v_bind uuid; v_bind2 uuid;
  c public.entity_resolution_cases; b public.registration_entity_bindings;
  v_new_entity uuid; v_ok int := 0;
  v_ur_off uuid; v_ur_sup uuid; v_ur_self uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_officer::text, 'role','authenticated')::text, true);

  INSERT INTO public.sec_user_roles (user_id, role_id, status) VALUES (v_officer, v_role_off, 'active') RETURNING id INTO v_ur_off;
  INSERT INTO public.sec_user_roles (user_id, role_id, status) VALUES (v_super, v_role_sup, 'active') RETURNING id INTO v_ur_sup;

  INSERT INTO public.registrations (user_id, sector_id, sub_sector_id, category_id, applicant_name,
    first_name, last_name, telephone, email, registration_reference)
  VALUES (v_officer, '1ea22781-fee7-4a26-b382-09f0477485d5', '0f9ffb4e-2f4d-4083-af42-3cd09fd6624b',
    '04769138-b694-433a-967b-7f16ec3af110', 'CERT MC FIXTURE ORG', 'Cert', 'Fixture', '0000000',
    'cert-mc-fixture@example.test', 'CERT-MC-FIXTURE-1')
  RETURNING id INTO v_reg;

  INSERT INTO public.entity_resolution_cases (case_number, status, outcome, subject_name,
    subject_identifiers, subject_payload, requested_by, resolution_policy_id)
  VALUES ('CERT-MC-1', 'OPEN', 'POSSIBLE_MATCH', 'CERT MC FIXTURE ORG', '[]'::jsonb,
    jsonb_build_object('journey_type','FORM_FIRST','legal_name','CERT MC FIXTURE ORG'), v_officer,
    (SELECT id FROM public.entity_resolution_policies WHERE is_default AND is_active LIMIT 1))
  RETURNING id INTO v_case;

  INSERT INTO public.entity_match_candidates (case_id, entity_id, match_score, match_basis, signals)
  VALUES (v_case, v_entity, 55, 'name_similarity', '{}'::jsonb);

  INSERT INTO public.registration_entity_bindings (registration_id, resolution_case_id, binding_status)
  VALUES (v_reg, v_case, 'PENDING_RESOLUTION') RETURNING id INTO v_bind;

  PERFORM public.entity_resolution_decide(v_case, 'RECOMMEND_EXISTING', v_entity, 'Identifier and address evidence align with the register record.');
  SELECT * INTO c FROM public.entity_resolution_cases WHERE id = v_case;
  IF c.status <> 'PENDING_REVIEW' OR c.recommended_action <> 'RESOLVE_EXISTING'
     OR c.recommended_entity_id <> v_entity OR c.recommended_by <> v_officer THEN
    RAISE EXCEPTION 'FAIL 1: recommendation not recorded (%, %)', c.status, c.recommended_action; END IF;
  v_ok := v_ok + 1;

  BEGIN
    PERFORM public.entity_resolution_decide(v_case, 'RECOMMEND_NEW', NULL, 'short');
    RAISE EXCEPTION 'FAIL 2: rationale not enforced';
  EXCEPTION WHEN sqlstate '22023' THEN v_ok := v_ok + 1; END;

  BEGIN
    PERFORM public.entity_resolution_decide(v_case, 'RESOLVE_EXISTING', v_entity, 'Attempting direct resolution without supervision.');
    RAISE EXCEPTION 'FAIL 3: direct resolution allowed';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok + 1; END;

  PERFORM public.entity_resolution_decide(v_case, 'ESCALATE', NULL, 'Conflicting address evidence requires supervisory review.');
  SELECT * INTO c FROM public.entity_resolution_cases WHERE id = v_case;
  IF c.status <> 'ESCALATED' OR c.escalated_by <> v_officer OR c.escalated_at IS NULL
     OR c.escalation_reason IS NULL THEN RAISE EXCEPTION 'FAIL 4: escalation not recorded'; END IF;
  v_ok := v_ok + 1;

  BEGIN
    PERFORM public.entity_resolution_decide(v_case, 'APPROVE', NULL, 'Trying to approve without permission.');
    RAISE EXCEPTION 'FAIL 5: unauthorised approval allowed';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok + 1; END;

  INSERT INTO public.sec_user_roles (user_id, role_id, status) VALUES (v_officer, v_role_sup, 'active') RETURNING id INTO v_ur_self;
  BEGIN
    PERFORM public.entity_resolution_decide(v_case, 'APPROVE', NULL, 'Self approval attempt.');
    RAISE EXCEPTION 'FAIL 6: self-approval allowed';
  EXCEPTION WHEN insufficient_privilege THEN v_ok := v_ok + 1; END;
  DELETE FROM public.sec_user_roles WHERE id = v_ur_self;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super::text, 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.entity_resolution_decide(v_case, 'RETURN_FOR_REVIEW', NULL, 'no');
    RAISE EXCEPTION 'FAIL 7a: return reason not enforced';
  EXCEPTION WHEN sqlstate '22023' THEN v_ok := v_ok + 1; END;

  PERFORM public.entity_resolution_decide(v_case, 'RETURN_FOR_REVIEW', NULL, 'Obtain certified incorporation evidence before binding.');
  SELECT * INTO c FROM public.entity_resolution_cases WHERE id = v_case;
  SELECT * INTO b FROM public.registration_entity_bindings WHERE id = v_bind;
  IF c.status <> 'PENDING_REVIEW' OR c.supervisor_decision <> 'RETURNED'
     OR c.recommended_action IS NULL OR c.supervisor_decided_by <> v_super
     OR b.binding_status <> 'PENDING_RESOLUTION' OR b.entity_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 7b: return did not preserve state (%, %, %)', c.status, c.supervisor_decision, b.binding_status; END IF;
  v_ok := v_ok + 1;

  PERFORM public.entity_resolution_decide(v_case, 'ESCALATE', NULL, 'Re-escalated after officer rework of the recommendation.');
  PERFORM public.entity_resolution_decide(v_case, 'REQUEST_EVIDENCE', NULL, 'Provide the certificate of incorporation and licence letter.');
  SELECT * INTO c FROM public.entity_resolution_cases WHERE id = v_case;
  IF c.status <> 'EVIDENCE_REQUESTED' THEN RAISE EXCEPTION 'FAIL 8: evidence state'; END IF;
  v_ok := v_ok + 1;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_officer::text, 'role','authenticated')::text, true);
  PERFORM public.entity_resolution_decide(v_case, 'ESCALATE', NULL, 'Evidence received; submitting for supervisory decision.');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super::text, 'role','authenticated')::text, true);
  PERFORM public.entity_resolution_decide(v_case, 'APPROVE', NULL, 'Evidence supports the recommended register record.');
  SELECT * INTO c FROM public.entity_resolution_cases WHERE id = v_case;
  SELECT * INTO b FROM public.registration_entity_bindings WHERE id = v_bind;
  IF c.status <> 'RESOLVED' OR c.outcome <> 'RESOLVED_EXISTING' OR c.resolved_entity_id <> v_entity
     OR c.resolved_by <> v_officer OR c.approved_by <> v_super
     OR b.binding_status <> 'BOUND_EXISTING' OR b.entity_id <> v_entity THEN
    RAISE EXCEPTION 'FAIL 9: approval did not complete resolution (%, %, %, %)', c.status, c.outcome, c.resolved_by, b.binding_status; END IF;
  v_ok := v_ok + 1;

  BEGIN
    PERFORM public.entity_resolution_decide(v_case, 'APPROVE', NULL, 'Double click.');
    RAISE EXCEPTION 'FAIL 10a: double approval allowed';
  EXCEPTION WHEN sqlstate '22023' THEN v_ok := v_ok + 1; END;
  BEGIN
    PERFORM public.entity_resolution_decide(v_case, 'RETURN_FOR_REVIEW', NULL, 'Returning a resolved case should fail.');
    RAISE EXCEPTION 'FAIL 10b: return after resolution allowed';
  EXCEPTION WHEN sqlstate '22023' THEN v_ok := v_ok + 1; END;

  IF EXISTS (SELECT 1 FROM public.entity_user_memberships WHERE user_id = v_officer AND entity_id = v_entity) THEN
    RAISE EXCEPTION 'FAIL 11: identity approval granted membership'; END IF;
  v_ok := v_ok + 1;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_officer::text, 'role','authenticated')::text, true);
  INSERT INTO public.entity_resolution_cases (case_number, status, outcome, subject_name,
    subject_identifiers, subject_payload, requested_by, resolution_policy_id)
  VALUES ('CERT-MC-2', 'OPEN', 'POSSIBLE_MATCH', 'CERT MC FIXTURE NEW ORG', '[]'::jsonb,
    jsonb_build_object('journey_type','FORM_FIRST','legal_name','CERT MC FIXTURE NEW ORG'), v_officer,
    (SELECT id FROM public.entity_resolution_policies WHERE is_default AND is_active LIMIT 1))
  RETURNING id INTO v_case2;
  INSERT INTO public.registration_entity_bindings (registration_id, resolution_case_id, binding_status)
  VALUES (v_reg, v_case2, 'PENDING_RESOLUTION')
  ON CONFLICT (registration_id) DO UPDATE SET resolution_case_id = EXCLUDED.resolution_case_id,
    binding_status = 'PENDING_RESOLUTION', entity_id = NULL
  RETURNING id INTO v_bind2;

  PERFORM public.entity_resolution_decide(v_case2, 'RECOMMEND_NEW', NULL, 'No register record exists for this applicant organisation.');
  PERFORM public.entity_resolution_decide(v_case2, 'ESCALATE', NULL, 'New entity creation requires supervisory approval.');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super::text, 'role','authenticated')::text, true);
  PERFORM public.entity_resolution_decide(v_case2, 'APPROVE', NULL, 'Confirmed as a new provisional register record.');
  SELECT * INTO c FROM public.entity_resolution_cases WHERE id = v_case2;
  SELECT * INTO b FROM public.registration_entity_bindings WHERE id = v_bind2;
  v_new_entity := c.resolved_entity_id;
  IF c.outcome <> 'CONFIRMED_NEW' OR v_new_entity IS NULL OR b.binding_status <> 'BOUND_PROVISIONAL'
     OR b.entity_id <> v_new_entity THEN
    RAISE EXCEPTION 'FAIL 12: new-entity approval (%, %, %)', c.outcome, v_new_entity, b.binding_status; END IF;
  v_ok := v_ok + 1;

  IF NOT EXISTS (SELECT 1 FROM public.entity_resolution_events WHERE case_id = v_case AND event_type='entity.resolution.recommended_existing')
     OR NOT EXISTS (SELECT 1 FROM public.entity_resolution_events WHERE case_id = v_case AND event_type='entity.resolution.approved')
     OR NOT EXISTS (SELECT 1 FROM public.entity_resolution_events WHERE case_id = v_case AND event_type='entity.resolution.returned')
     OR NOT EXISTS (SELECT 1 FROM public.entity_resolution_events WHERE case_id = v_case AND event_type='entity.resolution.resolved_existing') THEN
    RAISE EXCEPTION 'FAIL 13: audit events missing'; END IF;
  v_ok := v_ok + 1;

  IF (public.entity_resolution_queue('ESCALATED')->>'awaiting_supervisor_count') IS NULL THEN
    RAISE EXCEPTION 'FAIL 14a: queue read model'; END IF;
  IF public.entity_resolution_case_view(v_case)->'detail'->>'case_number' <> 'CERT-MC-1' THEN
    RAISE EXCEPTION 'FAIL 14b: case read model'; END IF;
  v_ok := v_ok + 1;

  RAISE NOTICE 'ENTITY RESOLUTION MAKER-CHECKER CERTIFICATION: % assertions passed', v_ok;

  DELETE FROM public.registration_entity_bindings WHERE registration_id = v_reg;
  DELETE FROM public.entity_resolution_events WHERE case_id IN (v_case, v_case2);
  DELETE FROM public.entity_match_candidates WHERE case_id IN (v_case, v_case2);
  DELETE FROM public.entity_resolution_cases WHERE id IN (v_case, v_case2);
  DELETE FROM public.registrations WHERE id = v_reg;
  DELETE FROM public.sec_user_roles WHERE id IN (v_ur_off, v_ur_sup);
  BEGIN
    DELETE FROM public.entity_identifiers WHERE entity_id = v_new_entity;
    DELETE FROM public.entity_identity_snapshots WHERE entity_id = v_new_entity;
    DELETE FROM public.licensees WHERE id = v_new_entity;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Provisional fixture entity % retained: %', v_new_entity, SQLERRM;
  END;
END $cert$;