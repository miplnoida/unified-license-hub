
-- ============================================================
-- Complaint RFI (Request for Information) workbench
-- ============================================================

CREATE TABLE public.complaint_rfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  licensee_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  raised_by uuid,
  raised_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  summary text,
  status text NOT NULL DEFAULT 'open',
  submitted_at timestamptz,
  submitted_by uuid,
  closure_notes text,
  closed_by uuid,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT complaint_rfis_status_chk CHECK (status IN ('open','submitted','closed','cancelled'))
);

CREATE TABLE public.complaint_rfi_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfi_id uuid NOT NULL REFERENCES public.complaint_rfis(id) ON DELETE CASCADE,
  ordinal integer NOT NULL DEFAULT 1,
  prompt text NOT NULL,
  question_type text NOT NULL DEFAULT 'text',
  required boolean NOT NULL DEFAULT true,
  response_status text NOT NULL DEFAULT 'pending',
  returned_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT complaint_rfi_items_type_chk CHECK (question_type IN ('text','document','both')),
  CONSTRAINT complaint_rfi_items_status_chk CHECK (response_status IN ('pending','draft','responded','returned'))
);

CREATE TABLE public.complaint_rfi_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfi_item_id uuid NOT NULL REFERENCES public.complaint_rfi_items(id) ON DELETE CASCADE,
  response_text text,
  file_upload_ids uuid[] NOT NULL DEFAULT '{}',
  is_draft boolean NOT NULL DEFAULT true,
  submitted_by uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_complaint_rfis_complaint ON public.complaint_rfis(complaint_id);
CREATE INDEX idx_complaint_rfis_licensee ON public.complaint_rfis(licensee_id, status);
CREATE INDEX idx_complaint_rfi_items_rfi ON public.complaint_rfi_items(rfi_id, ordinal);
CREATE INDEX idx_complaint_rfi_responses_item ON public.complaint_rfi_responses(rfi_item_id);
CREATE UNIQUE INDEX idx_complaint_rfi_item_draft ON public.complaint_rfi_responses(rfi_item_id) WHERE is_draft;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_rfis TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_rfi_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_rfi_responses TO authenticated;
GRANT ALL ON public.complaint_rfis TO service_role;
GRANT ALL ON public.complaint_rfi_items TO service_role;
GRANT ALL ON public.complaint_rfi_responses TO service_role;

CREATE TRIGGER trg_complaint_rfis_updated BEFORE UPDATE ON public.complaint_rfis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_complaint_rfi_items_updated BEFORE UPDATE ON public.complaint_rfi_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_complaint_rfi_responses_updated BEFORE UPDATE ON public.complaint_rfi_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- access helpers ----------

CREATE OR REPLACE FUNCTION public.can_view_complaint_rfi(_rfi_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.complaint_rfis r
    WHERE r.id = _rfi_id
      AND (
        public.is_super_admin(auth.uid())
        OR public.has_complaint_perm(auth.uid(), 'view')
        OR public.can_current_user_access_licensee(r.licensee_id, NULL)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_complaint_rfi_entity_user(_rfi_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.complaint_rfis r
    WHERE r.id = _rfi_id
      AND public.can_current_user_access_licensee(r.licensee_id, NULL)
  );
$$;

ALTER TABLE public.complaint_rfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_rfi_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_rfi_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal read complaint rfis" ON public.complaint_rfis
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(), 'view'));

CREATE POLICY "Entity read own complaint rfis" ON public.complaint_rfis
  FOR SELECT TO authenticated
  USING (public.can_current_user_access_licensee(licensee_id, NULL));

CREATE POLICY "Internal read complaint rfi items" ON public.complaint_rfi_items
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(), 'view'));

CREATE POLICY "Entity read own complaint rfi items" ON public.complaint_rfi_items
  FOR SELECT TO authenticated
  USING (public.is_complaint_rfi_entity_user(rfi_id));

-- Internal staff can only read SUBMITTED responses (drafts stay private).
CREATE POLICY "Internal read submitted complaint rfi responses" ON public.complaint_rfi_responses
  FOR SELECT TO authenticated
  USING (
    is_draft = false
    AND (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(), 'view'))
  );

CREATE POLICY "Entity read own complaint rfi responses" ON public.complaint_rfi_responses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.complaint_rfi_items i
      WHERE i.id = rfi_item_id AND public.is_complaint_rfi_entity_user(i.rfi_id)
    )
  );

-- Writes go exclusively through the RPCs below (SECURITY DEFINER); no direct
-- INSERT/UPDATE/DELETE policies are granted.

