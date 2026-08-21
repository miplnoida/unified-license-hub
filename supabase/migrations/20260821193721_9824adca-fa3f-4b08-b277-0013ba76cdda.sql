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

  WITH base AS (
    SELECT t.id, t.reference, t.subject, t.summary, t.module, t.category,
           t.channel, t.thread_type, t.thread_state, t.priority, t.is_entity_facing,
           t.source_type, t.source_id, t.source_reference,
           public.correspondence_case_href(t.source_type, t.source_id) AS related_href,
           t.licensee_id,
           (SELECT l.entity_name FROM public.licensees l WHERE l.id = t.licensee_id) AS entity_name,
           t.sender_name AS person_name, t.sender_org AS person_org,
           t.assigned_officer AS owner_name, t.assigned_officer_id AS owner_id,
           COALESCE(t.assigned_team, t.assigned_unit) AS team,
           COALESCE(t.response_due_at, t.due_at) AS sla_due_at,
           CASE
             WHEN t.thread_state = 'closed' THEN 'none'
             WHEN t.sla_breached_at IS NOT NULL THEN 'breached'
             WHEN t.sla_warned_at IS NOT NULL THEN 'at_risk'
             WHEN COALESCE(t.response_due_at, t.due_at) IS NULL THEN 'none'
             WHEN COALESCE(t.response_due_at, t.due_at) < now() THEN 'breached'
             WHEN COALESCE(t.response_due_at, t.due_at) < now() + interval '48 hours' THEN 'at_risk'
             ELSE 'on_track'
           END AS sla_state,
           CASE
             WHEN t.thread_state = 'closed' THEN NULL
             WHEN t.thread_state = 'pending_response' THEN 'entity'
             ELSE 'regulator'
           END AS waiting_on,
           public.correspondence_thread_unread_count(t.id, v_user) AS unread_count,
           CASE
             WHEN t.thread_state = 'closed' THEN 'No action — thread closed'
             WHEN t.thread_state = 'pending_response' THEN 'Await entity response'
             WHEN COALESCE(t.last_message_kind, '') = 'external_inbound' THEN 'Review inbound message and respond'
             WHEN t.assigned_officer_id IS NULL THEN 'Assign an owner'
             ELSE 'Progress the conversation'
           END AS next_action,
           COALESCE(t.last_message_at, t.received_at) AS last_activity_at,
           '/correspondence/' || t.id AS canonical_href,
           CASE WHEN t.is_entity_facing = false THEN 'internal'
                WHEN COALESCE(t.last_message_kind, '') = 'external_inbound' THEN 'inbound'
                WHEN COALESCE(t.last_message_kind, '') = 'external_outbound' THEN 'outbound'
                ELSE t.direction END AS effective_direction
      FROM public.correspondence_threads t
     WHERE (
             v_staff
             OR (t.is_entity_facing = true
                 AND ((t.licensee_id IS NOT NULL AND t.licensee_id = v_licensee) OR t.created_by = v_user))
           )
       AND (v_staff = false OR public.correspondence_case_readable(t.source_type, t.source_id, v_user))
  ), scoped AS (
    SELECT b.*,
           (b.thread_state <> 'closed'
            AND (
              (v_staff AND (b.unread_count > 0 OR b.waiting_on = 'regulator' OR b.owner_id IS NULL))
              OR (NOT v_staff AND (b.unread_count > 0 OR b.waiting_on = 'entity'))
            )) AS action_required
      FROM base b
  ), agg AS (
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
    ) AS counts FROM scoped
  ), f AS (
    SELECT w.* FROM scoped w
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
  ), page AS (
    SELECT * FROM f ORDER BY last_activity_at DESC NULLS LAST, id LIMIT v_lim OFFSET v_off
  )
  SELECT (SELECT COUNT(*)::int FROM f),
         COALESCE((SELECT jsonb_agg(row_to_json(p)::jsonb ORDER BY p.last_activity_at DESC NULLS LAST, p.id) FROM page p), '[]'::jsonb),
         (SELECT counts FROM agg)
    INTO v_total, v_rows, v_counts;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'page_count', jsonb_array_length(v_rows),
    'counts', v_counts,
    'can_filter_assignee', v_staff
  );
END $function$;