-- 1. Thread columns
ALTER TABLE public.correspondence_threads
  ADD COLUMN IF NOT EXISTS thread_type text NOT NULL DEFAULT 'general_correspondence',
  ADD COLUMN IF NOT EXISTS thread_state text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS source_reference text,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending_since timestamptz,
  ADD COLUMN IF NOT EXISTS response_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS close_justification text,
  ADD COLUMN IF NOT EXISTS is_entity_facing boolean NOT NULL DEFAULT true;

-- 2. Message columns
ALTER TABLE public.correspondence_messages
  ADD COLUMN IF NOT EXISTS message_kind text NOT NULL DEFAULT 'external_inbound',
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounce_reason text,
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

-- 3. Participants
CREATE TABLE IF NOT EXISTS public.correspondence_thread_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.correspondence_threads(id) ON DELETE CASCADE,
  user_id uuid,
  party_type text NOT NULL DEFAULT 'officer',
  display_name text NOT NULL,
  party_role text,
  last_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS corr_participants_uniq
  ON public.correspondence_thread_participants(thread_id, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), display_name);
CREATE INDEX IF NOT EXISTS corr_participants_thread ON public.correspondence_thread_participants(thread_id);

GRANT SELECT, INSERT, UPDATE ON public.correspondence_thread_participants TO authenticated;
GRANT ALL ON public.correspondence_thread_participants TO service_role;
ALTER TABLE public.correspondence_thread_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY corr_participants_read ON public.correspondence_thread_participants
  FOR SELECT USING (public.correspondence_thread_visible(thread_id, auth.uid()));
CREATE POLICY corr_participants_write ON public.correspondence_thread_participants
  FOR INSERT WITH CHECK (public.is_internal_staff(auth.uid()));
CREATE POLICY corr_participants_update ON public.correspondence_thread_participants
  FOR UPDATE USING (public.correspondence_thread_visible(thread_id, auth.uid()))
  WITH CHECK (public.correspondence_thread_visible(thread_id, auth.uid()));

CREATE TRIGGER trg_corr_participants_touch BEFORE UPDATE ON public.correspondence_thread_participants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Backfill
UPDATE public.correspondence_threads
   SET thread_state = CASE WHEN status = 'closed' THEN 'closed'
                           WHEN status = 'responded' THEN 'pending_response'
                           ELSE 'open' END,
       last_message_at = COALESCE(last_message_at, received_at),
       source_reference = COALESCE(source_reference, reference)
 WHERE true;

UPDATE public.correspondence_messages
   SET message_kind = CASE WHEN is_internal_note THEN 'internal'
                           WHEN direction = 'outbound' THEN 'external_outbound'
                           ELSE 'external_inbound' END
 WHERE true;

UPDATE public.correspondence_threads t
   SET last_message_at = GREATEST(COALESCE(t.last_message_at, t.received_at), m.mx)
  FROM (SELECT thread_id, MAX(sent_at) mx FROM public.correspondence_messages GROUP BY thread_id) m
 WHERE m.thread_id = t.id;

