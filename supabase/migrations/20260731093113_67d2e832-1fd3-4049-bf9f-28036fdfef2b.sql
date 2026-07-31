
-- ============ sequence + reference ============
CREATE SEQUENCE IF NOT EXISTS public.correspondence_reference_seq;

CREATE OR REPLACE FUNCTION public.generate_correspondence_reference()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'COR-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.correspondence_reference_seq')::text, 6, '0');
$$;

-- ============ threads ============
CREATE TABLE IF NOT EXISTS public.correspondence_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT public.generate_correspondence_reference(),
  subject text NOT NULL,
  summary text,
  category text NOT NULL DEFAULT 'General',
  channel text NOT NULL DEFAULT 'email',
  direction text NOT NULL DEFAULT 'inbound',
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'received',
  sender_name text NOT NULL,
  sender_org text,
  sender_email text,
  licensee_id uuid REFERENCES public.licensees(id) ON DELETE SET NULL,
  regulator_id uuid,
  assigned_unit text,
  assigned_officer text,
  assigned_officer_id uuid,
  received_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  sla_days integer NOT NULL DEFAULT 5,
  responded_at timestamptz,
  closed_at timestamptz,
  retention_years integer NOT NULL DEFAULT 7,
  retention_expires_at timestamptz,
  tags text[] NOT NULL DEFAULT '{}',
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT correspondence_threads_status_chk CHECK (status IN ('received','classified','assigned','in_review','approved','responded','closed')),
  CONSTRAINT correspondence_threads_priority_chk CHECK (priority IN ('low','normal','high','urgent')),
  CONSTRAINT correspondence_threads_channel_chk CHECK (channel IN ('email','letter','portal','fax','sms')),
  CONSTRAINT correspondence_threads_direction_chk CHECK (direction IN ('inbound','outbound'))
);

