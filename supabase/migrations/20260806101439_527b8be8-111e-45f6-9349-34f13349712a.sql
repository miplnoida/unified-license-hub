-- ============================================================
-- Complaint RFI Approval & Oversight
-- ============================================================

-- ---------- settings ----------
CREATE TABLE IF NOT EXISTS public.complaint_rfi_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_required boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.complaint_rfi_settings TO authenticated;
GRANT ALL ON public.complaint_rfi_settings TO service_role;
ALTER TABLE public.complaint_rfi_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal read complaint rfi settings" ON public.complaint_rfi_settings
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

CREATE TRIGGER trg_complaint_rfi_settings_updated BEFORE UPDATE ON public.complaint_rfi_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.complaint_rfi_settings (approval_required)
SELECT true WHERE NOT EXISTS (SELECT 1 FROM public.complaint_rfi_settings);

-- ---------- schema extension ----------
ALTER TABLE public.complaint_rfis
  ADD COLUMN IF NOT EXISTS approval_state text NOT NULL DEFAULT 'dispatched',
  ADD COLUMN IF NOT EXISTS approver_id uuid,
  ADD COLUMN IF NOT EXISTS submitted_for_approval_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_for_approval_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approval_notes text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;

UPDATE public.complaint_rfis
SET approval_state = 'dispatched', dispatched_at = COALESCE(dispatched_at, raised_at)
WHERE approval_state IS DISTINCT FROM 'dispatched' OR dispatched_at IS NULL;

ALTER TABLE public.complaint_rfis DROP CONSTRAINT IF EXISTS complaint_rfis_approval_state_chk;
ALTER TABLE public.complaint_rfis
  ADD CONSTRAINT complaint_rfis_approval_state_chk
  CHECK (approval_state IN ('draft','pending_approval','rejected','dispatched'));

ALTER TABLE public.complaint_rfis DROP CONSTRAINT IF EXISTS complaint_rfis_status_chk;
ALTER TABLE public.complaint_rfis
  ADD CONSTRAINT complaint_rfis_status_chk
  CHECK (status IN ('draft','open','submitted','closed','cancelled'));

CREATE INDEX IF NOT EXISTS idx_complaint_rfis_approval ON public.complaint_rfis(approval_state, approver_id);

-- ---------- permission ----------
WITH m AS (SELECT id FROM public.permission_modules WHERE key = 'complaint_management'),
ins AS (
  INSERT INTO public.permission_actions (module_id, key, label, description, audience, sort_order, is_system)
  SELECT m.id, 'approve_rfi', 'Approve Information Requests',
         'Approve, modify or reject complaint information requests before dispatch', 'internal', 95, false
  FROM m
  WHERE NOT EXISTS (
    SELECT 1 FROM public.permission_actions a
    JOIN m ON true WHERE a.module_id = m.id AND a.key = 'approve_rfi'
  )
  RETURNING id, key
)
INSERT INTO public.permissions (module, name, description, action_id, enforced)
SELECT 'complaint_management', ins.key, 'Complaints — approve information requests', ins.id, true
FROM ins
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p
  WHERE p.module = 'complaint_management' AND p.name = 'approve_rfi'
);

CREATE OR REPLACE FUNCTION public.can_approve_complaint_rfi(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id)
      OR public.has_role(_user_id, 'admin')
      OR public.has_role(_user_id, 'supervisor')
      OR public.has_complaint_perm(_user_id, 'approve_rfi');
$$;

REVOKE ALL ON FUNCTION public.can_approve_complaint_rfi(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_approve_complaint_rfi(uuid) TO authenticated, service_role;

-- ---------- visibility ----------
-- Entity users may only ever see dispatched requests.
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
      AND r.approval_state = 'dispatched'
      AND public.can_current_user_access_licensee(r.licensee_id, NULL)
  );
$$;

DROP POLICY IF EXISTS "Entity read own complaint rfis" ON public.complaint_rfis;
CREATE POLICY "Entity read own complaint rfis" ON public.complaint_rfis
  FOR SELECT TO authenticated
  USING (approval_state = 'dispatched' AND public.can_current_user_access_licensee(licensee_id, NULL));