-- 5. Extended create RPC
CREATE OR REPLACE FUNCTION public.create_correspondence_thread(
  _subject text, _summary text, _sender_name text,
  _sender_org text DEFAULT NULL, _sender_email text DEFAULT NULL,
  _channel text DEFAULT 'email', _category text DEFAULT 'General',
  _priority text DEFAULT NULL, _licensee_id uuid DEFAULT NULL,
  _tags text[] DEFAULT '{}', _body text DEFAULT NULL,
  _thread_type text DEFAULT 'general_correspondence',
  _source_type text DEFAULT NULL, _source_id uuid DEFAULT NULL,
  _source_reference text DEFAULT NULL, _is_entity_facing boolean DEFAULT true,
  _participants jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
  v_p jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  v_staff := public.is_internal_staff(v_user);
  IF NOT v_staff THEN
    v_licensee := public.user_licensee_id(v_user);
    IF v_licensee IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  END IF;
  IF _thread_type = 'internal_discussion' THEN v_entity_facing := false; END IF;
  IF v_entity_facing AND _thread_type <> 'general_correspondence'
     AND _source_id IS NULL AND _source_reference IS NULL THEN
    RAISE EXCEPTION 'linked_case_required';
  END IF;
  v_actor := public.correspondence_actor_label(v_user);

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
    priority, licensee_id, tags, sla_days, due_at, retention_expires_at,
    assigned_unit, assigned_officer, status, created_by,
    thread_type, thread_state, source_type, source_id, source_reference,
    is_entity_facing, last_message_at
  ) VALUES (
    _subject, _summary, _sender_name, _sender_org, _sender_email, _channel, _category,
    v_priority, v_licensee, COALESCE(_tags, '{}'), v_sla, now() + (v_sla || ' days')::interval,
    now() + interval '7 years',
    v_rule.assign_unit, v_rule.assign_officer,
    CASE WHEN v_rule.id IS NOT NULL THEN 'assigned' ELSE 'received' END,
    v_user,
    COALESCE(_thread_type, 'general_correspondence'), 'open',
    _source_type, _source_id, _source_reference, v_entity_facing, now()
  ) RETURNING id INTO v_id;

  INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail)
  VALUES (v_id, v_user, v_actor, CASE WHEN v_staff THEN 'Staff' ELSE 'Licensee' END,
          'THREAD_CREATED', 'Type: ' || COALESCE(_thread_type,'general_correspondence') || ' · Channel: ' || _channel);

  IF v_rule.id IS NOT NULL THEN
    INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail)
    VALUES (v_id, v_user, 'Routing Engine', 'System', 'Routed automatically',
            v_rule.assign_unit || COALESCE(' -> ' || v_rule.assign_officer, '') || ' (rule: ' || v_rule.name || ')');
  END IF;

  INSERT INTO public.correspondence_thread_participants (thread_id, user_id, party_type, display_name, party_role, last_read_at)
  VALUES (v_id, v_user, CASE WHEN v_staff THEN 'officer' ELSE 'entity' END, v_actor,
          CASE WHEN v_staff THEN 'Officer' ELSE 'Entity' END, now())
  ON CONFLICT DO NOTHING;

  IF _participants IS NOT NULL THEN
    FOR v_p IN SELECT * FROM jsonb_array_elements(_participants) LOOP
      INSERT INTO public.correspondence_thread_participants (thread_id, user_id, party_type, display_name, party_role)
      VALUES (v_id,
              NULLIF(v_p->>'user_id','')::uuid,
              COALESCE(v_p->>'party_type','officer'),
              COALESCE(v_p->>'display_name','Participant'),
              v_p->>'party_role')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  IF _body IS NOT NULL AND length(TRIM(_body)) > 0 THEN
    INSERT INTO public.correspondence_messages (thread_id, direction, channel, subject, body, author_id, author_name, author_role, message_kind, delivery_status)
    VALUES (v_id, CASE WHEN v_staff THEN 'outbound' ELSE 'inbound' END, _channel, _subject, _body, v_user,
            COALESCE(_sender_name, v_actor),
            CASE WHEN v_staff THEN 'Staff' ELSE 'Licensee' END,
            CASE WHEN NOT v_entity_facing THEN 'internal'
                 WHEN v_staff THEN 'external_outbound' ELSE 'external_inbound' END,
            'sent');
  END IF;

  RETURN v_id;
END; $function$;

