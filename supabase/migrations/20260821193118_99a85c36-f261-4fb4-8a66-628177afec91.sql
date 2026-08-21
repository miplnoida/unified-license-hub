-- P12 closure certification: deterministic queue ordering + honest delivery evidence.

CREATE OR REPLACE FUNCTION public.correspondence_delivery_state(
  _msg_status text, _delivered_at timestamptz, _opened_at timestamptz,
  _bounce_reason text, _dispatch_status text, _sent_at timestamptz)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _bounce_reason IS NOT NULL OR lower(COALESCE(_msg_status, '')) IN ('bounced', 'rejected')
         OR upper(COALESCE(_dispatch_status, '')) IN ('BOUNCED', 'REJECTED') THEN 'bounced'
    WHEN lower(COALESCE(_msg_status, '')) IN ('failed', 'dead_letter', 'error')
         OR upper(COALESCE(_dispatch_status, '')) IN ('FAILED', 'DEAD_LETTER', 'ERROR') THEN 'failed'
    WHEN upper(COALESCE(_dispatch_status, '')) IN ('RETRYING') THEN 'retrying'
    WHEN _opened_at IS NOT NULL OR lower(COALESCE(_msg_status, '')) = 'opened' THEN 'opened'
    WHEN _delivered_at IS NOT NULL OR lower(COALESCE(_msg_status, '')) = 'delivered'
         OR upper(COALESCE(_dispatch_status, '')) = 'DELIVERED' THEN 'delivered'
    WHEN lower(COALESCE(_msg_status, '')) IN ('sent', 'sent_to_provider')
         OR upper(COALESCE(_dispatch_status, '')) IN ('SENT', 'SENT_TO_PROVIDER') THEN 'sent'
    WHEN lower(COALESCE(_msg_status, '')) IN ('queued', 'pending')
         OR upper(COALESCE(_dispatch_status, '')) IN ('QUEUED', 'PENDING') THEN 'queued'
    WHEN upper(COALESCE(_dispatch_status, '')) IN ('SUPPRESSED', 'PROVIDER_NOT_CONFIGURED') THEN 'not_delivered'
    WHEN _sent_at IS NOT NULL THEN 'recorded'
    ELSE 'unknown'
  END
$$;

GRANT EXECUTE ON FUNCTION public.correspondence_delivery_state(text, timestamptz, timestamptz, text, text, timestamptz) TO authenticated, service_role;

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
    'entity_name', (SELECT l.entity_name FROM public.licensees l WHERE l.id = t.licensee_id),
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