-- ---------- RPCs ----------

CREATE OR REPLACE FUNCTION public.complaint_rfi_raise(
  p_complaint_id uuid,
  p_summary text,
  p_due_at timestamptz,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_licensee uuid;
  v_rfi uuid;
  v_item jsonb;
  v_ord integer := 0;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(), 'edit')) THEN
    RAISE EXCEPTION 'not_authorised_to_raise_complaint_rfi';
  END IF;

  SELECT licensee_id INTO v_licensee FROM public.complaints WHERE id = p_complaint_id;
  IF v_licensee IS NULL THEN
    RAISE EXCEPTION 'complaint_has_no_linked_entity';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'at_least_one_question_required';
  END IF;

  INSERT INTO public.complaint_rfis (complaint_id, licensee_id, raised_by, due_at, summary)
  VALUES (p_complaint_id, v_licensee, auth.uid(), p_due_at, NULLIF(btrim(coalesce(p_summary,'')), ''))
  RETURNING id INTO v_rfi;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_ord := v_ord + 1;
    IF btrim(coalesce(v_item->>'prompt','')) = '' THEN
      RAISE EXCEPTION 'question_prompt_required';
    END IF;
    INSERT INTO public.complaint_rfi_items (rfi_id, ordinal, prompt, question_type, required)
    VALUES (
      v_rfi,
      v_ord,
      btrim(v_item->>'prompt'),
      coalesce(NULLIF(v_item->>'question_type',''), 'text'),
      coalesce((v_item->>'required')::boolean, true)
    );
  END LOOP;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value, metadata)
  VALUES (auth.uid(), 'complaint.rfi_raised', 'complaint', p_complaint_id,
          jsonb_build_object('rfi_id', v_rfi, 'questions', v_ord, 'due_at', p_due_at),
          jsonb_build_object('licensee_id', v_licensee));

  RETURN v_rfi;
END;
$$;