-- 6. Extended post message RPC
CREATE OR REPLACE FUNCTION public.post_correspondence_message(
  _thread_id uuid, _body text, _is_internal_note boolean DEFAULT false,
  _channel text DEFAULT 'portal', _subject text DEFAULT NULL, _dispatch_id uuid DEFAULT NULL,
  _is_draft boolean DEFAULT false
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_staff boolean;
  v_id uuid;
  v_actor text;
  v_kind text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.correspondence_thread_visible(_thread_id, v_user) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_staff := public.is_internal_staff(v_user);
  IF _is_internal_note AND NOT v_staff THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_actor := public.correspondence_actor_label(v_user);
  v_kind := CASE WHEN _is_internal_note THEN 'internal'
                 WHEN v_staff THEN 'external_outbound' ELSE 'external_inbound' END;

  INSERT INTO public.correspondence_messages (
    thread_id, direction, channel, subject, body, is_internal_note, author_id, author_name,
    author_role, dispatch_id, message_kind, delivery_status, is_draft
  ) VALUES (
    _thread_id, CASE WHEN v_staff THEN 'outbound' ELSE 'inbound' END, _channel, _subject, _body,
    _is_internal_note, v_user, v_actor, CASE WHEN v_staff THEN 'Staff' ELSE 'Licensee' END,
    _dispatch_id, v_kind, CASE WHEN _is_draft THEN 'queued' ELSE 'sent' END, COALESCE(_is_draft,false)
  ) RETURNING id INTO v_id;

  IF COALESCE(_is_draft,false) THEN RETURN v_id; END IF;

  INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail, visible_to_licensee)
  VALUES (_thread_id, v_user, v_actor, CASE WHEN v_staff THEN 'Staff' ELSE 'Licensee' END,
          CASE WHEN _is_internal_note THEN 'Internal note added' ELSE 'MESSAGE_SENT' END,
          'Channel: ' || _channel, NOT _is_internal_note);

  UPDATE public.correspondence_threads SET last_message_at = now() WHERE id = _thread_id;

  IF _is_internal_note = false THEN
    IF v_staff THEN
      UPDATE public.correspondence_threads
        SET status = CASE WHEN status IN ('closed') THEN status ELSE 'responded' END,
            responded_at = COALESCE(responded_at, now()),
            thread_state = CASE WHEN thread_state = 'closed' THEN thread_state ELSE 'pending_response' END,
            pending_since = CASE WHEN thread_state = 'closed' THEN pending_since ELSE now() END,
            response_due_at = CASE WHEN thread_state = 'closed' THEN response_due_at
                                   ELSE now() + (COALESCE(sla_days,5) || ' days')::interval END
      WHERE id = _thread_id;
    ELSE
      UPDATE public.correspondence_threads
        SET status = CASE WHEN status IN ('responded','closed') THEN 'in_review' ELSE status END,
            due_at = COALESCE(due_at, now() + (sla_days || ' days')::interval),
            thread_state = CASE WHEN thread_state = 'closed' THEN thread_state ELSE 'open' END,
            pending_since = NULL,
            response_due_at = NULL
      WHERE id = _thread_id;
    END IF;
  END IF;

  RETURN v_id;
END; $function$;

-- 7. Thread state management
CREATE OR REPLACE FUNCTION public.set_correspondence_thread_state(
  _thread_id uuid, _state text, _justification text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_actor text;
  v_thread public.correspondence_threads%ROWTYPE;
BEGIN
  IF NOT public.is_internal_staff(v_user) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _state NOT IN ('open','pending_response','closed') THEN RAISE EXCEPTION 'invalid_state'; END IF;
  SELECT * INTO v_thread FROM public.correspondence_threads WHERE id = _thread_id;
  IF v_thread.id IS NULL THEN RAISE EXCEPTION 'thread_not_found'; END IF;
  v_actor := public.correspondence_actor_label(v_user);

  IF _state = 'closed' THEN
    IF v_thread.thread_state = 'pending_response'
       AND v_thread.response_due_at IS NOT NULL
       AND v_thread.response_due_at > now()
       AND COALESCE(length(TRIM(_justification)), 0) < 10 THEN
      RAISE EXCEPTION 'closure_justification_required';
    END IF;
    UPDATE public.correspondence_threads
       SET thread_state = 'closed', status = 'closed', closed_at = now(),
           close_justification = _justification, pending_since = NULL
     WHERE id = _thread_id;
    INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail, visible_to_licensee)
    VALUES (_thread_id, v_user, v_actor, 'Staff', 'THREAD_CLOSED', _justification, true);
  ELSIF _state = 'pending_response' THEN
    UPDATE public.correspondence_threads
       SET thread_state = 'pending_response', pending_since = now(),
           response_due_at = now() + (COALESCE(sla_days,5) || ' days')::interval
     WHERE id = _thread_id;
    INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail, visible_to_licensee)
    VALUES (_thread_id, v_user, v_actor, 'Staff', 'THREAD_STATUS_CHANGED', 'Pending response · SLA started', true);
  ELSE
    UPDATE public.correspondence_threads
       SET thread_state = 'open', pending_since = NULL, response_due_at = NULL,
           closed_at = NULL,
           status = CASE WHEN status = 'closed' THEN 'in_review' ELSE status END
     WHERE id = _thread_id;
    INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail, visible_to_licensee)
    VALUES (_thread_id, v_user, v_actor, 'Staff', 'THREAD_STATUS_CHANGED', 'Reopened', true);
  END IF;