-- Deterministic (stable) ordering for server pagination.
CREATE OR REPLACE FUNCTION public.correspondence_work_queue(_filters jsonb DEFAULT '{}'::jsonb, _limit integer DEFAULT 25, _offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_staff boolean;
  v_licensee uuid;
  v_q text := NULLIF(TRIM(COALESCE(_filters->>'query', '')), '');
  v_state text := NULLIF(_filters->>'status', 'all');
  v_module text := NULLIF(_filters->>'module', 'all');
  v_type text := NULLIF(_filters->>'thread_type', 'all');
  v_channel text := NULLIF(_filters->>'channel', 'all');
  v_priority text := NULLIF(_filters->>'priority', 'all');
  v_bucket text := NULLIF(_filters->>'bucket', 'all');
  v_assignee uuid := NULLIF(_filters->>'assigned_officer_id', '')::uuid;
  v_source_type text := NULLIF(_filters->>'source_type', '');
  v_source_id uuid := NULLIF(_filters->>'source_id', '')::uuid;
  v_lim integer := LEAST(GREATEST(COALESCE(_limit, 25), 1), 200);
  v_off integer := GREATEST(COALESCE(_offset, 0), 0);
  v_total integer := 0;
  v_rows jsonb := '[]'::jsonb;
  v_counts jsonb := '{}'::jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  v_staff := public.is_internal_staff(v_user);
  v_licensee := public.user_licensee_id(v_user);

  IF NOT v_staff AND v_licensee IS NULL THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'total', 0, 'page_count', 0,
                              'counts', jsonb_build_object(), 'can_filter_assignee', false);
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _corr_wq (
    id uuid, reference text, subject text, summary text, module text, category text,
    channel text, thread_type text, thread_state text, priority text, is_entity_facing boolean,
    source_type text, source_id uuid, source_reference text, related_href text,
    licensee_id uuid, entity_name text, person_name text, person_org text,
    owner_name text, owner_id uuid, team text,
    sla_due_at timestamptz, sla_state text, waiting_on text,
    unread_count integer, action_required boolean, next_action text,
    last_activity_at timestamptz, canonical_href text, effective_direction text
  ) ON COMMIT DROP;
  DELETE FROM _corr_wq;

  INSERT INTO _corr_wq
  SELECT t.id, t.reference, t.subject, t.summary, t.module, t.category,
         t.channel, t.thread_type, t.thread_state, t.priority, t.is_entity_facing,
         t.source_type, t.source_id, t.source_reference,
         public.correspondence_case_href(t.source_type, t.source_id),
         t.licensee_id,
         (SELECT l.entity_name FROM public.licensees l WHERE l.id = t.licensee_id),
         t.sender_name, t.sender_org,
         t.assigned_officer, t.assigned_officer_id, COALESCE(t.assigned_team, t.assigned_unit),
         COALESCE(t.response_due_at, t.due_at),
         CASE
           WHEN t.thread_state = 'closed' THEN 'none'
           WHEN t.sla_breached_at IS NOT NULL THEN 'breached'
           WHEN t.sla_warned_at IS NOT NULL THEN 'at_risk'
           WHEN COALESCE(t.response_due_at, t.due_at) IS NULL THEN 'none'
           WHEN COALESCE(t.response_due_at, t.due_at) < now() THEN 'breached'
           WHEN COALESCE(t.response_due_at, t.due_at) < now() + interval '48 hours' THEN 'at_risk'
           ELSE 'on_track'
         END,
         CASE
           WHEN t.thread_state = 'closed' THEN NULL
           WHEN t.thread_state = 'pending_response' THEN 'entity'
           ELSE 'regulator'
         END,
         public.correspondence_thread_unread_count(t.id, v_user),
         false,
         CASE
           WHEN t.thread_state = 'closed' THEN 'No action — thread closed'
           WHEN t.thread_state = 'pending_response' THEN 'Await entity response'
           WHEN COALESCE(t.last_message_kind, '') = 'external_inbound' THEN 'Review inbound message and respond'
           WHEN t.assigned_officer_id IS NULL THEN 'Assign an owner'
           ELSE 'Progress the conversation'
         END,
         COALESCE(t.last_message_at, t.received_at),
         '/correspondence/' || t.id,
         CASE WHEN t.is_entity_facing = false THEN 'internal'
              WHEN COALESCE(t.last_message_kind, '') = 'external_inbound' THEN 'inbound'
              WHEN COALESCE(t.last_message_kind, '') = 'external_outbound' THEN 'outbound'
              ELSE t.direction END
    FROM public.correspondence_threads t
   WHERE (
           v_staff
           OR (t.is_entity_facing = true
               AND ((t.licensee_id IS NOT NULL AND t.licensee_id = v_licensee) OR t.created_by = v_user))
         )
     AND (v_staff = false OR public.correspondence_case_readable(t.source_type, t.source_id, v_user));

  UPDATE _corr_wq SET action_required = (
    thread_state <> 'closed'
    AND (
      (v_staff AND (unread_count > 0 OR waiting_on = 'regulator' OR owner_id IS NULL))
      OR (NOT v_staff AND (unread_count > 0 OR waiting_on = 'entity'))
    )
  );

  SELECT jsonb_build_object(
    'total_open', COUNT(*) FILTER (WHERE thread_state <> 'closed'),
    'awaiting_response', COUNT(*) FILTER (WHERE waiting_on = 'entity'),
    'breached', COUNT(*) FILTER (WHERE sla_state = 'breached'),
    'at_risk', COUNT(*) FILTER (WHERE sla_state = 'at_risk'),
    'unread', COUNT(*) FILTER (WHERE unread_count > 0),
    'action_required', COUNT(*) FILTER (WHERE action_required),
    'unassigned', COUNT(*) FILTER (WHERE owner_id IS NULL AND thread_state <> 'closed'),
    'mine', COUNT(*) FILTER (WHERE owner_id = v_user AND thread_state <> 'closed'),
    'total', COUNT(*)
  ) INTO v_counts FROM _corr_wq;

  WITH f AS (
    SELECT * FROM _corr_wq w
     WHERE (v_state IS NULL OR w.thread_state = v_state)
       AND (v_module IS NULL OR w.module = v_module)
       AND (v_type IS NULL OR w.thread_type = v_type)
       AND (v_channel IS NULL OR w.channel = v_channel)
       AND (v_priority IS NULL OR w.priority = v_priority)
       AND (v_assignee IS NULL OR w.owner_id = v_assignee)
       AND (v_source_type IS NULL OR w.source_type = v_source_type)
       AND (v_source_id IS NULL OR w.source_id = v_source_id)
       AND (
             v_bucket IS NULL
             OR (v_bucket = 'open' AND w.thread_state <> 'closed')
             OR (v_bucket = 'mine' AND w.owner_id = v_user AND w.thread_state <> 'closed')
             OR (v_bucket = 'unassigned' AND w.owner_id IS NULL AND w.thread_state <> 'closed')
             OR (v_bucket = 'awaiting_response' AND w.waiting_on = 'entity')
             OR (v_bucket = 'breached' AND w.sla_state = 'breached')
             OR (v_bucket = 'unread' AND w.unread_count > 0)
             OR (v_bucket = 'action_required' AND w.action_required)
           )
       AND (
             v_q IS NULL
             OR w.subject ILIKE '%' || v_q || '%'
             OR w.reference ILIKE '%' || v_q || '%'
             OR COALESCE(w.source_reference, '') ILIKE '%' || v_q || '%'
             OR COALESCE(w.person_name, '') ILIKE '%' || v_q || '%'
             OR COALESCE(w.person_org, '') ILIKE '%' || v_q || '%'
             OR COALESCE(w.entity_name, '') ILIKE '%' || v_q || '%'
           )
  )
  SELECT (SELECT COUNT(*)::int FROM f),
         COALESCE((SELECT jsonb_agg(row_to_json(p)::jsonb ORDER BY p.last_activity_at DESC NULLS LAST, p.id)
                     FROM (SELECT * FROM f ORDER BY last_activity_at DESC NULLS LAST, id
                            LIMIT v_lim OFFSET v_off) p), '[]'::jsonb)
    INTO v_total, v_rows;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'page_count', jsonb_array_length(v_rows),
    'counts', v_counts,
    'can_filter_assignee', v_staff
  );
END $function$;