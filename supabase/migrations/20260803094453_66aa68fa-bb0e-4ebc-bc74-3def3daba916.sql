-- =====================================================================
-- Notifications Phase 2: wire every active event to a real business
-- transaction boundary. All emission happens server-side; the browser
-- never raises a regulatory notification.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notif_enqueue(
  _event_key text,
  _entity_type text,
  _entity_id uuid,
  _reference text,
  _route text,
  _payload jsonb DEFAULT '{}'::jsonb,
  _suffix text DEFAULT NULL,
  _reminder_window text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  v_payload := coalesce(_payload, '{}'::jsonb)
    || jsonb_build_object(
         'source_entity_type', _entity_type,
         'source_entity_id', _entity_id,
         'source_reference', _reference,
         'source_route', _route,
         'actor_id', auth.uid()
       );
  RETURN public.notification_enqueue_event(
    _event_key, _entity_type, _entity_id, v_payload, _suffix, gen_random_uuid(), _reminder_window
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notif_enqueue(text, text, uuid, text, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------- applications: AI override
CREATE OR REPLACE FUNCTION public.trg_notify_application_ai_overridden()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ref text;
BEGIN
  IF NEW.routing_decision IS DISTINCT FROM OLD.routing_decision
     AND NEW.routing_decision_by IS NOT NULL THEN
    SELECT application_number INTO v_ref FROM public.applications WHERE id = NEW.application_id;
    PERFORM public.notif_enqueue(
      'application.ai_overridden', 'application', NEW.application_id, v_ref,
      '/applications/' || NEW.application_id,
      jsonb_build_object(
        'application_number', v_ref,
        'routing_decision', NEW.routing_decision,
        'reason', coalesce(NEW.routing_decision_reason, NEW.analyst_justification, '')
      ),
      NEW.routing_decision
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_application_ai_overridden ON public.application_ai_assessments;
CREATE TRIGGER notify_application_ai_overridden
AFTER UPDATE ON public.application_ai_assessments
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_application_ai_overridden();

-- ------------------------------------------------------- applications: RFIs
CREATE OR REPLACE FUNCTION public.trg_notify_application_rfi_raised()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ref text;
BEGIN
  SELECT application_number INTO v_ref FROM public.applications WHERE id = NEW.application_id;
  PERFORM public.notif_enqueue(
    'application.rfi_raised', 'application', NEW.application_id, v_ref,
    '/applications/' || NEW.application_id,
    jsonb_build_object(
      'application_number', v_ref,
      'rfi_id', NEW.id,
      'summary', coalesce(NEW.summary, ''),
      'due_at', NEW.due_at
    ),
    NEW.id::text
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_application_rfi_raised ON public.application_rfis;
CREATE TRIGGER notify_application_rfi_raised
AFTER INSERT ON public.application_rfis
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_application_rfi_raised();

CREATE OR REPLACE FUNCTION public.trg_notify_application_rfi_responded()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_app uuid; v_ref text; v_rfi uuid;
BEGIN
  SELECT r.application_id, r.id INTO v_app, v_rfi
  FROM public.application_rfi_items i
  JOIN public.application_rfis r ON r.id = i.rfi_id
  WHERE i.id = NEW.rfi_item_id;
  IF v_app IS NULL THEN RETURN NEW; END IF;
  SELECT application_number INTO v_ref FROM public.applications WHERE id = v_app;
  PERFORM public.notif_enqueue(
    'application.rfi_responded', 'application', v_app, v_ref,
    '/applications/' || v_app,
    jsonb_build_object('application_number', v_ref, 'rfi_id', v_rfi, 'response_id', NEW.id),
    NEW.id::text
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_application_rfi_responded ON public.application_rfi_responses;
CREATE TRIGGER notify_application_rfi_responded
AFTER INSERT ON public.application_rfi_responses
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_application_rfi_responded();

-- --------------------------------------------------- market conduct actions
CREATE OR REPLACE FUNCTION public.trg_notify_conduct_action()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event text; v_route text := '/conduct/actions';
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'conduct_action_created';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event := CASE lower(NEW.status)
      WHEN 'completed' THEN 'conduct_action_completed'
      WHEN 'waived' THEN 'conduct_action_waived'
      WHEN 'cancelled' THEN 'conduct_action_cancelled'
      WHEN 'canceled' THEN 'conduct_action_cancelled'
      ELSE NULL END;
  END IF;
  IF v_event IS NULL THEN RETURN NEW; END IF;
  PERFORM public.notif_enqueue(
    v_event, 'conduct_action', NEW.id, NEW.title, v_route,
    jsonb_build_object(
      'action_title', NEW.title,
      'action_type', NEW.action_type,
      'entity_id', NEW.entity_id,
      'due_date', NEW.due_date,
      'assigned_to', NEW.assigned_to,
      'status', NEW.status,
      'reason', coalesce(NEW.waiver_reason, NEW.cancellation_reason, NEW.completion_notes, '')
    ),
    coalesce(NEW.status, TG_OP)
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_conduct_action ON public.conduct_actions;
CREATE TRIGGER notify_conduct_action
AFTER INSERT OR UPDATE ON public.conduct_actions
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_conduct_action();

CREATE OR REPLACE FUNCTION public.trg_notify_conduct_alert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event text;
BEGIN
  IF NEW.acknowledged_at IS NOT NULL AND OLD.acknowledged_at IS NULL THEN
    v_event := 'conduct_alert_acknowledged';
  ELSIF NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL THEN
    v_event := 'conduct_alert_closed';
  END IF;
  IF v_event IS NULL THEN RETURN NEW; END IF;
  PERFORM public.notif_enqueue(
    v_event, 'conduct_alert', NEW.id, NEW.title, '/conduct/alerts',
    jsonb_build_object(
      'alert_title', NEW.title, 'severity', NEW.severity, 'kind', NEW.kind,
      'licensee_id', NEW.licensee_id, 'closure_reason', coalesce(NEW.closure_reason, '')
    ),
    v_event
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_conduct_alert ON public.conduct_alerts;
CREATE TRIGGER notify_conduct_alert
AFTER UPDATE ON public.conduct_alerts
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_conduct_alert();

CREATE OR REPLACE FUNCTION public.trg_notify_conduct_evidence_uploaded()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notif_enqueue(
    'conduct_evidence_uploaded', 'conduct_evidence', NEW.id, NEW.title, '/conduct/investigations',
    jsonb_build_object(
      'evidence_title', NEW.title, 'evidence_type', NEW.evidence_type,
      'restricted', coalesce(NEW.restricted, false), 'investigation_id', NEW.investigation_id,
      'complaint_id', NEW.complaint_id
    ),
    'uploaded'
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_conduct_evidence_uploaded ON public.conduct_evidence;
CREATE TRIGGER notify_conduct_evidence_uploaded
AFTER INSERT ON public.conduct_evidence
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_conduct_evidence_uploaded();

CREATE OR REPLACE FUNCTION public.trg_notify_conduct_evidence_denied()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(coalesce(NEW.action, '')) NOT IN ('restrict', 'denied', 'access_denied') THEN
    RETURN NEW;
  END IF;
  PERFORM public.notif_enqueue(
    'conduct_evidence_access_denied', 'conduct_evidence', NEW.evidence_id,
    NEW.evidence_id::text, '/conduct/investigations',
    jsonb_build_object('actor_id', NEW.actor_id, 'reason', coalesce(NEW.reason, '')),
    NEW.id::text
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_conduct_evidence_denied ON public.conduct_evidence_access_log;
CREATE TRIGGER notify_conduct_evidence_denied
AFTER INSERT ON public.conduct_evidence_access_log
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_conduct_evidence_denied();

CREATE OR REPLACE FUNCTION public.trg_notify_conduct_investigation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'conduct_investigation_opened';
  ELSIF NEW.assigned_investigator IS DISTINCT FROM OLD.assigned_investigator
        AND NEW.assigned_investigator IS NOT NULL THEN
    v_event := 'conduct_investigation_assigned';
  ELSIF NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL THEN
    v_event := 'conduct_investigation_closed';
  END IF;
  IF v_event IS NULL THEN RETURN NEW; END IF;
  PERFORM public.notif_enqueue(
    v_event, 'conduct_investigation', NEW.id, NEW.code, '/conduct/investigations/' || NEW.id,
    jsonb_build_object(
      'investigation_code', NEW.code, 'allegation', coalesce(NEW.allegation, ''),
      'priority', NEW.priority, 'severity', NEW.severity,
      'assigned_investigator', NEW.assigned_investigator,
      'outcome', coalesce(NEW.outcome, ''), 'due_date', NEW.due_date
    ),
    v_event || ':' || coalesce(NEW.assigned_investigator::text, '-')
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_conduct_investigation ON public.conduct_investigations;
CREATE TRIGGER notify_conduct_investigation
AFTER INSERT OR UPDATE ON public.conduct_investigations
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_conduct_investigation();

-- ------------------------------------------------------------ correspondence
CREATE OR REPLACE FUNCTION public.trg_notify_correspondence_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event text; v_ref text; v_thread uuid := NEW.thread_id;
BEGIN
  IF coalesce(NEW.is_draft, false) THEN RETURN NEW; END IF;
  IF coalesce(NEW.is_internal_note, false) THEN
    v_event := 'correspondence.internal_message_posted';
  ELSIF lower(coalesce(NEW.direction, '')) = 'inbound' THEN
    v_event := 'correspondence.reply_received';
  ELSE
    v_event := 'correspondence.response_sent';
  END IF;
  SELECT reference INTO v_ref FROM public.correspondence_threads WHERE id = v_thread;
  PERFORM public.notif_enqueue(
    v_event, 'correspondence_thread', v_thread, v_ref, '/correspondence/' || v_thread,
    jsonb_build_object(
      'thread_reference', v_ref,
      'subject', coalesce(NEW.subject, ''),
      'message_id', NEW.id,
      'direction', NEW.direction,
      'author_name', coalesce(NEW.author_name, 'System')
    ),
    NEW.id::text
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_correspondence_message ON public.correspondence_messages;
CREATE TRIGGER notify_correspondence_message
AFTER INSERT ON public.correspondence_messages
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_correspondence_message();

-- ------------------------------------------------------------ form versions
CREATE OR REPLACE FUNCTION public.trg_notify_form_version_published()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  IF lower(coalesce(NEW.status, '')) <> 'published'
     OR lower(coalesce(OLD.status, '')) = 'published' THEN
    RETURN NEW;
  END IF;
  SELECT name INTO v_name FROM public.form_templates WHERE id = NEW.template_id;
  PERFORM public.notif_enqueue(
    'form_version.published', 'form_version', NEW.id,
    coalesce(v_name, '') || ' v' || NEW.version,
    '/admin/forms/' || NEW.template_id,
    jsonb_build_object(
      'form_name', coalesce(v_name, ''), 'version', NEW.version,
      'semantic_version', coalesce(NEW.semantic_version, ''),
      'effective_from', NEW.effective_from,
      'change_notes', coalesce(NEW.change_notes, '')
    ),
    'published'
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_form_version_published ON public.form_versions;
CREATE TRIGGER notify_form_version_published
AFTER UPDATE ON public.form_versions
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_form_version_published();

-- ------------------------------------------------------------ fit and proper
CREATE OR REPLACE FUNCTION public.trg_notify_fp_appeal_decided()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.decision IS NULL OR NEW.decision IS NOT DISTINCT FROM OLD.decision THEN RETURN NEW; END IF;
  PERFORM public.notif_enqueue(
    'fp_appeal_decided', 'fp_appeal', NEW.id, NEW.id::text, '/fpa/appeals',
    jsonb_build_object(
      'decision', NEW.decision, 'rationale', coalesce(NEW.decision_rationale, ''),
      'individual_id', NEW.individual_id, 'decided_at', NEW.decided_at
    ),
    NEW.decision
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_fp_appeal_decided ON public.fp_appeals;
CREATE TRIGGER notify_fp_appeal_decided
AFTER UPDATE ON public.fp_appeals
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_fp_appeal_decided();

CREATE OR REPLACE FUNCTION public.trg_notify_fp_finding()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event text;
BEGIN
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL THEN
    v_event := 'fp_finding_assigned';
  ELSIF NEW.resolved_at IS NOT NULL AND OLD.resolved_at IS NULL THEN
    v_event := 'fp_finding_resolved';
  END IF;
  IF v_event IS NULL THEN RETURN NEW; END IF;
  PERFORM public.notif_enqueue(
    v_event, 'fp_finding', NEW.id, coalesce(NEW.title, NEW.id::text), '/fpa/findings',
    jsonb_build_object(
      'finding_title', coalesce(NEW.title, ''), 'severity', NEW.severity,
      'check_type', NEW.check_type, 'individual_id', NEW.individual_id,
      'assigned_to', NEW.assigned_to,
      'resolution_status', coalesce(NEW.resolution_status, ''),
      'resolution_reason', coalesce(NEW.resolution_reason, '')
    ),
    v_event || ':' || coalesce(NEW.assigned_to::text, '-')
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_fp_finding ON public.fp_findings;
CREATE TRIGGER notify_fp_finding
AFTER UPDATE ON public.fp_findings
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_fp_finding();

-- --------------------------------------------------------- licence renewals
CREATE OR REPLACE FUNCTION public.trg_notify_license_renewal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event text; v_num text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'license.renewal_requested';
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND lower(NEW.status) IN ('approved', 'completed') THEN
    v_event := 'license.renewal_approved';
  END IF;
  IF v_event IS NULL THEN RETURN NEW; END IF;
  SELECT license_number INTO v_num FROM public.licenses WHERE id = NEW.license_id;
  PERFORM public.notif_enqueue(
    v_event, 'license', NEW.license_id, v_num, '/licenses/' || NEW.license_id,
    jsonb_build_object(
      'license_number', coalesce(v_num, ''), 'renewal_id', NEW.id,
      'status', NEW.status, 'new_valid_until', NEW.new_valid_until,
      'previous_valid_until', NEW.previous_valid_until
    ),
    v_event
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_license_renewal ON public.license_renewals;
CREATE TRIGGER notify_license_renewal
AFTER INSERT OR UPDATE ON public.license_renewals
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_license_renewal();

-- ---------------------------------------------------------- licence appeals
CREATE OR REPLACE FUNCTION public.trg_notify_license_appeal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'license_appeal.filed';
  ELSIF NEW.acknowledged_at IS NOT NULL AND OLD.acknowledged_at IS NULL THEN
    v_event := 'license_appeal.acknowledged';
  ELSIF NEW.panel_id IS DISTINCT FROM OLD.panel_id AND NEW.panel_id IS NOT NULL THEN
    v_event := 'license_appeal.panel_assigned';
  ELSIF NEW.decision IS NOT NULL AND NEW.decision IS DISTINCT FROM OLD.decision THEN
    v_event := 'license_appeal.decided';
  END IF;
  IF v_event IS NULL THEN RETURN NEW; END IF;
  PERFORM public.notif_enqueue(
    v_event, 'license_appeal', NEW.id, NEW.appeal_reference, '/admin/appeals/' || NEW.id,
    jsonb_build_object(
      'appeal_reference', NEW.appeal_reference, 'status', NEW.status,
      'grounds', coalesce(NEW.grounds, ''), 'decision', coalesce(NEW.decision, ''),
      'decision_rationale', coalesce(NEW.decision_rationale, ''),
      'application_id', NEW.application_id, 'filed_by', NEW.filed_by,
      'hearing_date', NEW.hearing_date
    ),
    v_event
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_license_appeal ON public.license_appeals;
CREATE TRIGGER notify_license_appeal
AFTER INSERT OR UPDATE ON public.license_appeals
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_license_appeal();

-- ------------------------------------------------------------------ payments
CREATE OR REPLACE FUNCTION public.trg_notify_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event text; v_ref text;
BEGIN
  IF TG_OP = 'INSERT' AND lower(coalesce(NEW.status, '')) IN ('pending', 'unpaid', 'due') THEN
    v_event := 'payment.required';
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
        AND lower(NEW.status) IN ('paid', 'completed', 'success', 'verified') THEN
    v_event := 'payment.received';
  END IF;
  IF v_event IS NULL THEN RETURN NEW; END IF;
  SELECT application_number INTO v_ref FROM public.applications WHERE id = NEW.application_id;
  PERFORM public.notif_enqueue(
    v_event, 'payment', NEW.id, coalesce(NEW.receipt_number, NEW.transaction_ref, v_ref),
    CASE WHEN NEW.application_id IS NULL THEN '/payments' ELSE '/applications/' || NEW.application_id END,
    jsonb_build_object(
      'application_number', coalesce(v_ref, ''), 'amount', NEW.amount,
      'currency', coalesce(NEW.currency, 'JMD'), 'status', NEW.status,
      'receipt_number', coalesce(NEW.receipt_number, ''),
      'transaction_ref', coalesce(NEW.transaction_ref, ''),
      'payer_user_id', NEW.user_id
    ),
    v_event
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_payment ON public.payments;
CREATE TRIGGER notify_payment
AFTER INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_payment();

-- ------------------------------------------------------ prudential actions
CREATE OR REPLACE FUNCTION public.trg_notify_prudential_action()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL THEN
    v_event := 'prudential_action_assigned';
  ELSIF TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
        AND NEW.assigned_to IS NOT NULL THEN
    v_event := 'prudential_action_assigned';
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
        AND lower(NEW.status) IN ('completed', 'closed') THEN
    v_event := 'prudential_action_completed';
  END IF;
  IF v_event IS NULL THEN RETURN NEW; END IF;
  PERFORM public.notif_enqueue(
    v_event, 'prudential_action', NEW.id, NEW.title, '/prudential/actions',
    jsonb_build_object(
      'action_title', NEW.title, 'action_type', NEW.action_type,
      'entity_id', NEW.entity_id, 'severity', NEW.severity,
      'due_date', NEW.due_date, 'assigned_to', NEW.assigned_to,
      'status', NEW.status, 'completion_notes', coalesce(NEW.completion_notes, '')
    ),
    v_event || ':' || coalesce(NEW.assigned_to::text, '-')
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_prudential_action ON public.prudential_actions;
CREATE TRIGGER notify_prudential_action
AFTER INSERT OR UPDATE ON public.prudential_actions
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_prudential_action();

CREATE OR REPLACE FUNCTION public.trg_notify_prudential_assessment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event text;
BEGIN
  IF NEW.submitted_at IS NOT NULL AND OLD.submitted_at IS NULL THEN
    v_event := 'prudential_assessment_submitted';
  ELSIF NEW.reviewed_at IS NOT NULL AND OLD.reviewed_at IS NULL THEN
    v_event := 'prudential_assessment_reviewed';
  ELSIF NEW.approved_at IS NOT NULL AND OLD.approved_at IS NULL THEN
    v_event := 'prudential_assessment_approved';
  END IF;
  IF v_event IS NULL THEN RETURN NEW; END IF;
  PERFORM public.notif_enqueue(
    v_event, 'prudential_assessment', NEW.id, NEW.id::text,
    '/prudential/assessments/' || NEW.id,
    jsonb_build_object(
      'entity_id', NEW.entity_id, 'overall_rating', coalesce(NEW.overall_rating::text, ''),
      'period_start', NEW.period_start, 'period_end', NEW.period_end,
      'status', NEW.status, 'conclusion', coalesce(NEW.conclusion, ''),
      'review_notes', coalesce(NEW.review_notes, '')
    ),
    v_event
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_prudential_assessment ON public.prudential_assessments;
CREATE TRIGGER notify_prudential_assessment
AFTER UPDATE ON public.prudential_assessments
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_prudential_assessment();

CREATE OR REPLACE FUNCTION public.trg_notify_prudential_escalation_resolved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     OR lower(coalesce(NEW.status, '')) NOT IN ('resolved', 'closed') THEN
    RETURN NEW;
  END IF;
  PERFORM public.notif_enqueue(
    'prudential_escalation_resolved', 'prudential_escalation', NEW.id, NEW.id::text,
    '/prudential/escalations',
    jsonb_build_object(
      'entity_id', NEW.entity_id, 'escalation_type', NEW.escalation_type,
      'decision', coalesce(NEW.decision, ''), 'outcome', coalesce(NEW.outcome, ''),
      'reason', coalesce(NEW.reason, '')
    ),
    'resolved'
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_prudential_escalation_resolved ON public.prudential_escalations;
CREATE TRIGGER notify_prudential_escalation_resolved
AFTER UPDATE ON public.prudential_escalations
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_prudential_escalation_resolved();

-- --------------------------------------------------------------- registration
CREATE OR REPLACE FUNCTION public.trg_notify_registration_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_route text; v_payload jsonb;
BEGIN
  v_route := '/admin/registrations/' || NEW.id;
  v_payload := jsonb_build_object(
    'registration_reference', coalesce(NEW.registration_reference, NEW.id::text),
    'applicant_name', coalesce(NEW.applicant_name, ''),
    'status', NEW.status,
    'email', coalesce(NEW.email, ''),
    'review_notes', coalesce(NEW.review_notes, '')
  );

  IF TG_OP = 'INSERT' THEN
    IF lower(coalesce(NEW.status, '')) = 'draft' THEN RETURN NEW; END IF;
    PERFORM public.notif_enqueue('registration.new_submission', 'registration', NEW.id,
      NEW.registration_reference, v_route, v_payload, 'new');
    PERFORM public.notif_enqueue('registration.workflow_started', 'registration', NEW.id,
      NEW.registration_reference, v_route, v_payload, 'started');
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  CASE lower(coalesce(NEW.status, ''))
    WHEN 'pending_review' THEN
      PERFORM public.notif_enqueue('registration.pending_review', 'registration', NEW.id,
        NEW.registration_reference, v_route, v_payload, 'pending_review');
    WHEN 'pending_verification' THEN
      PERFORM public.notif_enqueue('registration.pending_review', 'registration', NEW.id,
        NEW.registration_reference, v_route, v_payload, 'pending_verification');
    WHEN 'rejected' THEN
      PERFORM public.notif_enqueue('registration.rejected', 'registration', NEW.id,
        NEW.registration_reference, v_route, v_payload, 'rejected');
    WHEN 'correction_required' THEN
      PERFORM public.notif_enqueue('registration.correction_required', 'registration', NEW.id,
        NEW.registration_reference, v_route, v_payload, 'correction');
    WHEN 'changes_requested' THEN
      PERFORM public.notif_enqueue('registration.correction_required', 'registration', NEW.id,
        NEW.registration_reference, v_route, v_payload, 'changes');
    WHEN 'resubmitted' THEN
      PERFORM public.notif_enqueue('registration.resubmitted', 'registration', NEW.id,
        NEW.registration_reference, v_route, v_payload, 'resubmitted');
    WHEN 'approved' THEN
      PERFORM public.notif_enqueue('registration.workflow_completed', 'registration', NEW.id,
        NEW.registration_reference, v_route, v_payload, 'approved');
    ELSE
      NULL;
  END CASE;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_registration_state ON public.registrations;
CREATE TRIGGER notify_registration_state
AFTER INSERT OR UPDATE ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_registration_state();

CREATE OR REPLACE FUNCTION public.trg_notify_registration_step()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ref text;
BEGIN
  IF coalesce(NEW.entity_type, '') <> 'registration' OR NEW.entity_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT registration_reference INTO v_ref FROM public.registrations WHERE id = NEW.entity_id;

  PERFORM public.notif_enqueue(
    'registration.step_entered', 'registration', NEW.entity_id, v_ref,
    '/admin/registrations/' || NEW.entity_id,
    jsonb_build_object(
      'registration_reference', coalesce(v_ref, ''), 'step_id', NEW.step_id,
      'action', NEW.action, 'actor_id', NEW.actor_id
    ),
    'entered:' || NEW.id::text
  );

  IF NEW.delegated_to IS NOT NULL THEN
    PERFORM public.notif_enqueue(
      'registration.step_assigned', 'registration', NEW.entity_id, v_ref,
      '/admin/registrations/' || NEW.entity_id,
      jsonb_build_object(
        'registration_reference', coalesce(v_ref, ''), 'step_id', NEW.step_id,
        'assigned_user_id', NEW.delegated_to
      ),
      'assigned:' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_registration_step ON public.approval_actions;
CREATE TRIGGER notify_registration_step
AFTER INSERT ON public.approval_actions
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_registration_step();

-- ------------------------------------------------------- SLA configuration
CREATE OR REPLACE FUNCTION public.trg_notify_sla_configuration_updated()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notif_enqueue(
    'sla.configuration_updated', 'sla_configuration', NEW.id,
    NEW.process_type || ' / ' || coalesce(NEW.stage_name, ''),
    '/admin/sla-configuration',
    jsonb_build_object(
      'process_type', NEW.process_type, 'stage_name', coalesce(NEW.stage_name, ''),
      'sla_duration', NEW.sla_duration, 'sla_unit', NEW.sla_unit,
      'warning_threshold_pct', NEW.warning_threshold_pct, 'active', NEW.active
    ),
    to_char(now(), 'YYYYMMDDHH24MI')
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_sla_configuration_updated ON public.sla_configurations;
CREATE TRIGGER notify_sla_configuration_updated
AFTER INSERT OR UPDATE ON public.sla_configurations
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_sla_configuration_updated();

-- ------------------------------------------------------------ user invited
CREATE OR REPLACE FUNCTION public.trg_notify_user_invited()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(NEW.force_password_change, false) THEN RETURN NEW; END IF;
  PERFORM public.notif_enqueue(
    'user.invited', 'profile', NEW.id, coalesce(NEW.email, NEW.full_name), '/profile',
    jsonb_build_object(
      'user_id', NEW.id, 'full_name', coalesce(NEW.full_name, ''),
      'email', coalesce(NEW.email, ''), 'user_type', coalesce(NEW.user_type::text, ''),
      'entity_name', coalesce(NEW.entity_name, '')
    ),
    'invited'
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_user_invited ON public.profiles;
CREATE TRIGGER notify_user_invited
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_user_invited();

-- =====================================================================
-- Time-based sweeps (legitimately scheduled: no owning user transaction)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_upcoming_form_versions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    SELECT v.id, v.template_id, v.version, v.effective_from, t.name
    FROM public.form_versions v
    LEFT JOIN public.form_templates t ON t.id = v.template_id
    WHERE v.effective_from IS NOT NULL
      AND v.effective_from > now()
      AND v.effective_from <= now() + interval '7 days'
      AND coalesce(v.notified_for_upcoming, false) = false
  LOOP
    PERFORM public.notif_enqueue(
      'form_version.upcoming', 'form_version', r.id,
      coalesce(r.name, '') || ' v' || r.version,
      '/admin/forms/' || r.template_id,
      jsonb_build_object('form_name', coalesce(r.name, ''), 'version', r.version,
                         'effective_from', r.effective_from),
      'upcoming', to_char(r.effective_from, 'YYYY-MM-DD')
    );
    UPDATE public.form_versions SET notified_for_upcoming = true WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_overdue_prudential_actions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    SELECT id, title, entity_id, due_date, assigned_to, severity
    FROM public.prudential_actions
    WHERE due_date IS NOT NULL AND due_date < current_date
      AND lower(coalesce(status, '')) NOT IN ('completed', 'closed', 'waived', 'cancelled')
  LOOP
    PERFORM public.notif_enqueue(
      'prudential_action_overdue', 'prudential_action', r.id, r.title, '/prudential/actions',
      jsonb_build_object('action_title', r.title, 'entity_id', r.entity_id,
                         'due_date', r.due_date, 'assigned_to', r.assigned_to,
                         'severity', r.severity,
                         'days_overdue', (current_date - r.due_date)),
      'overdue', to_char(current_date, 'YYYY-MM-DD')
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_application_rfi_deadlines()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n integer := 0; v_ref text;
BEGIN
  FOR r IN
    SELECT id, application_id, due_at, summary
    FROM public.application_rfis
    WHERE due_at IS NOT NULL
      AND lower(coalesce(status, '')) NOT IN ('closed', 'resolved', 'withdrawn')
  LOOP
    SELECT application_number INTO v_ref FROM public.applications WHERE id = r.application_id;
    IF r.due_at < now() THEN
      PERFORM public.notif_enqueue(
        'application.rfi_overdue', 'application', r.application_id, v_ref,
        '/applications/' || r.application_id,
        jsonb_build_object('application_number', coalesce(v_ref, ''), 'rfi_id', r.id,
                           'due_at', r.due_at, 'summary', coalesce(r.summary, '')),
        'overdue:' || r.id::text, to_char(current_date, 'YYYY-MM-DD')
      );
      UPDATE public.application_rfis SET overdue_notified_at = now() WHERE id = r.id;
      n := n + 1;
    ELSIF r.due_at <= now() + interval '2 days' THEN
      PERFORM public.notif_enqueue(
        'application.rfi_near_due', 'application', r.application_id, v_ref,
        '/applications/' || r.application_id,
        jsonb_build_object('application_number', coalesce(v_ref, ''), 'rfi_id', r.id,
                           'due_at', r.due_at, 'summary', coalesce(r.summary, '')),
        'near_due:' || r.id::text, to_char(current_date, 'YYYY-MM-DD')
      );
      UPDATE public.application_rfis SET near_due_notified_at = now() WHERE id = r.id;
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_upcoming_form_versions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_overdue_prudential_actions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_application_rfi_deadlines() FROM PUBLIC, anon, authenticated;