END; $function$;

-- 8. Read receipts
CREATE OR REPLACE FUNCTION public.mark_correspondence_thread_read(_thread_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_user uuid := auth.uid(); v_staff boolean; v_actor text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.correspondence_thread_visible(_thread_id, v_user) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_staff := public.is_internal_staff(v_user);
  v_actor := public.correspondence_actor_label(v_user);

  UPDATE public.correspondence_thread_participants
     SET last_read_at = now()
   WHERE thread_id = _thread_id AND user_id = v_user;

  IF NOT FOUND THEN
    INSERT INTO public.correspondence_thread_participants (thread_id, user_id, party_type, display_name, party_role, last_read_at)
    VALUES (_thread_id, v_user, CASE WHEN v_staff THEN 'officer' ELSE 'entity' END, v_actor,
            CASE WHEN v_staff THEN 'Officer' ELSE 'Entity' END, now())
    ON CONFLICT DO NOTHING;
  END IF;

  IF NOT v_staff THEN
    UPDATE public.correspondence_messages
       SET opened_at = COALESCE(opened_at, now()),
           delivery_status = CASE WHEN delivery_status IN ('bounced') THEN delivery_status ELSE 'opened' END
     WHERE thread_id = _thread_id AND message_kind = 'external_outbound' AND opened_at IS NULL;
  END IF;
END; $function$;

-- 9. Delivery status
CREATE OR REPLACE FUNCTION public.record_correspondence_delivery(
  _message_id uuid, _status text, _reason text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_user uuid := auth.uid(); v_msg public.correspondence_messages%ROWTYPE; v_actor text;
BEGIN
  IF NOT public.is_internal_staff(v_user) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _status NOT IN ('queued','sent','delivered','opened','bounced') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  SELECT * INTO v_msg FROM public.correspondence_messages WHERE id = _message_id;
  IF v_msg.id IS NULL THEN RAISE EXCEPTION 'message_not_found'; END IF;
  v_actor := public.correspondence_actor_label(v_user);

  UPDATE public.correspondence_messages
     SET delivery_status = _status,
         delivered_at = CASE WHEN _status IN ('delivered','opened') THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
         opened_at = CASE WHEN _status = 'opened' THEN COALESCE(opened_at, now()) ELSE opened_at END,
         bounce_reason = CASE WHEN _status = 'bounced' THEN _reason ELSE bounce_reason END
   WHERE id = _message_id;

  INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail, visible_to_licensee)
  VALUES (v_msg.thread_id, v_user, v_actor, 'System',
          CASE WHEN _status = 'bounced' THEN 'MESSAGE_DELIVERY_FAILED' ELSE 'MESSAGE_DELIVERY_CONFIRMED' END,
          COALESCE(_reason, 'Status: ' || _status), false);
END; $function$;

REVOKE ALL ON FUNCTION public.set_correspondence_thread_state(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_correspondence_thread_read(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_correspondence_delivery(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_correspondence_thread_state(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_correspondence_thread_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_correspondence_delivery(uuid, text, text) TO authenticated;