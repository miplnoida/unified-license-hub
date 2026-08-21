-- ============================================================
-- P08 closure + P12 correspondence convergence
-- ============================================================

-- 1. External isolation hardening -----------------------------
DROP POLICY IF EXISTS corr_threads_read ON public.correspondence_threads;
CREATE POLICY corr_threads_read ON public.correspondence_threads
FOR SELECT USING (
  public.is_internal_staff(auth.uid())
  OR (
    is_entity_facing = true
    AND (
      (licensee_id IS NOT NULL AND licensee_id = public.user_licensee_id(auth.uid()))
      OR created_by = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS corr_participants_read ON public.correspondence_thread_participants;
CREATE POLICY corr_participants_read ON public.correspondence_thread_participants
FOR SELECT USING (
  public.correspondence_thread_visible(thread_id, auth.uid())
  AND (public.is_internal_staff(auth.uid()) OR COALESCE(is_internal, false) = false)
);

-- 2. Authoritative browser DML = 0 on correspondence business tables
REVOKE INSERT, UPDATE, DELETE ON public.correspondence_threads FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.correspondence_messages FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.correspondence_attachments FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.correspondence_events FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.correspondence_thread_participants FROM authenticated, anon;
GRANT ALL ON public.correspondence_threads TO service_role;
GRANT ALL ON public.correspondence_messages TO service_role;
GRANT ALL ON public.correspondence_attachments TO service_role;
GRANT ALL ON public.correspondence_events TO service_role;
GRANT ALL ON public.correspondence_thread_participants TO service_role;

-- 3. Canonical case href resolver ------------------------------
CREATE OR REPLACE FUNCTION public.correspondence_case_href(_source_type text, _source_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _source_id IS NULL OR _source_type IS NULL THEN NULL
    WHEN _source_type = 'application' THEN '/applications/' || _source_id
    WHEN _source_type IN ('license', 'licence') THEN '/licenses/' || _source_id
    WHEN _source_type = 'complaint' THEN '/complaints/' || _source_id
    WHEN _source_type IN ('return', 'return_filing') THEN '/returns/filings/' || _source_id
    WHEN _source_type IN ('conduct_investigation', 'investigation') THEN '/conduct/investigations/' || _source_id
    WHEN _source_type = 'conduct_finding' THEN '/conduct/findings/' || _source_id
    WHEN _source_type = 'conduct_action' THEN '/conduct/actions/' || _source_id
    WHEN _source_type IN ('enforcement', 'enforcement_action') THEN '/enforcement/' || _source_id
    WHEN _source_type = 'examination' THEN '/examinations/' || _source_id
    WHEN _source_type IN ('fp_assessment', 'fit_and_proper') THEN '/fpa/assessments/' || _source_id
    WHEN _source_type = 'fp_person' THEN '/fpa/individuals/' || _source_id
    WHEN _source_type IN ('prudential_assessment', 'prudential') THEN '/prudential/assessments/' || _source_id
    WHEN _source_type IN ('licensee', 'entity') THEN '/entities/' || _source_id
    ELSE NULL
  END
$$;
GRANT EXECUTE ON FUNCTION public.correspondence_case_href(text, uuid) TO authenticated, service_role;

-- 4. P12 operational work queue (server-paged, count-backed) ---
CREATE OR REPLACE FUNCTION public.correspondence_work_queue(
  _filters jsonb DEFAULT '{}'::jsonb, _limit integer DEFAULT 25, _offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
         COALESCE((SELECT jsonb_agg(row_to_json(p)::jsonb ORDER BY p.last_activity_at DESC NULLS LAST)
                     FROM (SELECT * FROM f ORDER BY last_activity_at DESC NULLS LAST
                            LIMIT v_lim OFFSET v_off) p), '[]'::jsonb)
    INTO v_total, v_rows;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'page_count', jsonb_array_length(v_rows),
    'counts', v_counts,
    'can_filter_assignee', v_staff
  );
END $$;
GRANT EXECUTE ON FUNCTION public.correspondence_work_queue(jsonb, integer, integer) TO authenticated, service_role;

-- 5. Canonical thread workspace read model --------------------
CREATE OR REPLACE FUNCTION public.correspondence_thread_case(_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
                 'recipient', (SELECT d.recipient_email FROM public.correspondence_dispatches d WHERE d.id = m.dispatch_id))
               ORDER BY m.sent_at DESC), '[]'::jsonb)
          FROM public.correspondence_messages m
         WHERE m.thread_id = t.id
           AND m.is_draft = false
           AND m.message_kind IN ('external_outbound', 'external_inbound')
           AND (v_staff OR m.is_internal_note = false)),
    'reopened_count', COALESCE(t.reopened_count, 0),
    'can_act', v_staff
  );
END $$;
GRANT EXECUTE ON FUNCTION public.correspondence_thread_case(uuid) TO authenticated, service_role;

