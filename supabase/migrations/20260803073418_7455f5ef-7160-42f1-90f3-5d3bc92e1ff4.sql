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
  v_payload jsonb;
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

  -- Notifications now flow through the central pipeline so that user
  -- preferences, email delivery, dispatch logging and retries all apply.
  v_payload := jsonb_build_object(
    'thread_id', _thread_id,
    'message_id', v_id,
    'reference', v_t.reference,
    'subject', COALESCE(_subject, v_t.subject),
    'actor_id', v_user,
    'actor_name', v_actor,
    'licensee_id', v_t.licensee_id,
    'assigned_officer_id', v_t.assigned_officer_id,
    'cta_url', '/correspondence/' || _thread_id::text,
    'cta_label', 'Open thread'
  );

  IF v_kind = 'external_outbound' THEN
    PERFORM public.notification_enqueue_event(
      'correspondence.external_message_sent', 'correspondence_thread', _thread_id, v_payload, v_id::text);
  ELSIF v_kind = 'external_inbound' THEN
    PERFORM public.notification_enqueue_event(
      'correspondence.external_response_received', 'correspondence_thread', _thread_id, v_payload, v_id::text);
  ELSE
    PERFORM public.notification_enqueue_event(
      'correspondence.internal_message_posted', 'correspondence_thread', _thread_id, v_payload, v_id::text);
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.post_correspondence_message(uuid, text, boolean, text, text, uuid, boolean, text, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_correspondence_message(uuid, text, boolean, text, text, uuid, boolean, text, uuid[], uuid) TO authenticated;