-- =====================================================================
-- Phase 2: wire every remaining configured notification event to a real
-- business transaction. All enqueues go through notification_enqueue_event
-- (existing queue + dispatcher). No new notification system is introduced.
-- =====================================================================

-- ---------------------------------------------------------------- Applications
CREATE OR REPLACE FUNCTION public.trg_application_notification_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payload jsonb;
  v_new_legal boolean; v_old_legal boolean;
  v_new_terminal boolean; v_old_terminal boolean;
BEGIN
  v_payload := jsonb_build_object(
    'application_id', NEW.id,
    'application_number', NEW.application_number,
    'applicant_id', NEW.applicant_id,
    'licensee_id', NEW.data->>'licensee_id',
    'status', NEW.status,
    'cta_url', '/applications/' || NEW.id,
    'cta_label', 'Open application'
  );

  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    IF public.has_role(NEW.assigned_to, 'licensing_officer'::app_role) THEN
      PERFORM public.notification_enqueue_event('application.officer_assigned', 'application', NEW.id,
        v_payload || jsonb_build_object('assignee_id', NEW.assigned_to), NEW.assigned_to::text);
    ELSE
      PERFORM public.notification_enqueue_event('application.analyst_assigned', 'application', NEW.id,
        v_payload || jsonb_build_object('assignee_id', NEW.assigned_to), NEW.assigned_to::text);
    END IF;
  END IF;

  IF NEW.current_step_id IS DISTINCT FROM OLD.current_step_id THEN
    SELECT coalesce(is_legal_compliance_stage,false), coalesce(is_terminal,false)
      INTO v_new_legal, v_new_terminal FROM public.approval_steps WHERE id = NEW.current_step_id;
    SELECT coalesce(is_legal_compliance_stage,false), coalesce(is_terminal,false)
      INTO v_old_legal, v_old_terminal FROM public.approval_steps WHERE id = OLD.current_step_id;

    IF coalesce(v_new_legal,false) THEN
      PERFORM public.notification_enqueue_event('application.routed_to_legal', 'application', NEW.id,
        v_payload, NEW.current_step_id::text);
    END IF;
    IF coalesce(v_old_legal,false) AND NOT coalesce(v_new_legal,false) THEN
      PERFORM public.notification_enqueue_event('application.legal_review_completed', 'application', NEW.id,
        v_payload, OLD.current_step_id::text);
    END IF;
    IF coalesce(v_new_terminal,false) AND NOT coalesce(v_old_terminal,false) THEN
      PERFORM public.notification_enqueue_event('application.decision_ready', 'application', NEW.id,
        v_payload, NEW.current_step_id::text);
    END IF;
  END IF;

  IF (NEW.approved_at IS NOT NULL AND OLD.approved_at IS NULL)
     OR (NEW.rejected_at IS NOT NULL AND OLD.rejected_at IS NULL) THEN
    PERFORM public.notification_enqueue_event('application.decision_dispatched', 'application', NEW.id,
      v_payload || jsonb_build_object('decision',
        CASE WHEN NEW.approved_at IS NOT NULL THEN 'approved' ELSE 'rejected' END),
      coalesce(NEW.approved_at, NEW.rejected_at)::text);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_application_notification_events ON public.applications;
CREATE TRIGGER trg_application_notification_events
AFTER UPDATE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.trg_application_notification_events();