-- 6. P08 — canonical related-case links for complaints & investigations
CREATE OR REPLACE FUNCTION public.conduct_related_cases(_case_type text, _case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_entity uuid;
BEGIN
  IF v_user IS NULL OR NOT public.is_internal_staff(v_user) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _case_type NOT IN ('complaint', 'conduct_investigation') THEN
    RAISE EXCEPTION 'unsupported_case_type' USING ERRCODE = '22023';
  END IF;

  IF _case_type = 'complaint' THEN
    SELECT licensee_id INTO v_entity FROM public.complaints WHERE id = _case_id;
  ELSE
    SELECT licensee_id INTO v_entity FROM public.conduct_investigations WHERE id = _case_id;
  END IF;

  RETURN jsonb_build_object(
    'case_type', _case_type,
    'case_id', _case_id,
    'entity', CASE WHEN v_entity IS NOT NULL THEN jsonb_build_object(
        'id', v_entity,
        'name', (SELECT l.entity_name FROM public.licensees l WHERE l.id = v_entity),
        'href', '/entities/' || v_entity) END,
    'enforcement', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', e.id, 'case_number', e.case_number,
               'status', e.status, 'source_kind', COALESCE(e.source_kind, e.source_type),
               'href', '/enforcement/' || e.id) ORDER BY e.created_at DESC), '[]'::jsonb)
        FROM public.enforcement_actions e
       WHERE (_case_type = 'complaint'
              AND ((e.source_type = 'complaint' AND e.source_id = _case_id)
                   OR (e.source_kind = 'COMPLAINT' AND e.source_reference_id = _case_id)
                   OR e.id IN (SELECT c.enforcement_action_id FROM public.complaints c WHERE c.id = _case_id)))
          OR (_case_type = 'conduct_investigation'
              AND ((e.source_type = 'conduct_investigation' AND e.source_id = _case_id)
                   OR (e.source_kind = 'CONDUCT_INVESTIGATION' AND e.source_reference_id = _case_id)
                   OR e.source_investigation_id = _case_id))),
    'investigations', CASE WHEN _case_type = 'complaint' THEN (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'code', i.code, 'status', i.status,
               'href', '/conduct/investigations/' || i.id) ORDER BY i.created_at DESC), '[]'::jsonb)
        FROM public.conduct_investigations i
       WHERE i.source_type = 'complaint' AND i.source_id = _case_id) ELSE '[]'::jsonb END,
    'complaints', CASE WHEN _case_type = 'conduct_investigation' THEN (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'reference', c.complaint_number,
               'status', c.status, 'href', '/complaints/' || c.id) ORDER BY c.created_at DESC), '[]'::jsonb)
        FROM public.complaints c
       WHERE c.id IN (SELECT i.source_id FROM public.conduct_investigations i
                       WHERE i.id = _case_id AND i.source_type = 'complaint')) ELSE '[]'::jsonb END,
    'alerts', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'status', a.status,
               'severity', a.severity, 'href', '/conduct/alerts') ORDER BY a.created_at DESC), '[]'::jsonb)
        FROM public.conduct_alerts a
       WHERE (_case_type = 'complaint' AND a.complaint_id = _case_id)
          OR (_case_type = 'conduct_investigation' AND a.investigation_id = _case_id)),
    'findings', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', f.id, 'reference', f.finding_reference,
               'title', f.title, 'status', f.status, 'risk_rating', f.risk_rating,
               'href', '/conduct/findings/' || f.id) ORDER BY f.created_at DESC), '[]'::jsonb)
        FROM public.conduct_findings f
       WHERE (_case_type = 'complaint' AND f.complaint_id = _case_id)
          OR (_case_type = 'conduct_investigation' AND f.investigation_id = _case_id)),
    'remediation_actions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', ac.id, 'title', ac.title, 'status', ac.status,
               'due_date', ac.due_date, 'href', '/conduct/actions/' || ac.id) ORDER BY ac.created_at DESC), '[]'::jsonb)
        FROM public.conduct_actions ac
       WHERE (ac.source_module = _case_type AND ac.source_id = _case_id)
          OR ac.finding_id IN (
               SELECT f.id FROM public.conduct_findings f
                WHERE (_case_type = 'complaint' AND f.complaint_id = _case_id)
                   OR (_case_type = 'conduct_investigation' AND f.investigation_id = _case_id))),
    'correspondence', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'reference', t.reference,
               'subject', t.subject, 'thread_state', t.thread_state,
               'last_activity_at', COALESCE(t.last_message_at, t.received_at),
               'href', '/correspondence/' || t.id) ORDER BY COALESCE(t.last_message_at, t.received_at) DESC), '[]'::jsonb)
        FROM public.correspondence_threads t
       WHERE t.source_type = _case_type AND t.source_id = _case_id)
  );
END $$;
GRANT EXECUTE ON FUNCTION public.conduct_related_cases(text, uuid) TO authenticated, service_role;