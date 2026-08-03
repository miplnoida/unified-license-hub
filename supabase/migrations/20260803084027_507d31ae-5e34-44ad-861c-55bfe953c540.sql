-- Registration approved
CREATE OR REPLACE FUNCTION public.trg_registration_approved_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status <> 'approved' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  PERFORM public.notification_enqueue_event('registration.approved', 'registration', NEW.id,
    jsonb_build_object('registration_id', NEW.id, 'registration_reference', NEW.registration_reference,
      'applicant_id', NEW.user_id, 'applicant_name', NEW.applicant_name, 'applicant_email', NEW.email,
      'sector_id', NEW.sector_id,
      'cta_url', '/dashboard', 'cta_label', 'Open portal'),
    'approved');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_registration_approved_notification ON public.registrations;
CREATE TRIGGER trg_registration_approved_notification
AFTER UPDATE ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.trg_registration_approved_notification();

-- Overdue conduct actions (time-based, so swept daily)
CREATE OR REPLACE FUNCTION public.notify_overdue_conduct_actions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.conduct_actions
    WHERE due_date IS NOT NULL AND due_date < current_date
      AND coalesce(status,'open') NOT IN ('completed','waived','closed','cancelled')
  LOOP
    PERFORM public.notification_enqueue_event('conduct_action_overdue', 'conduct_action', r.id,
      jsonb_build_object('action_id', r.id, 'title', r.title, 'due_date', r.due_date,
        'days_overdue', (current_date - r.due_date),
        'assigned_to', r.assigned_to, 'record_assignee_id', r.assigned_to,
        'entity_id', r.entity_id, 'licensee_id', r.entity_id, 'action_type', r.action_type,
        'cta_url', '/conduct/actions/' || r.id, 'cta_label', 'Open action'),
      NULL, NULL, current_date::text);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Workflow SLA warning / breach on pending approval steps
CREATE OR REPLACE FUNCTION public.notify_workflow_sla_events()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n integer := 0; v_payload jsonb; v_pct numeric;
BEGIN
  FOR r IN
    SELECT aa.id AS action_id, aa.sla_deadline, aa.application_id, aa.step_id,
           s.name AS step_name, s.sla_hours, s.sla_warning_threshold_percent,
           a.application_number, a.applicant_id, a.assigned_to, a.data->>'licensee_id' AS licensee_id
    FROM public.approval_actions aa
    JOIN public.approval_steps s ON s.id = aa.step_id
    LEFT JOIN public.applications a ON a.id = aa.application_id
    WHERE aa.sla_deadline IS NOT NULL
      AND aa.responded_at IS NULL
      AND aa.application_id IS NOT NULL
  LOOP
    v_payload := jsonb_build_object(
      'application_id', r.application_id, 'application_number', r.application_number,
      'applicant_id', r.applicant_id, 'assignee_id', r.assigned_to,
      'assigned_officer_id', r.assigned_to, 'licensee_id', r.licensee_id,
      'process_name', coalesce(r.step_name,'Approval step'), 'step_name', r.step_name,
      'sla_due_at', r.sla_deadline, 'sla_hours', r.sla_hours,
      'cta_url', '/applications/' || r.application_id, 'cta_label', 'Open application');

    IF r.sla_deadline < now() THEN
      PERFORM public.notification_enqueue_event('sla.breach', 'application', r.application_id,
        v_payload || jsonb_build_object('hours_overdue',
          round(extract(epoch FROM (now() - r.sla_deadline))/3600.0, 1)),
        r.action_id::text, NULL, to_char(now(),'YYYY-MM-DD'));
      n := n + 1;
    ELSE
      v_pct := coalesce(r.sla_warning_threshold_percent, 80);
      IF r.sla_hours IS NOT NULL AND r.sla_hours > 0
         AND now() >= (r.sla_deadline - make_interval(hours => (r.sla_hours * (100 - v_pct) / 100.0)::int)) THEN
        PERFORM public.notification_enqueue_event('sla.warning', 'application', r.application_id,
          v_payload || jsonb_build_object('hours_remaining',
            round(extract(epoch FROM (r.sla_deadline - now()))/3600.0, 1)),
          r.action_id::text, NULL, to_char(now(),'YYYY-MM-DD"T"HH24'));
        n := n + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN n;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobname) FROM cron.job
     WHERE jobname IN ('notify-overdue-conduct-actions','notify-workflow-sla-events');
    PERFORM cron.schedule('notify-overdue-conduct-actions', '30 6 * * *', 'SELECT public.notify_overdue_conduct_actions();');
    PERFORM cron.schedule('notify-workflow-sla-events', '10 * * * *', 'SELECT public.notify_workflow_sla_events();');
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.notify_overdue_conduct_actions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_workflow_sla_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_overdue_conduct_actions() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_workflow_sla_events() TO service_role;