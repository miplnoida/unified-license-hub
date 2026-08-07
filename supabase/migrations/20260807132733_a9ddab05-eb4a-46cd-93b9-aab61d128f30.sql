-- =========================================================
-- Phase 7A: supervisory action record completion
-- =========================================================

CREATE SEQUENCE IF NOT EXISTS public.prudential_action_ref_seq;

ALTER TABLE public.prudential_actions
  ADD COLUMN IF NOT EXISTS action_reference text,
  ADD COLUMN IF NOT EXISTS evidence_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS progress_percent integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entity_owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS response_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS breach_after_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS breached_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Backfill references for pre-existing rows, then enforce.
UPDATE public.prudential_actions
   SET action_reference = 'PA-' || to_char(COALESCE(created_at, now()), 'YYYY') || '-' ||
       lpad(nextval('public.prudential_action_ref_seq')::text, 6, '0')
 WHERE action_reference IS NULL;

ALTER TABLE public.prudential_actions
  ALTER COLUMN action_reference SET DEFAULT
    ('PA-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.prudential_action_ref_seq')::text, 6, '0'));

ALTER TABLE public.prudential_actions ALTER COLUMN action_reference SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS prudential_actions_action_reference_key
  ON public.prudential_actions (action_reference);

ALTER TABLE public.prudential_actions
  DROP CONSTRAINT IF EXISTS prudential_actions_status_check;
ALTER TABLE public.prudential_actions
  ADD CONSTRAINT prudential_actions_status_check CHECK (status = ANY (ARRAY[
    'open','in_progress','awaiting_evidence','awaiting_review',
    'completed','overdue','breached','waived','cancelled']));

ALTER TABLE public.prudential_actions
  DROP CONSTRAINT IF EXISTS prudential_actions_review_status_check;
ALTER TABLE public.prudential_actions
  ADD CONSTRAINT prudential_actions_review_status_check CHECK (review_status = ANY (ARRAY[
    'not_required','awaiting_review','accepted','rejected']));

ALTER TABLE public.prudential_actions
  DROP CONSTRAINT IF EXISTS prudential_actions_progress_check;
ALTER TABLE public.prudential_actions
  ADD CONSTRAINT prudential_actions_progress_check
  CHECK (progress_percent >= 0 AND progress_percent <= 100);

-- ---------------------------------------------------------
-- Responses / reviews (add-only evidence trail)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prudential_action_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.prudential_actions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('entity_response','supervisor_review')),
  narrative text,
  evidence_document_ids uuid[] NOT NULL DEFAULT '{}',
  decision text CHECK (decision IS NULL OR decision IN ('accepted','rejected')),
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.prudential_action_responses TO authenticated;
GRANT ALL ON public.prudential_action_responses TO service_role;
ALTER TABLE public.prudential_action_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "par_read" ON public.prudential_action_responses
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.prudential_actions a
   WHERE a.id = action_id
     AND (
       public.can_read_prudential_entity(auth.uid(), a.entity_id)
       OR a.entity_owner_user_id = auth.uid()
       OR EXISTS (SELECT 1 FROM public.entity_user_access eua
                   WHERE eua.entity_id = a.entity_id AND eua.user_id = auth.uid())
       OR EXISTS (SELECT 1 FROM public.profiles p
                   WHERE p.id = auth.uid() AND p.licensee_id = a.entity_id)
     )
));

DROP TRIGGER IF EXISTS trg_par_append_only ON public.prudential_action_responses;
CREATE TRIGGER trg_par_append_only
BEFORE UPDATE OR DELETE ON public.prudential_action_responses
FOR EACH ROW EXECUTE FUNCTION public.prudential_appendonly_guard();

-- ---------------------------------------------------------
-- Lifecycle events (append-only)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prudential_action_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.prudential_actions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.prudential_action_events TO authenticated;
GRANT ALL ON public.prudential_action_events TO service_role;
ALTER TABLE public.prudential_action_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pae_read" ON public.prudential_action_events
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.prudential_actions a
   WHERE a.id = action_id
     AND (
       public.can_read_prudential_entity(auth.uid(), a.entity_id)
       OR a.entity_owner_user_id = auth.uid()
       OR EXISTS (SELECT 1 FROM public.entity_user_access eua
                   WHERE eua.entity_id = a.entity_id AND eua.user_id = auth.uid())
       OR EXISTS (SELECT 1 FROM public.profiles p
                   WHERE p.id = auth.uid() AND p.licensee_id = a.entity_id)
     )
));

