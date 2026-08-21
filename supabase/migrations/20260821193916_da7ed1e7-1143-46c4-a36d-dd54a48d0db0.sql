CREATE OR REPLACE FUNCTION public.correspondence_thread_case(_thread_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_staff boolean;
  t record;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT public.correspondence_thread_visible(_thread_id, v_user) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_staff := public.is_internal_staff(v_user);
  SELECT * INTO t FROM public.correspondence_threads WHERE id = _thread_id;
  IF t IS NULL THEN RAISE EXCEPTION 'thread_not_found' USING ERRCODE = '22023'; END IF;

  RETURN jsonb_build_object(
    'id', t.id,
    'reference', t.reference,
    'subject', t.subject,
    'summary', t.summary,
    'module', t.module,
    'category', t.category,
    'channel', t.channel,
    'thread_type', t.thread_type,
    'thread_state', t.thread_state,
    'stage_label', CASE t.thread_state WHEN 'open' THEN 'Open conversation'
                                       WHEN 'pending_response' THEN 'Awaiting response'
                                       ELSE 'Closed' END,
    'status_label', initcap(replace(COALESCE(t.status, t.thread_state), '_', ' ')),
    'priority', t.priority,
    'is_entity_facing', t.is_entity_facing,
    'entity_id', t.licensee_id,
    'entity_name', (SELECT l.name FROM public.licensees l WHERE l.id = t.licensee_id),
    'entity_href', CASE WHEN t.licensee_id IS NOT NULL AND v_staff
                        THEN '/entities/' || t.licensee_id END,
    'owner_name', t.assigned_officer,
    'owner_id', t.assigned_officer_id,
    'team', COALESCE(t.assigned_team, t.assigned_unit),
    'sla_due_at', COALESCE(t.response_due_at, t.due_at),
    'sla_state', CASE
        WHEN t.thread_state = 'closed' THEN 'none'
        WHEN t.sla_breached_at IS NOT NULL THEN 'breached'
        WHEN t.sla_warned_at IS NOT NULL THEN 'at_risk'
        WHEN COALESCE(t.response_due_at, t.due_at) IS NULL THEN 'none'
        WHEN COALESCE(t.response_due_at, t.due_at) < now() THEN 'breached'
        WHEN COALESCE(t.response_due_at, t.due_at) < now() + interval '48 hours' THEN 'at_risk'
        ELSE 'on_track' END,
    'waiting_on', CASE WHEN t.thread_state = 'closed' THEN NULL
                       WHEN t.thread_state = 'pending_response' THEN 'entity'
                       ELSE 'regulator' END,
    'next_action', CASE
        WHEN t.thread_state = 'closed' THEN 'No action — thread closed'
        WHEN t.thread_state = 'pending_response' THEN 'Await entity response'
        WHEN COALESCE(t.last_message_kind, '') = 'external_inbound' THEN 'Review inbound message and respond'
        WHEN t.assigned_officer_id IS NULL THEN 'Assign an owner'
        ELSE 'Progress the conversation' END,
    'last_activity_at', COALESCE(t.last_message_at, t.received_at),
    'related_case', CASE WHEN t.source_id IS NOT NULL THEN jsonb_build_object(
        'source_type', t.source_type,
        'source_id', t.source_id,
        'reference', t.source_reference,
        'href', public.correspondence_case_href(t.source_type, t.source_id)) END,
    'rfi_links', CASE WHEN NOT v_staff THEN '[]'::jsonb ELSE (
        SELECT COALESCE(jsonb_agg(x ORDER BY x->>'raised_at' DESC), '[]'::jsonb) FROM (
          SELECT jsonb_build_object('kind', 'complaint_rfi', 'id', r.id, 'status', r.status,
                                    'summary', LEFT(COALESCE(r.summary, ''), 160),
                                    'due_at', r.due_at, 'raised_at', r.raised_at,
                                    'href', '/complaints/' || r.complaint_id) AS x
            FROM public.complaint_rfis r
           WHERE t.source_type = 'complaint' AND r.complaint_id = t.source_id
          UNION ALL
          SELECT jsonb_build_object('kind', 'application_rfi', 'id', r.id, 'status', r.status,
                                    'summary', LEFT(COALESCE(r.summary, ''), 160),
                                    'due_at', r.due_at, 'raised_at', r.raised_at,
                                    'href', '/applications/' || r.application_id) AS x
            FROM public.application_rfis r
           WHERE t.source_type = 'application' AND r.application_id = t.source_id
        ) s) END,
    'delivery_evidence', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
                 'message_id', m.id, 'channel', m.channel, 'status', m.delivery_status,
                 'sent_at', m.sent_at, 'delivered_at', m.delivered_at, 'opened_at', m.opened_at,
                 'bounce_reason', m.bounce_reason,
                 'dispatch_status', d.status,
                 'error_message', COALESCE(m.bounce_reason, d.error_message),
                 'provider_message_id', d.provider_message_id,
                 'evidence_state', public.correspondence_delivery_state(
                    m.delivery_status, m.delivered_at, m.opened_at, m.bounce_reason, d.status, m.sent_at),
                 'delivery_confirmed', (m.delivered_at IS NOT NULL
                    OR lower(COALESCE(m.delivery_status, '')) IN ('delivered', 'opened')
                    OR upper(COALESCE(d.status, '')) = 'DELIVERED'),
                 'recipient', COALESCE(d.recipient_email, d.recipient_phone))
               ORDER BY m.sent_at DESC NULLS LAST, m.id), '[]'::jsonb)
          FROM public.correspondence_messages m
          LEFT JOIN public.correspondence_dispatches d ON d.id = m.dispatch_id
         WHERE m.thread_id = t.id
           AND m.is_draft = false
           AND m.message_kind IN ('external_outbound', 'external_inbound')
           AND (v_staff OR m.is_internal_note = false)),
    'reopened_count', COALESCE(t.reopened_count, 0),
    'can_act', v_staff
  );
END $function$;