CREATE INDEX IF NOT EXISTS idx_corr_threads_status ON public.correspondence_threads(status);
CREATE INDEX IF NOT EXISTS idx_corr_threads_licensee ON public.correspondence_threads(licensee_id);
CREATE INDEX IF NOT EXISTS idx_corr_threads_received ON public.correspondence_threads(received_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.correspondence_threads TO authenticated;
GRANT ALL ON public.correspondence_threads TO service_role;
ALTER TABLE public.correspondence_threads ENABLE ROW LEVEL SECURITY;

-- ============ messages ============
CREATE TABLE IF NOT EXISTS public.correspondence_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.correspondence_threads(id) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT 'inbound',
  channel text NOT NULL DEFAULT 'portal',
  subject text,
  body text NOT NULL,
  is_internal_note boolean NOT NULL DEFAULT false,
  author_id uuid,
  author_name text,
  author_role text,
  dispatch_id uuid REFERENCES public.correspondence_dispatches(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT correspondence_messages_direction_chk CHECK (direction IN ('inbound','outbound'))
);
CREATE INDEX IF NOT EXISTS idx_corr_messages_thread ON public.correspondence_messages(thread_id, sent_at);

GRANT SELECT, INSERT ON public.correspondence_messages TO authenticated;
GRANT ALL ON public.correspondence_messages TO service_role;
ALTER TABLE public.correspondence_messages ENABLE ROW LEVEL SECURITY;

-- ============ attachments ============
CREATE TABLE IF NOT EXISTS public.correspondence_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.correspondence_threads(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.correspondence_messages(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  size_kb integer NOT NULL DEFAULT 0,
  content_type text,
  version integer NOT NULL DEFAULT 1,
  uploaded_by uuid,
  uploaded_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_corr_attachments_thread ON public.correspondence_attachments(thread_id);

GRANT SELECT, INSERT ON public.correspondence_attachments TO authenticated;
GRANT ALL ON public.correspondence_attachments TO service_role;
ALTER TABLE public.correspondence_attachments ENABLE ROW LEVEL SECURITY;

-- ============ events (audit trail) ============
CREATE TABLE IF NOT EXISTS public.correspondence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.correspondence_threads(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_name text,
  actor_role text,
  action text NOT NULL,
  detail text,
  visible_to_licensee boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_corr_events_thread ON public.correspondence_events(thread_id, created_at);

GRANT SELECT ON public.correspondence_events TO authenticated;
GRANT ALL ON public.correspondence_events TO service_role;
ALTER TABLE public.correspondence_events ENABLE ROW LEVEL SECURITY;

-- ============ routing rules ============
CREATE TABLE IF NOT EXISTS public.correspondence_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  match_type text NOT NULL DEFAULT 'category',
  match_value text NOT NULL,
  assign_unit text NOT NULL,
  assign_officer text,
  priority text NOT NULL DEFAULT 'normal',
  sla_days integer NOT NULL DEFAULT 5,
  allow_manual_override boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT corr_rule_match_type_chk CHECK (match_type IN ('category','institution','subject','priority','channel'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.correspondence_routing_rules TO authenticated;
GRANT ALL ON public.correspondence_routing_rules TO service_role;
ALTER TABLE public.correspondence_routing_rules ENABLE ROW LEVEL SECURITY;

-- ============ visibility helper ============
CREATE OR REPLACE FUNCTION public.correspondence_thread_visible(_thread_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.correspondence_threads t
    WHERE t.id = _thread_id
      AND (
        public.is_internal_staff(_user_id)
        OR (t.licensee_id IS NOT NULL AND t.licensee_id = public.user_licensee_id(_user_id))
        OR t.created_by = _user_id
      )
  );
$$;

-- ============ policies ============
DROP POLICY IF EXISTS "corr_threads_read" ON public.correspondence_threads;
CREATE POLICY "corr_threads_read" ON public.correspondence_threads FOR SELECT TO authenticated
USING (
  public.is_internal_staff(auth.uid())
  OR (licensee_id IS NOT NULL AND licensee_id = public.user_licensee_id(auth.uid()))
  OR created_by = auth.uid()
);

DROP POLICY IF EXISTS "corr_threads_staff_write" ON public.correspondence_threads;
CREATE POLICY "corr_threads_staff_write" ON public.correspondence_threads FOR UPDATE TO authenticated
USING (public.is_internal_staff(auth.uid()))
WITH CHECK (public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS "corr_threads_insert" ON public.correspondence_threads;
CREATE POLICY "corr_threads_insert" ON public.correspondence_threads FOR INSERT TO authenticated
WITH CHECK (
  public.is_internal_staff(auth.uid())
  OR (licensee_id IS NOT NULL AND licensee_id = public.user_licensee_id(auth.uid()))
);

DROP POLICY IF EXISTS "corr_messages_read" ON public.correspondence_messages;
CREATE POLICY "corr_messages_read" ON public.correspondence_messages FOR SELECT TO authenticated
USING (
  public.correspondence_thread_visible(thread_id, auth.uid())
  AND (is_internal_note = false OR public.is_internal_staff(auth.uid()))
);

DROP POLICY IF EXISTS "corr_messages_insert" ON public.correspondence_messages;
CREATE POLICY "corr_messages_insert" ON public.correspondence_messages FOR INSERT TO authenticated
WITH CHECK (
  public.correspondence_thread_visible(thread_id, auth.uid())
  AND (is_internal_note = false OR public.is_internal_staff(auth.uid()))
);

DROP POLICY IF EXISTS "corr_attachments_read" ON public.correspondence_attachments;
CREATE POLICY "corr_attachments_read" ON public.correspondence_attachments FOR SELECT TO authenticated
USING (public.correspondence_thread_visible(thread_id, auth.uid()));

DROP POLICY IF EXISTS "corr_attachments_insert" ON public.correspondence_attachments;
CREATE POLICY "corr_attachments_insert" ON public.correspondence_attachments FOR INSERT TO authenticated
WITH CHECK (public.correspondence_thread_visible(thread_id, auth.uid()));

DROP POLICY IF EXISTS "corr_events_read" ON public.correspondence_events;
CREATE POLICY "corr_events_read" ON public.correspondence_events FOR SELECT TO authenticated
USING (
  public.correspondence_thread_visible(thread_id, auth.uid())
  AND (visible_to_licensee = true OR public.is_internal_staff(auth.uid()))
);

DROP POLICY IF EXISTS "corr_rules_read" ON public.correspondence_routing_rules;
CREATE POLICY "corr_rules_read" ON public.correspondence_routing_rules FOR SELECT TO authenticated
USING (public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS "corr_rules_manage" ON public.correspondence_routing_rules;
CREATE POLICY "corr_rules_manage" ON public.correspondence_routing_rules FOR ALL TO authenticated
USING (public.is_internal_staff(auth.uid()) AND public.has_permission(auth.uid(), 'settings', 'edit'))
WITH CHECK (public.is_internal_staff(auth.uid()) AND public.has_permission(auth.uid(), 'settings', 'edit'));

-- ============ updated_at triggers ============
CREATE OR REPLACE FUNCTION public._touch_correspondence_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_touch_corr_threads ON public.correspondence_threads;
CREATE TRIGGER trg_touch_corr_threads BEFORE UPDATE ON public.correspondence_threads
FOR EACH ROW EXECUTE FUNCTION public._touch_correspondence_updated_at();

DROP TRIGGER IF EXISTS trg_touch_corr_rules ON public.correspondence_routing_rules;
CREATE TRIGGER trg_touch_corr_rules BEFORE UPDATE ON public.correspondence_routing_rules
FOR EACH ROW EXECUTE FUNCTION public._touch_correspondence_updated_at();

-- ============ actor label helper ============
CREATE OR REPLACE FUNCTION public.correspondence_actor_label(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(NULLIF(TRIM(p.full_name), ''), p.email, 'System')
  FROM public.profiles p WHERE p.id = _user_id;
$$;

-- ============ RPCs ============
CREATE OR REPLACE FUNCTION public.create_correspondence_thread(
  _subject text,
  _summary text,
  _sender_name text,
  _sender_org text DEFAULT NULL,
  _sender_email text DEFAULT NULL,
  _channel text DEFAULT 'email',
  _category text DEFAULT 'General',
  _priority text DEFAULT NULL,
  _licensee_id uuid DEFAULT NULL,
  _tags text[] DEFAULT '{}',
  _body text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_staff boolean;
  v_licensee uuid := _licensee_id;
  v_rule public.correspondence_routing_rules%ROWTYPE;
  v_priority text := COALESCE(_priority, 'normal');
  v_sla integer := 5;
  v_id uuid;
  v_actor text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  v_staff := public.is_internal_staff(v_user);
  IF NOT v_staff THEN
    v_licensee := public.user_licensee_id(v_user);
    IF v_licensee IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
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
    assigned_unit, assigned_officer, status, created_by
  ) VALUES (
    _subject, _summary, _sender_name, _sender_org, _sender_email, _channel, _category,
    v_priority, v_licensee, COALESCE(_tags, '{}'), v_sla, now() + (v_sla || ' days')::interval,
    now() + interval '7 years',
    v_rule.assign_unit, v_rule.assign_officer,
    CASE WHEN v_rule.id IS NOT NULL THEN 'assigned' ELSE 'received' END,
    v_user
  ) RETURNING id INTO v_id;

  INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail)
  VALUES (v_id, v_user, v_actor, CASE WHEN v_staff THEN 'Staff' ELSE 'Licensee' END,
          'Correspondence received', 'Channel: ' || _channel);

  IF v_rule.id IS NOT NULL THEN
    INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail)
    VALUES (v_id, v_user, 'Routing Engine', 'System', 'Routed automatically',
            v_rule.assign_unit || COALESCE(' -> ' || v_rule.assign_officer, '') || ' (rule: ' || v_rule.name || ')');
  END IF;

  IF _body IS NOT NULL AND length(TRIM(_body)) > 0 THEN
    INSERT INTO public.correspondence_messages (thread_id, direction, channel, subject, body, author_id, author_name, author_role)
    VALUES (v_id, 'inbound', _channel, _subject, _body, v_user, COALESCE(_sender_name, v_actor),
            CASE WHEN v_staff THEN 'Staff' ELSE 'Licensee' END);
  END IF;

  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.post_correspondence_message(
  _thread_id uuid,
  _body text,
  _is_internal_note boolean DEFAULT false,
  _channel text DEFAULT 'portal',
  _subject text DEFAULT NULL,
  _dispatch_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_staff boolean;
  v_id uuid;
  v_actor text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.correspondence_thread_visible(_thread_id, v_user) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_staff := public.is_internal_staff(v_user);
  IF _is_internal_note AND NOT v_staff THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_actor := public.correspondence_actor_label(v_user);

  INSERT INTO public.correspondence_messages (thread_id, direction, channel, subject, body, is_internal_note, author_id, author_name, author_role, dispatch_id)
  VALUES (_thread_id, CASE WHEN v_staff THEN 'outbound' ELSE 'inbound' END, _channel, _subject, _body, _is_internal_note,
          v_user, v_actor, CASE WHEN v_staff THEN 'Staff' ELSE 'Licensee' END, _dispatch_id)
  RETURNING id INTO v_id;

  INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail, visible_to_licensee)
  VALUES (_thread_id, v_user, v_actor, CASE WHEN v_staff THEN 'Staff' ELSE 'Licensee' END,
          CASE WHEN _is_internal_note THEN 'Internal note added'
               WHEN v_staff THEN 'Response sent' ELSE 'Reply received from licensee' END,
          'Channel: ' || _channel, NOT _is_internal_note);

  IF _is_internal_note = false THEN
    IF v_staff THEN
      UPDATE public.correspondence_threads
        SET status = CASE WHEN status IN ('closed') THEN status ELSE 'responded' END,
            responded_at = COALESCE(responded_at, now())
      WHERE id = _thread_id;
    ELSE
      UPDATE public.correspondence_threads
        SET status = CASE WHEN status IN ('responded','closed') THEN 'in_review' ELSE status END,
            due_at = COALESCE(due_at, now() + (sla_days || ' days')::interval)
      WHERE id = _thread_id;
    END IF;
  END IF;

  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.classify_correspondence(
  _thread_id uuid, _category text, _priority text, _tags text[] DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_actor text;
BEGIN
  IF NOT public.is_internal_staff(v_user) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_actor := public.correspondence_actor_label(v_user);
  UPDATE public.correspondence_threads
  SET category = _category, priority = _priority,
      tags = COALESCE(_tags, tags),
      status = CASE WHEN status = 'received' THEN 'classified' ELSE status END
  WHERE id = _thread_id;
  INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail)
  VALUES (_thread_id, v_user, v_actor, 'Staff', 'Classified', _category || ' / priority ' || _priority);
END; $$;

CREATE OR REPLACE FUNCTION public.assign_correspondence(
  _thread_id uuid, _unit text, _officer text DEFAULT NULL, _officer_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_actor text;
BEGIN
  IF NOT public.is_internal_staff(v_user) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_actor := public.correspondence_actor_label(v_user);
  UPDATE public.correspondence_threads
  SET assigned_unit = _unit, assigned_officer = _officer, assigned_officer_id = _officer_id,
      status = CASE WHEN status IN ('received','classified') THEN 'assigned' ELSE status END
  WHERE id = _thread_id;
  INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail)
  VALUES (_thread_id, v_user, v_actor, 'Staff', 'Assigned', _unit || COALESCE(' -> ' || _officer, ''));
END; $$;

CREATE OR REPLACE FUNCTION public.record_correspondence_review(
  _thread_id uuid, _decision text, _notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_actor text; v_status text;
BEGIN
  IF NOT public.is_internal_staff(v_user) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _decision NOT IN ('start_review','approve','reject') THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  v_actor := public.correspondence_actor_label(v_user);
  v_status := CASE _decision WHEN 'start_review' THEN 'in_review' WHEN 'approve' THEN 'approved' ELSE 'in_review' END;
  UPDATE public.correspondence_threads SET status = v_status WHERE id = _thread_id;
  INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail)
  VALUES (_thread_id, v_user, v_actor, 'Staff',
          CASE _decision WHEN 'start_review' THEN 'Moved to In Review' WHEN 'approve' THEN 'Response approved' ELSE 'Sent back for revision' END,
          _notes);
END; $$;

CREATE OR REPLACE FUNCTION public.close_correspondence(_thread_id uuid, _notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_actor text;
BEGIN
  IF NOT public.is_internal_staff(v_user) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_actor := public.correspondence_actor_label(v_user);
  UPDATE public.correspondence_threads SET status = 'closed', closed_at = now() WHERE id = _thread_id;
  INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail)
  VALUES (_thread_id, v_user, v_actor, 'Staff', 'Correspondence closed', _notes);
END; $$;

CREATE OR REPLACE FUNCTION public.add_correspondence_attachment(
  _thread_id uuid, _file_name text, _storage_path text, _size_kb integer,
  _content_type text DEFAULT NULL, _message_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_actor text; v_version integer; v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.correspondence_thread_visible(_thread_id, v_user) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_actor := public.correspondence_actor_label(v_user);
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM public.correspondence_attachments WHERE thread_id = _thread_id AND file_name = _file_name;

  INSERT INTO public.correspondence_attachments (thread_id, message_id, file_name, storage_path, size_kb, content_type, version, uploaded_by, uploaded_by_name)
  VALUES (_thread_id, _message_id, _file_name, _storage_path, COALESCE(_size_kb,0), _content_type, v_version, v_user, v_actor)
  RETURNING id INTO v_id;

  INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail)
  VALUES (_thread_id, v_user, v_actor, CASE WHEN public.is_internal_staff(v_user) THEN 'Staff' ELSE 'Licensee' END,
          'Attachment uploaded', _file_name || ' (v' || v_version || ')');
  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.create_correspondence_thread(text,text,text,text,text,text,text,text,uuid,text[],text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_correspondence_message(uuid,text,boolean,text,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.classify_correspondence(uuid,text,text,text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_correspondence(uuid,text,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_correspondence_review(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_correspondence(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_correspondence_attachment(uuid,text,text,integer,text,uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_correspondence_thread(text,text,text,text,text,text,text,text,uuid,text[],text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_correspondence_message(uuid,text,boolean,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classify_correspondence(uuid,text,text,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_correspondence(uuid,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_correspondence_review(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_correspondence(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_correspondence_attachment(uuid,text,text,integer,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.correspondence_thread_visible(uuid,uuid) TO authenticated;