DROP POLICY IF EXISTS "Internal read complaint rfis" ON public.complaint_rfis;
CREATE POLICY "Internal read complaint rfis" ON public.complaint_rfis
  FOR SELECT TO authenticated
  USING (
    (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(), 'view'))
    AND (
      approval_state = 'dispatched'
      OR raised_by = auth.uid()
      OR approver_id = auth.uid()
      OR public.can_approve_complaint_rfi(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Internal read complaint rfi items" ON public.complaint_rfi_items;
CREATE POLICY "Internal read complaint rfi items" ON public.complaint_rfi_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.complaint_rfis r
      WHERE r.id = rfi_id
        AND (public.is_super_admin(auth.uid()) OR public.has_complaint_perm(auth.uid(), 'view'))
        AND (
          r.approval_state = 'dispatched'
          OR r.raised_by = auth.uid()
          OR r.approver_id = auth.uid()
          OR public.can_approve_complaint_rfi(auth.uid())
        )
    )
  );

-- ---------- raise (draft-aware) ----------
DROP FUNCTION IF EXISTS public.complaint_rfi_raise(uuid, text, timestamptz, jsonb);

CREATE OR REPLACE FUNCTION public.complaint_rfi_raise(
  p_complaint_id uuid,
  p_summary text,
  p_due_at timestamptz,
  p_items jsonb,
  p_as_draft boolean DEFAULT NULL,
  p_approver_id uuid DEFAULT NULL
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
  v_required boolean;
  v_state text;
  v_status text;
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

  SELECT approval_required INTO v_required FROM public.complaint_rfi_settings LIMIT 1;
  v_required := COALESCE(v_required, true);

  IF COALESCE(p_as_draft, v_required) THEN
    v_state := 'draft';
    v_status := 'draft';
  ELSE
    IF v_required THEN
      RAISE EXCEPTION 'approval_required_for_complaint_rfi';
    END IF;
    v_state := 'dispatched';
    v_status := 'open';
  END IF;

  INSERT INTO public.complaint_rfis (
    complaint_id, licensee_id, raised_by, due_at, summary, status,
    approval_state, approver_id, dispatched_at
  )
  VALUES (
    p_complaint_id, v_licensee, auth.uid(), p_due_at,
    NULLIF(btrim(coalesce(p_summary,'')), ''), v_status,
    v_state, p_approver_id,
    CASE WHEN v_state = 'dispatched' THEN now() ELSE NULL END
  )
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
  VALUES (auth.uid(),
          CASE WHEN v_state = 'draft' THEN 'complaint.rfi_drafted' ELSE 'complaint.rfi_raised' END,
          'complaint', p_complaint_id,
          jsonb_build_object('rfi_id', v_rfi, 'questions', v_ord, 'due_at', p_due_at,
                             'approval_state', v_state, 'approver_id', p_approver_id),
          jsonb_build_object('licensee_id', v_licensee));

  IF v_state = 'dispatched' THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value, metadata)
    VALUES (auth.uid(), 'complaint.rfi_dispatched', 'complaint', p_complaint_id,
            jsonb_build_object('rfi_id', v_rfi, 'questions', v_ord, 'due_at', p_due_at,
                               'approval_gate', 'disabled'),
            jsonb_build_object('licensee_id', v_licensee));
  END IF;

  RETURN v_rfi;
END;
$$;

