-- ============================================================
-- EPR-03 — Enforcement process engine
-- ============================================================

-- ---------- source resolution / validation
CREATE OR REPLACE FUNCTION public.enforcement_resolve_source(_kind text, _id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r jsonb;
BEGIN
  IF _kind IS NULL OR _id IS NULL THEN
    RAISE EXCEPTION 'Source kind and source record are both required' USING ERRCODE = '22023';
  END IF;

  CASE _kind
    WHEN 'COMPLAINT' THEN
      SELECT jsonb_build_object('entity_id', c.licensee_id, 'reference', c.complaint_number,
             'title', c.subject, 'href', '/complaints/' || c.id, 'domain', 'complaint_management')
        INTO r FROM complaints c WHERE c.id = _id;
    WHEN 'CONDUCT_INVESTIGATION' THEN
      SELECT jsonb_build_object('entity_id', i.licensee_id, 'reference', i.code,
             'title', i.allegation, 'href', '/conduct/investigations/' || i.id, 'domain', 'market_conduct')
        INTO r FROM conduct_investigations i WHERE i.id = _id;
    WHEN 'THEMATIC_FINDING' THEN
      SELECT jsonb_build_object('entity_id', f.licensee_id, 'reference', left(f.id::text, 8),
             'title', f.title, 'href', '/supervision/thematic-reviews/' || f.review_id, 'domain', 'market_conduct')
        INTO r FROM thematic_review_findings f WHERE f.id = _id;
    WHEN 'PRUDENTIAL_BREACH' THEN
      SELECT jsonb_build_object('entity_id', b.entity_id, 'reference', b.metric_key,
             'title', 'Threshold breach: ' || b.metric_key,
             'href', CASE WHEN b.return_filing_id IS NOT NULL
                          THEN '/returns/filings/' || b.return_filing_id ELSE '/supervision/breaches' END,
             'domain', 'prudential_supervision')
        INTO r FROM return_threshold_breaches b WHERE b.id = _id;
    WHEN 'PRUDENTIAL_ACTION' THEN
      SELECT jsonb_build_object('entity_id', a.entity_id, 'reference', a.action_reference,
             'title', a.title, 'href', '/prudential/actions', 'domain', 'prudential_supervision')
        INTO r FROM prudential_actions a WHERE a.id = _id;
    WHEN 'EXAMINATION_FINDING' THEN
      SELECT jsonb_build_object('entity_id', e.entity_id, 'reference', f.reference,
             'title', f.title, 'href', '/prudential/examinations/' || e.id, 'domain', 'prudential_supervision')
        INTO r FROM examination_findings f JOIN examinations e ON e.id = f.examination_id WHERE f.id = _id;
    WHEN 'LICENSING_VIOLATION' THEN
      SELECT jsonb_build_object('entity_id', ap.entity_id, 'reference', ap.application_number,
             'title', 'Licensing matter ' || ap.application_number,
             'href', '/applications/' || ap.id, 'domain', 'license_management')
        INTO r FROM applications ap WHERE ap.id = _id;
    WHEN 'FP_MATTER' THEN
      SELECT jsonb_build_object('entity_id', fa.licensee_id, 'reference', left(fa.id::text, 8),
             'title', 'Fit and proper matter', 'href', '/fpa/assessments/' || fa.id, 'domain', 'fit_and_proper')
        INTO r FROM fp_assessments fa WHERE fa.id = _id;
    WHEN 'MANUAL_REFERRAL' THEN
      SELECT jsonb_build_object('entity_id', l.id, 'reference', NULL::text,
             'title', 'Manual enforcement referral', 'href', '/entities/' || l.id,
             'domain', 'enforcement_management')
        INTO r FROM licensees l WHERE l.id = _id;
    ELSE
      RAISE EXCEPTION 'Unsupported enforcement source kind %', _kind USING ERRCODE = '22023';
  END CASE;

  IF r IS NULL THEN
    RAISE EXCEPTION 'Referred % record was not found', _kind USING ERRCODE = 'P0002';
  END IF;
  IF (r->>'entity_id') IS NULL THEN
    RAISE EXCEPTION 'Referred % record is not linked to a regulated entity', _kind USING ERRCODE = '22023';
  END IF;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.enforcement_resolve_source(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforcement_resolve_source(text, uuid) TO authenticated;

-- ---------- governed referral creation
CREATE OR REPLACE FUNCTION public.enforcement_referral_create(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_kind text := upper(nullif(btrim(_payload->>'source_kind'), ''));
  v_src uuid := nullif(_payload->>'source_id','')::uuid;
  v_reason text := nullif(btrim(_payload->>'referral_reason'), '');
  v_resolved jsonb;
  v_entity uuid;
  v_case uuid;
  v_number text;
  v_domain text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 20 THEN
    RAISE EXCEPTION 'A referral reason of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;

  v_resolved := public.enforcement_resolve_source(v_kind, v_src);
  v_entity := (v_resolved->>'entity_id')::uuid;
  v_domain := v_resolved->>'domain';

  IF NOT (
    public.has_permission(v_uid, 'enforcement_management', 'refer')
    OR public.has_permission(v_uid, 'enforcement_management', 'create')
    OR public.has_permission(v_uid, v_domain, 'workflow_action')
    OR public.has_permission(v_uid, v_domain, 'approve')
  ) THEN
    RAISE EXCEPTION 'You are not authorised to refer this matter to Enforcement' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM enforcement_actions ea
              WHERE ea.source_kind = v_kind AND ea.source_id = v_src
                AND ea.stage NOT IN ('CLOSED','WITHDRAWN')) THEN
    RAISE EXCEPTION 'An open enforcement case already exists for this source record' USING ERRCODE = '23505';
  END IF;

  v_number := 'ENF-' || to_char(now(), 'YYYY') || '-' || lpad((
    SELECT count(*) + 1 FROM enforcement_actions
     WHERE date_trunc('year', created_at) = date_trunc('year', now()))::text, 5, '0');

  INSERT INTO enforcement_actions (
    entity_id, case_number, enforcement_type, date_opened, status, stage,
    source_kind, source_id, source_reference, referred_by, referred_at, referral_reason,
    legal_basis, description, severity, assigned_to, assigned_team, opened_by, review_state
  ) VALUES (
    v_entity, v_number,
    coalesce(nullif(btrim(_payload->>'enforcement_type'), ''), 'regulatory_action'),
    CURRENT_DATE, 'referred', 'REFERRAL',
    v_kind, v_src, v_resolved->>'reference', v_uid, now(), v_reason,
    nullif(btrim(_payload->>'legal_basis'), ''),
    coalesce(nullif(btrim(_payload->>'description'), ''), v_resolved->>'title'),
    coalesce(nullif(btrim(_payload->>'severity'), ''), 'medium'),
    nullif(_payload->>'assigned_to','')::uuid,
    nullif(btrim(_payload->>'assigned_team'), ''),
    v_uid, 'proposed'
  ) RETURNING id INTO v_case;

  INSERT INTO enforcement_case_events (case_id, event_type, actor_id, note, detail)
  VALUES (v_case, 'REFERRAL_RECEIVED', v_uid, v_reason,
          jsonb_build_object('source_kind', v_kind, 'source_id', v_src,
                             'source_reference', v_resolved->>'reference',
                             'source_href', v_resolved->>'href', 'to_stage', 'REFERRAL'));

  PERFORM public.log_compliance_audit_as_actor(
    v_uid, 'CREATE'::compliance_audit_action, 'enforcement_actions', v_case::text,
    NULL, jsonb_build_object('case_number', v_number, 'stage', 'REFERRAL',
                             'source_kind', v_kind, 'source_id', v_src, 'entity_id', v_entity),
    v_reason, NULL, NULL, NULL, jsonb_build_object('process', 'P11', 'action', 'REFER'));

  RETURN v_case;
END;
$$;

REVOKE ALL ON FUNCTION public.enforcement_referral_create(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforcement_referral_create(jsonb) TO authenticated;

-- ---------- the single governed enforcement transition
CREATE OR REPLACE FUNCTION public.enforcement_case_action(
  _case_id uuid, _action text, _payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_case enforcement_actions;
  v_t enforcement_workflow_transitions;
  v_rationale text := nullif(btrim(_payload->>'rationale'), '');
  v_before jsonb;
  v_child uuid;
  v_amount numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_case FROM enforcement_actions WHERE id = _case_id FOR UPDATE;
  IF v_case.id IS NULL THEN
    RAISE EXCEPTION 'Enforcement case not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_read_enforcement(v_uid, v_case.entity_id) THEN
    RAISE EXCEPTION 'You are not authorised for this enforcement case' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_t FROM enforcement_workflow_transitions
   WHERE version = 1 AND is_active AND action_code = upper(_action) AND from_stage = v_case.stage;
  IF v_t.id IS NULL THEN
    RAISE EXCEPTION 'Action % is not available at stage %', _action, v_case.stage USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission(v_uid, 'enforcement_management', v_t.permission_action) THEN
    RAISE EXCEPTION 'You do not hold the % authority required for this action', v_t.permission_action
      USING ERRCODE = '42501';
  END IF;

  IF v_t.requires_rationale AND (v_rationale IS NULL OR length(v_rationale) < v_t.min_rationale_length) THEN
    RAISE EXCEPTION 'A rationale of at least % characters is required', v_t.min_rationale_length
      USING ERRCODE = '22023';
  END IF;

  -- maker/checker: the decision maker may not be the officer who proposed the case stage
  IF v_t.requires_maker_checker AND v_case.referred_by IS NOT NULL AND v_case.referred_by = v_uid
     AND NOT public.has_permission(v_uid, 'enforcement_management', 'decide') THEN
    RAISE EXCEPTION 'Maker/checker separation: the referring officer cannot take this decision'
      USING ERRCODE = '42501';
  END IF;

  v_before := to_jsonb(v_case);

  -- action specific prerequisites and record keeping
  IF upper(_action) = 'ISSUE_NOTICE' THEN
    IF nullif(btrim(_payload->>'notice_reference'), '') IS NULL THEN
      RAISE EXCEPTION 'A notice reference is required to issue an enforcement notice' USING ERRCODE = '22023';
    END IF;
    IF v_case.legal_basis IS NULL AND nullif(btrim(_payload->>'legal_basis'), '') IS NULL THEN
      RAISE EXCEPTION 'The legal basis must be recorded before a notice can be issued' USING ERRCODE = '22023';
    END IF;
    IF v_t.requires_evidence AND v_case.findings IS NULL
       AND nullif(btrim(_payload->>'findings'), '') IS NULL THEN
      RAISE EXCEPTION 'Assessment findings must be recorded before a notice can be issued' USING ERRCODE = '22023';
    END IF;
    UPDATE enforcement_actions SET
      notice_issued_at = now(),
      notice_reference = _payload->>'notice_reference',
      notice_recipient = nullif(btrim(_payload->>'notice_recipient'), ''),
      notice_dispatch_method = nullif(btrim(_payload->>'notice_dispatch_method'), ''),
      representation_deadline = coalesce(nullif(_payload->>'representation_deadline','')::date,
                                        (CURRENT_DATE + 21)),
      legal_basis = coalesce(nullif(btrim(_payload->>'legal_basis'), ''), legal_basis),
      findings = coalesce(nullif(btrim(_payload->>'findings'), ''), findings)
     WHERE id = _case_id;

  ELSIF upper(_action) = 'BEGIN_ASSESSMENT' THEN
    UPDATE enforcement_actions SET
      findings = coalesce(nullif(btrim(_payload->>'findings'), ''), findings),
      legal_basis = coalesce(nullif(btrim(_payload->>'legal_basis'), ''), legal_basis),
      severity = coalesce(nullif(btrim(_payload->>'severity'), ''), severity)
     WHERE id = _case_id;

  ELSIF upper(_action) = 'RECORD_REPRESENTATION' THEN
    INSERT INTO enforcement_representations (case_id, received_from, channel, summary,
                                             attachment_reference, recorded_by)
    VALUES (_case_id, nullif(btrim(_payload->>'received_from'), ''),
            nullif(btrim(_payload->>'channel'), ''), v_rationale,
            nullif(btrim(_payload->>'attachment_reference'), ''), v_uid)
    RETURNING id INTO v_child;
    UPDATE enforcement_actions SET
      response_received_at = coalesce(response_received_at, now()),
      response_summary = v_rationale
     WHERE id = _case_id;

  ELSIF upper(_action) = 'COMPLETE_EVIDENCE_REVIEW' THEN
    UPDATE enforcement_actions SET
      representations_closed_at = now(), evidence_review_at = now(), evidence_review_note = v_rationale
     WHERE id = _case_id;

  ELSIF upper(_action) IN ('MAKE_DECISION','CLOSE_NO_ACTION') THEN
    IF nullif(btrim(_payload->>'decision_outcome'), '') IS NULL THEN
      RAISE EXCEPTION 'A decision outcome is required' USING ERRCODE = '22023';
    END IF;
    UPDATE enforcement_actions SET
      decision_at = now(),
      decision_outcome = _payload->>'decision_outcome',
      decision_rationale = v_rationale,
      decision_authority = v_uid,
      legal_basis = coalesce(nullif(btrim(_payload->>'legal_basis'), ''), legal_basis),
      closed_at = CASE WHEN upper(_action) = 'CLOSE_NO_ACTION' THEN now() ELSE closed_at END,
      closed_by = CASE WHEN upper(_action) = 'CLOSE_NO_ACTION' THEN v_uid ELSE closed_by END,
      closure_rationale = CASE WHEN upper(_action) = 'CLOSE_NO_ACTION' THEN v_rationale ELSE closure_rationale END
     WHERE id = _case_id;

  ELSIF upper(_action) IN ('IMPOSE_SANCTION','ISSUE_DIRECTIVE') THEN
    IF v_case.decision_at IS NULL THEN
      RAISE EXCEPTION 'A sanction can only follow a recorded enforcement decision' USING ERRCODE = '22023';
    END IF;
    v_amount := coalesce(nullif(_payload->>'penalty_amount','')::numeric, 0);
    IF v_amount < 0 THEN
      RAISE EXCEPTION 'A monetary penalty cannot be negative' USING ERRCODE = '22023';
    END IF;
    UPDATE enforcement_actions SET
      sanction_imposed_at = now(),
      sanction_type = coalesce(nullif(btrim(_payload->>'sanction_type'), ''),
                               CASE WHEN upper(_action) = 'ISSUE_DIRECTIVE' THEN 'directive' ELSE sanction_type END),
      sanction_detail = coalesce(nullif(btrim(_payload->>'sanction_detail'), ''), v_rationale),
      directive_detail = CASE WHEN upper(_action) = 'ISSUE_DIRECTIVE'
                              THEN coalesce(nullif(btrim(_payload->>'directive_detail'), ''), v_rationale)
                              ELSE directive_detail END,
      penalty_amount = CASE WHEN v_amount > 0 THEN v_amount ELSE penalty_amount END,
      penalty_currency = coalesce(nullif(btrim(_payload->>'penalty_currency'), ''), penalty_currency),
      effective_date = coalesce(nullif(_payload->>'effective_date','')::date, CURRENT_DATE),
      appeal_deadline = coalesce(nullif(_payload->>'appeal_deadline','')::date, CURRENT_DATE + 30),
      monitoring_state = 'monitoring'
     WHERE id = _case_id;

  ELSIF upper(_action) = 'RECORD_OBLIGATION' THEN
    INSERT INTO enforcement_obligations (case_id, obligation, detail, deadline, status, created_by)
    VALUES (_case_id, coalesce(nullif(btrim(_payload->>'obligation'), ''), v_rationale),
            nullif(btrim(_payload->>'detail'), ''),
            nullif(_payload->>'deadline','')::date, 'pending', v_uid)
    RETURNING id INTO v_child;

  ELSIF upper(_action) = 'REVIEW_REMEDIATION' THEN
    UPDATE enforcement_actions SET
      non_compliance_flag = coalesce((_payload->>'non_compliant')::boolean, false),
      non_compliance_note = CASE WHEN coalesce((_payload->>'non_compliant')::boolean, false)
                                 THEN v_rationale ELSE non_compliance_note END,
      monitoring_state = CASE WHEN coalesce((_payload->>'non_compliant')::boolean, false)
                              THEN 'non_compliant' ELSE 'monitoring' END
     WHERE id = _case_id;

  ELSIF upper(_action) = 'RECORD_PAYMENT' THEN
    v_amount := coalesce(nullif(_payload->>'amount','')::numeric, 0);
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'A payment amount greater than zero is required' USING ERRCODE = '22023';
    END IF;
    IF lower(coalesce(_payload->>'kind','payment')) = 'waiver'
       AND NOT public.has_permission(v_uid, 'enforcement_management', 'decide') THEN
      RAISE EXCEPTION 'Only an enforcement decision maker can waive a penalty' USING ERRCODE = '42501';
    END IF;
    IF coalesce(v_case.penalty_amount, 0) = 0 THEN
      RAISE EXCEPTION 'This case has no monetary penalty to settle' USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_case.penalty_paid_amount,0) + coalesce(v_case.penalty_waived_amount,0) + v_amount
       > coalesce(v_case.penalty_amount,0) THEN
      RAISE EXCEPTION 'Recorded settlement cannot exceed the imposed penalty' USING ERRCODE = '22023';
    END IF;
    INSERT INTO enforcement_penalty_payments (case_id, amount, currency, payment_reference, paid_on, kind, note, recorded_by)
    VALUES (_case_id, v_amount, coalesce(nullif(btrim(_payload->>'currency'),''), coalesce(v_case.penalty_currency,'USD')),
            nullif(btrim(_payload->>'payment_reference'), ''),
            coalesce(nullif(_payload->>'paid_on','')::date, CURRENT_DATE),
            lower(coalesce(_payload->>'kind','payment')), v_rationale, v_uid)
    RETURNING id INTO v_child;
    UPDATE enforcement_actions SET
      penalty_paid_amount = coalesce(penalty_paid_amount,0)
        + CASE WHEN lower(coalesce(_payload->>'kind','payment')) = 'payment' THEN v_amount ELSE 0 END,
      penalty_waived_amount = coalesce(penalty_waived_amount,0)
        + CASE WHEN lower(coalesce(_payload->>'kind','payment')) = 'waiver' THEN v_amount ELSE 0 END
     WHERE id = _case_id;

  ELSIF upper(_action) = 'LODGE_APPEAL' THEN
    INSERT INTO enforcement_appeals (case_id, appellant, grounds, review_body, lodged_by,
                                     lodged_at, status)
    VALUES (_case_id, nullif(btrim(_payload->>'appellant'), ''), v_rationale,
            nullif(btrim(_payload->>'review_body'), ''), v_uid,
            coalesce(nullif(_payload->>'lodged_at','')::timestamptz, now()), 'lodged')
    RETURNING id INTO v_child;

  ELSIF upper(_action) = 'DECIDE_APPEAL' THEN
    IF nullif(btrim(_payload->>'appeal_decision'), '') IS NULL THEN
      RAISE EXCEPTION 'An appeal decision is required' USING ERRCODE = '22023';
    END IF;
    UPDATE enforcement_appeals SET
      status = 'decided', decision = _payload->>'appeal_decision',
      decision_rationale = v_rationale, decision_at = now(), decided_by = v_uid,
      effect_on_action = nullif(btrim(_payload->>'effect_on_action'), '')
     WHERE case_id = _case_id AND status = 'lodged';

  ELSIF upper(_action) = 'CLOSE' THEN
    IF EXISTS (SELECT 1 FROM enforcement_obligations o
                WHERE o.case_id = _case_id AND o.status NOT IN ('completed','waived','closed')) THEN
      RAISE EXCEPTION 'All compliance obligations must be discharged or waived before closure' USING ERRCODE = '22023';
    END IF;
    IF coalesce(v_case.penalty_amount,0) >
       coalesce(v_case.penalty_paid_amount,0) + coalesce(v_case.penalty_waived_amount,0) THEN
      RAISE EXCEPTION 'The monetary penalty is not fully settled or waived' USING ERRCODE = '22023';
    END IF;
    UPDATE enforcement_actions SET
      closed_at = now(), closed_by = v_uid, closure_rationale = v_rationale,
      resolution_date = CURRENT_DATE, monitoring_state = 'closed'
     WHERE id = _case_id;

  ELSIF upper(_action) = 'WITHDRAW' THEN
    UPDATE enforcement_actions SET
      withdrawn_at = now(), withdrawal_reason = v_rationale, closed_at = now(), closed_by = v_uid
     WHERE id = _case_id;
  END IF;

  -- governed stage/status advance
  UPDATE enforcement_actions SET
    stage = v_t.to_stage,
    status = coalesce(v_t.to_status, status),
    updated_at = now()
   WHERE id = _case_id;

  INSERT INTO enforcement_case_events (case_id, event_type, actor_id, note, detail)
  VALUES (_case_id, upper(_action), v_uid, v_rationale,
          jsonb_build_object('from_stage', v_case.stage, 'to_stage', v_t.to_stage,
                             'child_id', v_child, 'payload', _payload - 'rationale'));

  PERFORM public.log_compliance_audit_as_actor(
    v_uid, 'WORKFLOW_TRANSITION'::compliance_audit_action, 'enforcement_actions', _case_id::text,
    v_before, (SELECT to_jsonb(e) FROM enforcement_actions e WHERE e.id = _case_id),
    v_rationale, NULL, NULL, NULL,
    jsonb_build_object('process', 'P11', 'action', upper(_action),
                       'from_stage', v_case.stage, 'to_stage', v_t.to_stage));

  RETURN jsonb_build_object('case_id', _case_id, 'action', upper(_action),
                            'from_stage', v_case.stage, 'to_stage', v_t.to_stage);
END;
$$;

REVOKE ALL ON FUNCTION public.enforcement_case_action(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforcement_case_action(uuid, text, jsonb) TO authenticated;
