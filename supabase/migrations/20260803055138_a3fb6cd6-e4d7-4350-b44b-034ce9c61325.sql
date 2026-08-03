-- =====================================================================
-- NOT-THR-001 Phase 3 — messaging, SLA sweep, notifications
-- =====================================================================

DROP FUNCTION IF EXISTS public.post_correspondence_message(uuid, text, boolean, text, text, uuid);
DROP FUNCTION IF EXISTS public.post_correspondence_message(uuid, text, boolean, text, text, uuid, boolean);

CREATE OR REPLACE FUNCTION public.post_correspondence_message(
  _thread_id uuid,
  _body text,
  _is_internal_note boolean DEFAULT false,
  _channel text DEFAULT NULL::text,
  _subject text DEFAULT NULL::text,
  _dispatch_id uuid DEFAULT NULL::uuid,
  _is_draft boolean DEFAULT false,
  _body_format text DEFAULT 'html'::text,
  _document_ids uuid[] DEFAULT NULL::uuid[],
  _draft_message_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_staff boolean;
  v_actor text;
  v_t public.correspondence_threads%ROWTYPE;
  v_kind text;
  v_direction text;
  v_internal boolean := COALESCE(_is_internal_note, false);
  v_id uuid;
  v_linked uuid[] := '{}';
  v_doc record;
  v_recipient record;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF COALESCE(length(TRIM(COALESCE(_body, ''))), 0) = 0 THEN RAISE EXCEPTION 'message_body_required'; END IF;
  IF NOT public.correspondence_thread_visible(_thread_id, v_user) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_t FROM public.correspondence_threads WHERE id = _thread_id;
  IF v_t.id IS NULL THEN RAISE EXCEPTION 'thread_not_found'; END IF;

  v_staff := public.is_internal_staff(v_user);
  v_actor := public.correspondence_actor_label(v_user);

  IF NOT v_staff THEN
    v_internal := false;
    IF v_t.is_entity_facing = false THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;
  END IF;

  IF v_t.thread_state = 'closed' THEN
    IF NOT (v_staff AND public.has_permission(v_user, 'correspondence_management', 'approve')) THEN
      RAISE EXCEPTION 'thread_closed' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_t.is_entity_facing = false THEN
    v_internal := true;
  END IF;

  v_kind := CASE WHEN v_internal THEN 'internal'
                 WHEN v_staff THEN 'external_outbound'
                 ELSE 'external_inbound' END;
  v_direction := CASE WHEN v_kind = 'external_inbound' THEN 'inbound'
                      WHEN v_kind = 'external_outbound' THEN 'outbound'
                      ELSE 'internal' END;

  -- Resolve authorised document links
  IF _document_ids IS NOT NULL THEN
    FOR v_doc IN SELECT d.* FROM public.documents d WHERE d.id = ANY(_document_ids) LOOP
      IF public.correspondence_case_readable(v_doc.entity_type, v_doc.entity_id, v_user) THEN
        v_linked := v_linked || v_doc.id;
      END IF;
    END LOOP;
  END IF;

  IF _draft_message_id IS NOT NULL THEN
    UPDATE public.correspondence_messages
       SET body = _body,
           body_format = COALESCE(_body_format, 'html'),
           subject = COALESCE(_subject, subject),
           channel = COALESCE(_channel, channel),
           is_internal_note = v_internal,
           message_kind = v_kind,
           direction = v_direction,
           linked_document_ids = v_linked,
           is_draft = COALESCE(_is_draft, false),
           delivery_status = CASE WHEN COALESCE(_is_draft, false) THEN 'draft' ELSE 'sent' END,
           sent_at = CASE WHEN COALESCE(_is_draft, false) THEN sent_at ELSE now() END
     WHERE id = _draft_message_id
       AND thread_id = _thread_id
       AND author_id = v_user
       AND COALESCE(is_draft, false) = true
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'draft_not_found'; END IF;
  ELSE
    INSERT INTO public.correspondence_messages (
      thread_id, direction, channel, subject, body, body_format, author_id, author_name, author_role,
      message_kind, delivery_status, is_internal_note, dispatch_id, is_draft, linked_document_ids
    ) VALUES (
      _thread_id, v_direction, COALESCE(_channel, v_t.channel), COALESCE(_subject, v_t.subject),
      _body, COALESCE(_body_format, 'html'), v_user, v_actor,
      CASE WHEN v_staff THEN 'Staff' ELSE 'Licensee' END,
      v_kind,
      CASE WHEN COALESCE(_is_draft, false) THEN 'draft'
           WHEN v_kind = 'internal' THEN 'internal' ELSE 'sent' END,
      v_internal, _dispatch_id, COALESCE(_is_draft, false), v_linked
    ) RETURNING id INTO v_id;
  END IF;

  -- Audit
  INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail, visible_to_licensee)
  VALUES (_thread_id, v_user, v_actor, CASE WHEN v_staff THEN 'Staff' ELSE 'Licensee' END,
          CASE WHEN COALESCE(_is_draft, false) THEN 'MESSAGE_DRAFT_SAVED' ELSE 'MESSAGE_SENT' END,
          CASE WHEN v_internal THEN 'Internal note' ELSE initcap(replace(v_kind, '_', ' ')) END
            || CASE WHEN array_length(v_linked, 1) IS NOT NULL
                    THEN ' · ' || array_length(v_linked, 1) || ' linked document(s)' ELSE '' END,
          NOT v_internal AND NOT COALESCE(_is_draft, false));

  IF COALESCE(_is_draft, false) THEN
    RETURN v_id;
  END IF;

  -- Lifecycle + response clock
  IF v_kind = 'external_outbound' THEN
    UPDATE public.correspondence_threads
       SET thread_state = CASE WHEN thread_state = 'closed' THEN thread_state ELSE 'pending_response' END,
           pending_since = CASE WHEN thread_state = 'closed' THEN pending_since ELSE now() END,
           response_due_at = CASE WHEN thread_state = 'closed' THEN response_due_at
                                  ELSE now() + (COALESCE(sla_hours, COALESCE(sla_days, 5) * 24) || ' hours')::interval END,
           sla_warned_at = NULL, sla_breached_at = NULL,
           status = CASE WHEN status IN ('received', 'assigned') THEN 'in_review' ELSE status END
     WHERE id = _thread_id;
  ELSIF v_kind = 'external_inbound' THEN
    UPDATE public.correspondence_threads
       SET thread_state = CASE WHEN thread_state = 'closed' THEN thread_state ELSE 'open' END,
           responded_at = COALESCE(responded_at, now()),
           pending_since = NULL, response_due_at = NULL,
           sla_warned_at = NULL, sla_breached_at = NULL
     WHERE id = _thread_id;
  END IF;

  -- Notifications
  IF v_kind = 'external_outbound' AND v_t.licensee_id IS NOT NULL THEN
    FOR v_recipient IN
      SELECT DISTINCT p.id AS user_id FROM public.profiles p
       WHERE p.licensee_id = v_t.licensee_id AND p.is_active IS DISTINCT FROM false
    LOOP
      INSERT INTO public.notifications (
        user_id, title, message, type, channel, severity, category, module,
        action_required, entity_type, entity_id, source_reference, event_key, metadata
      ) VALUES (
        v_recipient.user_id,
        'New message from the regulator',
        v_t.reference || ' — ' || v_t.subject,
        'info', 'in_app', 'high', 'action_required', 'communications',
        true, 'correspondence_thread', _thread_id::text, v_t.reference,
        'correspondence.external_message_sent',
        jsonb_build_object('thread_id', _thread_id, 'message_id', v_id)
      );
    END LOOP;
  ELSIF v_kind = 'external_inbound' AND v_t.assigned_officer_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id, title, message, type, channel, severity, category, module,
      action_required, entity_type, entity_id, source_reference, event_key, metadata
    ) VALUES (
      v_t.assigned_officer_id,
      'Response received on ' || v_t.reference,
      COALESCE(v_actor, 'The entity') || ' replied on: ' || v_t.subject,
      'info', 'in_app', 'high', 'action_required', 'communications',
      true, 'correspondence_thread', _thread_id::text, v_t.reference,
      'correspondence.external_response_received',
      jsonb_build_object('thread_id', _thread_id, 'message_id', v_id)
    );
  ELSIF v_kind = 'internal' THEN
    FOR v_recipient IN
      SELECT p.user_id FROM public.correspondence_thread_participants p
       WHERE p.thread_id = _thread_id AND p.is_internal = true
         AND p.user_id IS NOT NULL AND p.user_id <> v_user
    LOOP
      INSERT INTO public.notifications (
        user_id, title, message, type, channel, severity, category, module,
        action_required, entity_type, entity_id, source_reference, event_key, metadata
      ) VALUES (
        v_recipient.user_id,
        'Internal note on ' || v_t.reference,
        COALESCE(v_actor, 'A colleague') || ' posted an internal note on: ' || v_t.subject,
        'info', 'in_app', 'medium', 'info', 'communications',
        false, 'correspondence_thread', _thread_id::text, v_t.reference,
        'correspondence.internal_message_posted',
        jsonb_build_object('thread_id', _thread_id, 'message_id', v_id)
      );
    END LOOP;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.post_correspondence_message(uuid, text, boolean, text, text, uuid, boolean, text, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_correspondence_message(uuid, text, boolean, text, text, uuid, boolean, text, uuid[], uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Discard a draft
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.correspondence_discard_draft(_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_deleted uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.correspondence_messages
   WHERE id = _message_id AND author_id = v_user AND COALESCE(is_draft, false) = true
  RETURNING id INTO v_deleted;
  IF v_deleted IS NULL THEN RAISE EXCEPTION 'draft_not_found'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.correspondence_discard_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correspondence_discard_draft(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- SLA sweep
-- ---------------------------------------------------------------------
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
  -- Near breach (within 25% of window, min 4 hours)
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
    IF r.assigned_officer_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id, title, message, type, channel, severity, category, module,
        action_required, entity_type, entity_id, source_reference, event_key, metadata
      ) VALUES (
        r.assigned_officer_id, 'Response deadline approaching — ' || r.reference,
        r.subject || ' is due by ' || to_char(r.response_due_at, 'DD Mon YYYY HH24:MI'),
        'warning', 'in_app', 'high', 'alert', 'communications', true,
        'correspondence_thread', r.id::text, r.reference,
        'correspondence.sla_near_breach', jsonb_build_object('thread_id', r.id)
      );
    END IF;
    v_warned := v_warned + 1;
  END LOOP;

  -- Breached
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
    INSERT INTO public.notifications (
      user_id, title, message, type, channel, severity, category, module,
      action_required, entity_type, entity_id, source_reference, event_key, metadata
    )
    SELECT u, 'Response deadline breached — ' || r.reference,
           r.subject || ' passed its response deadline on ' || to_char(r.response_due_at, 'DD Mon YYYY HH24:MI'),
           'error', 'in_app', 'critical', 'alert', 'communications', true,
           'correspondence_thread', r.id::text, r.reference,
           'correspondence.sla_breached', jsonb_build_object('thread_id', r.id)
      FROM (
        SELECT r.assigned_officer_id AS u WHERE r.assigned_officer_id IS NOT NULL
        UNION
        SELECT ur.user_id FROM public.user_roles ur
         WHERE ur.role IN ('supervisor', 'admin', 'super_admin')
      ) recips
      WHERE u IS NOT NULL;
    v_breached := v_breached + 1;
  END LOOP;

  RETURN jsonb_build_object('warned', v_warned, 'breached', v_breached, 'ran_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.correspondence_sla_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.correspondence_sla_sweep() TO service_role;

-- ---------------------------------------------------------------------
-- Notification event configuration
-- ---------------------------------------------------------------------
INSERT INTO public.notification_event_configs (
  event_key, description, title_template, message_template,
  email_subject_template, email_body_template,
  channels, notification_type, module, category, severity, action_required, is_active
)
SELECT v.event_key, v.description, v.title_template, v.message_template,
       v.title_template, v.message_template,
       ARRAY['in_app','email'], v.notification_type, 'communications',
       v.category::notification_category, v.severity::notification_severity,
       v.action_required, true
  FROM (VALUES
    ('correspondence.external_message_sent', 'A regulator message was sent on a communication thread', 'New message from the regulator', '{{reference}} — {{subject}}', 'info', 'action_required', 'high', true),
    ('correspondence.external_response_received', 'An entity replied on a communication thread', 'Response received on {{reference}}', '{{actor}} replied on: {{subject}}', 'info', 'action_required', 'high', true),
    ('correspondence.internal_message_posted', 'An internal note was posted on a thread', 'Internal note on {{reference}}', '{{actor}} posted an internal note on: {{subject}}', 'info', 'info', 'medium', false),
    ('correspondence.internal_participant_added', 'An internal colleague was added to a thread', 'You were added to a communication thread', '{{actor}} added you to {{reference}} — {{subject}}', 'info', 'info', 'medium', false),
    ('correspondence.awaiting_response', 'A thread is awaiting a response', 'Awaiting response — {{reference}}', '{{subject}} is awaiting a response', 'warning', 'action_required', 'medium', true),
    ('correspondence.sla_near_breach', 'A thread response deadline is approaching', 'Response deadline approaching — {{reference}}', '{{subject}} is due by {{due_at}}', 'warning', 'alert', 'high', true),
    ('correspondence.sla_breached', 'A thread response deadline has been breached', 'Response deadline breached — {{reference}}', '{{subject}} passed its response deadline on {{due_at}}', 'error', 'alert', 'critical', true)
  ) AS v(event_key, description, title_template, message_template, notification_type, category, severity, action_required)
 WHERE NOT EXISTS (SELECT 1 FROM public.notification_event_configs c WHERE c.event_key = v.event_key);

-- ---------------------------------------------------------------------
-- Schedule the sweep
-- ---------------------------------------------------------------------
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('correspondence-sla-sweep')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'correspondence-sla-sweep');
    PERFORM cron.schedule('correspondence-sla-sweep', '*/15 * * * *',
      $job$SELECT public.correspondence_sla_sweep();$job$);
  END IF;
END
$cron$;