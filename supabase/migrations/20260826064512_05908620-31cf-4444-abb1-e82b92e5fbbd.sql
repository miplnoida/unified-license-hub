-- =====================================================================
-- MC-02 PART 2 — GOVERNED JURISDICTION OPERATIONS
-- =====================================================================

ALTER TABLE public.complaint_vulnerability_assessments
  ADD COLUMN IF NOT EXISTS staff_categories text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS staff_support_required boolean,
  ADD COLUMN IF NOT EXISTS handling_instruction text;

-- ---------- guard --------------------------------------------------
CREATE OR REPLACE FUNCTION public.mc02_complaint_guard(_complaint_id uuid, _action text)
RETURNS public.complaints
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); c public.complaints;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM public.complaints WHERE id = _complaint_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Complaint not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_complaint_perm(v_uid, _action) THEN
    RAISE EXCEPTION 'not_authorized: complaint_management.%', _action USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_super_admin(v_uid) THEN
    IF NOT public.regulatory_scope_allows(v_uid, 'complaint_management', _action,
             c.regulator_id, NULL::uuid, NULL::uuid, c.licensee_id, NULL::uuid) THEN
      RAISE EXCEPTION 'not_authorized: outside regulatory scope for this complaint' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN c;
END;
$$;
REVOKE ALL ON FUNCTION public.mc02_complaint_guard(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mc02_complaint_guard(uuid,text) TO authenticated, service_role;

-- ---------- rule set resolution ------------------------------------
CREATE OR REPLACE FUNCTION public.complaint_jurisdiction_resolve_rule_set(_regulator_id uuid)
RETURNS public.complaint_jurisdiction_rule_sets
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.complaint_jurisdiction_rule_sets
   WHERE status = 'PUBLISHED'
     AND effective_from <= CURRENT_DATE
     AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
     AND (regulator_id = _regulator_id OR regulator_id IS NULL)
   ORDER BY (regulator_id IS NOT NULL) DESC, version DESC, effective_from DESC
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.complaint_jurisdiction_resolve_rule_set(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complaint_jurisdiction_resolve_rule_set(uuid) TO authenticated, service_role;

-- ---------- start --------------------------------------------------
CREATE OR REPLACE FUNCTION public.complaint_jurisdiction_start(_complaint_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); c public.complaints; rs public.complaint_jurisdiction_rule_sets;
        a public.complaint_jurisdiction_assessments;
BEGIN
  c := public.mc02_complaint_guard(_complaint_id, 'assess_jurisdiction');
  rs := public.complaint_jurisdiction_resolve_rule_set(c.regulator_id);
  IF rs.id IS NULL THEN
    RAISE EXCEPTION 'No published jurisdiction rule set is effective for this authority' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO a FROM public.complaint_jurisdiction_assessments WHERE complaint_id = _complaint_id;
  IF a.id IS NULL THEN
    INSERT INTO public.complaint_jurisdiction_assessments
      (complaint_id, regulator_id, status, assessment_started_at, assessment_started_by, rule_set_id, rule_set_version)
    VALUES (_complaint_id, c.regulator_id, 'IN_ASSESSMENT', now(), v_uid, rs.id, rs.version)
    RETURNING * INTO a;
  ELSIF a.status = 'DECIDED' THEN
    RAISE EXCEPTION 'This jurisdiction assessment is already decided; reopen it first' USING ERRCODE = '22023';
  ELSE
    UPDATE public.complaint_jurisdiction_assessments
       SET status = 'IN_ASSESSMENT',
           regulator_id = COALESCE(regulator_id, c.regulator_id),
           assessment_started_at = COALESCE(assessment_started_at, now()),
           assessment_started_by = COALESCE(assessment_started_by, v_uid),
           rule_set_id = COALESCE(rule_set_id, rs.id),
           rule_set_version = COALESCE(rule_set_version, rs.version),
           row_version = row_version + 1
     WHERE id = a.id RETURNING * INTO a;
  END IF;

  INSERT INTO public.complaint_jurisdiction_factors
    (assessment_id, complaint_id, factor_code, factor_label, requirement, rule_set_id, rule_set_version)
  SELECT a.id, _complaint_id, f.factor_code, cat.label, f.requirement, a.rule_set_id, a.rule_set_version
  FROM public.complaint_jurisdiction_rule_set_factors f
  JOIN public.complaint_jurisdiction_factor_catalogue cat ON cat.code = f.factor_code
  WHERE f.rule_set_id = a.rule_set_id AND f.requirement <> 'NOT_APPLICABLE'
  ON CONFLICT (assessment_id, factor_code) DO NOTHING;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'complaint.jurisdiction.assessment_started', 'complaint', _complaint_id,
          jsonb_build_object('assessment_id', a.id, 'rule_set_id', a.rule_set_id, 'rule_set_version', a.rule_set_version));

  RETURN jsonb_build_object('assessment_id', a.id, 'status', a.status,
                            'rule_set_version', a.rule_set_version);
END;
$$;
REVOKE ALL ON FUNCTION public.complaint_jurisdiction_start(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complaint_jurisdiction_start(uuid) TO authenticated, service_role;

-- ---------- save factor --------------------------------------------
CREATE OR REPLACE FUNCTION public.complaint_jurisdiction_save_factor(
  _complaint_id uuid, _factor_code text, _result text,
  _rationale text DEFAULT NULL, _evidence_refs jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); a public.complaint_jurisdiction_assessments; v_id uuid;
BEGIN
  PERFORM public.mc02_complaint_guard(_complaint_id, 'assess_jurisdiction');
  SELECT * INTO a FROM public.complaint_jurisdiction_assessments WHERE complaint_id = _complaint_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Start the jurisdiction assessment first' USING ERRCODE = '22023'; END IF;
  IF a.status = 'DECIDED' THEN
    RAISE EXCEPTION 'Decided assessments cannot be edited; reopen it first' USING ERRCODE = '22023';
  END IF;
  IF _result NOT IN ('YES','NO','UNKNOWN','NOT_APPLICABLE','MORE_INFORMATION_REQUIRED') THEN
    RAISE EXCEPTION 'Invalid factor result' USING ERRCODE = '22023';
  END IF;

  UPDATE public.complaint_jurisdiction_factors
     SET result = _result,
         rationale = NULLIF(btrim(coalesce(_rationale,'')), ''),
         evidence_refs = coalesce(_evidence_refs, '[]'::jsonb),
         evaluated_by = v_uid, evaluated_at = now()
   WHERE assessment_id = a.id AND factor_code = _factor_code
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Factor % is not part of this assessment', _factor_code USING ERRCODE = '22023';
  END IF;

  UPDATE public.complaint_jurisdiction_assessments
     SET reviewed_at = now(), row_version = row_version + 1 WHERE id = a.id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'complaint.jurisdiction.factor_recorded', 'complaint', _complaint_id,
          jsonb_build_object('factor_code', _factor_code, 'result', _result));
  RETURN jsonb_build_object('factor_id', v_id, 'result', _result);
END;
$$;
REVOKE ALL ON FUNCTION public.complaint_jurisdiction_save_factor(uuid,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complaint_jurisdiction_save_factor(uuid,text,text,text,jsonb) TO authenticated, service_role;

-- ---------- request information ------------------------------------
CREATE OR REPLACE FUNCTION public.complaint_jurisdiction_request_information(
  _complaint_id uuid, _missing_information text,
  _requested_from text DEFAULT 'COMPLAINANT',
  _factor_codes text[] DEFAULT '{}',
  _due_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); c public.complaints;
        a public.complaint_jurisdiction_assessments; rs public.complaint_jurisdiction_rule_sets;
        v_req uuid; v_due date;
BEGIN
  c := public.mc02_complaint_guard(_complaint_id, 'assess_jurisdiction');
  SELECT * INTO a FROM public.complaint_jurisdiction_assessments WHERE complaint_id = _complaint_id;
  IF a.id IS NULL OR a.status = 'DECIDED' THEN
    RAISE EXCEPTION 'Jurisdiction assessment must be open to request information' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(_missing_information,''))) < 10 THEN
    RAISE EXCEPTION 'Describe the missing information (at least 10 characters)' USING ERRCODE = '22023';
  END IF;

  rs := public.complaint_jurisdiction_resolve_rule_set(c.regulator_id);
  v_due := COALESCE(_due_date,
             (CURRENT_DATE + COALESCE((rs.config #>> '{sla,information_request_days}')::int, 14)));

  INSERT INTO public.complaint_jurisdiction_info_requests
    (complaint_id, assessment_id, requested_from, missing_information, factor_codes, due_date, requested_by)
  VALUES (_complaint_id, a.id, _requested_from, btrim(_missing_information),
          coalesce(_factor_codes,'{}'), v_due, v_uid)
  RETURNING id INTO v_req;

  UPDATE public.complaint_jurisdiction_assessments
     SET status = 'PENDING_INFORMATION', more_information_required = true,
         row_version = row_version + 1
   WHERE id = a.id;

  PERFORM public.notification_enqueue_event(
    'complaint_jurisdiction_more_information_required', 'complaint', _complaint_id,
    jsonb_build_object('complaint_id', _complaint_id, 'complaint_number', c.complaint_number,
                       'due_date', v_due, 'cta_url', '/complaints/' || _complaint_id,
                       'cta_label', 'Open complaint'), v_req::text);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'complaint.jurisdiction.information_requested', 'complaint', _complaint_id,
          jsonb_build_object('request_id', v_req, 'due_date', v_due, 'requested_from', _requested_from));
  RETURN jsonb_build_object('request_id', v_req, 'due_date', v_due);
END;
$$;
REVOKE ALL ON FUNCTION public.complaint_jurisdiction_request_information(uuid,text,text,text[],date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complaint_jurisdiction_request_information(uuid,text,text,text[],date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complaint_jurisdiction_record_information_response(
  _request_id uuid, _response_summary text, _communication_ref uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); r public.complaint_jurisdiction_info_requests;
BEGIN
  SELECT * INTO r FROM public.complaint_jurisdiction_info_requests WHERE id = _request_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Information request not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.mc02_complaint_guard(r.complaint_id, 'assess_jurisdiction');
  IF r.status <> 'OPEN' THEN RAISE EXCEPTION 'This information request is no longer open' USING ERRCODE = '22023'; END IF;
  IF length(btrim(coalesce(_response_summary,''))) < 5 THEN
    RAISE EXCEPTION 'Summarise the information received' USING ERRCODE = '22023';
  END IF;

  UPDATE public.complaint_jurisdiction_info_requests
     SET status = 'RESPONDED', response_summary = btrim(_response_summary),
         response_received_at = now(), resolved_by = v_uid,
         communication_ref = COALESCE(_communication_ref, communication_ref)
   WHERE id = _request_id;

  UPDATE public.complaint_jurisdiction_assessments
     SET status = 'IN_ASSESSMENT',
         more_information_required = EXISTS (
           SELECT 1 FROM public.complaint_jurisdiction_info_requests o
            WHERE o.assessment_id = r.assessment_id AND o.status = 'OPEN' AND o.id <> _request_id),
         row_version = row_version + 1
   WHERE id = r.assessment_id AND status <> 'DECIDED';

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'complaint.jurisdiction.information_received', 'complaint', r.complaint_id,
          jsonb_build_object('request_id', _request_id));
  RETURN jsonb_build_object('request_id', _request_id, 'status', 'RESPONDED');
END;
$$;
REVOKE ALL ON FUNCTION public.complaint_jurisdiction_record_information_response(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complaint_jurisdiction_record_information_response(uuid,text,uuid) TO authenticated, service_role;

-- ---------- decide -------------------------------------------------
CREATE OR REPLACE FUNCTION public.complaint_jurisdiction_decide(
  _complaint_id uuid, _outcome text, _payload jsonb DEFAULT '{}'::jsonb,
  _expected_row_version integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); c public.complaints;
        a public.complaint_jurisdiction_assessments;
        v_unresolved text[]; v_rationale text; v_legal text; v_policy text;
        v_referral uuid; v_event text;
BEGIN
  c := public.mc02_complaint_guard(_complaint_id, 'decide_jurisdiction');
  SELECT * INTO a FROM public.complaint_jurisdiction_assessments WHERE complaint_id = _complaint_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Start the jurisdiction assessment first' USING ERRCODE = '22023'; END IF;
  IF a.status = 'DECIDED' THEN RAISE EXCEPTION 'Jurisdiction has already been decided' USING ERRCODE = '22023'; END IF;
  IF _expected_row_version IS NOT NULL AND _expected_row_version <> a.row_version THEN
    RAISE EXCEPTION 'This assessment was updated by someone else; reload and try again' USING ERRCODE = '40001';
  END IF;
  IF _outcome NOT IN ('ACCEPTED','PARTIALLY_ACCEPTED','REFERRED','OUT_OF_JURISDICTION') THEN
    RAISE EXCEPTION 'Invalid jurisdiction decision. Use the information request operation for missing information.' USING ERRCODE = '22023';
  END IF;

  v_rationale := NULLIF(btrim(coalesce(_payload->>'rationale','')), '');
  v_legal     := NULLIF(btrim(coalesce(_payload->>'legal_basis','')), '');
  v_policy    := NULLIF(btrim(coalesce(_payload->>'policy_basis','')), '');
  IF v_rationale IS NULL OR length(v_rationale) < 10 THEN
    RAISE EXCEPTION 'A rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  IF _outcome IN ('ACCEPTED','PARTIALLY_ACCEPTED') THEN
    SELECT array_agg(f.factor_label ORDER BY f.factor_code) INTO v_unresolved
      FROM public.complaint_jurisdiction_factors f
     WHERE f.assessment_id = a.id AND f.requirement = 'MANDATORY'
       AND f.result IN ('UNKNOWN','MORE_INFORMATION_REQUIRED');
    IF v_unresolved IS NOT NULL THEN
      RAISE EXCEPTION 'Unresolved mandatory jurisdiction factors: %', array_to_string(v_unresolved, '; ')
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF _outcome = 'PARTIALLY_ACCEPTED' THEN
    IF NULLIF(btrim(coalesce(_payload->>'partial_scope_summary','')),'') IS NULL
       OR NULLIF(btrim(coalesce(_payload->>'outside_scope_summary','')),'') IS NULL THEN
      RAISE EXCEPTION 'Describe both the part within our role and the part outside it' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF _outcome = 'OUT_OF_JURISDICTION' AND v_legal IS NULL AND v_policy IS NULL THEN
    RAISE EXCEPTION 'A legal or policy basis is required to place a complaint outside our role' USING ERRCODE = '22023';
  END IF;

  IF _outcome = 'REFERRED' THEN
    IF NOT public.has_complaint_perm(v_uid, 'refer') THEN
      RAISE EXCEPTION 'not_authorized: complaint_management.refer' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(btrim(coalesce(_payload->>'destination_name','')),'') IS NULL
       OR NULLIF(btrim(coalesce(_payload->>'referral_reason','')),'') IS NULL
       OR NULLIF(btrim(coalesce(_payload->>'shareable_information','')),'') IS NULL THEN
      RAISE EXCEPTION 'Referrals need a destination, a reason and what information may be shared' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.complaint_referrals
      (complaint_id, assessment_id, regulator_id, destination_type, destination_name, destination_contact,
       referral_reason, legal_basis, policy_basis, information_sharing_basis, shareable_information,
       status, created_by)
    VALUES (_complaint_id, a.id, c.regulator_id,
            COALESCE(NULLIF(_payload->>'destination_type',''),'OTHER'),
            btrim(_payload->>'destination_name'), NULLIF(_payload->>'destination_contact',''),
            btrim(_payload->>'referral_reason'), v_legal, v_policy,
            NULLIF(_payload->>'information_sharing_basis',''),
            btrim(_payload->>'shareable_information'), 'READY', v_uid)
    RETURNING id INTO v_referral;
  END IF;

  UPDATE public.complaint_jurisdiction_assessments
     SET status = 'DECIDED',
         decision_outcome = _outcome,
         decision_date = now(),
         decision_by = v_uid,
         assessed_by = v_uid,
         assessed_at = now(),
         rationale = v_rationale,
         legal_basis = v_legal,
         policy_basis = v_policy,
         partial_scope_summary = NULLIF(btrim(coalesce(_payload->>'partial_scope_summary','')),''),
         outside_scope_summary = NULLIF(btrim(coalesce(_payload->>'outside_scope_summary','')),''),
         referral_required = (_outcome = 'REFERRED'),
         referred_to = CASE WHEN _outcome = 'REFERRED' THEN btrim(_payload->>'destination_name') ELSE referred_to END,
         more_information_required = false,
         row_version = row_version + 1
   WHERE id = a.id;

  UPDATE public.complaint_jurisdiction_info_requests
     SET status = 'CANCELLED' WHERE assessment_id = a.id AND status = 'OPEN';

  v_event := CASE _outcome
    WHEN 'ACCEPTED' THEN 'complaint_jurisdiction_accepted'
    WHEN 'PARTIALLY_ACCEPTED' THEN 'complaint_jurisdiction_partially_accepted'
    WHEN 'REFERRED' THEN 'complaint_jurisdiction_referred'
    ELSE 'complaint_jurisdiction_out_of_scope' END;
  PERFORM public.notification_enqueue_event(v_event, 'complaint', _complaint_id,
    jsonb_build_object('complaint_id', _complaint_id, 'complaint_number', c.complaint_number,
                       'outcome', _outcome, 'cta_url', '/complaints/' || _complaint_id,
                       'cta_label', 'Open complaint'), _outcome);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'complaint.jurisdiction.decided', 'complaint', _complaint_id,
          jsonb_build_object('outcome', _outcome, 'assessment_id', a.id,
                             'rule_set_id', a.rule_set_id, 'rule_set_version', a.rule_set_version,
                             'referral_id', v_referral));

  RETURN jsonb_build_object('assessment_id', a.id, 'outcome', _outcome, 'referral_id', v_referral);
END;
$$;
REVOKE ALL ON FUNCTION public.complaint_jurisdiction_decide(uuid,text,jsonb,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complaint_jurisdiction_decide(uuid,text,jsonb,integer) TO authenticated, service_role;

-- ---------- reopen -------------------------------------------------
CREATE OR REPLACE FUNCTION public.complaint_jurisdiction_reopen(_complaint_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); a public.complaint_jurisdiction_assessments;
BEGIN
  PERFORM public.mc02_complaint_guard(_complaint_id, 'decide_jurisdiction');
  SELECT * INTO a FROM public.complaint_jurisdiction_assessments WHERE complaint_id = _complaint_id;
  IF a.id IS NULL OR a.status <> 'DECIDED' THEN
    RAISE EXCEPTION 'Only a decided assessment can be reopened' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(_reason,''))) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required to reopen' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'complaint.jurisdiction.reopened', 'complaint', _complaint_id,
          jsonb_build_object('previous_outcome', a.decision_outcome, 'reason', btrim(_reason),
                             'previous_decision_by', a.decision_by, 'previous_decision_date', a.decision_date));

  UPDATE public.complaint_jurisdiction_assessments
     SET status = 'IN_ASSESSMENT', decision_outcome = NULL, decision_date = NULL, decision_by = NULL,
         reopened_at = now(), reopened_by = v_uid, reopen_reason = btrim(_reason),
         row_version = row_version + 1
   WHERE id = a.id;
  RETURN jsonb_build_object('assessment_id', a.id, 'status', 'IN_ASSESSMENT');
END;
$$;
REVOKE ALL ON FUNCTION public.complaint_jurisdiction_reopen(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complaint_jurisdiction_reopen(uuid,text) TO authenticated, service_role;

-- ---------- referral progress --------------------------------------
CREATE OR REPLACE FUNCTION public.complaint_referral_mark_referred(
  _referral_id uuid, _external_reference text DEFAULT NULL, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); r public.complaint_referrals;
BEGIN
  SELECT * INTO r FROM public.complaint_referrals WHERE id = _referral_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Referral not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.mc02_complaint_guard(r.complaint_id, 'refer');
  IF r.status NOT IN ('DRAFT','READY') THEN
    RAISE EXCEPTION 'This referral has already been sent' USING ERRCODE = '22023';
  END IF;
  UPDATE public.complaint_referrals
     SET status = 'REFERRED', referred_by = v_uid, referred_at = now(),
         external_reference = COALESCE(NULLIF(btrim(coalesce(_external_reference,'')),''), external_reference),
         acknowledgement_note = COALESCE(NULLIF(btrim(coalesce(_note,'')),''), acknowledgement_note)
   WHERE id = _referral_id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'complaint.referral.sent', 'complaint', r.complaint_id,
          jsonb_build_object('referral_id', _referral_id, 'destination', r.destination_name));
  RETURN jsonb_build_object('referral_id', _referral_id, 'status', 'REFERRED');
END;
$$;
REVOKE ALL ON FUNCTION public.complaint_referral_mark_referred(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complaint_referral_mark_referred(uuid,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complaint_referral_record_response(
  _referral_id uuid, _status text, _note text DEFAULT NULL, _external_reference text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); r public.complaint_referrals;
BEGIN
  SELECT * INTO r FROM public.complaint_referrals WHERE id = _referral_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Referral not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.mc02_complaint_guard(r.complaint_id, 'refer');
  IF _status NOT IN ('ACKNOWLEDGED','DECLINED','RETURNED','CLOSED') THEN
    RAISE EXCEPTION 'Invalid referral response' USING ERRCODE = '22023';
  END IF;
  IF r.status = 'DRAFT' OR r.status = 'READY' THEN
    RAISE EXCEPTION 'Send the referral before recording a response' USING ERRCODE = '22023';
  END IF;
  UPDATE public.complaint_referrals
     SET status = _status, acknowledged_at = now(),
         acknowledgement_note = NULLIF(btrim(coalesce(_note,'')),''),
         external_reference = COALESCE(NULLIF(btrim(coalesce(_external_reference,'')),''), external_reference)
   WHERE id = _referral_id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'complaint.referral.response_recorded', 'complaint', r.complaint_id,
          jsonb_build_object('referral_id', _referral_id, 'status', _status));
  RETURN jsonb_build_object('referral_id', _referral_id, 'status', _status);
END;
$$;
REVOKE ALL ON FUNCTION public.complaint_referral_record_response(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complaint_referral_record_response(uuid,text,text,text) TO authenticated, service_role;

-- ---------- support / vulnerability staff review --------------------
CREATE OR REPLACE FUNCTION public.complaint_review_support_needs(
  _complaint_id uuid, _decision text, _staff_categories text[] DEFAULT '{}',
  _handling_instruction text DEFAULT NULL, _staff_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_state text; v_required boolean;
BEGIN
  PERFORM public.mc02_complaint_guard(_complaint_id, 'review_vulnerability');
  IF _decision NOT IN ('CONFIRM_SUPPORT_NEED','NOT_REQUIRED','UPDATE_CATEGORY','ADD_HANDLING_INSTRUCTION') THEN
    RAISE EXCEPTION 'Invalid support review decision' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_id FROM public.complaint_vulnerability_assessments WHERE complaint_id = _complaint_id;
  IF v_id IS NULL THEN
    INSERT INTO public.complaint_vulnerability_assessments (complaint_id, source, support_required, categories)
    VALUES (_complaint_id, 'staff_assessed', false, '{}') RETURNING id INTO v_id;
  END IF;

  v_state := CASE WHEN _decision = 'NOT_REQUIRED' THEN 'not_required' ELSE 'reviewed' END;
  v_required := CASE WHEN _decision = 'NOT_REQUIRED' THEN false
                     WHEN _decision = 'CONFIRM_SUPPORT_NEED' THEN true ELSE NULL END;

  -- consumer-declared fields (source, support_required, categories, consumer_notes) are never touched
  UPDATE public.complaint_vulnerability_assessments
     SET staff_review_state = v_state,
         staff_support_required = COALESCE(v_required, staff_support_required),
         staff_categories = CASE WHEN _decision = 'UPDATE_CATEGORY'
                                 THEN coalesce(_staff_categories,'{}') ELSE staff_categories END,
         handling_instruction = COALESCE(NULLIF(btrim(coalesce(_handling_instruction,'')),''), handling_instruction),
         staff_notes = COALESCE(NULLIF(btrim(coalesce(_staff_notes,'')),''), staff_notes),
         reviewed_by = v_uid, reviewed_at = now()
   WHERE id = v_id;

  UPDATE public.complaints
     SET vulnerability_review_state = CASE WHEN _decision = 'NOT_REQUIRED'
                                           THEN 'not_applicable'::complaint_vulnerability_review_state
                                           ELSE 'confirmed'::complaint_vulnerability_review_state END,
         updated_at = now()
   WHERE id = _complaint_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'complaint.support_needs.reviewed', 'complaint', _complaint_id,
          jsonb_build_object('decision', _decision, 'staff_categories', _staff_categories));
  RETURN jsonb_build_object('assessment_id', v_id, 'staff_review_state', v_state);
END;
$$;
REVOKE ALL ON FUNCTION public.complaint_review_support_needs(uuid,text,text[],text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complaint_review_support_needs(uuid,text,text[],text,text) TO authenticated, service_role;

-- ---------- read model ---------------------------------------------
CREATE OR REPLACE FUNCTION public.get_complaint_jurisdiction(_complaint_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); a public.complaint_jurisdiction_assessments;
        rs public.complaint_jurisdiction_rule_sets; c public.complaints; v jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_complaint_perm(v_uid, 'view') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.complaints WHERE id = _complaint_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Complaint not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO a FROM public.complaint_jurisdiction_assessments WHERE complaint_id = _complaint_id;
  rs := public.complaint_jurisdiction_resolve_rule_set(c.regulator_id);

  SELECT jsonb_build_object(
    'complaint', jsonb_build_object('id', c.id, 'complaint_number', c.complaint_number,
        'subject', c.subject, 'status', c.status, 'incident_date', c.incident_date,
        'received_at', c.created_at, 'complainant_name', c.complainant_name,
        'customer_type', c.customer_type, 'product_id', c.product_id, 'channel_id', c.channel_id),
    'assessment', CASE WHEN a.id IS NULL THEN NULL ELSE to_jsonb(a) END,
    'effective_rule_set', CASE WHEN rs.id IS NULL THEN NULL ELSE
        jsonb_build_object('id', rs.id, 'code', rs.code, 'name', rs.name, 'version', rs.version,
                           'effective_from', rs.effective_from, 'config', rs.config) END,
    'factors', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', f.id, 'factor_code', f.factor_code, 'factor_label', f.factor_label,
                 'requirement', f.requirement, 'result', f.result, 'rationale', f.rationale,
                 'evidence_refs', f.evidence_refs, 'evaluated_at', f.evaluated_at,
                 'guidance', cat.help_text, 'sort_order', cat.sort_order)
                 ORDER BY cat.sort_order)
        FROM public.complaint_jurisdiction_factors f
        JOIN public.complaint_jurisdiction_factor_catalogue cat ON cat.code = f.factor_code
        WHERE f.assessment_id = a.id), '[]'::jsonb),
    'information_requests', COALESCE((
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.requested_at DESC)
        FROM public.complaint_jurisdiction_info_requests r WHERE r.complaint_id = _complaint_id), '[]'::jsonb),
    'referrals', COALESCE((
        SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
        FROM public.complaint_referrals x WHERE x.complaint_id = _complaint_id), '[]'::jsonb),
    'respondents', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', rr.id, 'legal_name', rr.legal_name,
                 'trading_name', rr.trading_name, 'match_state', rr.match_state,
                 'is_primary', rr.is_primary, 'licensee_id', rr.licensee_id,
                 'respondent_role', rr.respondent_role, 'country', rr.country)
                 ORDER BY rr.is_primary DESC)
        FROM public.complaint_respondents rr WHERE rr.complaint_id = _complaint_id), '[]'::jsonb),
    'support_needs', (SELECT to_jsonb(v2) FROM public.complaint_vulnerability_assessments v2
                       WHERE v2.complaint_id = _complaint_id LIMIT 1)
  ) INTO v;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.get_complaint_jurisdiction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_complaint_jurisdiction(uuid) TO authenticated, service_role;