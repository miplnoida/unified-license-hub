-- =====================================================================
-- Notification recipient-rule remediation
-- 34 active event configs had empty recipient_rules, so the dispatcher
-- resolved zero recipients and never produced a dispatch row.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notification_seed_rules(_key text, _rules jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.notification_event_configs
     SET recipient_rules = _rules,
         updated_at = now()
   WHERE event_key = _key
     AND (recipient_rules IS NULL OR recipient_rules = '[]'::jsonb);
$$;

-- SLA engine ----------------------------------------------------------
SELECT public.notification_seed_rules('sla.warning', '[
  {"type":"assigned_officer"},{"type":"sla_process_team_leads"},{"type":"supervisor"}]'::jsonb);
SELECT public.notification_seed_rules('sla.breach', '[
  {"type":"assigned_officer"},{"type":"sla_process_team_leads"},{"type":"supervisor"},
  {"type":"role","role":"admin"}]'::jsonb);

-- Returns -------------------------------------------------------------
SELECT public.notification_seed_rules('return.overdue', '[
  {"type":"entity_primary_users"},{"type":"return_sector_regulators"}]'::jsonb);
SELECT public.notification_seed_rules('return.breach_warning', '[
  {"type":"entity_primary_users"},{"type":"return_sector_regulators"}]'::jsonb);
SELECT public.notification_seed_rules('return.breach_critical', '[
  {"type":"entity_primary_users"},{"type":"return_sector_regulators"},{"type":"supervisor"}]'::jsonb);
SELECT public.notification_seed_rules('return.validation_failed', '[
  {"type":"return_submitter"},{"type":"entity_primary_users"}]'::jsonb);
SELECT public.notification_seed_rules('return.validation_passed', '[
  {"type":"return_submitter"}]'::jsonb);

-- Applications / RFI --------------------------------------------------
SELECT public.notification_seed_rules('application.rfi_near_due', '[
  {"type":"applicant"},{"type":"assigned_officer"}]'::jsonb);
SELECT public.notification_seed_rules('application.rfi_overdue', '[
  {"type":"applicant"},{"type":"assigned_officer"},{"type":"supervisor"}]'::jsonb);
SELECT public.notification_seed_rules('application.rfi_responded', '[
  {"type":"assigned_officer"},{"type":"workflow_step_approvers"}]'::jsonb);
SELECT public.notification_seed_rules('application.ai_overridden', '[
  {"type":"supervisor"},{"type":"role","role":"admin"}]'::jsonb);

-- Correspondence / threads -------------------------------------------
SELECT public.notification_seed_rules('correspondence.internal_message_posted', '[
  {"type":"thread_participants","scope":"internal"},{"type":"thread_assigned_officer"},
  {"type":"actor_excluded"}]'::jsonb);
SELECT public.notification_seed_rules('correspondence.internal_participant_added', '[
  {"type":"thread_participants","scope":"internal"}]'::jsonb);
SELECT public.notification_seed_rules('correspondence.external_message_sent', '[
  {"type":"thread_participants","scope":"external"},{"type":"actor_excluded"}]'::jsonb);
SELECT public.notification_seed_rules('correspondence.external_response_received', '[
  {"type":"thread_assigned_officer"},{"type":"thread_participants","scope":"internal"},
  {"type":"actor_excluded"}]'::jsonb);
SELECT public.notification_seed_rules('correspondence.awaiting_response', '[
  {"type":"thread_participants","scope":"external"},{"type":"thread_assigned_officer"}]'::jsonb);
SELECT public.notification_seed_rules('correspondence.sla_near_breach', '[
  {"type":"thread_assigned_officer"}]'::jsonb);
SELECT public.notification_seed_rules('correspondence.sla_breached', '[
  {"type":"thread_assigned_officer"},{"type":"supervisor"},{"type":"role","role":"admin"}]'::jsonb);

-- Market conduct ------------------------------------------------------
SELECT public.notification_seed_rules('conduct_alert_created', '[
  {"type":"record_assignee"},{"type":"supervisor"}]'::jsonb);
SELECT public.notification_seed_rules('conduct_alert_acknowledged', '[
  {"type":"record_assignee"},{"type":"supervisor"}]'::jsonb);
SELECT public.notification_seed_rules('conduct_alert_closed', '[
  {"type":"record_assignee"},{"type":"supervisor"}]'::jsonb);
SELECT public.notification_seed_rules('conduct_action_overdue', '[
  {"type":"record_assignee"},{"type":"supervisor"}]'::jsonb);
SELECT public.notification_seed_rules('conduct_complaint_created', '[
  {"type":"record_assignee"},{"type":"supervisor"}]'::jsonb);
SELECT public.notification_seed_rules('conduct_complaint_triaged', '[
  {"type":"record_assignee"},{"type":"supervisor"}]'::jsonb);
SELECT public.notification_seed_rules('conduct_high_severity_complaint', '[
  {"type":"record_assignee"},{"type":"supervisor"},{"type":"role","role":"admin"}]'::jsonb);
SELECT public.notification_seed_rules('conduct_investigation_assigned', '[
  {"type":"record_assignee"},{"type":"supervisor"}]'::jsonb);
SELECT public.notification_seed_rules('conduct_investigation_opened', '[
  {"type":"record_assignee"},{"type":"supervisor"}]'::jsonb);
SELECT public.notification_seed_rules('conduct_investigation_closed', '[
  {"type":"record_assignee"},{"type":"supervisor"}]'::jsonb);
SELECT public.notification_seed_rules('conduct_evidence_uploaded', '[
  {"type":"record_assignee"},{"type":"supervisor"}]'::jsonb);
SELECT public.notification_seed_rules('conduct_evidence_access_denied', '[
  {"type":"supervisor"},{"type":"role","role":"admin"}]'::jsonb);
SELECT public.notification_seed_rules('conduct_monitoring_rule_triggered', '[
  {"type":"supervisor"},{"type":"role","role":"admin"}]'::jsonb);
SELECT public.notification_seed_rules('conduct_thematic_review_created', '[
  {"type":"record_assignee"},{"type":"supervisor"}]'::jsonb);
SELECT public.notification_seed_rules('conduct_thematic_review_assigned', '[
  {"type":"record_assignee"},{"type":"supervisor"}]'::jsonb);
SELECT public.notification_seed_rules('conduct_thematic_review_closed', '[
  {"type":"record_assignee"},{"type":"supervisor"}]'::jsonb);

DROP FUNCTION IF EXISTS public.notification_seed_rules(text, jsonb);

-- =====================================================================
-- Guardrail: an active event config must define at least one recipient
-- rule, otherwise it silently delivers to nobody.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.notification_event_config_requires_recipients()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.is_active, false) = true
     AND (NEW.recipient_rules IS NULL
          OR jsonb_typeof(NEW.recipient_rules) <> 'array'
          OR jsonb_array_length(NEW.recipient_rules) = 0) THEN
    RAISE EXCEPTION 'recipient_rules_required: event % cannot be active without at least one recipient rule', NEW.event_key
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notification_event_config_requires_recipients ON public.notification_event_configs;
CREATE TRIGGER trg_notification_event_config_requires_recipients
BEFORE INSERT OR UPDATE ON public.notification_event_configs
FOR EACH ROW EXECUTE FUNCTION public.notification_event_config_requires_recipients();