CREATE OR REPLACE FUNCTION public.complaint_rfi_save_draft(
  p_item_id uuid,
  p_response_text text,
  p_file_upload_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfi uuid;
  v_status text;
  v_resp uuid;
BEGIN
  SELECT i.rfi_id, r.status INTO v_rfi, v_status
  FROM public.complaint_rfi_items i
  JOIN public.complaint_rfis r ON r.id = i.rfi_id
  WHERE i.id = p_item_id;

  IF v_rfi IS NULL THEN RAISE EXCEPTION 'rfi_item_not_found'; END IF;
  IF NOT public.is_complaint_rfi_entity_user(v_rfi) THEN
    RAISE EXCEPTION 'not_authorised_for_this_entity';
  END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'rfi_not_open'; END IF;
  IF EXISTS (SELECT 1 FROM public.complaint_rfi_items WHERE id = p_item_id AND response_status = 'responded') THEN
    RAISE EXCEPTION 'question_already_submitted';
  END IF;

  SELECT id INTO v_resp FROM public.complaint_rfi_responses
  WHERE rfi_item_id = p_item_id AND is_draft LIMIT 1;

  IF v_resp IS NULL THEN
    INSERT INTO public.complaint_rfi_responses (rfi_item_id, response_text, file_upload_ids, is_draft, submitted_by)
    VALUES (p_item_id, NULLIF(btrim(coalesce(p_response_text,'')), ''), coalesce(p_file_upload_ids, '{}'), true, auth.uid())
    RETURNING id INTO v_resp;
  ELSE
    UPDATE public.complaint_rfi_responses
    SET response_text = NULLIF(btrim(coalesce(p_response_text,'')), ''),
        file_upload_ids = coalesce(p_file_upload_ids, '{}'),
        submitted_by = auth.uid()
    WHERE id = v_resp;
  END IF;

  UPDATE public.complaint_rfi_items
  SET response_status = 'draft'
  WHERE id = p_item_id AND response_status IN ('pending','returned','draft');

  RETURN v_resp;
END;
$$;

CREATE OR REPLACE FUNCTION public.complaint_rfi_submit(p_rfi_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_missing text[] := '{}';
  v_item record;
  v_draft record;
  v_submitted integer := 0;
  v_file uuid;
BEGIN
  SELECT * INTO v_rec FROM public.complaint_rfis WHERE id = p_rfi_id;
  IF v_rec.id IS NULL THEN RAISE EXCEPTION 'rfi_not_found'; END IF;
  IF NOT public.is_complaint_rfi_entity_user(p_rfi_id) THEN
    RAISE EXCEPTION 'not_authorised_for_this_entity';
  END IF;
  IF v_rec.status <> 'open' THEN RAISE EXCEPTION 'rfi_not_open'; END IF;

  -- Gate: every mandatory question must have a usable draft answer.
  FOR v_item IN
    SELECT i.*, d.response_text, d.file_upload_ids
    FROM public.complaint_rfi_items i
    LEFT JOIN public.complaint_rfi_responses d ON d.rfi_item_id = i.id AND d.is_draft
    WHERE i.rfi_id = p_rfi_id AND i.response_status <> 'responded'
    ORDER BY i.ordinal
  LOOP
    IF v_item.required THEN
      IF v_item.question_type IN ('text','both')
         AND btrim(coalesce(v_item.response_text,'')) = '' THEN
        v_missing := v_missing || ('Q' || v_item.ordinal || ': written response required');
      END IF;
      IF v_item.question_type IN ('document','both')
         AND coalesce(array_length(v_item.file_upload_ids, 1), 0) = 0 THEN
        v_missing := v_missing || ('Q' || v_item.ordinal || ': supporting document required');
      END IF;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'missing', to_jsonb(v_missing));
  END IF;

  -- Lock drafts as submitted responses; link documents to complaint evidence.
  FOR v_draft IN
    SELECT d.id, d.rfi_item_id, d.file_upload_ids
    FROM public.complaint_rfi_responses d
    JOIN public.complaint_rfi_items i ON i.id = d.rfi_item_id
    WHERE i.rfi_id = p_rfi_id AND d.is_draft
  LOOP
    UPDATE public.complaint_rfi_responses
    SET is_draft = false, submitted_at = now(), submitted_by = auth.uid()
    WHERE id = v_draft.id;

    UPDATE public.complaint_rfi_items SET response_status = 'responded' WHERE id = v_draft.rfi_item_id;
    v_submitted := v_submitted + 1;

    INSERT INTO public.complaint_evidence (complaint_id, file_upload_id, label, description, uploaded_by, finalized_at)
    SELECT v_rec.complaint_id, f, 'RFI response document',
           'Submitted via complaint information request', auth.uid(), now()
    FROM unnest(coalesce(v_draft.file_upload_ids, '{}'::uuid[])) AS f
    WHERE NOT EXISTS (
      SELECT 1 FROM public.complaint_evidence ce
      WHERE ce.complaint_id = v_rec.complaint_id AND ce.file_upload_id = f
    );
  END LOOP;

  UPDATE public.complaint_rfis
  SET status = 'submitted', submitted_at = now(), submitted_by = auth.uid()
  WHERE id = p_rfi_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value, metadata)
  VALUES (auth.uid(), 'complaint.rfi_response_submitted', 'complaint', v_rec.complaint_id,
          jsonb_build_object('rfi_id', p_rfi_id, 'answers', v_submitted),
          jsonb_build_object('licensee_id', v_rec.licensee_id));

  RETURN jsonb_build_object('ok', true, 'answers', v_submitted);
END;
$$;

CREATE OR REPLACE FUNCTION public.complaint_rfi_return_item(p_item_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfi uuid;
  v_complaint uuid;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(), 'edit')) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;
  IF btrim(coalesce(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'clarification_reason_required';
  END IF;

  SELECT i.rfi_id, r.complaint_id INTO v_rfi, v_complaint
  FROM public.complaint_rfi_items i
  JOIN public.complaint_rfis r ON r.id = i.rfi_id
  WHERE i.id = p_item_id;
  IF v_rfi IS NULL THEN RAISE EXCEPTION 'rfi_item_not_found'; END IF;

  UPDATE public.complaint_rfi_items
  SET response_status = 'returned', returned_reason = btrim(p_reason)
  WHERE id = p_item_id;

  UPDATE public.complaint_rfis
  SET status = 'open', submitted_at = NULL, submitted_by = NULL
  WHERE id = v_rfi AND status = 'submitted';

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (auth.uid(), 'complaint.rfi_item_returned', 'complaint', v_complaint,
          jsonb_build_object('rfi_id', v_rfi, 'item_id', p_item_id, 'reason', btrim(p_reason)));
END;
$$;

CREATE OR REPLACE FUNCTION public.complaint_rfi_close(p_rfi_id uuid, p_notes text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_complaint uuid;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(), 'edit')) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  SELECT complaint_id INTO v_complaint FROM public.complaint_rfis WHERE id = p_rfi_id;
  IF v_complaint IS NULL THEN RAISE EXCEPTION 'rfi_not_found'; END IF;

  UPDATE public.complaint_rfis
  SET status = 'closed', closure_notes = NULLIF(btrim(coalesce(p_notes,'')), ''),
      closed_by = auth.uid(), closed_at = now()
  WHERE id = p_rfi_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (auth.uid(), 'complaint.rfi_closed', 'complaint', v_complaint,
          jsonb_build_object('rfi_id', p_rfi_id, 'notes', p_notes));
END;
$$;

CREATE OR REPLACE FUNCTION public.complaint_rfi_cancel(p_rfi_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_complaint uuid;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(), 'edit')) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;
  SELECT complaint_id INTO v_complaint FROM public.complaint_rfis WHERE id = p_rfi_id;
  IF v_complaint IS NULL THEN RAISE EXCEPTION 'rfi_not_found'; END IF;

  UPDATE public.complaint_rfis
  SET status = 'cancelled', closure_notes = NULLIF(btrim(coalesce(p_reason,'')), ''),
      closed_by = auth.uid(), closed_at = now()
  WHERE id = p_rfi_id AND status IN ('open','submitted');

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (auth.uid(), 'complaint.rfi_cancelled', 'complaint', v_complaint,
          jsonb_build_object('rfi_id', p_rfi_id, 'reason', p_reason));
