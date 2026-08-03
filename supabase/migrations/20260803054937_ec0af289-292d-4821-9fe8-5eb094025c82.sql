-- =====================================================================
-- NOT-THR-001 Phase 2 — Thread services
-- =====================================================================

CREATE OR REPLACE FUNCTION public.correspondence_case_readable(_source_type text, _source_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_type text := lower(COALESCE(_source_type, ''));
BEGIN
  IF _source_id IS NULL THEN
    RETURN true; -- nothing linked; thread-level visibility governs
  END IF;
  IF _user_id IS NULL THEN RETURN false; END IF;

  IF v_type IN ('application', 'applications', 'registration', 'rfi', 'application_rfi') THEN
    RETURN public.can_read_application(_user_id, _source_id);
  ELSIF v_type IN ('complaint', 'complaints') THEN
    RETURN public.has_complaint_perm(_user_id, 'view')
        OR EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = _source_id);
  ELSIF v_type IN ('return', 'returns', 'compliance_return') THEN
    RETURN public.can_read_return_filed(_user_id, _source_id);
  ELSIF v_type IN ('enforcement', 'enforcement_action', 'enforcement_case') THEN
    RETURN public.can_read_enforcement(_user_id, _source_id);
  ELSIF v_type IN ('inspection', 'inspections') THEN
    RETURN public.can_read_inspection(_user_id, _source_id);
  ELSIF v_type IN ('licensee', 'entity') THEN
    RETURN public.can_read_licensee(_user_id, _source_id);
  ELSIF v_type IN ('license', 'licence') THEN
    RETURN public.can_read_license(_user_id, _source_id);
  END IF;

  -- Unknown source types fall back to staff-only access
  RETURN public.is_internal_staff(_user_id);
EXCEPTION WHEN others THEN
  RETURN public.is_internal_staff(_user_id);
END;
$$;

