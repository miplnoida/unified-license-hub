-- =====================================================================
-- NOT-THR-001 Phase 1 — Communication Thread Manager data model
-- =====================================================================

ALTER TABLE public.correspondence_threads
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS assigned_team text,
  ADD COLUMN IF NOT EXISTS sla_hours integer,
  ADD COLUMN IF NOT EXISTS sla_warned_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_breached_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_preview text,
  ADD COLUMN IF NOT EXISTS last_message_kind text,
  ADD COLUMN IF NOT EXISTS reopened_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closed_by uuid;

ALTER TABLE public.correspondence_messages
  ADD COLUMN IF NOT EXISTS linked_document_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS body_format text NOT NULL DEFAULT 'plain',
  ADD COLUMN IF NOT EXISTS sent_by_system boolean NOT NULL DEFAULT false;

ALTER TABLE public.correspondence_thread_participants
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------
-- Module classification
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.correspondence_module_for(_source_type text, _category text, _thread_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _thread_type = 'internal_discussion' THEN 'internal'
    WHEN lower(COALESCE(_source_type,'')) IN ('application','applications','registration','licence','license','appeal') THEN 'licensing'
    WHEN lower(COALESCE(_source_type,'')) IN ('complaint','complaints') THEN 'complaints'
    WHEN lower(COALESCE(_source_type,'')) IN ('return','returns','compliance_return') THEN 'returns'
    WHEN lower(COALESCE(_source_type,'')) IN ('enforcement','enforcement_action','enforcement_case') THEN 'enforcement'
    WHEN lower(COALESCE(_source_type,'')) IN ('inspection','inspections') THEN 'inspections'
    WHEN lower(COALESCE(_source_type,'')) IN ('conduct','conduct_alert','market_conduct') THEN 'conduct'
    WHEN lower(COALESCE(_source_type,'')) IN ('rfi','application_rfi') THEN 'licensing'
    WHEN lower(COALESCE(_category,'')) = 'internal' THEN 'internal'
    WHEN lower(COALESCE(_category,'')) LIKE '%complaint%' THEN 'complaints'
    WHEN lower(COALESCE(_category,'')) LIKE '%return%' THEN 'returns'
    WHEN lower(COALESCE(_category,'')) LIKE '%licen%' THEN 'licensing'
    WHEN lower(COALESCE(_category,'')) LIKE '%enforce%' THEN 'enforcement'
    ELSE 'general'
  END;
$$;

UPDATE public.correspondence_threads
   SET module = public.correspondence_module_for(source_type, category, thread_type)
 WHERE module IS NULL;

ALTER TABLE public.correspondence_threads
  ALTER COLUMN module SET DEFAULT 'general';

UPDATE public.correspondence_threads t
   SET last_message_preview = sub.preview,
       last_message_kind = sub.message_kind
  FROM (
    SELECT m.thread_id,
           left(regexp_replace(m.body, '\s+', ' ', 'g'), 180) AS preview,
           m.message_kind,
           row_number() OVER (PARTITION BY m.thread_id ORDER BY m.sent_at DESC) rn
      FROM public.correspondence_messages m
     WHERE COALESCE(m.is_draft,false) = false
  ) sub
 WHERE sub.thread_id = t.id AND sub.rn = 1 AND t.last_message_preview IS NULL;

UPDATE public.correspondence_threads
   SET sla_hours = COALESCE(sla_hours, GREATEST(COALESCE(sla_days,5),1) * 24);

CREATE INDEX IF NOT EXISTS idx_corr_threads_module ON public.correspondence_threads (module);
CREATE INDEX IF NOT EXISTS idx_corr_threads_state ON public.correspondence_threads (thread_state);
CREATE INDEX IF NOT EXISTS idx_corr_threads_source ON public.correspondence_threads (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_corr_threads_last_msg ON public.correspondence_threads (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_corr_msgs_thread_sent ON public.correspondence_messages (thread_id, sent_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_corr_participant_user
  ON public.correspondence_thread_participants (thread_id, user_id) WHERE user_id IS NOT NULL;

UPDATE public.correspondence_thread_participants p
   SET is_internal = true
 WHERE p.user_id IS NOT NULL
   AND public.is_internal_staff(p.user_id)
   AND p.is_internal = false;

-- ---------------------------------------------------------------------
-- Preview / activity maintenance
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.correspondence_touch_thread_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.is_draft, false) = false THEN
    UPDATE public.correspondence_threads
       SET last_message_at = COALESCE(NEW.sent_at, now()),
           last_message_preview = left(regexp_replace(COALESCE(NEW.body,''), '\s+', ' ', 'g'), 180),
           last_message_kind = NEW.message_kind
     WHERE id = NEW.thread_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_corr_touch_activity ON public.correspondence_messages;
CREATE TRIGGER trg_corr_touch_activity
AFTER INSERT ON public.correspondence_messages
FOR EACH ROW EXECUTE FUNCTION public.correspondence_touch_thread_activity();

-- ---------------------------------------------------------------------
-- Immutable communication history + closed-thread lock
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.correspondence_guard_message_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_state text;
  v_privileged boolean;
BEGIN
  v_privileged := v_user IS NOT NULL
                  AND public.is_internal_staff(v_user)
                  AND public.has_permission(v_user, 'correspondence_management', 'approve');

  IF TG_OP = 'DELETE' THEN
    IF COALESCE(OLD.is_draft, false) = true AND OLD.author_id = v_user THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'communication_history_immutable' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Delivery bookkeeping columns may always change; content may not once sent.
    IF COALESCE(OLD.is_draft, false) = false THEN
      IF NEW.body IS DISTINCT FROM OLD.body
         OR NEW.subject IS DISTINCT FROM OLD.subject
         OR NEW.is_internal_note IS DISTINCT FROM OLD.is_internal_note
         OR NEW.message_kind IS DISTINCT FROM OLD.message_kind
         OR NEW.author_id IS DISTINCT FROM OLD.author_id
         OR NEW.thread_id IS DISTINCT FROM OLD.thread_id THEN
        RAISE EXCEPTION 'communication_history_immutable' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT
  SELECT thread_state INTO v_state FROM public.correspondence_threads WHERE id = NEW.thread_id;
  IF v_state = 'closed' AND NOT v_privileged THEN
    RAISE EXCEPTION 'thread_closed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_corr_guard_message_write ON public.correspondence_messages;
CREATE TRIGGER trg_corr_guard_message_write
BEFORE INSERT OR UPDATE OR DELETE ON public.correspondence_messages
FOR EACH ROW EXECUTE FUNCTION public.correspondence_guard_message_write();

CREATE OR REPLACE FUNCTION public.correspondence_guard_event_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'audit_trail_immutable' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_corr_guard_event_write ON public.correspondence_events;
CREATE TRIGGER trg_corr_guard_event_write
BEFORE UPDATE OR DELETE ON public.correspondence_events
FOR EACH ROW EXECUTE FUNCTION public.correspondence_guard_event_write();

-- ---------------------------------------------------------------------
-- Unread counts
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.correspondence_thread_unread_count(_thread_id uuid, _user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
    FROM public.correspondence_messages m
   WHERE m.thread_id = _thread_id
     AND COALESCE(m.is_draft, false) = false
     AND m.author_id IS DISTINCT FROM _user_id
     AND (m.is_internal_note = false OR public.is_internal_staff(_user_id))
     AND m.sent_at > COALESCE(
       (SELECT p.last_read_at FROM public.correspondence_thread_participants p
         WHERE p.thread_id = _thread_id AND p.user_id = _user_id),
       'epoch'::timestamptz);
$$;

-- Re-scope participant policies from PUBLIC to authenticated
DROP POLICY IF EXISTS corr_participants_read ON public.correspondence_thread_participants;
DROP POLICY IF EXISTS corr_participants_update ON public.correspondence_thread_participants;
DROP POLICY IF EXISTS corr_participants_write ON public.correspondence_thread_participants;

CREATE POLICY corr_participants_read ON public.correspondence_thread_participants
  FOR SELECT TO authenticated
  USING (public.correspondence_thread_visible(thread_id, auth.uid()));

CREATE POLICY corr_participants_update ON public.correspondence_thread_participants
  FOR UPDATE TO authenticated
  USING (public.correspondence_thread_visible(thread_id, auth.uid()))
  WITH CHECK (public.correspondence_thread_visible(thread_id, auth.uid()));

CREATE POLICY corr_participants_write ON public.correspondence_thread_participants
  FOR INSERT TO authenticated
  WITH CHECK (public.correspondence_thread_visible(thread_id, auth.uid()));

-- External users may never insert an internal message directly
DROP POLICY IF EXISTS corr_messages_insert ON public.correspondence_messages;
CREATE POLICY corr_messages_insert ON public.correspondence_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.correspondence_thread_visible(thread_id, auth.uid())
    AND (is_internal_note = false OR public.is_internal_staff(auth.uid()))
  );

GRANT SELECT, INSERT, UPDATE ON public.correspondence_thread_participants TO authenticated;
GRANT ALL ON public.correspondence_thread_participants TO service_role;
GRANT ALL ON public.correspondence_messages TO service_role;
GRANT ALL ON public.correspondence_threads TO service_role;
GRANT ALL ON public.correspondence_events TO service_role;