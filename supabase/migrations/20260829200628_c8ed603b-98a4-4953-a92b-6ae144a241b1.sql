-- ============================================================================
-- F7-B (part 2) — canonical returns lifecycle: notifications, extensions,
-- RFI, amendments, evidence, deterministic overdue detection.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Shared, fail-safe notification helper for the canonical returns spine.
-- Idempotent per (event, filing, suffix) via notification_enqueue_event.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.returns_notify(
  _event_key text, _filing_id uuid, _payload jsonb DEFAULT '{}'::jsonb, _suffix text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE f record; v_payload jsonb;
BEGIN
  SELECT fi.id, fi.filing_reference, fi.entity_id, fi.status, fi.current_version_number,
         d.name AS definition_name, d.code AS definition_code,
         p.period_label, p.due_date,
         (SELECT l.name FROM public.licensees l WHERE l.id = fi.entity_id) AS entity_name
    INTO f
    FROM public.return_filings fi
    LEFT JOIN public.return_definitions d ON d.id = fi.return_definition_id
    LEFT JOIN public.reporting_periods p ON p.id = fi.reporting_period_id
   WHERE fi.id = _filing_id;
  IF f.id IS NULL THEN RETURN; END IF;

  v_payload := COALESCE(_payload,'{}'::jsonb) || jsonb_build_object(
    'filing_id', f.id,
    'filing_reference', f.filing_reference,
    'entity_id', f.entity_id,
    'entity_name', f.entity_name,
    'return_name', f.definition_name,
    'return_code', f.definition_code,
    'period_label', f.period_label,
    'due_date', f.due_date,
    'status', f.status,
    'version_number', f.current_version_number,
    'route', '/returns/filings/' || f.id::text,
    'module', 'returns_management');

  PERFORM public.notification_enqueue_event(
    _event_key, 'return_filing', f.id, v_payload, _suffix);
END $$;

REVOKE ALL ON FUNCTION public.returns_notify(text, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.returns_notify(text, uuid, jsonb, text) TO service_role;

-- ---------------------------------------------------------------------------
-- GAP-F7-01 — submission emits canonical notifications
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.returns_submit_filing(_version_id uuid, _declaration_accepted boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v record; d record; v_check jsonb; v_version_number int;
BEGIN
  SELECT v2.id, v2.status, v2.return_filing_id, v2.version_number, f.entity_id, f.return_definition_id,
         f.id AS filing_id, f.entity_reporting_obligation_id AS obligation_id
    INTO v FROM public.return_filing_versions v2
    JOIN public.return_filings f ON f.id = v2.return_filing_id
   WHERE v2.id = _version_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Filing version not found'; END IF;
  IF NOT public.returns_can_file_obligation(v.obligation_id) THEN
    RAISE EXCEPTION 'You are not authorised to submit returns for this entity' USING ERRCODE='42501';
  END IF;
  IF v.status NOT IN ('DRAFT','CORRECTION_REQUESTED') THEN
    RAISE EXCEPTION 'This filing version has already been submitted';
  END IF;

  SELECT * INTO d FROM public.return_definitions WHERE id = v.return_definition_id;
  IF d.requires_declaration AND NOT _declaration_accepted THEN
    RAISE EXCEPTION 'The declaration must be accepted before submission';
  END IF;

  PERFORM public.returns_extract_metrics(_version_id);
  PERFORM public.returns_calculate_metrics(_version_id);
  v_check := public.returns_validate_filing(_version_id);
  v_version_number := v.version_number;

  IF NOT (v_check->>'can_submit')::boolean THEN
    PERFORM public.returns_notify('return.validation_failed', v.filing_id,
      jsonb_build_object('version_id', _version_id, 'validation', v_check),
      'v' || v_version_number::text || ':failed:' || (v_check->>'errors'));
    RETURN jsonb_build_object('submitted', false, 'validation', v_check);
  END IF;

  UPDATE public.return_filing_versions
     SET status = 'SUBMITTED', is_immutable = true, submitted_at = now(), submitted_by = auth.uid(),
         declaration_accepted_at = CASE WHEN _declaration_accepted THEN now() END,
         declaration_accepted_by = CASE WHEN _declaration_accepted THEN auth.uid() END
   WHERE id = _version_id;

  UPDATE public.return_filings
     SET status = 'SUBMITTED', submitted_at = COALESCE(submitted_at, now()), updated_at = now()
   WHERE id = v.filing_id;

  UPDATE public.return_filing_requests SET status = 'RESOLVED', updated_at = now()
   WHERE return_filing_id = v.filing_id AND status IN ('OPEN','RESPONDED') AND request_kind = 'CORRECTION';

  PERFORM public.create_audit_log('return_filing', v.filing_id, 'SUBMIT',
    jsonb_build_object('version_id', _version_id, 'validation', v_check));

  -- Canonical lifecycle notifications (idempotent per version).
  PERFORM public.returns_notify('return.validation_passed', v.filing_id,
    jsonb_build_object('version_id', _version_id, 'validation', v_check),
    'v' || v_version_number::text);
  IF v_version_number > 1 THEN
    PERFORM public.returns_notify('return.resubmitted', v.filing_id,
      jsonb_build_object('version_id', _version_id), 'v' || v_version_number::text);
  END IF;
  PERFORM public.returns_notify('return.submitted', v.filing_id,
    jsonb_build_object('version_id', _version_id), 'v' || v_version_number::text);
  PERFORM public.returns_notify('return.submitted.confirmation', v.filing_id,
    jsonb_build_object('version_id', _version_id), 'v' || v_version_number::text);

  RETURN jsonb_build_object('submitted', true, 'validation', v_check);
END $$;

-- ---------------------------------------------------------------------------
-- GAP-F7-01 — review decisions emit canonical notifications
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.returns_review_filing(_version_id uuid, _action text, _reason text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v record; v_new_version uuid;
BEGIN
  IF _action NOT IN ('START_REVIEW','ACCEPT','REJECT','REQUEST_CORRECTION') THEN
    RAISE EXCEPTION 'Unsupported review action';
  END IF;
  IF _action IN ('ACCEPT','REJECT') THEN
    PERFORM public.returns_require('approve');
  ELSE
    PERFORM public.returns_require('review');
  END IF;
  IF _action IN ('REJECT','REQUEST_CORRECTION') AND COALESCE(length(trim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'Please record a reason of at least 10 characters';
  END IF;

  SELECT v2.id, v2.status, v2.return_filing_id, v2.version_number, v2.submitted_by, f.entity_id
    INTO v FROM public.return_filing_versions v2
    JOIN public.return_filings f ON f.id = v2.return_filing_id
   WHERE v2.id = _version_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Filing version not found'; END IF;
  IF v.status NOT IN ('SUBMITTED','UNDER_REVIEW') THEN
    RAISE EXCEPTION 'Only a submitted filing version can be reviewed';
  END IF;

  -- Maker-checker: the person who filed a return can never decide it.
  IF _action IN ('ACCEPT','REJECT','REQUEST_CORRECTION')
     AND v.submitted_by IS NOT NULL AND v.submitted_by = auth.uid() THEN
    RAISE EXCEPTION 'The person who submitted this return cannot decide it' USING ERRCODE='42501';
  END IF;

  IF _action = 'START_REVIEW' THEN
    UPDATE public.return_filing_versions SET status = 'UNDER_REVIEW' WHERE id = _version_id;
    UPDATE public.return_filings SET status = 'UNDER_REVIEW', updated_at = now() WHERE id = v.return_filing_id;
  ELSIF _action = 'ACCEPT' THEN
    UPDATE public.return_filing_versions
       SET status = 'ACCEPTED', accepted_at = now(), accepted_by = auth.uid(), is_immutable = true
     WHERE id = _version_id;
    UPDATE public.return_filings
       SET status = 'ACCEPTED', accepted_at = now(), accepted_version_id = _version_id, updated_at = now()
     WHERE id = v.return_filing_id;
  ELSIF _action = 'REJECT' THEN
    UPDATE public.return_filing_versions
       SET status = 'REJECTED', rejected_at = now(), rejected_by = auth.uid(),
           rejection_reason = _reason, is_immutable = true
     WHERE id = _version_id;
    UPDATE public.return_filings
       SET status = 'REJECTED', rejected_at = now(), updated_at = now()
     WHERE id = v.return_filing_id;
  ELSE
    UPDATE public.return_filing_versions SET status = 'SUPERSEDED', is_immutable = true WHERE id = _version_id;
    INSERT INTO public.return_filing_versions(return_filing_id, version_number, status, supersedes_version_id)
    VALUES (v.return_filing_id, v.version_number + 1, 'DRAFT', _version_id)
    RETURNING id INTO v_new_version;

    INSERT INTO public.return_filing_form_requirements(
      return_filing_version_id, form_template_id, form_version_id, is_required, sequence, tab_name, completion_status)
    SELECT v_new_version, r.form_template_id, r.form_version_id, r.is_required, r.sequence, r.tab_name, 'PENDING'
      FROM public.return_filing_form_requirements r
     WHERE r.return_filing_version_id = _version_id;

    UPDATE public.return_filings
       SET status = 'CORRECTION_REQUESTED', current_version_number = v.version_number + 1, updated_at = now()
     WHERE id = v.return_filing_id;

    INSERT INTO public.return_filing_requests(
      return_filing_id, return_filing_version_id, request_kind, message, status, created_by)
    VALUES (v.return_filing_id, _version_id, 'CORRECTION', _reason, 'OPEN', auth.uid());
  END IF;

  PERFORM public.create_audit_log('return_filing', v.return_filing_id, 'RETURN_REVIEW_' || _action,
    jsonb_build_object('version_id', _version_id, 'reason', _reason));

  IF _action = 'ACCEPT' THEN
    PERFORM public.returns_notify('return.approved', v.return_filing_id,
      jsonb_build_object('version_id', _version_id), 'v' || v.version_number::text);
  ELSIF _action = 'REJECT' THEN
    PERFORM public.returns_notify('return.rejected', v.return_filing_id,
      jsonb_build_object('version_id', _version_id, 'reason', _reason), 'v' || v.version_number::text);
  ELSIF _action = 'REQUEST_CORRECTION' THEN
    PERFORM public.returns_notify('return.resubmission_requested', v.return_filing_id,
      jsonb_build_object('version_id', _version_id, 'new_version_id', v_new_version, 'reason', _reason),
      'v' || v.version_number::text);
  ELSE
    PERFORM public.returns_notify('return.workflow_action_taken', v.return_filing_id,
      jsonb_build_object('version_id', _version_id, 'action', _action), 'v' || v.version_number::text || ':review');
  END IF;

  RETURN jsonb_build_object('action', _action, 'new_version_id', v_new_version);
END $$;

-- ---------------------------------------------------------------------------
-- GAP-F7-10 — governed RFI on a canonical filing
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.returns_raise_rfi(
  _version_id uuid, _message text, _form_template_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v record; v_id uuid;
BEGIN
  PERFORM public.returns_require('review');
  IF COALESCE(length(trim(_message)),0) < 10 THEN
    RAISE EXCEPTION 'Please record a request of at least 10 characters';
  END IF;
  SELECT v2.id, v2.return_filing_id, v2.status, v2.version_number
    INTO v FROM public.return_filing_versions v2 WHERE v2.id = _version_id;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Filing version not found'; END IF;
  IF v.status NOT IN ('SUBMITTED','UNDER_REVIEW','ACCEPTED') THEN
    RAISE EXCEPTION 'Information can only be requested on a submitted return';
  END IF;

  INSERT INTO public.return_filing_requests(
    return_filing_id, return_filing_version_id, request_kind, form_template_id,
    message, status, created_by)
  VALUES (v.return_filing_id, _version_id, 'RFI', _form_template_id, trim(_message), 'OPEN', auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.create_audit_log('return_filing', v.return_filing_id, 'RETURN_RFI_RAISED',
    jsonb_build_object('request_id', v_id, 'version_id', _version_id));
  PERFORM public.returns_notify('return.rfi_raised', v.return_filing_id,
    jsonb_build_object('request_id', v_id, 'version_id', _version_id, 'message', trim(_message)),
    v_id::text);
  RETURN v_id;
END $$;

-- ---------------------------------------------------------------------------
-- GAP-F7-09 — governed amendment of a closed filing
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.returns_request_amendment(_filing_id uuid, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE f record; v_id uuid;
BEGIN
  IF COALESCE(length(trim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'Please record a reason of at least 10 characters';
  END IF;
  SELECT fi.id, fi.status, fi.entity_id, fi.entity_reporting_obligation_id AS obligation_id,
         fi.accepted_version_id, fi.current_version_number
    INTO f FROM public.return_filings fi WHERE fi.id = _filing_id;
  IF f.id IS NULL THEN RAISE EXCEPTION 'Filing not found'; END IF;
  IF NOT public.returns_can_file_obligation(f.obligation_id) THEN
    RAISE EXCEPTION 'You are not authorised to request an amendment for this entity' USING ERRCODE='42501';
  END IF;
  IF f.status NOT IN ('ACCEPTED','REJECTED') THEN
    RAISE EXCEPTION 'Only a completed return can be amended; correct the open version instead';
  END IF;
  IF EXISTS (SELECT 1 FROM public.return_filing_requests
              WHERE return_filing_id = _filing_id AND request_kind = 'AMENDMENT' AND status = 'OPEN') THEN
    RAISE EXCEPTION 'An amendment request is already open for this return';
  END IF;

  INSERT INTO public.return_filing_requests(
    return_filing_id, return_filing_version_id, request_kind, message, status, created_by)
  VALUES (_filing_id, f.accepted_version_id, 'AMENDMENT', trim(_reason), 'OPEN', auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.create_audit_log('return_filing', _filing_id, 'RETURN_AMENDMENT_REQUESTED',
    jsonb_build_object('request_id', v_id, 'reason', trim(_reason)));
  PERFORM public.returns_notify('return.edit_requested', _filing_id,
    jsonb_build_object('request_id', v_id, 'reason', trim(_reason), 'kind', 'AMENDMENT'), v_id::text);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.returns_decide_amendment(
  _request_id uuid, _decision text, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE q record; v_prev record; v_new_version uuid; v_next int;
BEGIN
  PERFORM public.returns_require('approve');
  IF _decision NOT IN ('APPROVE','REFUSE') THEN RAISE EXCEPTION 'Unsupported amendment decision'; END IF;
  IF COALESCE(length(trim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'Please record a decision reason of at least 10 characters';
  END IF;

  SELECT q2.*, f.entity_id, f.current_version_number
    INTO q FROM public.return_filing_requests q2
    JOIN public.return_filings f ON f.id = q2.return_filing_id
   WHERE q2.id = _request_id AND q2.request_kind = 'AMENDMENT' FOR UPDATE;
  IF q.id IS NULL THEN RAISE EXCEPTION 'Amendment request not found'; END IF;
  IF q.status <> 'OPEN' THEN RAISE EXCEPTION 'This amendment request has already been decided'; END IF;
  IF q.created_by IS NOT NULL AND q.created_by = auth.uid() THEN
    RAISE EXCEPTION 'The requester cannot decide their own amendment request' USING ERRCODE='42501';
  END IF;

  IF _decision = 'REFUSE' THEN
    UPDATE public.return_filing_requests
       SET status = 'CANCELLED', response_text = trim(_reason), responded_at = now(),
           responded_by = auth.uid(), updated_at = now()
     WHERE id = _request_id;
    PERFORM public.create_audit_log('return_filing', q.return_filing_id, 'RETURN_AMENDMENT_REFUSED',
      jsonb_build_object('request_id', _request_id, 'reason', trim(_reason)));
    PERFORM public.returns_notify('return.workflow_action_taken', q.return_filing_id,
      jsonb_build_object('request_id', _request_id, 'action', 'AMENDMENT_REFUSED', 'reason', trim(_reason)),
      _request_id::text || ':refused');
    RETURN jsonb_build_object('decision','REFUSE','new_version_id', NULL);
  END IF;

  SELECT * INTO v_prev FROM public.return_filing_versions
   WHERE return_filing_id = q.return_filing_id ORDER BY version_number DESC LIMIT 1;

  v_next := COALESCE(v_prev.version_number, 0) + 1;
  INSERT INTO public.return_filing_versions(
    return_filing_id, version_number, status, supersedes_version_id)
  VALUES (q.return_filing_id, v_next, 'DRAFT', v_prev.id)
  RETURNING id INTO v_new_version;

  INSERT INTO public.return_filing_form_requirements(
    return_filing_version_id, form_template_id, form_version_id, is_required, sequence, tab_name, completion_status)
  SELECT v_new_version, r.form_template_id, r.form_version_id, r.is_required, r.sequence, r.tab_name, 'PENDING'
    FROM public.return_filing_form_requirements r
   WHERE r.return_filing_version_id = v_prev.id;

  UPDATE public.return_filings
     SET status = 'CORRECTION_REQUESTED', current_version_number = v_next, updated_at = now()
   WHERE id = q.return_filing_id;

  UPDATE public.return_filing_requests
     SET status = 'RESOLVED', response_text = trim(_reason), responded_at = now(),
         responded_by = auth.uid(), updated_at = now()
   WHERE id = _request_id;

  PERFORM public.create_audit_log('return_filing', q.return_filing_id, 'RETURN_AMENDMENT_APPROVED',
    jsonb_build_object('request_id', _request_id, 'new_version_id', v_new_version, 'reason', trim(_reason)));
  PERFORM public.returns_notify('return.resubmission_requested', q.return_filing_id,
    jsonb_build_object('request_id', _request_id, 'new_version_id', v_new_version, 'kind', 'AMENDMENT'),
    _request_id::text || ':approved');

  RETURN jsonb_build_object('decision','APPROVE','new_version_id', v_new_version);
END $$;

-- ---------------------------------------------------------------------------
-- GAP-F7-04 — governed filing extensions (maker-checker)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.returns_request_extension(
  _period_id uuid, _requested_due_date date, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p record; o record; v_filing uuid; v_id uuid;
BEGIN
  IF COALESCE(length(trim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'Please record a reason of at least 10 characters';
  END IF;
  SELECT * INTO p FROM public.reporting_periods WHERE id = _period_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Reporting period not found'; END IF;
  SELECT * INTO o FROM public.entity_reporting_obligations WHERE id = p.entity_reporting_obligation_id;
  IF NOT public.returns_can_file_obligation(o.id) THEN
    RAISE EXCEPTION 'You are not authorised to request an extension for this entity' USING ERRCODE='42501';
  END IF;
  IF p.status IN ('CLOSED','WAIVED') THEN
    RAISE EXCEPTION 'This reporting period is closed';
  END IF;
  IF p.due_date IS NULL THEN RAISE EXCEPTION 'This period has no filing deadline to extend'; END IF;
  IF _requested_due_date IS NULL OR _requested_due_date <= p.due_date THEN
    RAISE EXCEPTION 'The requested date must be later than the current deadline';
  END IF;

  SELECT id INTO v_filing FROM public.return_filings WHERE reporting_period_id = _period_id;
  IF v_filing IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.return_filings WHERE id = v_filing AND status = 'ACCEPTED') THEN
    RAISE EXCEPTION 'This return has already been accepted';
  END IF;

  INSERT INTO public.return_filing_extensions(
    entity_id, reporting_period_id, entity_reporting_obligation_id, return_filing_id,
    original_due_date, requested_due_date, reason, status, requested_by)
  VALUES (o.entity_id, _period_id, o.id, v_filing, p.due_date, _requested_due_date,
          trim(_reason), 'REQUESTED', auth.uid())
  RETURNING id INTO v_id;

  IF v_filing IS NOT NULL THEN
    INSERT INTO public.return_filing_requests(
      return_filing_id, request_kind, message, status, created_by)
    VALUES (v_filing, 'EXTENSION', trim(_reason), 'OPEN', auth.uid());
    PERFORM public.returns_notify('return.edit_requested', v_filing,
      jsonb_build_object('extension_id', v_id, 'requested_due_date', _requested_due_date, 'kind', 'EXTENSION'),
      v_id::text);
  END IF;

  PERFORM public.create_audit_log('return_filing_extension', v_id, 'REQUESTED',
    jsonb_build_object('period_id', _period_id, 'entity_id', o.entity_id,
                       'original_due_date', p.due_date, 'requested_due_date', _requested_due_date));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.returns_decide_extension(
  _extension_id uuid, _decision text, _reason text, _granted_due_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e record; v_granted date;
BEGIN
  PERFORM public.returns_require('approve');
  IF _decision NOT IN ('GRANT','REFUSE') THEN RAISE EXCEPTION 'Unsupported extension decision'; END IF;
  IF COALESCE(length(trim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'Please record a decision reason of at least 10 characters';
  END IF;

  SELECT * INTO e FROM public.return_filing_extensions WHERE id = _extension_id FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Extension request not found'; END IF;
  IF e.status <> 'REQUESTED' THEN RAISE EXCEPTION 'This extension request has already been decided'; END IF;
  IF e.requested_by IS NOT NULL AND e.requested_by = auth.uid() THEN
    RAISE EXCEPTION 'The requester cannot decide their own extension request' USING ERRCODE='42501';
  END IF;

  IF _decision = 'REFUSE' THEN
    UPDATE public.return_filing_extensions
       SET status = 'REFUSED', decision_reason = trim(_reason), decided_by = auth.uid(), decided_at = now()
     WHERE id = _extension_id;
    PERFORM public.create_audit_log('return_filing_extension', _extension_id, 'REFUSED',
      jsonb_build_object('reason', trim(_reason)));
    IF e.return_filing_id IS NOT NULL THEN
      PERFORM public.returns_notify('return.workflow_action_taken', e.return_filing_id,
        jsonb_build_object('extension_id', _extension_id, 'action', 'EXTENSION_REFUSED', 'reason', trim(_reason)),
        _extension_id::text || ':refused');
    END IF;
    RETURN jsonb_build_object('decision','REFUSE');
  END IF;

  v_granted := COALESCE(_granted_due_date, e.requested_due_date);
  IF v_granted <= e.original_due_date THEN
    RAISE EXCEPTION 'A granted deadline must be later than the original deadline';
  END IF;

  UPDATE public.return_filing_extensions
     SET status = 'GRANTED', granted_due_date = v_granted, decision_reason = trim(_reason),
         decided_by = auth.uid(), decided_at = now()
   WHERE id = _extension_id;

  UPDATE public.reporting_periods SET due_date = v_granted WHERE id = e.reporting_period_id;

  PERFORM public.create_audit_log('return_filing_extension', _extension_id, 'GRANTED',
    jsonb_build_object('original_due_date', e.original_due_date, 'granted_due_date', v_granted,
                       'reason', trim(_reason), 'period_id', e.reporting_period_id));
  IF e.return_filing_id IS NOT NULL THEN
    PERFORM public.returns_notify('return.workflow_action_taken', e.return_filing_id,
      jsonb_build_object('extension_id', _extension_id, 'action', 'EXTENSION_GRANTED',
                         'granted_due_date', v_granted),
      _extension_id::text || ':granted');
  END IF;
  RETURN jsonb_build_object('decision','GRANT','granted_due_date', v_granted);
END $$;

-- ---------------------------------------------------------------------------
-- GAP-F7-06 — deterministic overdue detection off the canonical calendar
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.returns_overdue_sweep(_as_of date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_as_of date := COALESCE(_as_of, (now() AT TIME ZONE 'UTC')::date);
        v_inserted int := 0; r record;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    PERFORM public.returns_require('workflow_action');
  ELSIF current_user NOT IN ('service_role','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'Not authorised to run the overdue sweep' USING ERRCODE='42501';
  END IF;

  FOR r IN
    SELECT p.id AS period_id, p.due_date, p.entity_reporting_obligation_id AS obligation_id,
           o.entity_id, o.return_definition_id, f.id AS filing_id, f.status AS filing_status
      FROM public.reporting_periods p
      JOIN public.entity_reporting_obligations o ON o.id = p.entity_reporting_obligation_id
      LEFT JOIN public.return_filings f ON f.reporting_period_id = p.id
     WHERE p.status IN ('OPEN','SCHEDULED')
       AND p.due_date IS NOT NULL
       AND p.due_date < v_as_of
       AND COALESCE(f.status,'NONE') NOT IN ('SUBMITTED','UNDER_REVIEW','ACCEPTED','WITHDRAWN')
       -- a granted extension moves the deadline, so it can never be late twice
       AND NOT EXISTS (SELECT 1 FROM public.return_filing_extensions x
                        WHERE x.reporting_period_id = p.id AND x.status = 'REQUESTED')
  LOOP
    INSERT INTO public.return_overdue_events(
      reporting_period_id, entity_reporting_obligation_id, entity_id, return_definition_id,
      return_filing_id, effective_due_date, as_of_date, days_late, filing_status)
    VALUES (r.period_id, r.obligation_id, r.entity_id, r.return_definition_id, r.filing_id,
            r.due_date, v_as_of, (v_as_of - r.due_date), COALESCE(r.filing_status,'NOT_STARTED'))
    ON CONFLICT (reporting_period_id, as_of_date) DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
      IF r.filing_id IS NOT NULL THEN
        PERFORM public.returns_notify('return.overdue', r.filing_id,
          jsonb_build_object('days_late', (v_as_of - r.due_date), 'as_of', v_as_of,
                             'effective_due_date', r.due_date),
          v_as_of::text);
      ELSE
        PERFORM public.notification_enqueue_event('return.overdue', 'reporting_period', r.period_id,
          jsonb_build_object('entity_id', r.entity_id, 'period_id', r.period_id,
                             'effective_due_date', r.due_date, 'days_late', (v_as_of - r.due_date),
                             'module','returns_management','route','/entity/returns'),
          v_as_of::text);
      END IF;
    END IF;
  END LOOP;

  PERFORM public.create_audit_log('return_overdue_sweep', gen_random_uuid(), 'RUN',
    jsonb_build_object('as_of', v_as_of, 'recorded', v_inserted));
  RETURN jsonb_build_object('as_of', v_as_of, 'recorded', v_inserted);
END $$;

-- ---------------------------------------------------------------------------
-- GAP-F7-08 — governed evidence bound to a filing version
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.returns_attach_evidence(
  _version_id uuid, _document_name text, _storage_path text,
  _file_type text DEFAULT NULL, _file_size bigint DEFAULT NULL, _description text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v record; v_id uuid; v_internal boolean;
BEGIN
  IF COALESCE(length(trim(_document_name)),0) = 0 OR COALESCE(length(trim(_storage_path)),0) = 0 THEN
    RAISE EXCEPTION 'A document name and stored file are required';
  END IF;
  SELECT v2.id, v2.status, v2.return_filing_id, f.entity_id,
         f.entity_reporting_obligation_id AS obligation_id
    INTO v FROM public.return_filing_versions v2
    JOIN public.return_filings f ON f.id = v2.return_filing_id
   WHERE v2.id = _version_id;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Filing version not found'; END IF;

  v_internal := public.is_super_admin(auth.uid())
             OR public.has_permission(auth.uid(),'returns_management','upload_documents');

  IF NOT v_internal THEN
    IF NOT public.returns_can_file_obligation(v.obligation_id) THEN
      RAISE EXCEPTION 'You are not authorised to attach evidence to this return' USING ERRCODE='42501';
    END IF;
    IF v.status NOT IN ('DRAFT','CORRECTION_REQUESTED') THEN
      RAISE EXCEPTION 'Evidence can only be added while the return is open for filing';
    END IF;
  END IF;

  INSERT INTO public.return_filing_evidence(
    return_filing_id, return_filing_version_id, entity_id, document_name, storage_path,
    file_type, file_size, description, uploaded_by)
  VALUES (v.return_filing_id, _version_id, v.entity_id, trim(_document_name), trim(_storage_path),
          _file_type, _file_size, _description, auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.create_audit_log('return_filing', v.return_filing_id, 'RETURN_EVIDENCE_ATTACHED',
    jsonb_build_object('evidence_id', v_id, 'version_id', _version_id, 'document_name', trim(_document_name)));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.returns_withdraw_evidence(_evidence_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e record; v_status text; v_internal boolean;
BEGIN
  IF COALESCE(length(trim(_reason)),0) < 5 THEN
    RAISE EXCEPTION 'Please record why this document is being withdrawn';
  END IF;
  SELECT ev.*, v2.status AS version_status, f.entity_reporting_obligation_id AS obligation_id
    INTO e FROM public.return_filing_evidence ev
    JOIN public.return_filing_versions v2 ON v2.id = ev.return_filing_version_id
    JOIN public.return_filings f ON f.id = ev.return_filing_id
   WHERE ev.id = _evidence_id;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF e.withdrawn_at IS NOT NULL THEN RAISE EXCEPTION 'This document has already been withdrawn'; END IF;

  v_internal := public.is_super_admin(auth.uid())
             OR public.has_permission(auth.uid(),'returns_management','upload_documents');
  IF NOT v_internal THEN
    IF NOT public.returns_can_file_obligation(e.obligation_id) THEN
      RAISE EXCEPTION 'You are not authorised to withdraw this document' USING ERRCODE='42501';
    END IF;
    IF e.version_status NOT IN ('DRAFT','CORRECTION_REQUESTED') THEN
      RAISE EXCEPTION 'Submitted evidence is durable regulatory record and cannot be withdrawn';
    END IF;
  END IF;

  UPDATE public.return_filing_evidence
     SET withdrawn_at = now(), withdrawn_by = auth.uid(), withdrawn_reason = trim(_reason)
   WHERE id = _evidence_id;

  PERFORM public.create_audit_log('return_filing', e.return_filing_id, 'RETURN_EVIDENCE_WITHDRAWN',
    jsonb_build_object('evidence_id', _evidence_id, 'reason', trim(_reason)));
END $$;

-- ---------------------------------------------------------------------------
-- Privileges: browsers reach these only through the guarded RPCs above.
-- ---------------------------------------------------------------------------
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.returns_raise_rfi(uuid,text,uuid)',
    'public.returns_request_amendment(uuid,text)',
    'public.returns_decide_amendment(uuid,text,text)',
    'public.returns_request_extension(uuid,date,text)',
    'public.returns_decide_extension(uuid,text,text,date)',
    'public.returns_attach_evidence(uuid,text,text,text,bigint,text)',
    'public.returns_withdraw_evidence(uuid,text)',
    'public.returns_overdue_sweep(date)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- GAP-F7-12 — retire the legacy `compliance_returns` scope namespace.
DELETE FROM public.rbac_module_scopes WHERE module = 'compliance_returns';