-- ---------------------------------------------------------------------
-- Unified, authorised thread feed
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.correspondence_thread_feed(
  _filters jsonb DEFAULT '{}'::jsonb,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_staff boolean;
  v_licensee uuid;
  v_q text := NULLIF(TRIM(COALESCE(_filters->>'query', '')), '');
  v_status text := NULLIF(_filters->>'status', 'all');
  v_module text := NULLIF(_filters->>'module', 'all');
  v_direction text := NULLIF(_filters->>'direction', 'all');
  v_type text := NULLIF(_filters->>'thread_type', 'all');
  v_assignee uuid := NULLIF(_filters->>'assigned_officer_id', '')::uuid;
  v_team text := NULLIF(_filters->>'assigned_team', 'all');
  v_unread boolean := COALESCE((_filters->>'unread_only')::boolean, false);
  v_source_type text := NULLIF(_filters->>'source_type', '');
  v_source_id uuid := NULLIF(_filters->>'source_id', '')::uuid;
  v_lim integer := LEAST(GREATEST(COALESCE(_limit, 50), 1), 200);
  v_off integer := GREATEST(COALESCE(_offset, 0), 0);
  v_total integer;
  v_rows jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  v_staff := public.is_internal_staff(v_user);
  v_licensee := public.user_licensee_id(v_user);

  IF NOT v_staff AND v_licensee IS NULL THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'total', 0);
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _corr_feed_tmp (id uuid) ON COMMIT DROP;

  WITH base AS (
    SELECT t.*
      FROM public.correspondence_threads t
     WHERE (
             v_staff
             OR (t.is_entity_facing = true
                 AND ((t.licensee_id IS NOT NULL AND t.licensee_id = v_licensee)
                      OR t.created_by = v_user))
           )
       AND (v_staff = false OR public.correspondence_case_readable(t.source_type, t.source_id, v_user))
       AND (v_status IS NULL OR t.thread_state = v_status)
       AND (v_module IS NULL OR t.module = v_module)
       AND (v_type IS NULL OR t.thread_type = v_type)
       AND (v_team IS NULL OR t.assigned_team = v_team OR t.assigned_unit = v_team)
       AND (v_assignee IS NULL OR t.assigned_officer_id = v_assignee)
       AND (v_source_type IS NULL OR t.source_type = v_source_type)
       AND (v_source_id IS NULL OR t.source_id = v_source_id)
       AND (
             v_direction IS NULL
             OR (v_direction = 'internal' AND t.is_entity_facing = false)
             OR (v_direction <> 'internal' AND t.is_entity_facing = true
                 AND COALESCE(t.last_message_kind,
                              CASE WHEN t.direction = 'inbound' THEN 'external_inbound' ELSE 'external_outbound' END)
                     = CASE WHEN v_direction = 'inbound' THEN 'external_inbound' ELSE 'external_outbound' END)
           )
       AND (
             v_q IS NULL
             OR t.subject ILIKE '%' || v_q || '%'
             OR t.reference ILIKE '%' || v_q || '%'
             OR COALESCE(t.source_reference, '') ILIKE '%' || v_q || '%'
             OR COALESCE(t.sender_name, '') ILIKE '%' || v_q || '%'
             OR COALESCE(t.sender_org, '') ILIKE '%' || v_q || '%'
             OR EXISTS (SELECT 1 FROM public.licensees l
                         WHERE l.id = t.licensee_id AND l.entity_name ILIKE '%' || v_q || '%')
             OR EXISTS (SELECT 1 FROM public.correspondence_thread_participants p
                         WHERE p.thread_id = t.id AND p.display_name ILIKE '%' || v_q || '%')
           )
  ), scored AS (
    SELECT b.*, public.correspondence_thread_unread_count(b.id, v_user) AS unread_count
      FROM base b
  ), filtered AS (
    SELECT * FROM scored WHERE v_unread = false OR unread_count > 0
  )
  SELECT COUNT(*)::int,
         COALESCE(jsonb_agg(row_to_json(page)::jsonb ORDER BY page.sort_at DESC), '[]'::jsonb)
    INTO v_total, v_rows
    FROM (
      SELECT f.id, f.reference, f.subject, f.summary, f.module, f.category, f.channel,
             f.thread_type, f.thread_state, f.priority, f.is_entity_facing,
             f.source_type, f.source_id, f.source_reference,
             f.licensee_id, f.assigned_unit, f.assigned_team, f.assigned_officer,
             f.assigned_officer_id, f.sender_name, f.sender_org,
             f.last_message_at, f.last_message_preview, f.last_message_kind,
             f.received_at, f.pending_since, f.response_due_at,
             f.sla_warned_at, f.sla_breached_at, f.closed_at, f.unread_count,
             COALESCE(f.last_message_at, f.received_at) AS sort_at,
             CASE WHEN f.is_entity_facing = false THEN 'internal'
                  WHEN COALESCE(f.last_message_kind, '') = 'external_inbound' THEN 'inbound'
                  WHEN COALESCE(f.last_message_kind, '') = 'external_outbound' THEN 'outbound'
                  ELSE f.direction END AS effective_direction,
             (SELECT l.entity_name FROM public.licensees l WHERE l.id = f.licensee_id) AS entity_name,
             (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'id', p.id, 'name', p.display_name, 'role', COALESCE(p.party_role, p.party_type),
                        'is_internal', p.is_internal, 'last_read_at', p.last_read_at)
                      ORDER BY p.created_at), '[]'::jsonb)
                FROM public.correspondence_thread_participants p
               WHERE p.thread_id = f.id
                 AND (v_staff OR p.is_internal = false)) AS parties
        FROM filtered f
       ORDER BY COALESCE(f.last_message_at, f.received_at) DESC
       LIMIT v_lim OFFSET v_off
    ) page;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'total', (SELECT COUNT(*)::int FROM public.correspondence_threads t
               WHERE (v_staff OR (t.is_entity_facing = true
                     AND ((t.licensee_id IS NOT NULL AND t.licensee_id = v_licensee) OR t.created_by = v_user)))),
    'page_count', v_total,
    'can_filter_assignee', v_staff
  );
END;
$$;