-- ---------- edit a draft ----------
CREATE OR REPLACE FUNCTION public.complaint_rfi_update_draft(
  p_rfi_id uuid,
  p_summary text,
  p_due_at timestamptz,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_before jsonb;
  v_after jsonb;
  v_item jsonb;
  v_ord integer := 0;
BEGIN
  SELECT * INTO v_rec FROM public.complaint_rfis WHERE id = p_rfi_id;
  IF v_rec.id IS NULL THEN RAISE EXCEPTION 'rfi_not_found'; END IF;
  IF v_rec.approval_state NOT IN ('draft','pending_approval','rejected') THEN
    RAISE EXCEPTION 'rfi_already_dispatched';
  END IF;
  IF NOT (
    public.is_super_admin(auth.uid())
    OR public.can_approve_complaint_rfi(auth.uid())
    OR (v_rec.raised_by = auth.uid() AND public.has_complaint_perm(auth.uid(), 'edit'))
  ) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'at_least_one_question_required';
  END IF;

  SELECT jsonb_build_object(
           'summary', v_rec.summary,
           'due_at', v_rec.due_at,
           'items', COALESCE(jsonb_agg(jsonb_build_object(
             'ordinal', i.ordinal, 'prompt', i.prompt,
             'question_type', i.question_type, 'required', i.required)
             ORDER BY i.ordinal), '[]'::jsonb))
    INTO v_before
  FROM public.complaint_rfi_items i WHERE i.rfi_id = p_rfi_id;

  DELETE FROM public.complaint_rfi_items WHERE rfi_id = p_rfi_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_ord := v_ord + 1;
    IF btrim(coalesce(v_item->>'prompt','')) = '' THEN
      RAISE EXCEPTION 'question_prompt_required';
    END IF;
    INSERT INTO public.complaint_rfi_items (rfi_id, ordinal, prompt, question_type, required)
    VALUES (p_rfi_id, v_ord, btrim(v_item->>'prompt'),
            coalesce(NULLIF(v_item->>'question_type',''), 'text'),
            coalesce((v_item->>'required')::boolean, true));
  END LOOP;

  UPDATE public.complaint_rfis
  SET summary = NULLIF(btrim(coalesce(p_summary,'')), ''),
      due_at = p_due_at
  WHERE id = p_rfi_id;

  SELECT jsonb_build_object(
           'summary', NULLIF(btrim(coalesce(p_summary,'')), ''),
           'due_at', p_due_at,
           'items', COALESCE(jsonb_agg(jsonb_build_object(
             'ordinal', i.ordinal, 'prompt', i.prompt,
             'question_type', i.question_type, 'required', i.required)
             ORDER BY i.ordinal), '[]'::jsonb))
    INTO v_after
  FROM public.complaint_rfi_items i WHERE i.rfi_id = p_rfi_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (auth.uid(), 'complaint.rfi_modified', 'complaint', v_rec.complaint_id,
          v_before, v_after,
          jsonb_build_object('rfi_id', p_rfi_id, 'licensee_id', v_rec.licensee_id,
                             'modified_by_approver', public.can_approve_complaint_rfi(auth.uid())));
END;
$$;

-- ---------- submit for approval ----------
CREATE OR REPLACE FUNCTION public.complaint_rfi_submit_for_approval(
  p_rfi_id uuid,
  p_approver_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rec record;
BEGIN
  SELECT * INTO v_rec FROM public.complaint_rfis WHERE id = p_rfi_id;
  IF v_rec.id IS NULL THEN RAISE EXCEPTION 'rfi_not_found'; END IF;
  IF v_rec.approval_state NOT IN ('draft','rejected') THEN
    RAISE EXCEPTION 'rfi_not_in_draft_state';
  END IF;
  IF NOT (
    public.is_super_admin(auth.uid())
    OR (public.has_complaint_perm(auth.uid(), 'edit')
        AND (v_rec.raised_by = auth.uid() OR public.can_approve_complaint_rfi(auth.uid())))
  ) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.complaint_rfi_items WHERE rfi_id = p_rfi_id) THEN
    RAISE EXCEPTION 'at_least_one_question_required';
  END IF;

  UPDATE public.complaint_rfis
  SET approval_state = 'pending_approval',
      approver_id = COALESCE(p_approver_id, approver_id),
      submitted_for_approval_at = now(),
      submitted_for_approval_by = auth.uid(),
      rejection_reason = NULL
  WHERE id = p_rfi_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value, metadata)
  VALUES (auth.uid(), 'complaint.rfi_approval_requested', 'complaint', v_rec.complaint_id,
          jsonb_build_object('rfi_id', p_rfi_id,
                             'approver_id', COALESCE(p_approver_id, v_rec.approver_id),
                             'nominated', p_approver_id IS NOT NULL),
          jsonb_build_object('licensee_id', v_rec.licensee_id));
