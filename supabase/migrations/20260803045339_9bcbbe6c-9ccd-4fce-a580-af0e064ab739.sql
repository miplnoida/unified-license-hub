
-- ============================================================
-- NOT-CEN-001: Notification Centre server-side support
-- ============================================================

-- 1. Paginated / filterable feed ------------------------------
CREATE OR REPLACE FUNCTION public.notification_feed(
  _tab text DEFAULT 'all',
  _module text DEFAULT NULL,
  _severity text DEFAULT NULL,
  _type text DEFAULT NULL,
  _status text DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _search text DEFAULT NULL,
  _cursor_created_at timestamptz DEFAULT NULL,
  _cursor_id uuid DEFAULT NULL,
  _limit integer DEFAULT 25
)
RETURNS SETOF public.notifications
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      auth.uid() AS uid,
      LEAST(GREATEST(COALESCE(_limit, 25), 1), 100) AS lim,
      CASE WHEN length(btrim(COALESCE(_search, ''))) >= 3
           THEN btrim(_search) END AS q
  )
  SELECT n.*
  FROM public.notifications n, params p
  WHERE n.user_id = p.uid
    AND n.channel = 'in_app'
    AND (n.expires_at IS NULL OR n.expires_at > now())
    -- tab semantics
    AND CASE COALESCE(_tab, 'all')
          WHEN 'unread'          THEN n.status = 'unread'
          WHEN 'action_required' THEN n.category = 'action_required'
                                      AND n.status NOT IN ('dismissed', 'archived')
          WHEN 'alerts'          THEN n.category = 'alert'
                                      AND n.status NOT IN ('dismissed', 'archived')
          WHEN 'system'          THEN n.category = 'system'
                                      AND n.status NOT IN ('dismissed', 'archived')
          WHEN 'archived'        THEN n.status IN ('dismissed', 'archived')
          ELSE n.status NOT IN ('dismissed', 'archived')
        END
    AND (_module IS NULL OR n.module = _module)
    AND (_severity IS NULL OR n.severity::text = _severity)
    AND (_type IS NULL OR n.type = _type)
    AND (_status IS NULL OR n.status::text = _status)
    AND (_from IS NULL OR n.created_at >= _from)
    AND (_to IS NULL OR n.created_at <= _to)
    AND (
      p.q IS NULL
      OR n.title ILIKE '%' || p.q || '%'
      OR n.message ILIKE '%' || p.q || '%'
      OR COALESCE(n.source_reference, '') ILIKE '%' || p.q || '%'
      OR COALESCE(n.entity_id, '') ILIKE '%' || p.q || '%'
    )
    AND (
      _cursor_created_at IS NULL
      OR (n.created_at, n.id) < (_cursor_created_at, COALESCE(_cursor_id, '00000000-0000-0000-0000-000000000000'::uuid))
    )
  ORDER BY n.created_at DESC, n.id DESC
  LIMIT (SELECT lim FROM params);
$$;