DROP TRIGGER IF EXISTS trg_pae_append_only ON public.prudential_action_events;
CREATE TRIGGER trg_pae_append_only
BEFORE UPDATE OR DELETE ON public.prudential_action_events
FOR EACH ROW EXECUTE FUNCTION public.prudential_appendonly_guard();

CREATE INDEX IF NOT EXISTS prudential_action_events_action_idx
  ON public.prudential_action_events (action_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prudential_action_responses_action_idx
  ON public.prudential_action_responses (action_id, submitted_at DESC);

-- Every status change is logged, whoever performs it.
CREATE OR REPLACE FUNCTION public.tg_prudential_action_log_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.prudential_action_events(action_id, event_type, from_status, to_status, actor_id, reason)
    VALUES (NEW.id, 'created', NULL, NEW.status, COALESCE(auth.uid(), NEW.created_by), NULL);
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.prudential_action_events(action_id, event_type, from_status, to_status, actor_id, reason)
    VALUES (NEW.id, 'status_changed', OLD.status, NEW.status, auth.uid(),
            COALESCE(NEW.completion_notes, NEW.waiver_reason, NEW.cancellation_reason, NEW.review_notes));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prudential_action_log_status ON public.prudential_actions;
CREATE TRIGGER trg_prudential_action_log_status
AFTER INSERT OR UPDATE ON public.prudential_actions
FOR EACH ROW EXECUTE FUNCTION public.tg_prudential_action_log_status();

-- ---------------------------------------------------------
-- Helper: is the caller a user of the regulated entity?
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_prudential_action_entity_user(_user uuid, _action_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.prudential_actions a
     WHERE a.id = _action_id
       AND (
         a.entity_owner_user_id = _user
         OR EXISTS (SELECT 1 FROM public.entity_user_access eua
                     WHERE eua.entity_id = a.entity_id AND eua.user_id = _user)
         OR EXISTS (SELECT 1 FROM public.profiles p
                     WHERE p.id = _user AND p.licensee_id = a.entity_id)
       )
  );
$$;

-- ---------------------------------------------------------
-- RPC: entity submits a response with evidence
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_prudential_action_response(
  _action_id uuid,
  _narrative text,
  _document_ids uuid[] DEFAULT '{}'::uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid();
        _a public.prudential_actions;
        _resp public.prudential_action_responses;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHENTICATED');
  END IF;
  SELECT * INTO _a FROM public.prudential_actions WHERE id = _action_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Action not found','code','NOT_FOUND');
  END IF;
  IF NOT public.is_prudential_action_entity_user(_uid, _action_id) THEN
    RETURN jsonb_build_object('error','Only users of the regulated entity may respond to this action','code','FORBIDDEN');
  END IF;
  IF _a.status IN ('completed','waived','cancelled') THEN
    RETURN jsonb_build_object('error','Action is closed','code','CLOSED');
  END IF;
  IF _narrative IS NULL OR length(trim(_narrative)) < 5 THEN
    RETURN jsonb_build_object('error','A response narrative of at least 5 characters is required','code','VALIDATION');
  END IF;
  IF _a.evidence_required AND COALESCE(array_length(_document_ids,1),0) = 0 THEN
    RETURN jsonb_build_object('error','This action requires supporting evidence documents','code','EVIDENCE_REQUIRED');
  END IF;

  INSERT INTO public.prudential_action_responses(action_id, kind, narrative, evidence_document_ids, submitted_by)
  VALUES (_action_id, 'entity_response', trim(_narrative), COALESCE(_document_ids,'{}'::uuid[]), _uid)
  RETURNING * INTO _resp;

  UPDATE public.prudential_actions
     SET status = 'awaiting_review',
         review_status = 'awaiting_review',
         review_notes = NULL,
         reviewed_by = NULL,
         reviewed_at = NULL,
         updated_at = now()
   WHERE id = _action_id;

  INSERT INTO public.prudential_action_events(action_id, event_type, from_status, to_status, actor_id, reason, metadata)
  VALUES (_action_id, 'entity_response_submitted', _a.status, 'awaiting_review', _uid, NULL,
          jsonb_build_object('response_id', _resp.id, 'document_count', COALESCE(array_length(_document_ids,1),0)));

  RETURN jsonb_build_object('ok', true, 'response_id', _resp.id);
END $$;

REVOKE ALL ON FUNCTION public.submit_prudential_action_response(uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_prudential_action_response(uuid, text, uuid[]) TO authenticated;

-- ---------------------------------------------------------
-- RPC: supervisor reviews the latest response
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_prudential_action_response(
  _action_id uuid,
  _decision text,
  _notes text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid();
        _a public.prudential_actions;
        _has_resp boolean;
        _new_status text;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHENTICATED');
  END IF;
  IF _decision NOT IN ('accepted','rejected') THEN
    RETURN jsonb_build_object('error','Decision must be accepted or rejected','code','VALIDATION');
  END IF;
  IF _notes IS NULL OR length(trim(_notes)) < 5 THEN
    RETURN jsonb_build_object('error','Review notes of at least 5 characters are required','code','VALIDATION');
  END IF;
  SELECT * INTO _a FROM public.prudential_actions WHERE id = _action_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Action not found','code','NOT_FOUND');
  END IF;
  IF NOT (public.is_super_admin(_uid)
          OR public.has_permission(_uid,'prudential_supervision','workflow_action')
          OR public.has_permission(_uid,'prudential_supervision','edit')) THEN
    RETURN jsonb_build_object('error','You are not permitted to review supervisory actions','code','FORBIDDEN');
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.prudential_action_responses r
                  WHERE r.action_id = _action_id AND r.kind = 'entity_response') INTO _has_resp;
  IF NOT _has_resp THEN
    RETURN jsonb_build_object('error','There is no entity response to review','code','NO_RESPONSE');
  END IF;

  _new_status := CASE WHEN _decision = 'accepted' THEN 'completed' ELSE 'in_progress' END;

  INSERT INTO public.prudential_action_responses(action_id, kind, narrative, decision, submitted_by)
  VALUES (_action_id, 'supervisor_review', trim(_notes), _decision, _uid);

  UPDATE public.prudential_actions
     SET review_status = _decision,
         review_notes = trim(_notes),
         reviewed_by = _uid,
         reviewed_at = now(),
         status = _new_status,
         completion_notes = CASE WHEN _decision = 'accepted' THEN trim(_notes) ELSE completion_notes END,
         closed_at = CASE WHEN _decision = 'accepted' THEN now() ELSE closed_at END,
         closed_by = CASE WHEN _decision = 'accepted' THEN _uid ELSE closed_by END,
         progress_percent = CASE WHEN _decision = 'accepted' THEN 100 ELSE progress_percent END,
         updated_at = now()
   WHERE id = _action_id;

  INSERT INTO public.prudential_action_events(action_id, event_type, from_status, to_status, actor_id, reason)
  VALUES (_action_id, 'supervisor_review_' || _decision, _a.status, _new_status, _uid, trim(_notes));

  RETURN jsonb_build_object('ok', true, 'status', _new_status, 'review_status', _decision);
END $$;

REVOKE ALL ON FUNCTION public.review_prudential_action_response(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_prudential_action_response(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------
-- RPC: closure gate
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_prudential_action(
  _action_id uuid,
  _kind text,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid();
        _a public.prudential_actions;
        _accepted boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHENTICATED');
  END IF;
  IF _kind NOT IN ('completed','waived','cancelled') THEN
    RETURN jsonb_build_object('error','Invalid closure type','code','VALIDATION');
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RETURN jsonb_build_object('error','A reason of at least 5 characters is required','code','VALIDATION');
  END IF;
  SELECT * INTO _a FROM public.prudential_actions WHERE id = _action_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Action not found','code','NOT_FOUND');
  END IF;
  IF NOT (public.is_super_admin(_uid) OR public.can_act_on_prudential(_uid)) THEN
    RETURN jsonb_build_object('error','You are not permitted to close supervisory actions','code','FORBIDDEN');
  END IF;

  IF _kind = 'completed' AND _a.evidence_required THEN
    SELECT EXISTS (SELECT 1 FROM public.prudential_action_responses r
                    WHERE r.action_id = _action_id AND r.kind = 'supervisor_review' AND r.decision = 'accepted')
      INTO _accepted;
    IF NOT _accepted THEN
      RETURN jsonb_build_object(
        'error','This action requires evidence that has been reviewed and accepted before it can be completed',
        'code','EVIDENCE_NOT_ACCEPTED');
    END IF;
  END IF;

  UPDATE public.prudential_actions
     SET status = _kind,
         completion_notes = CASE WHEN _kind = 'completed' THEN trim(_reason) ELSE completion_notes END,
         waiver_reason   = CASE WHEN _kind = 'waived' THEN trim(_reason) ELSE waiver_reason END,
         cancellation_reason = CASE WHEN _kind = 'cancelled' THEN trim(_reason) ELSE cancellation_reason END,
         progress_percent = CASE WHEN _kind = 'completed' THEN 100 ELSE progress_percent END,
         closed_at = now(), closed_by = _uid, updated_at = now()
   WHERE id = _action_id;

  INSERT INTO public.prudential_action_events(action_id, event_type, from_status, to_status, actor_id, reason)
  VALUES (_action_id, 'closed', _a.status, _kind, _uid, trim(_reason));

  RETURN jsonb_build_object('ok', true, 'status', _kind);
END $$;

REVOKE ALL ON FUNCTION public.close_prudential_action(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_prudential_action(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------
-- Breach sweep (reuses the existing escalation table)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_prudential_actions_breached()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _n integer := 0; _r record;
BEGIN
  FOR _r IN
    SELECT * FROM public.prudential_actions
     WHERE status IN ('open','in_progress','overdue','awaiting_evidence')
       AND due_date IS NOT NULL
       AND due_date < (CURRENT_DATE - COALESCE(breach_after_days,7))
  LOOP
    UPDATE public.prudential_actions
       SET status = 'breached', breached_at = now(), updated_at = now()
     WHERE id = _r.id;

    INSERT INTO public.prudential_action_events(action_id, event_type, from_status, to_status, reason, actor_id)
    VALUES (_r.id, 'breached', _r.status, 'breached', 'Automated breach sweep: due date exceeded by breach window', NULL);

    IF NOT EXISTS (
      SELECT 1 FROM public.prudential_escalations e
       WHERE e.related_type = 'action' AND e.related_id = _r.id AND e.status IN ('open','under_review')
    ) THEN
      INSERT INTO public.prudential_escalations(entity_id, related_type, related_id, escalation_type, reason, status, priority, created_by)
      VALUES (_r.entity_id, 'action', _r.id, 'action_breach',
              'Supervisory action ' || _r.action_reference || ' breached its remediation deadline',
              'open', COALESCE(_r.severity,'high'), _r.created_by);
    END IF;
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;

REVOKE ALL ON FUNCTION public.mark_prudential_actions_breached() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_prudential_actions_breached() TO authenticated, service_role;

-- Keep the overdue sweep aware of the evidence states.
CREATE OR REPLACE FUNCTION public.mark_prudential_actions_overdue()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n INT;
BEGIN
  UPDATE public.prudential_actions
     SET status = 'overdue', updated_at = now()
   WHERE status IN ('open','in_progress','awaiting_evidence')
     AND due_date IS NOT NULL AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ---------------------------------------------------------
-- Phase 7B: monitoring buckets from real data
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prudential_action_monitor(
  _entity_id uuid DEFAULT NULL,
  _due_soon_days integer DEFAULT 7
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _rows jsonb;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHENTICATED');
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'due_date' NULLS LAST), '[]'::jsonb) INTO _rows
  FROM (
    SELECT jsonb_build_object(
             'id', a.id,
             'action_reference', a.action_reference,
             'entity_id', a.entity_id,
             'entity_name', l.name,
             'title', a.title,
             'action_type', a.action_type,
             'severity', a.severity,
             'status', a.status,
             'review_status', a.review_status,
             'evidence_required', a.evidence_required,
             'progress_percent', a.progress_percent,
             'due_date', a.due_date,
             'breached_at', a.breached_at,
             'source_type', a.source_type,
             'source_id', a.source_id,
             'assigned_to', a.assigned_to,
             'bucket', CASE
               WHEN a.status = 'breached' THEN 'breached'
               WHEN a.status = 'overdue' THEN 'overdue'
               WHEN a.status = 'awaiting_review' THEN 'awaiting_review'
               WHEN a.status = 'awaiting_evidence' THEN 'awaiting_evidence'
               WHEN a.status = 'completed' THEN 'completed'
               WHEN a.status IN ('open','in_progress') AND a.due_date IS NOT NULL
                    AND a.due_date <= (CURRENT_DATE + GREATEST(COALESCE(_due_soon_days,7),0))
                    AND a.due_date >= CURRENT_DATE THEN 'due_soon'
               WHEN a.status IN ('open','in_progress') THEN 'open'
               ELSE 'other' END
           ) AS x
      FROM public.prudential_actions a
      LEFT JOIN public.licensees l ON l.id = a.entity_id
     WHERE (_entity_id IS NULL OR a.entity_id = _entity_id)
       AND public.can_read_prudential_entity(_uid, a.entity_id)
  ) s;

  RETURN jsonb_build_object(
    'rows', _rows,
    'counts', (
      SELECT COALESCE(jsonb_object_agg(bucket, c), '{}'::jsonb)
        FROM (SELECT r->>'bucket' AS bucket, count(*) AS c
                FROM jsonb_array_elements(_rows) r GROUP BY 1) g
    ),
    'generated_at', now()
  );
END $$;

REVOKE ALL ON FUNCTION public.prudential_action_monitor(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prudential_action_monitor(uuid, integer) TO authenticated;