-- =====================================================================
-- Correspondence SLA sweep now routes through the notification pipeline
-- instead of inserting in-app rows directly (so preferences, email
-- delivery, dispatch logging and retries all apply).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.correspondence_sla_sweep()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warned integer := 0;
  v_breached integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT t.* FROM public.correspondence_threads t
     WHERE t.thread_state = 'pending_response'
       AND t.response_due_at IS NOT NULL
       AND t.sla_warned_at IS NULL
       AND t.sla_breached_at IS NULL
       AND now() >= t.response_due_at - GREATEST(
             (COALESCE(t.sla_hours, COALESCE(t.sla_days, 5) * 24) * 0.25 || ' hours')::interval,
             interval '4 hours')
       AND now() < t.response_due_at
  LOOP
    UPDATE public.correspondence_threads SET sla_warned_at = now() WHERE id = r.id;
    INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail, visible_to_licensee)
    VALUES (r.id, NULL, 'SLA Monitor', 'System', 'THREAD_STATUS_CHANGED',
            'Response deadline approaching (' || to_char(r.response_due_at, 'DD Mon YYYY HH24:MI') || ')', false);
    PERFORM public.notification_enqueue_event(
      'correspondence.sla_near_breach', 'correspondence_thread', r.id,
      jsonb_build_object(
        'thread_id', r.id,
        'reference', r.reference,
        'subject', r.subject,
        'assigned_officer_id', r.assigned_officer_id,
        'licensee_id', r.licensee_id,
        'response_due_at', r.response_due_at,
        'cta_url', '/correspondence/' || r.id::text
      ),
      'warn');
    v_warned := v_warned + 1;
  END LOOP;

  FOR r IN
    SELECT t.* FROM public.correspondence_threads t
     WHERE t.thread_state = 'pending_response'
       AND t.response_due_at IS NOT NULL
       AND t.sla_breached_at IS NULL
       AND now() >= t.response_due_at
  LOOP
    UPDATE public.correspondence_threads SET sla_breached_at = now() WHERE id = r.id;
    INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail, visible_to_licensee)
    VALUES (r.id, NULL, 'SLA Monitor', 'System', 'THREAD_STATUS_CHANGED',
            'Response deadline breached (' || to_char(r.response_due_at, 'DD Mon YYYY HH24:MI') || ')', true);
    PERFORM public.notification_enqueue_event(
      'correspondence.sla_breached', 'correspondence_thread', r.id,
      jsonb_build_object(
        'thread_id', r.id,
        'reference', r.reference,
        'subject', r.subject,
        'assigned_officer_id', r.assigned_officer_id,
        'licensee_id', r.licensee_id,
        'response_due_at', r.response_due_at,
        'cta_url', '/correspondence/' || r.id::text
      ),
      'breach');
    v_breached := v_breached + 1;
  END LOOP;

  RETURN jsonb_build_object('warned', v_warned, 'breached', v_breached, 'ran_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.correspondence_sla_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.correspondence_sla_sweep() TO service_role;