END;
$$;

-- ---------- approve & dispatch ----------
CREATE OR REPLACE FUNCTION public.complaint_rfi_approve(
  p_rfi_id uuid,
  p_notes text DEFAULT NULL,
  p_due_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_questions integer;
  v_due timestamptz;
BEGIN
  SELECT * INTO v_rec FROM public.complaint_rfis WHERE id = p_rfi_id;
  IF v_rec.id IS NULL THEN RAISE EXCEPTION 'rfi_not_found'; END IF;
  IF NOT public.can_approve_complaint_rfi(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorised_to_approve_complaint_rfi';
  END IF;
  IF v_rec.approval_state <> 'pending_approval' THEN
    RAISE EXCEPTION 'rfi_not_pending_approval';
  END IF;

  SELECT count(*) INTO v_questions FROM public.complaint_rfi_items WHERE rfi_id = p_rfi_id;
  IF v_questions = 0 THEN RAISE EXCEPTION 'at_least_one_question_required'; END IF;

  v_due := COALESCE(p_due_at, v_rec.due_at);

  UPDATE public.complaint_rfis
  SET approval_state = 'dispatched',
      status = 'open',
      due_at = v_due,
      approved_at = now(),
      approved_by = auth.uid(),
      approval_notes = NULLIF(btrim(coalesce(p_notes,'')), ''),
      rejection_reason = NULL,
      dispatched_at = now(),
      raised_at = now()
  WHERE id = p_rfi_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value, metadata)
  VALUES (auth.uid(), 'complaint.rfi_approved', 'complaint', v_rec.complaint_id,
          jsonb_build_object('rfi_id', p_rfi_id, 'notes', p_notes, 'due_at', v_due,
                             'nominated_approver_id', v_rec.approver_id,
                             'acted_as_nominee', v_rec.approver_id IS NOT DISTINCT FROM auth.uid()),
          jsonb_build_object('licensee_id', v_rec.licensee_id));

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value, metadata)
  VALUES (auth.uid(), 'complaint.rfi_dispatched', 'complaint', v_rec.complaint_id,
          jsonb_build_object('rfi_id', p_rfi_id, 'questions', v_questions, 'due_at', v_due,
                             'recipient_licensee_id', v_rec.licensee_id, 'dispatched_at', now()),
          jsonb_build_object('licensee_id', v_rec.licensee_id));

  RETURN jsonb_build_object('ok', true, 'questions', v_questions,
                            'licensee_id', v_rec.licensee_id,
                            'complaint_id', v_rec.complaint_id, 'due_at', v_due);
END;
$$;