REVOKE ALL ON FUNCTION public.notification_feed(text, text, text, text, text, timestamptz, timestamptz, text, timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_feed(text, text, text, text, text, timestamptz, timestamptz, text, timestamptz, uuid, integer) TO authenticated, service_role;

-- 2. Delivery detail for the caller's own notification --------
CREATE OR REPLACE FUNCTION public.notification_delivery_for(_notification_id uuid)
RETURNS TABLE (
  channel text,
  status text,
  provider text,
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  retry_count integer,
  error text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.channel, d.status, d.provider, d.queued_at, d.sent_at,
         d.delivered_at, d.failed_at, COALESCE(d.retry_count, 0), d.error
  FROM public.notification_dispatch_log d
  JOIN public.notifications n ON n.id = d.notification_id
  WHERE d.notification_id = _notification_id
    AND n.user_id = auth.uid()
  ORDER BY d.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.notification_delivery_for(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_delivery_for(uuid) TO authenticated, service_role;

-- 3. Audited export -------------------------------------------
CREATE OR REPLACE FUNCTION public.notification_export(_ids uuid[])
RETURNS TABLE (
  created_at timestamptz,
  severity text,
  category text,
  module text,
  type text,
  title text,
  message text,
  source_reference text,
  status text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.log_notification_audit(
    'NOTIFICATION_EXPORTED',
    COALESCE(_ids, ARRAY[]::uuid[]),
    jsonb_build_object('count', COALESCE(array_length(_ids, 1), 0))
  );

  RETURN QUERY
  SELECT n.created_at, n.severity::text, n.category::text, n.module, n.type,
         n.title, n.message, n.source_reference, n.status::text
  FROM public.notifications n
  WHERE n.user_id = auth.uid()
    AND n.id = ANY(COALESCE(_ids, ARRAY[]::uuid[]))
  ORDER BY n.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_export(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_export(uuid[]) TO authenticated, service_role;

-- 4. Forward to colleague (internal thread draft) -------------
CREATE OR REPLACE FUNCTION public.notification_forward(
  _notification_id uuid,
  _to_user_id uuid,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_n public.notifications;
  v_thread_id uuid;
  v_reference text;
  v_from_name text;
  v_to_name text;
  v_to_email text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_n
  FROM public.notifications
  WHERE id = _notification_id AND user_id = v_uid;

  IF v_n.id IS NULL THEN
    RAISE EXCEPTION 'notification_not_found' USING ERRCODE = '42501';
  END IF;

  SELECT full_name INTO v_from_name FROM public.profiles WHERE id = v_uid;
  SELECT full_name, email INTO v_to_name, v_to_email FROM public.profiles WHERE id = _to_user_id;

  IF v_to_name IS NULL THEN
    RAISE EXCEPTION 'recipient_not_found' USING ERRCODE = '22023';
  END IF;

  v_reference := 'INT-' || to_char(now(), 'YYYY') || '-' || lpad((floor(random() * 1000000))::text, 6, '0');

  INSERT INTO public.correspondence_threads (
    reference, subject, summary, category, channel, direction, priority, status,
    sender_name, sender_email, thread_type, thread_state, source_type, source_id,
    source_reference, is_entity_facing, assigned_officer, assigned_officer_id,
    received_at, created_by
  ) VALUES (
    v_reference,
    'Forwarded: ' || v_n.title,
    COALESCE(v_n.preview, left(v_n.message, 160)),
    'internal',
    'internal',
    'internal',
    CASE WHEN v_n.severity::text IN ('critical', 'high') THEN 'high' ELSE 'normal' END,
    'open',
    COALESCE(v_from_name, 'Internal user'),
    NULL,
    'internal',
    'open',
    COALESCE(v_n.entity_type, 'notification'),
    NULL,
    COALESCE(v_n.source_reference, v_n.entity_id),
    false,
    v_to_name,
    _to_user_id,
    now(),
    v_uid
  )
  RETURNING id INTO v_thread_id;

  INSERT INTO public.correspondence_messages (
    thread_id, direction, channel, subject, body, is_internal_note,
    author_id, author_name, message_kind, is_draft, created_at
  ) VALUES (
    v_thread_id, 'internal', 'internal',
    'Forwarded: ' || v_n.title,
    COALESCE(_note || E'\n\n', '')
      || v_n.message
      || E'\n\n--\nForwarded notification: ' || v_n.id::text
      || COALESCE(E'\nSource reference: ' || v_n.source_reference, '')
      || COALESCE(E'\nSource record: ' || v_n.entity_type || ' ' || v_n.entity_id, ''),
    true, v_uid, COALESCE(v_from_name, 'Internal user'), 'note', true, now()
  );

  INSERT INTO public.notifications (
    user_id, title, message, type, channel, severity, category, module,
    action_required, entity_type, entity_id, source_reference, event_key, metadata
  ) VALUES (
    _to_user_id,
    'Notification forwarded to you',
    COALESCE(v_from_name, 'A colleague') || ' forwarded: ' || v_n.title,
    'info', 'in_app', 'medium', 'info', 'communications',
    false, 'correspondence_thread', v_thread_id::text, v_reference,
    'notification.forwarded',
    jsonb_build_object('forwarded_notification_id', v_n.id, 'from_user_id', v_uid)
  );

  PERFORM public.log_notification_audit(
    'NOTIFICATION_FORWARDED',
    ARRAY[_notification_id],
    jsonb_build_object('to_user_id', _to_user_id, 'thread_id', v_thread_id, 'reference', v_reference)
  );

  RETURN jsonb_build_object(
    'success', true,
    'thread_id', v_thread_id,
    'reference', v_reference,
    'route', '/correspondence/manager?thread=' || v_thread_id::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notification_forward(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_forward(uuid, uuid, text) TO authenticated, service_role;

-- 5. Admin delivery history -----------------------------------
CREATE OR REPLACE FUNCTION public.notification_history(
  _search text DEFAULT NULL,
  _channel text DEFAULT NULL,
  _status text DEFAULT NULL,
  _event_key text DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  notification_id uuid,
  recipient_user_id uuid,
  recipient_name text,
  recipient_email text,
  event_key text,
  notification_type text,
  template_name text,
  channel text,
  status text,
  created_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  retry_count integer,
  error text,
  source_reference text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q text := CASE WHEN length(btrim(COALESCE(_search, ''))) >= 3 THEN btrim(_search) END;
BEGIN
  PERFORM public.enforce_permission('notification_management', 'dispatch');

  RETURN QUERY
  SELECT d.id, d.notification_id, d.recipient_user_id,
         p.full_name, COALESCE(d.recipient_email, p.email),
         d.event_key, n.type, t.name, d.channel, d.status,
         d.created_at, d.sent_at, d.failed_at, COALESCE(d.retry_count, 0), d.error,
         COALESCE(n.source_reference, d.entity_id)
  FROM public.notification_dispatch_log d
  LEFT JOIN public.notifications n ON n.id = d.notification_id
  LEFT JOIN public.profiles p ON p.id = d.recipient_user_id
  LEFT JOIN public.notification_templates t ON t.id = d.template_id
  WHERE (_channel IS NULL OR d.channel = _channel)
    AND (_status IS NULL OR d.status = _status)
    AND (_event_key IS NULL OR d.event_key = _event_key)
    AND (_from IS NULL OR d.created_at >= _from)
    AND (_to IS NULL OR d.created_at <= _to)
    AND (
      v_q IS NULL
      OR COALESCE(p.full_name, '') ILIKE '%' || v_q || '%'
      OR COALESCE(d.recipient_email, '') ILIKE '%' || v_q || '%'
      OR COALESCE(d.event_key, '') ILIKE '%' || v_q || '%'
      OR COALESCE(n.source_reference, '') ILIKE '%' || v_q || '%'
      OR COALESCE(d.entity_id, '') ILIKE '%' || v_q || '%'
    )
  ORDER BY d.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 200)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.notification_history(text, text, text, text, timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_history(text, text, text, text, timestamptz, timestamptz, integer, integer) TO authenticated, service_role;