REVOKE ALL ON FUNCTION public.correspondence_thread_feed(jsonb, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correspondence_thread_feed(jsonb, integer, integer) TO authenticated;

-- ---------------------------------------------------------------------
-- Link a thread to a case
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.correspondence_thread_link_case(
  _thread_id uuid, _source_type text, _source_id uuid, _source_reference text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_actor text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_internal_staff(v_user) THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;
  IF NOT public.correspondence_thread_visible(_thread_id, v_user) THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;
  IF NOT public.correspondence_case_readable(_source_type, _source_id, v_user) THEN
    RAISE EXCEPTION 'case_not_accessible' USING ERRCODE = '42501';
  END IF;
  v_actor := public.correspondence_actor_label(v_user);

  UPDATE public.correspondence_threads
     SET source_type = _source_type,
         source_id = _source_id,
         source_reference = COALESCE(_source_reference, source_reference),
         module = public.correspondence_module_for(_source_type, category, thread_type)
   WHERE id = _thread_id;

  INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail, visible_to_licensee)
  VALUES (_thread_id, v_user, v_actor, 'Staff', 'THREAD_STATUS_CHANGED',
          'Linked to ' || _source_type || COALESCE(' ' || _source_reference, ''), true);
END;
$$;

REVOKE ALL ON FUNCTION public.correspondence_thread_link_case(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correspondence_thread_link_case(uuid, text, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- Pending response (SLA start)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.correspondence_set_pending_response(
  _thread_id uuid, _due_at timestamptz DEFAULT NULL, _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_actor text; v_due timestamptz; v_t public.correspondence_threads%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_internal_staff(v_user)
     OR NOT public.has_permission(v_user, 'correspondence_management', 'edit') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_t FROM public.correspondence_threads WHERE id = _thread_id;
  IF v_t.id IS NULL THEN RAISE EXCEPTION 'thread_not_found'; END IF;
  IF v_t.thread_state = 'closed' THEN RAISE EXCEPTION 'thread_closed' USING ERRCODE = '42501'; END IF;

  v_due := COALESCE(_due_at, now() + (COALESCE(v_t.sla_hours, COALESCE(v_t.sla_days, 5) * 24) || ' hours')::interval);
  v_actor := public.correspondence_actor_label(v_user);

  UPDATE public.correspondence_threads
     SET thread_state = 'pending_response',
         pending_since = now(),
         response_due_at = v_due,
         sla_warned_at = NULL,
         sla_breached_at = NULL
   WHERE id = _thread_id;

  INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail, visible_to_licensee)
  VALUES (_thread_id, v_user, v_actor, 'Staff', 'THREAD_STATUS_CHANGED',
          COALESCE(_note, 'Pending response · response due ' || to_char(v_due, 'DD Mon YYYY HH24:MI')), true);
END;
$$;

REVOKE ALL ON FUNCTION public.correspondence_set_pending_response(uuid, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correspondence_set_pending_response(uuid, timestamptz, text) TO authenticated;

-- ---------------------------------------------------------------------
-- Reopen (permission gated)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.correspondence_reopen_thread(_thread_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_actor text; v_t public.correspondence_threads%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_internal_staff(v_user)
     OR NOT public.has_permission(v_user, 'correspondence_management', 'approve') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(length(TRIM(_reason)), 0) < 10 THEN RAISE EXCEPTION 'reopen_reason_required'; END IF;
  SELECT * INTO v_t FROM public.correspondence_threads WHERE id = _thread_id;
  IF v_t.id IS NULL THEN RAISE EXCEPTION 'thread_not_found'; END IF;
  IF v_t.thread_state <> 'closed' THEN RAISE EXCEPTION 'thread_not_closed'; END IF;
  v_actor := public.correspondence_actor_label(v_user);

  UPDATE public.correspondence_threads
     SET thread_state = 'open', status = 'in_review', closed_at = NULL, closed_by = NULL,
         pending_since = NULL, response_due_at = NULL,
         sla_warned_at = NULL, sla_breached_at = NULL,
         reopened_count = COALESCE(reopened_count, 0) + 1
   WHERE id = _thread_id;

  INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail, visible_to_licensee)
  VALUES (_thread_id, v_user, v_actor, 'Staff', 'THREAD_STATUS_CHANGED', 'Reopened: ' || _reason, true);
END;
$$;

REVOKE ALL ON FUNCTION public.correspondence_reopen_thread(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correspondence_reopen_thread(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- Export manifest (authorised content only)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.correspondence_export_manifest(_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_staff boolean;
  v_t public.correspondence_threads%ROWTYPE;
  v_out jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT public.correspondence_thread_visible(_thread_id, v_user) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  v_staff := public.is_internal_staff(v_user);
  SELECT * INTO v_t FROM public.correspondence_threads WHERE id = _thread_id;
  IF NOT v_staff AND v_t.is_entity_facing = false THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF v_staff AND NOT public.correspondence_case_readable(v_t.source_type, v_t.source_id, v_user) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_out := jsonb_build_object(
    'thread', jsonb_build_object(
      'id', v_t.id, 'reference', v_t.reference, 'subject', v_t.subject,
      'module', v_t.module, 'thread_type', v_t.thread_type, 'thread_state', v_t.thread_state,
      'source_reference', v_t.source_reference, 'source_type', v_t.source_type,
      'entity_name', (SELECT l.entity_name FROM public.licensees l WHERE l.id = v_t.licensee_id),
      'received_at', v_t.received_at, 'closed_at', v_t.closed_at,
      'response_due_at', v_t.response_due_at, 'exported_at', now(),
      'exported_by', public.correspondence_actor_label(v_user),
      'includes_internal', v_staff
    ),
    'participants', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'name', p.display_name, 'role', COALESCE(p.party_role, p.party_type),
               'is_internal', p.is_internal) ORDER BY p.created_at), '[]'::jsonb)
        FROM public.correspondence_thread_participants p
       WHERE p.thread_id = _thread_id AND (v_staff OR p.is_internal = false)
    ),
    'messages', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', m.id, 'author_name', m.author_name, 'author_role', m.author_role,
               'sent_at', m.sent_at, 'direction', m.direction, 'message_kind', m.message_kind,
               'body', m.body, 'body_format', m.body_format,
               'delivery_status', m.delivery_status, 'is_internal', m.is_internal_note,
               'system_generated', m.sent_by_system,
               'attachments', (
                 SELECT COALESCE(jsonb_agg(a.file_name ORDER BY a.created_at), '[]'::jsonb)
                   FROM public.correspondence_attachments a WHERE a.message_id = m.id
               )) ORDER BY m.sent_at), '[]'::jsonb)
        FROM public.correspondence_messages m
       WHERE m.thread_id = _thread_id
         AND COALESCE(m.is_draft, false) = false
         AND (v_staff OR m.is_internal_note = false)
    ),
    'audit', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'action', e.action, 'actor', e.actor_name, 'role', e.actor_role,
               'detail', e.detail, 'at', e.created_at) ORDER BY e.created_at), '[]'::jsonb)
        FROM public.correspondence_events e
       WHERE e.thread_id = _thread_id AND (v_staff OR e.visible_to_licensee = true)
    )
  );

  INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail, visible_to_licensee)
  VALUES (_thread_id, v_user, public.correspondence_actor_label(v_user),
          CASE WHEN v_staff THEN 'Staff' ELSE 'Licensee' END,
          'THREAD_EXPORTED',
          'PDF export' || CASE WHEN v_staff THEN ' (including internal messages)' ELSE ' (external content only)' END,
          false);

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.correspondence_export_manifest(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correspondence_export_manifest(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Link authorised case documents to a message
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.correspondence_link_documents(_message_id uuid, _document_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_msg public.correspondence_messages%ROWTYPE;
  v_t public.correspondence_threads%ROWTYPE;
  v_doc record;
  v_ok uuid[] := '{}';
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_msg FROM public.correspondence_messages WHERE id = _message_id;
  IF v_msg.id IS NULL THEN RAISE EXCEPTION 'message_not_found'; END IF;
  IF NOT public.correspondence_thread_visible(v_msg.thread_id, v_user) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_t FROM public.correspondence_threads WHERE id = v_msg.thread_id;

  FOR v_doc IN SELECT d.* FROM public.documents d WHERE d.id = ANY(COALESCE(_document_ids, '{}')) LOOP
    IF public.correspondence_case_readable(v_doc.entity_type, v_doc.entity_id, v_user)
       AND (v_t.source_id IS NULL OR v_doc.entity_id = v_t.source_id OR public.is_internal_staff(v_user)) THEN
      v_ok := v_ok || v_doc.id;
    END IF;
  END LOOP;

  IF array_length(v_ok, 1) IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.correspondence_messages SET linked_document_ids = v_ok WHERE id = _message_id;
  RETURN array_length(v_ok, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.correspondence_link_documents(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correspondence_link_documents(uuid, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------
-- Add an internal colleague to a thread
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.correspondence_add_participant(
  _thread_id uuid, _user_id uuid, _party_role text DEFAULT 'Officer'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_name text; v_id uuid; v_actor text; v_t public.correspondence_threads%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_internal_staff(v_user)
     OR NOT public.has_permission(v_user, 'correspondence_management', 'edit') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT public.correspondence_thread_visible(_thread_id, v_user) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_internal_staff(_user_id) THEN RAISE EXCEPTION 'recipient_not_internal'; END IF;

  SELECT full_name INTO v_name FROM public.profiles WHERE id = _user_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'recipient_not_found'; END IF;
  SELECT * INTO v_t FROM public.correspondence_threads WHERE id = _thread_id;
  v_actor := public.correspondence_actor_label(v_user);

  INSERT INTO public.correspondence_thread_participants (thread_id, user_id, party_type, display_name, party_role, is_internal)
  VALUES (_thread_id, _user_id, 'officer', v_name, COALESCE(_party_role, 'Officer'), true)
  ON CONFLICT (thread_id, user_id) DO UPDATE SET party_role = COALESCE(EXCLUDED.party_role, correspondence_thread_participants.party_role)
  RETURNING id INTO v_id;

  INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail, visible_to_licensee)
  VALUES (_thread_id, v_user, v_actor, 'Staff', 'THREAD_STATUS_CHANGED', 'Internal participant added: ' || v_name, false);

  INSERT INTO public.notifications (
    user_id, title, message, type, channel, severity, category, module,
    action_required, entity_type, entity_id, source_reference, event_key, metadata
  ) VALUES (
    _user_id,
    'You were added to a communication thread',
    COALESCE(v_actor, 'A colleague') || ' added you to ' || v_t.reference || ' — ' || v_t.subject,
    'info', 'in_app', 'medium', 'info', 'communications',
    false, 'correspondence_thread', _thread_id::text, v_t.reference,
    'correspondence.internal_participant_added',
    jsonb_build_object('thread_id', _thread_id, 'added_by', v_user)
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.correspondence_add_participant(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correspondence_add_participant(uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- Thread creation: record module, validate linked case
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_correspondence_thread(
  _subject text, _summary text, _sender_name text, _sender_org text DEFAULT NULL::text,
  _sender_email text DEFAULT NULL::text, _channel text DEFAULT 'email'::text,
  _category text DEFAULT 'General'::text, _priority text DEFAULT NULL::text,
  _licensee_id uuid DEFAULT NULL::uuid, _tags text[] DEFAULT '{}'::text[],
  _body text DEFAULT NULL::text, _thread_type text DEFAULT 'general_correspondence'::text,
  _source_type text DEFAULT NULL::text, _source_id uuid DEFAULT NULL::uuid,
  _source_reference text DEFAULT NULL::text, _is_entity_facing boolean DEFAULT true,
  _participants jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_staff boolean;
  v_licensee uuid := _licensee_id;
  v_rule public.correspondence_routing_rules%ROWTYPE;
  v_priority text := COALESCE(_priority, 'normal');
  v_sla integer := 5;
  v_id uuid;
  v_actor text;
  v_entity_facing boolean := COALESCE(_is_entity_facing, true);
  v_module text;
  v_p jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  v_staff := public.is_internal_staff(v_user);
  IF NOT v_staff THEN
    v_licensee := public.user_licensee_id(v_user);
    IF v_licensee IS NULL THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;
  END IF;
  IF _thread_type = 'internal_discussion' THEN v_entity_facing := false; END IF;
  IF _thread_type NOT IN ('general_correspondence', 'internal_discussion')
     AND _source_id IS NULL AND _source_reference IS NULL THEN
    RAISE EXCEPTION 'linked_case_required';
  END IF;
  IF _source_id IS NOT NULL AND NOT public.correspondence_case_readable(_source_type, _source_id, v_user) THEN
    RAISE EXCEPTION 'case_not_accessible' USING ERRCODE = '42501';
  END IF;
  v_actor := public.correspondence_actor_label(v_user);
  v_module := public.correspondence_module_for(_source_type, _category, _thread_type);

  SELECT * INTO v_rule FROM public.correspondence_routing_rules r
  WHERE r.is_active
    AND (
      (r.match_type = 'category' AND lower(r.match_value) = lower(_category))
      OR (r.match_type = 'channel' AND lower(r.match_value) = lower(_channel))
      OR (r.match_type = 'subject' AND _subject ILIKE '%' || r.match_value || '%')
      OR (r.match_type = 'priority' AND lower(r.match_value) = lower(v_priority))
    )
  ORDER BY r.sort_order ASC LIMIT 1;

  IF v_rule.id IS NOT NULL THEN
    v_sla := v_rule.sla_days;
    IF _priority IS NULL THEN v_priority := v_rule.priority; END IF;
  END IF;

  INSERT INTO public.correspondence_threads (
    subject, summary, sender_name, sender_org, sender_email, channel, category,
    priority, licensee_id, tags, sla_days, sla_hours, due_at, retention_expires_at,
    assigned_unit, assigned_officer, status, created_by,
    thread_type, thread_state, source_type, source_id, source_reference,
    is_entity_facing, last_message_at, module
  ) VALUES (
    _subject, _summary, _sender_name, _sender_org, _sender_email, _channel, _category,
    v_priority, v_licensee, COALESCE(_tags, '{}'), v_sla, v_sla * 24,
    now() + (v_sla || ' days')::interval, now() + interval '7 years',
    v_rule.assign_unit, v_rule.assign_officer,
    CASE WHEN v_rule.id IS NOT NULL THEN 'assigned' ELSE 'received' END,
    v_user,
    COALESCE(_thread_type, 'general_correspondence'), 'open',
    _source_type, _source_id, _source_reference, v_entity_facing, now(), v_module
  ) RETURNING id INTO v_id;

  INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail, visible_to_licensee)
  VALUES (v_id, v_user, v_actor, CASE WHEN v_staff THEN 'Staff' ELSE 'Licensee' END,
          'THREAD_CREATED',
          'Type: ' || COALESCE(_thread_type, 'general_correspondence') || ' · Module: ' || v_module || ' · Channel: ' || _channel,
          v_entity_facing);

  IF v_rule.id IS NOT NULL THEN
    INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail, visible_to_licensee)
    VALUES (v_id, v_user, 'Routing Engine', 'System', 'THREAD_STATUS_CHANGED',
            'Routed to ' || v_rule.assign_unit || COALESCE(' -> ' || v_rule.assign_officer, '') || ' (rule: ' || v_rule.name || ')', false);
  END IF;

  INSERT INTO public.correspondence_thread_participants (thread_id, user_id, party_type, display_name, party_role, last_read_at, is_internal)
  VALUES (v_id, v_user, CASE WHEN v_staff THEN 'officer' ELSE 'entity' END, v_actor,
          CASE WHEN v_staff THEN 'Officer' ELSE 'Entity' END, now(), v_staff)
  ON CONFLICT (thread_id, user_id) DO NOTHING;

  IF _participants IS NOT NULL THEN
    FOR v_p IN SELECT * FROM jsonb_array_elements(_participants) LOOP
      INSERT INTO public.correspondence_thread_participants (thread_id, user_id, party_type, display_name, party_role, is_internal)
      VALUES (v_id,
              NULLIF(v_p->>'user_id', '')::uuid,
              COALESCE(v_p->>'party_type', 'officer'),
              COALESCE(v_p->>'display_name', 'Participant'),
              v_p->>'party_role',
              COALESCE((v_p->>'is_internal')::boolean,
                       CASE WHEN NULLIF(v_p->>'user_id','') IS NOT NULL
                            THEN public.is_internal_staff((v_p->>'user_id')::uuid) ELSE false END))
      ON CONFLICT (thread_id, user_id) DO NOTHING;
    END LOOP;
  END IF;

  IF _body IS NOT NULL AND length(TRIM(_body)) > 0 THEN
    INSERT INTO public.correspondence_messages (
      thread_id, direction, channel, subject, body, author_id, author_name, author_role,
      message_kind, delivery_status, is_internal_note
    ) VALUES (
      v_id, CASE WHEN v_staff THEN 'outbound' ELSE 'inbound' END, _channel, _subject, _body, v_user,
      COALESCE(_sender_name, v_actor),
      CASE WHEN v_staff THEN 'Staff' ELSE 'Licensee' END,
      CASE WHEN NOT v_entity_facing THEN 'internal'
           WHEN v_staff THEN 'external_outbound' ELSE 'external_inbound' END,
      'sent',
      NOT v_entity_facing
    );
  END IF;

  RETURN v_id;
END;
$$;