-- ---------- reject ----------
CREATE OR REPLACE FUNCTION public.complaint_rfi_reject(p_rfi_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rec record;
BEGIN
  SELECT * INTO v_rec FROM public.complaint_rfis WHERE id = p_rfi_id;
  IF v_rec.id IS NULL THEN RAISE EXCEPTION 'rfi_not_found'; END IF;
  IF NOT public.can_approve_complaint_rfi(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorised_to_approve_complaint_rfi';
  END IF;
  IF v_rec.approval_state <> 'pending_approval' THEN
    RAISE EXCEPTION 'rfi_not_pending_approval';
  END IF;
  IF btrim(coalesce(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'rejection_reason_required';
  END IF;

  UPDATE public.complaint_rfis
  SET approval_state = 'rejected',
      rejection_reason = btrim(p_reason),
      approved_at = NULL,
      approved_by = NULL
  WHERE id = p_rfi_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value, metadata)
  VALUES (auth.uid(), 'complaint.rfi_rejected', 'complaint', v_rec.complaint_id,
          jsonb_build_object('rfi_id', p_rfi_id, 'reason', btrim(p_reason)),
          jsonb_build_object('licensee_id', v_rec.licensee_id));

  RETURN jsonb_build_object('ok', true, 'drafter_id', v_rec.raised_by,
                            'complaint_id', v_rec.complaint_id);
END;
$$;

-- ---------- settings write ----------
CREATE OR REPLACE FUNCTION public.complaint_rfi_set_approval_required(p_required boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_old boolean;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  SELECT approval_required INTO v_old FROM public.complaint_rfi_settings LIMIT 1;

  IF v_old IS NULL THEN
    INSERT INTO public.complaint_rfi_settings (approval_required, updated_by)
    VALUES (COALESCE(p_required, true), auth.uid());
  ELSE
    UPDATE public.complaint_rfi_settings
    SET approval_required = COALESCE(p_required, true), updated_by = auth.uid();
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (auth.uid(), 'complaint.rfi_approval_gate_changed', 'complaint_rfi_settings', NULL,
          jsonb_build_object('approval_required', v_old),
          jsonb_build_object('approval_required', COALESCE(p_required, true)));
END;
$$;

-- ---------- grants ----------
REVOKE ALL ON FUNCTION public.complaint_rfi_raise(uuid, text, timestamptz, jsonb, boolean, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.complaint_rfi_update_draft(uuid, text, timestamptz, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.complaint_rfi_submit_for_approval(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.complaint_rfi_approve(uuid, text, timestamptz) FROM public, anon;
REVOKE ALL ON FUNCTION public.complaint_rfi_reject(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.complaint_rfi_set_approval_required(boolean) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.complaint_rfi_raise(uuid, text, timestamptz, jsonb, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complaint_rfi_update_draft(uuid, text, timestamptz, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complaint_rfi_submit_for_approval(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complaint_rfi_approve(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complaint_rfi_reject(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complaint_rfi_set_approval_required(boolean) TO authenticated;

-- ---------- notification events ----------
INSERT INTO public.notification_event_configs
  (event_key, description, title_template, message_template, email_subject_template, email_body_template,
   channels, recipient_rules, notification_type, dedupe_window_seconds, is_active, severity,
   allow_mute, system_required, category, action_required, delivery_frequency, module)
VALUES
  ('complaint.rfi_approval_requested',
   'A complaint information request was submitted for supervisory approval',
   'RFI approval needed: {{complaint_number}}',
   'An information request on complaint {{complaint_number}} is awaiting your approval. {{question_count}} question(s) drafted by {{drafter_name}}.',
   'Approval needed: information request on complaint {{complaint_number}}',
   'An information request on complaint {{complaint_number}} is awaiting approval. {{question_count}} question(s) were drafted by {{drafter_name}}. Please review, modify if needed, and approve or reject the request.',
   ARRAY['in_app','email'],
   '[{"type": "payload_user"}, {"type": "supervisor"}]'::jsonb,
   'action_required', 60, true, 'high', true, false, 'action_required', true, 'immediate', 'complaint'),
  ('complaint.rfi_approved',
   'A complaint information request was approved and dispatched to the entity',
   'RFI approved: {{complaint_number}}',
   'The information request on complaint {{complaint_number}} was approved and dispatched to {{entity_name}}.',
   'Information request approved for complaint {{complaint_number}}',
   'The information request on complaint {{complaint_number}} was approved and dispatched to {{entity_name}}.',
   ARRAY['in_app'],
   '[{"type": "payload_user"}]'::jsonb,
   'info', 60, true, 'medium', true, false, 'info', false, 'immediate', 'complaint'),
  ('complaint.rfi_rejected',
   'A complaint information request was rejected by the approver',
   'RFI returned: {{complaint_number}}',
   'The information request drafted on complaint {{complaint_number}} was returned for rework. Reason: {{rejection_reason}}',
   'Information request returned for complaint {{complaint_number}}',
   'The information request drafted on complaint {{complaint_number}} was returned for rework. Reason: {{rejection_reason}}',
   ARRAY['in_app','email'],
   '[{"type": "payload_user"}]'::jsonb,
   'action_required', 60, true, 'high', true, false, 'action_required', true, 'immediate', 'complaint')
ON CONFLICT (event_key) DO NOTHING;