CREATE OR REPLACE FUNCTION public.trg_approval_action_escalation_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.applications%ROWTYPE;
BEGIN
  IF NEW.application_id IS NULL THEN RETURN NEW; END IF;
  IF coalesce(NEW.action,'') NOT ILIKE '%escalat%' THEN RETURN NEW; END IF;
  SELECT * INTO a FROM public.applications WHERE id = NEW.application_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  PERFORM public.notification_enqueue_event('application.escalated_to_supervisor', 'application', a.id,
    jsonb_build_object('application_id', a.id, 'application_number', a.application_number,
      'applicant_id', a.applicant_id, 'licensee_id', a.data->>'licensee_id',
      'actor_id', NEW.actor_id, 'comments', NEW.comments,
      'cta_url', '/applications/' || a.id, 'cta_label', 'Open application'),
    NEW.id::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_approval_action_escalation_notification ON public.approval_actions;
CREATE TRIGGER trg_approval_action_escalation_notification
AFTER INSERT ON public.approval_actions
FOR EACH ROW EXECUTE FUNCTION public.trg_approval_action_escalation_notification();

-- ---------------------------------------------------------------- Complaints
CREATE OR REPLACE FUNCTION public.trg_complaint_correspondence_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.complaints%ROWTYPE;
BEGIN
  IF NEW.direction <> 'outbound' THEN RETURN NEW; END IF;
  SELECT * INTO c FROM public.complaints WHERE id = NEW.complaint_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  PERFORM public.notification_enqueue_event('complaint.complainant_update', 'complaint', c.id,
    jsonb_build_object('complaint_id', c.id, 'complaint_number', c.complaint_number,
      'complainant_id', c.complainant_id, 'complainant_email', c.email,
      'licensee_id', c.licensee_id, 'subject', NEW.subject,
      'cta_url', '/complaints/' || c.id, 'cta_label', 'Open complaint'),
    NEW.id::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_complaint_correspondence_notification ON public.complaint_correspondence;
CREATE TRIGGER trg_complaint_correspondence_notification
AFTER INSERT ON public.complaint_correspondence
FOR EACH ROW EXECUTE FUNCTION public.trg_complaint_correspondence_notification();

CREATE OR REPLACE FUNCTION public.notify_overdue_complaint_investigations()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    SELECT t.id AS task_id, t.title, t.due_date, c.id AS complaint_id, c.complaint_number,
           c.investigator_id, c.licensee_id
    FROM public.complaint_investigation_tasks t
    JOIN public.complaints c ON c.id = t.complaint_id
    WHERE t.due_date < current_date
      AND coalesce(t.status,'open') NOT IN ('completed','cancelled','closed')
      AND coalesce(c.status,'') NOT IN ('closed','resolved')
  LOOP
    PERFORM public.notification_enqueue_event('complaint.investigation_overdue', 'complaint', r.complaint_id,
      jsonb_build_object('complaint_id', r.complaint_id, 'complaint_number', r.complaint_number,
        'investigator_id', r.investigator_id, 'licensee_id', r.licensee_id,
        'task_title', r.title, 'due_date', r.due_date,
        'cta_url', '/complaints/' || r.complaint_id, 'cta_label', 'Open complaint'),
      r.task_id::text, NULL, current_date::text);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Conduct-facing complaint events (separate from the existing complaint trigger).
CREATE OR REPLACE FUNCTION public.trg_conduct_complaint_notification_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_payload jsonb;
BEGIN
  v_payload := jsonb_build_object(
    'complaint_id', NEW.id, 'complaint_number', NEW.complaint_number,
    'licensee_id', NEW.licensee_id, 'entity_id', NEW.licensee_id,
    'severity', NEW.severity, 'priority', NEW.priority,
    'assigned_to', NEW.investigator_id, 'record_assignee_id', NEW.investigator_id,
    'subject', NEW.subject,
    'cta_url', '/complaints/' || NEW.id, 'cta_label', 'Open complaint');

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notification_enqueue_event('conduct_complaint_created', 'complaint', NEW.id, v_payload);
    IF coalesce(NEW.severity,'') IN ('high','critical') THEN
      PERFORM public.notification_enqueue_event('conduct_high_severity_complaint', 'complaint', NEW.id, v_payload);
    END IF;
  ELSE
    IF NEW.triage_evaluated_at IS NOT NULL AND OLD.triage_evaluated_at IS DISTINCT FROM NEW.triage_evaluated_at THEN
      PERFORM public.notification_enqueue_event('conduct_complaint_triaged', 'complaint', NEW.id, v_payload,
        NEW.triage_evaluated_at::text);
    END IF;
    IF NEW.severity IS DISTINCT FROM OLD.severity AND coalesce(NEW.severity,'') IN ('high','critical') THEN
      PERFORM public.notification_enqueue_event('conduct_high_severity_complaint', 'complaint', NEW.id, v_payload,
        NEW.severity);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_conduct_complaint_notification_ins ON public.complaints;
CREATE TRIGGER trg_conduct_complaint_notification_ins
AFTER INSERT ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.trg_conduct_complaint_notification_events();

DROP TRIGGER IF EXISTS trg_conduct_complaint_notification_upd ON public.complaints;
CREATE TRIGGER trg_conduct_complaint_notification_upd
AFTER UPDATE ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.trg_conduct_complaint_notification_events();

-- The system has no complaint information-request transaction; do not leave
-- these active with no possible trigger.
UPDATE public.notification_event_configs
SET is_active = false,
    description = coalesce(description,'') ||
      ' [deactivated: no complaint information-request transaction exists in the approved scope]'
WHERE event_key IN ('complaint.rfi_raised','complaint.rfi_responded');

-- ---------------------------------------------------------------- Returns / compliance
CREATE OR REPLACE FUNCTION public.trg_return_notification_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_payload jsonb;
BEGIN
  IF NEW.workflow_status IS NOT DISTINCT FROM OLD.workflow_status THEN RETURN NEW; END IF;

  v_payload := jsonb_build_object(
    'return_id', NEW.id, 'unique_id', NEW.unique_id,
    'entity_id', NEW.entity_id,
    'licensee_id', coalesce(NEW.on_behalf_of_licensee_id, NEW.entity_id),
    'sector_id', NEW.sector_id, 'subsector_id', NEW.subsector_id,
    'return_period', NEW.return_period, 'return_year', NEW.return_year,
    'due_date', NEW.due_date, 'period_end', NEW.period_end_date,
    'workflow_status', NEW.workflow_status,
    'cta_url', '/returns/' || NEW.id, 'cta_label', 'Open return');

  IF NEW.workflow_status = 'SUB' THEN
    PERFORM public.notification_enqueue_event('compliance.return_submitted', 'return', NEW.id, v_payload, 'SUB');
  ELSIF NEW.workflow_status = 'VAL' THEN
    PERFORM public.notification_enqueue_event('compliance.return_reviewed', 'return', NEW.id, v_payload, 'VAL');
  ELSIF NEW.workflow_status IN ('REJ','TBR') THEN
    PERFORM public.notification_enqueue_event('compliance.return_rejected_or_changes_requested', 'return', NEW.id,
      v_payload, NEW.workflow_status::text);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_return_notification_events ON public.returns_filed;
CREATE TRIGGER trg_return_notification_events
AFTER UPDATE ON public.returns_filed
FOR EACH ROW EXECUTE FUNCTION public.trg_return_notification_events();

CREATE OR REPLACE FUNCTION public.notify_returns_due()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.returns_filed
    WHERE due_date IS NOT NULL
      AND due_date BETWEEN current_date AND (current_date + 7)
      AND workflow_status IN ('TEMP','WIP','TBR')
  LOOP
    PERFORM public.notification_enqueue_event('compliance.return_due', 'return', r.id,
      jsonb_build_object('return_id', r.id, 'unique_id', r.unique_id,
        'entity_id', r.entity_id, 'licensee_id', coalesce(r.on_behalf_of_licensee_id, r.entity_id),
        'sector_id', r.sector_id, 'subsector_id', r.subsector_id,
        'due_date', r.due_date, 'return_period', r.return_period,
        'days_remaining', (r.due_date - current_date),
        'cta_url', '/returns/' || r.id, 'cta_label', 'Open return'),
      NULL, NULL, current_date::text);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.trg_return_comment_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rf public.returns_filed%ROWTYPE;
BEGIN
  SELECT * INTO rf FROM public.returns_filed WHERE id = NEW.return_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  PERFORM public.notification_enqueue_event('regulator.comment_added_or_query_raised', 'return', rf.id,
    jsonb_build_object('return_id', rf.id, 'unique_id', rf.unique_id,
      'entity_id', rf.entity_id, 'licensee_id', coalesce(rf.on_behalf_of_licensee_id, rf.entity_id),
      'sector_id', rf.sector_id, 'comment_text', NEW.comment_text, 'tab_name', NEW.tab_name,
      'cta_url', '/returns/' || rf.id, 'cta_label', 'Open return'),
    NEW.id::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_return_comment_notification ON public.return_comments;
CREATE TRIGGER trg_return_comment_notification
AFTER INSERT ON public.return_comments
FOR EACH ROW EXECUTE FUNCTION public.trg_return_comment_notification();

CREATE OR REPLACE FUNCTION public.trg_return_request_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rf public.returns_filed%ROWTYPE;
BEGIN
  SELECT * INTO rf FROM public.returns_filed WHERE id = NEW.return_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  PERFORM public.notification_enqueue_event('return.rfi_raised', 'return', rf.id,
    jsonb_build_object('return_id', rf.id, 'unique_id', rf.unique_id,
      'entity_id', rf.entity_id, 'licensee_id', coalesce(rf.on_behalf_of_licensee_id, rf.entity_id),
      'sector_id', rf.sector_id, 'reasons', NEW.reasons,
      'cta_url', '/returns/' || rf.id, 'cta_label', 'Open return'),
    NEW.id::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_return_request_notification ON public.return_requests;
CREATE TRIGGER trg_return_request_notification
AFTER INSERT ON public.return_requests
FOR EACH ROW EXECUTE FUNCTION public.trg_return_request_notification();

-- ---------------------------------------------------------------- Prudential
CREATE OR REPLACE FUNCTION public.trg_return_threshold_breach_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rf public.returns_filed%ROWTYPE; v_payload jsonb; v_group integer;
BEGIN
  SELECT * INTO rf FROM public.returns_filed WHERE id = NEW.return_id;
  v_payload := jsonb_build_object(
    'breach_id', NEW.id, 'return_id', NEW.return_id, 'metric_key', NEW.metric_key,
    'level', NEW.level, 'value', NEW.value, 'threshold_value', NEW.threshold_value,
    'risk_level', NEW.risk_level,
    'entity_id', rf.entity_id, 'licensee_id', coalesce(rf.on_behalf_of_licensee_id, rf.entity_id),
    'sector_id', rf.sector_id,
    'cta_url', '/returns/' || NEW.return_id, 'cta_label', 'Open return');

  PERFORM public.notification_enqueue_event('prudential_breach_detected', 'return', NEW.return_id,
    v_payload, NEW.id::text);

  IF coalesce(NEW.risk_level,'') IN ('medium','low') OR coalesce(NEW.level,'') = 'warning' THEN
    PERFORM public.notification_enqueue_event('prudential.early_warning_triggered', 'return', NEW.return_id,
      v_payload, NEW.id::text);
  END IF;

  SELECT count(*) INTO v_group FROM public.entity_relationships
   WHERE entity_id = rf.entity_id AND coalesce(status,'active') = 'active';
  IF coalesce(v_group,0) > 0 THEN
    PERFORM public.notification_enqueue_event('prudential.group_contagion_alert', 'return', NEW.return_id,
      v_payload || jsonb_build_object('related_entity_count', v_group), NEW.id::text);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_return_threshold_breach_notification ON public.return_threshold_breaches;
CREATE TRIGGER trg_return_threshold_breach_notification
AFTER INSERT ON public.return_threshold_breaches
FOR EACH ROW EXECUTE FUNCTION public.trg_return_threshold_breach_notification();

CREATE OR REPLACE FUNCTION public.trg_return_validation_failure_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rf public.returns_filed%ROWTYPE;
BEGIN
  IF coalesce(NEW.passed, true) THEN RETURN NEW; END IF;
  IF coalesce(NEW.severity,'') NOT IN ('error','critical','blocker') THEN RETURN NEW; END IF;
  SELECT * INTO rf FROM public.returns_filed WHERE id = NEW.return_id;
  PERFORM public.notification_enqueue_event('prudential_return_validation_failed', 'return', NEW.return_id,
    jsonb_build_object('return_id', NEW.return_id, 'unique_id', rf.unique_id,
      'entity_id', rf.entity_id, 'licensee_id', coalesce(rf.on_behalf_of_licensee_id, rf.entity_id),
      'sector_id', rf.sector_id, 'rule_name', NEW.rule_name, 'severity', NEW.severity,
      'message', NEW.message, 'batch_id', NEW.batch_id,
      'cta_url', '/returns/' || NEW.return_id, 'cta_label', 'Open return'),
    coalesce(NEW.batch_id::text, NEW.id::text));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_return_validation_failure_notification ON public.return_validation_run_log;
CREATE TRIGGER trg_return_validation_failure_notification
AFTER INSERT ON public.return_validation_run_log
FOR EACH ROW EXECUTE FUNCTION public.trg_return_validation_failure_notification();

CREATE OR REPLACE FUNCTION public.notify_prudential_remediation_due()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.prudential_actions
    WHERE due_date IS NOT NULL
      AND due_date <= (current_date + 3)
      AND coalesce(status,'open') NOT IN ('completed','cancelled','waived','closed')
  LOOP
    PERFORM public.notification_enqueue_event('prudential.remediation_due', 'prudential_action', r.id,
      jsonb_build_object('action_id', r.id, 'entity_id', r.entity_id, 'licensee_id', r.entity_id,
        'owner_id', r.assigned_to, 'title', r.title, 'due_date', r.due_date, 'severity', r.severity,
        'cta_url', '/prudential/actions/' || r.id, 'cta_label', 'Open action'),
      NULL, NULL, current_date::text);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- ---------------------------------------------------------------- Fit & Proper
CREATE OR REPLACE FUNCTION public.trg_fp_invitation_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ind public.fp_individuals%ROWTYPE; v_licensee uuid; v_payload jsonb;
BEGIN
  SELECT * INTO ind FROM public.fp_individuals WHERE id = NEW.individual_id;
  SELECT licensee_id INTO v_licensee FROM public.fp_assessments WHERE id = NEW.assessment_id;
  v_payload := jsonb_build_object(
    'invitation_id', NEW.id, 'assessment_id', NEW.assessment_id, 'individual_id', NEW.individual_id,
    'individual_user_id', ind.user_id, 'individual_email', coalesce(NEW.recipient_email, ind.email),
    'individual_name', ind.full_name, 'licensee_id', v_licensee, 'entity_id', v_licensee,
    'cta_url', '/fit-and-proper/individuals/' || NEW.individual_id, 'cta_label', 'Open record');

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notification_enqueue_event('fp.pq_invitation', 'fp_assessment', NEW.assessment_id,
      v_payload, NEW.id::text);
  ELSIF NEW.status = 'SUBMITTED' AND OLD.status IS DISTINCT FROM 'SUBMITTED' THEN
    PERFORM public.notification_enqueue_event('fp.pq_submitted', 'fp_assessment', NEW.assessment_id,
      v_payload, NEW.id::text);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fp_invitation_notification_ins ON public.declaration_invitations;
CREATE TRIGGER trg_fp_invitation_notification_ins
AFTER INSERT ON public.declaration_invitations
FOR EACH ROW EXECUTE FUNCTION public.trg_fp_invitation_notification();

DROP TRIGGER IF EXISTS trg_fp_invitation_notification_upd ON public.declaration_invitations;
CREATE TRIGGER trg_fp_invitation_notification_upd
AFTER UPDATE ON public.declaration_invitations
FOR EACH ROW EXECUTE FUNCTION public.trg_fp_invitation_notification();

CREATE OR REPLACE FUNCTION public.trg_fp_screening_run_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_licensee uuid;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  SELECT licensee_id INTO v_licensee FROM public.fp_assessments WHERE id = NEW.assessment_id;
  PERFORM public.notification_enqueue_event('fp.screening_completed', 'fp_assessment', NEW.assessment_id,
    jsonb_build_object('run_id', NEW.id, 'assessment_id', NEW.assessment_id,
      'individual_id', NEW.individual_id, 'assigned_to', NEW.triggered_by,
      'licensee_id', v_licensee, 'entity_id', v_licensee,
      'total_checks', NEW.total_checks, 'total_hits', NEW.total_hits,
      'cta_url', '/fit-and-proper/individuals/' || NEW.individual_id, 'cta_label', 'Open record'),
    NEW.id::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fp_screening_run_notification ON public.fp_screening_runs;
CREATE TRIGGER trg_fp_screening_run_notification
AFTER UPDATE ON public.fp_screening_runs
FOR EACH ROW EXECUTE FUNCTION public.trg_fp_screening_run_notification();

CREATE OR REPLACE FUNCTION public.trg_fp_manual_task_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_licensee uuid;
BEGIN
  IF NEW.assigned_to IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN RETURN NEW; END IF;
  SELECT licensee_id INTO v_licensee FROM public.fp_assessments WHERE id = NEW.assessment_id;
  PERFORM public.notification_enqueue_event('fp.assessment_assigned', 'fp_assessment', NEW.assessment_id,
    jsonb_build_object('task_id', NEW.id, 'assessment_id', NEW.assessment_id,
      'individual_id', NEW.individual_id, 'assignee_id', NEW.assigned_to,
      'licensee_id', v_licensee, 'entity_id', v_licensee, 'due_date', NEW.due_date,
      'cta_url', '/fit-and-proper/individuals/' || NEW.individual_id, 'cta_label', 'Open record'),
    NEW.id::text || ':' || NEW.assigned_to::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fp_manual_task_notification_ins ON public.fp_manual_screening_tasks;
CREATE TRIGGER trg_fp_manual_task_notification_ins
AFTER INSERT ON public.fp_manual_screening_tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_fp_manual_task_notification();

DROP TRIGGER IF EXISTS trg_fp_manual_task_notification_upd ON public.fp_manual_screening_tasks;
CREATE TRIGGER trg_fp_manual_task_notification_upd
AFTER UPDATE ON public.fp_manual_screening_tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_fp_manual_task_notification();

CREATE OR REPLACE FUNCTION public.trg_fp_assessment_committee_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record; v_payload jsonb;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  v_payload := jsonb_build_object('assessment_id', NEW.id, 'individual_id', NEW.individual_id,
    'licensee_id', NEW.licensee_id, 'entity_id', NEW.licensee_id, 'committee_id', NEW.committee_id,
    'status', NEW.status, 'assessor_id', NEW.created_by,
    'cta_url', '/fit-and-proper/individuals/' || NEW.individual_id, 'cta_label', 'Open record');

  IF NEW.status = 'awaiting_committee' THEN
    IF NEW.committee_id IS NOT NULL THEN
      FOR m IN SELECT user_id FROM public.fp_committee_members
               WHERE committee_id = NEW.committee_id AND coalesce(is_active,true) LOOP
        PERFORM public.notification_enqueue_event('fp.committee_ready', 'fp_assessment', NEW.id,
          v_payload || jsonb_build_object('member_user_id', m.user_id), m.user_id::text);
      END LOOP;
    ELSE
      PERFORM public.notification_enqueue_event('fp.committee_ready', 'fp_assessment', NEW.id, v_payload, 'no-committee');
    END IF;
  ELSIF NEW.status = 'determined' THEN
    PERFORM public.notification_enqueue_event('fp.committee_decision', 'fp_assessment', NEW.id, v_payload, 'determined');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fp_assessment_committee_notification ON public.fp_assessments;
CREATE TRIGGER trg_fp_assessment_committee_notification
AFTER UPDATE ON public.fp_assessments
FOR EACH ROW EXECUTE FUNCTION public.trg_fp_assessment_committee_notification();

CREATE OR REPLACE FUNCTION public.trg_fp_determination_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ind public.fp_individuals%ROWTYPE; v_licensee uuid;
BEGIN
  SELECT * INTO ind FROM public.fp_individuals WHERE id = NEW.individual_id;
  SELECT licensee_id INTO v_licensee FROM public.fp_assessments WHERE id = NEW.assessment_id;
  PERFORM public.notification_enqueue_event('fp.determination_dispatched', 'fp_assessment', NEW.assessment_id,
    jsonb_build_object('determination_id', NEW.id, 'assessment_id', NEW.assessment_id,
      'individual_id', NEW.individual_id, 'individual_user_id', ind.user_id,
      'individual_email', ind.email, 'individual_name', ind.full_name,
      'outcome', NEW.outcome, 'licensee_id', v_licensee, 'entity_id', v_licensee,
      'cta_url', '/fit-and-proper/individuals/' || NEW.individual_id, 'cta_label', 'Open record'),
    NEW.id::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fp_determination_notification ON public.fp_determinations;
CREATE TRIGGER trg_fp_determination_notification
AFTER INSERT ON public.fp_determinations
FOR EACH ROW EXECUTE FUNCTION public.trg_fp_determination_notification();

-- ---------------------------------------------------------------- Licences
CREATE OR REPLACE FUNCTION public.trg_license_certificate_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.licenses%ROWTYPE; v_licensee uuid; v_applicant uuid;
BEGIN
  SELECT * INTO l FROM public.licenses WHERE id = NEW.license_id;
  SELECT id, applicant_id INTO v_licensee, v_applicant FROM public.licensees WHERE license_id = l.id LIMIT 1;
  PERFORM public.notification_enqueue_event('license.certificate_issued', 'license', l.id,
    jsonb_build_object('certificate_id', NEW.id, 'license_id', l.id,
      'license_number', l.license_number, 'licensee_id', v_licensee, 'entity_id', v_licensee,
      'applicant_id', coalesce(v_applicant, l.holder_id), 'version', NEW.version,
      'cta_url', '/licenses/' || l.id, 'cta_label', 'Open licence'),
    NEW.id::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_license_certificate_notification ON public.license_certificates;
CREATE TRIGGER trg_license_certificate_notification
AFTER INSERT ON public.license_certificates
FOR EACH ROW EXECUTE FUNCTION public.trg_license_certificate_notification();

CREATE OR REPLACE FUNCTION public.trg_license_varied_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.licenses%ROWTYPE; v_licensee uuid;
BEGIN
  IF coalesce(NEW.action_type,'') NOT ILIKE '%vari%' THEN RETURN NEW; END IF;
  SELECT * INTO l FROM public.licenses WHERE id = NEW.license_id;
  SELECT id INTO v_licensee FROM public.licensees WHERE license_id = l.id LIMIT 1;
  PERFORM public.notification_enqueue_event('license.varied', 'license', l.id,
    jsonb_build_object('license_id', l.id, 'license_number', l.license_number,
      'licensee_id', v_licensee, 'entity_id', v_licensee, 'reason', NEW.reason,
      'old_status', NEW.old_status, 'new_status', NEW.new_status,
      'cta_url', '/licenses/' || l.id, 'cta_label', 'Open licence'),
    NEW.id::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_license_varied_notification ON public.license_actions;
CREATE TRIGGER trg_license_varied_notification
AFTER INSERT ON public.license_actions
FOR EACH ROW EXECUTE FUNCTION public.trg_license_varied_notification();

-- ---------------------------------------------------------------- Enforcement
CREATE OR REPLACE FUNCTION public.trg_enforcement_notification_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_payload jsonb; v_complainant uuid;
BEGIN
  SELECT complainant_id INTO v_complainant FROM public.complaints
   WHERE enforcement_action_id = NEW.id LIMIT 1;

  v_payload := jsonb_build_object('enforcement_id', NEW.id, 'case_number', NEW.case_number,
    'entity_id', NEW.entity_id, 'licensee_id', NEW.entity_id,
    'enforcement_type', NEW.enforcement_type, 'status', NEW.status,
    'complainant_id', v_complainant,
    'cta_url', '/enforcement/' || NEW.id, 'cta_label', 'Open case');

  IF NEW.notice_issued_at IS NOT NULL AND OLD.notice_issued_at IS NULL THEN
    PERFORM public.notification_enqueue_event('enforcement.notice_issued', 'enforcement_action', NEW.id, v_payload, 'notice');
  END IF;
  IF NEW.response_received_at IS NOT NULL AND OLD.response_received_at IS NULL THEN
    PERFORM public.notification_enqueue_event('enforcement.response_received', 'enforcement_action', NEW.id, v_payload, 'response');
  END IF;
  IF NEW.decision_at IS NOT NULL AND OLD.decision_at IS NULL THEN
    PERFORM public.notification_enqueue_event('enforcement.decision_recorded', 'enforcement_action', NEW.id,
      v_payload || jsonb_build_object('decision_outcome', NEW.decision_outcome), 'decision');
  END IF;
  IF NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL THEN
    IF coalesce(NEW.decision_outcome,'') ILIKE '%withdraw%' OR coalesce(NEW.status,'') ILIKE '%withdraw%' THEN
      PERFORM public.notification_enqueue_event('enforcement.case_withdrawn', 'enforcement_action', NEW.id, v_payload, 'withdrawn');
    ELSE
      PERFORM public.notification_enqueue_event('enforcement.case_closed', 'enforcement_action', NEW.id, v_payload, 'closed');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforcement_notification_events ON public.enforcement_actions;
CREATE TRIGGER trg_enforcement_notification_events
AFTER UPDATE ON public.enforcement_actions
FOR EACH ROW EXECUTE FUNCTION public.trg_enforcement_notification_events();

-- ---------------------------------------------------------------- Entity users / regulator assignment
CREATE OR REPLACE FUNCTION public.trg_entity_user_access_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_payload jsonb;
BEGIN
  v_payload := jsonb_build_object('access_id', NEW.id, 'affected_user_id', NEW.user_id,
    'entity_id', NEW.entity_id, 'licensee_id', NEW.entity_id,
    'access_type', NEW.access_type, 'previous_access_type', OLD.access_type,
    'cta_url', '/admin/licensees/' || NEW.entity_id, 'cta_label', 'Open entity');

  IF coalesce(OLD.is_active,true) AND NOT coalesce(NEW.is_active,true) THEN
    PERFORM public.notification_enqueue_event('entity.user_access_revoked', 'licensee', NEW.entity_id,
      v_payload, NEW.id::text);
  END IF;
  IF NEW.access_type IS DISTINCT FROM OLD.access_type THEN
    PERFORM public.notification_enqueue_event('entity.user_role_changed', 'licensee', NEW.entity_id,
      v_payload, NEW.id::text || ':' || NEW.access_type::text);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_entity_user_access_notification ON public.entity_user_access;
CREATE TRIGGER trg_entity_user_access_notification
AFTER UPDATE ON public.entity_user_access
FOR EACH ROW EXECUTE FUNCTION public.trg_entity_user_access_notification();

CREATE OR REPLACE FUNCTION public.trg_licensee_regulator_assignment_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.regulator_officer_id IS NOT DISTINCT FROM OLD.regulator_officer_id
     AND NEW.assigned_supervisor_id IS NOT DISTINCT FROM OLD.assigned_supervisor_id
     AND NEW.alternate_regulator_id IS NOT DISTINCT FROM OLD.alternate_regulator_id THEN
    RETURN NEW;
  END IF;
  PERFORM public.notification_enqueue_event('regulator.assignment_changed', 'licensee', NEW.id,
    jsonb_build_object('licensee_id', NEW.id, 'entity_id', NEW.id, 'entity_name', NEW.name,
      'new_assignee_id', coalesce(NEW.regulator_officer_id, NEW.assigned_supervisor_id),
      'previous_assignee_id', coalesce(OLD.regulator_officer_id, OLD.assigned_supervisor_id),
      'sector_id', NEW.sector_id,
      'cta_url', '/admin/licensees/' || NEW.id, 'cta_label', 'Open entity'),
    coalesce(NEW.regulator_officer_id, NEW.assigned_supervisor_id, NEW.id)::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_licensee_regulator_assignment_notification ON public.licensees;
CREATE TRIGGER trg_licensee_regulator_assignment_notification
AFTER UPDATE ON public.licensees
FOR EACH ROW EXECUTE FUNCTION public.trg_licensee_regulator_assignment_notification();

-- ---------------------------------------------------------------- Market conduct
CREATE OR REPLACE FUNCTION public.trg_conduct_alert_created_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notification_enqueue_event('conduct_alert_created', 'conduct_alert', NEW.id,
    jsonb_build_object('alert_id', NEW.id, 'kind', NEW.kind, 'severity', NEW.severity,
      'title', NEW.title, 'licensee_id', NEW.licensee_id, 'entity_id', NEW.licensee_id,
      'assigned_to', NEW.assigned_to, 'record_assignee_id', NEW.assigned_to,
      'complaint_id', NEW.complaint_id,
      'cta_url', '/conduct/alerts/' || NEW.id, 'cta_label', 'Open alert'));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_conduct_alert_created_notification ON public.conduct_alerts;
CREATE TRIGGER trg_conduct_alert_created_notification
AFTER INSERT ON public.conduct_alerts
FOR EACH ROW EXECUTE FUNCTION public.trg_conduct_alert_created_notification();

CREATE OR REPLACE FUNCTION public.trg_conduct_action_assigned_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assigned_to IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN RETURN NEW; END IF;
  PERFORM public.notification_enqueue_event('conduct_action_assigned', 'conduct_action', NEW.id,
    jsonb_build_object('action_id', NEW.id, 'assigned_to', NEW.assigned_to,
      'record_assignee_id', NEW.assigned_to, 'title', NEW.title, 'due_date', NEW.due_date,
      'entity_id', NEW.entity_id, 'licensee_id', NEW.entity_id, 'action_type', NEW.action_type,
      'cta_url', '/conduct/actions/' || NEW.id, 'cta_label', 'Open action'),
    NEW.assigned_to::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_conduct_action_assigned_notification_ins ON public.conduct_actions;
CREATE TRIGGER trg_conduct_action_assigned_notification_ins
AFTER INSERT ON public.conduct_actions
FOR EACH ROW EXECUTE FUNCTION public.trg_conduct_action_assigned_notification();

DROP TRIGGER IF EXISTS trg_conduct_action_assigned_notification_upd ON public.conduct_actions;
CREATE TRIGGER trg_conduct_action_assigned_notification_upd
AFTER UPDATE ON public.conduct_actions
FOR EACH ROW EXECUTE FUNCTION public.trg_conduct_action_assigned_notification();

CREATE OR REPLACE FUNCTION public.trg_thematic_review_notification_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_payload jsonb;
BEGIN
  v_payload := jsonb_build_object('thematic_review_id', NEW.id, 'code', NEW.code, 'title', NEW.title,
    'status', NEW.status, 'lead_officer_id', NEW.lead_officer_id,
    'record_assignee_id', NEW.lead_officer_id, 'assigned_to', NEW.lead_officer_id,
    'cta_url', '/conduct/thematic-reviews/' || NEW.id, 'cta_label', 'Open review');

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notification_enqueue_event('conduct_thematic_review_created', 'thematic_review', NEW.id, v_payload);
    IF NEW.lead_officer_id IS NOT NULL THEN
      PERFORM public.notification_enqueue_event('conduct_thematic_review_assigned', 'thematic_review', NEW.id,
        v_payload, NEW.lead_officer_id::text);
    END IF;
  ELSE
    IF NEW.lead_officer_id IS NOT NULL AND NEW.lead_officer_id IS DISTINCT FROM OLD.lead_officer_id THEN
      PERFORM public.notification_enqueue_event('conduct_thematic_review_assigned', 'thematic_review', NEW.id,
        v_payload, NEW.lead_officer_id::text);
    END IF;
    IF NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL THEN
      PERFORM public.notification_enqueue_event('conduct_thematic_review_closed', 'thematic_review', NEW.id,
        v_payload, 'closed');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_thematic_review_notification_ins ON public.thematic_reviews;
CREATE TRIGGER trg_thematic_review_notification_ins
AFTER INSERT ON public.thematic_reviews
FOR EACH ROW EXECUTE FUNCTION public.trg_thematic_review_notification_events();

DROP TRIGGER IF EXISTS trg_thematic_review_notification_upd ON public.thematic_reviews;
CREATE TRIGGER trg_thematic_review_notification_upd
AFTER UPDATE ON public.thematic_reviews
FOR EACH ROW EXECUTE FUNCTION public.trg_thematic_review_notification_events();

-- ---------------------------------------------------------------- Correspondence
CREATE OR REPLACE FUNCTION public.trg_correspondence_awaiting_response_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.pending_since IS NULL OR OLD.pending_since IS NOT DISTINCT FROM NEW.pending_since THEN
    RETURN NEW;
  END IF;
  PERFORM public.notification_enqueue_event('correspondence.awaiting_response', 'correspondence_thread', NEW.id,
    jsonb_build_object('thread_id', NEW.id, 'reference', NEW.reference, 'subject', NEW.subject,
      'licensee_id', NEW.licensee_id, 'entity_id', NEW.licensee_id,
      'assigned_officer_id', NEW.assigned_officer_id,
      'response_due_at', NEW.response_due_at, 'pending_since', NEW.pending_since,
      'cta_url', '/correspondence/' || NEW.id, 'cta_label', 'Open thread'),
    NEW.pending_since::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_correspondence_awaiting_response_notification ON public.correspondence_threads;
CREATE TRIGGER trg_correspondence_awaiting_response_notification
AFTER UPDATE ON public.correspondence_threads
FOR EACH ROW EXECUTE FUNCTION public.trg_correspondence_awaiting_response_notification();

-- ---------------------------------------------------------------- Rule governance
CREATE OR REPLACE FUNCTION public.trg_monitoring_rule_activated_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(NEW.active,false) AND NOT coalesce(OLD.active,false) THEN
    PERFORM public.notification_enqueue_event('rule.activated', 'monitoring_rule', NEW.id,
      jsonb_build_object('rule_id', NEW.id, 'rule_name', NEW.name, 'rule_type', NEW.rule_type,
        'scope', NEW.scope, 'frequency', NEW.frequency,
        'cta_url', '/conduct/monitoring-rules', 'cta_label', 'Open rules'),
      'activated');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_monitoring_rule_activated_notification ON public.conduct_monitoring_rules;
CREATE TRIGGER trg_monitoring_rule_activated_notification
AFTER UPDATE ON public.conduct_monitoring_rules
FOR EACH ROW EXECUTE FUNCTION public.trg_monitoring_rule_activated_notification();

CREATE OR REPLACE FUNCTION public.trg_escalation_rule_activated_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(NEW.is_active,false) AND NOT coalesce(OLD.is_active,false) THEN
    PERFORM public.notification_enqueue_event('rule.activated', 'escalation_rule', NEW.id,
      jsonb_build_object('rule_id', NEW.id, 'rule_name', NEW.name,
        'source_module', NEW.source_module, 'escalation_type', NEW.escalation_type,
        'cta_url', '/admin/escalations', 'cta_label', 'Open escalation rules'),
      'activated');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_escalation_rule_activated_notification ON public.escalation_rules;
CREATE TRIGGER trg_escalation_rule_activated_notification
AFTER UPDATE ON public.escalation_rules
FOR EACH ROW EXECUTE FUNCTION public.trg_escalation_rule_activated_notification();

CREATE OR REPLACE FUNCTION public.trg_monitoring_rule_first_fired_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prior integer; v_name text;
BEGIN
  IF NOT coalesce(NEW.matched,false) THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_prior FROM public.conduct_monitoring_results
   WHERE rule_id = NEW.rule_id AND matched AND id <> NEW.id;
  IF coalesce(v_prior,0) > 0 THEN RETURN NEW; END IF;
  SELECT name INTO v_name FROM public.conduct_monitoring_rules WHERE id = NEW.rule_id;
  PERFORM public.notification_enqueue_event('rule.first_fired', 'monitoring_rule', NEW.rule_id,
    jsonb_build_object('rule_id', NEW.rule_id, 'rule_name', v_name,
      'result_id', NEW.id, 'entity_id', NEW.entity_id, 'licensee_id', NEW.entity_id,
      'metrics', NEW.metrics,
      'cta_url', '/conduct/monitoring-rules', 'cta_label', 'Open rules'),
    'first_fired');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_monitoring_rule_first_fired_notification ON public.conduct_monitoring_results;
CREATE TRIGGER trg_monitoring_rule_first_fired_notification
AFTER INSERT ON public.conduct_monitoring_results
FOR EACH ROW EXECUTE FUNCTION public.trg_monitoring_rule_first_fired_notification();

-- ---------------------------------------------------------------- Scheduled sweeps
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobname) FROM cron.job
     WHERE jobname IN ('notify-returns-due','notify-overdue-complaint-investigations','notify-prudential-remediation-due');
    PERFORM cron.schedule('notify-returns-due', '15 6 * * *', 'SELECT public.notify_returns_due();');
    PERFORM cron.schedule('notify-overdue-complaint-investigations', '20 6 * * *', 'SELECT public.notify_overdue_complaint_investigations();');
    PERFORM cron.schedule('notify-prudential-remediation-due', '25 6 * * *', 'SELECT public.notify_prudential_remediation_due();');
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.notify_returns_due() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_overdue_complaint_investigations() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_prudential_remediation_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_returns_due() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_overdue_complaint_investigations() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_prudential_remediation_due() TO service_role;