END;
$$;

REVOKE ALL ON FUNCTION public.complaint_rfi_raise(uuid, text, timestamptz, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.complaint_rfi_save_draft(uuid, text, uuid[]) FROM public, anon;
REVOKE ALL ON FUNCTION public.complaint_rfi_submit(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.complaint_rfi_return_item(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.complaint_rfi_close(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.complaint_rfi_cancel(uuid, text) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.complaint_rfi_raise(uuid, text, timestamptz, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complaint_rfi_save_draft(uuid, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complaint_rfi_submit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complaint_rfi_return_item(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complaint_rfi_close(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complaint_rfi_cancel(uuid, text) TO authenticated;

-- ---------- notification events ----------

INSERT INTO public.notification_event_configs
  (event_key, description, title_template, message_template, email_subject_template, email_body_template,
   channels, recipient_rules, notification_type, dedupe_window_seconds, is_active, severity,
   allow_mute, system_required, category, action_required, delivery_frequency, module)
VALUES
  ('complaint.rfi_issued',
   'A complaint information request was issued to a regulated entity',
   'Information request: {{complaint_number}}',
   'A request for information has been issued on complaint {{complaint_number}}. {{question_count}} question(s) require a response by {{due_at}}.',
   'Information request on complaint {{complaint_number}}',
   'A request for information has been issued on complaint {{complaint_number}}. {{question_count}} question(s) require a response by {{due_at}}. Please respond via the Information Requests area of your portal.',
   ARRAY['in_app','email'],
   '[{"type": "entity_primary_users"}, {"type": "entity_secondary_users"}]'::jsonb,
   'action_required', 60, true, 'high', false, false, 'action_required', true, 'immediate', 'complaint'),
  ('complaint.rfi_response_submitted',
   'A regulated entity submitted responses to a complaint information request',
   'RFI response received: {{complaint_number}}',
   '{{entity_name}} submitted {{answer_count}} response(s) to the information request on complaint {{complaint_number}}.',
   'RFI response received for complaint {{complaint_number}}',
   '{{entity_name}} submitted {{answer_count}} response(s) to the information request on complaint {{complaint_number}}. Please review the submission.',
   ARRAY['in_app','email'],
   '[{"type": "record_assignee"}, {"type": "supervisor"}]'::jsonb,
   'action_required', 60, true, 'medium', true, false, 'action_required', true, 'immediate', 'complaint'),
  ('complaint.rfi_due_reminder',
   'A complaint information request is approaching its due date',
   'Information request due soon: {{complaint_number}}',
   'The information request on complaint {{complaint_number}} is due on {{due_at}}. {{outstanding_count}} question(s) remain outstanding.',
   'Reminder: information request due for complaint {{complaint_number}}',
   'The information request on complaint {{complaint_number}} is due on {{due_at}}. {{outstanding_count}} question(s) remain outstanding.',
   ARRAY['in_app','email'],
   '[{"type": "entity_primary_users"}, {"type": "entity_secondary_users"}]'::jsonb,
   'alert', 86400, true, 'high', false, false, 'action_required', true, 'immediate', 'complaint')
ON CONFLICT (event_key) DO NOTHING;
