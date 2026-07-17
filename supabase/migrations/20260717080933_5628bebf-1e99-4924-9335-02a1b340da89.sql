
-- 1. Status catalogue integrity ------------------------------------------------
UPDATE public.complaints c
   SET status = 'submitted'
 WHERE status IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.complaint_status_catalogue s WHERE s.code = c.status);

ALTER TABLE public.complaints
  DROP CONSTRAINT IF EXISTS complaints_status_fkey;

ALTER TABLE public.complaints
  ADD CONSTRAINT complaints_status_fkey
  FOREIGN KEY (status)
  REFERENCES public.complaint_status_catalogue(code)
  ON UPDATE CASCADE
  DEFERRABLE INITIALLY IMMEDIATE;

-- 2. Parent complaint link for confirmed duplicates ---------------------------
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS parent_complaint_id uuid
  REFERENCES public.complaints(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_complaints_parent ON public.complaints(parent_complaint_id);

-- 3. Attachment lifecycle -----------------------------------------------------
ALTER TABLE public.complaint_evidence
  ADD COLUMN IF NOT EXISTS staged_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

UPDATE public.complaint_evidence SET finalized_at = created_at WHERE finalized_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_complaint_evidence_unfinalized
  ON public.complaint_evidence(staged_at)
  WHERE finalized_at IS NULL;

-- 4. Escalation duplication guard --------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_escalation_active_kind
  ON public.complaint_escalation_cases(complaint_id, rule_key)
  WHERE status IN ('pending', 'acknowledged', 'escalated');

-- 5. Duplicate confirm/dismiss RPCs ------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_complaint_duplicate(
  _pair_id uuid,
  _parent_id uuid,
  _notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pair record;
  v_child_regulator uuid;
  v_parent_regulator uuid;
BEGIN
  IF NOT public.has_complaint_perm(auth.uid(), 'triage')
     AND NOT public.has_complaint_perm(auth.uid(), 'view_all') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pair FROM public.complaint_duplicate_pairs WHERE id = _pair_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pair_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF _parent_id NOT IN (v_pair.primary_complaint_id, v_pair.candidate_complaint_id) THEN
    RAISE EXCEPTION 'parent_must_be_in_pair' USING ERRCODE = '22023';
  END IF;

  SELECT regulator_id INTO v_child_regulator FROM public.complaints
    WHERE id = CASE WHEN _parent_id = v_pair.primary_complaint_id THEN v_pair.candidate_complaint_id ELSE v_pair.primary_complaint_id END;
  SELECT regulator_id INTO v_parent_regulator FROM public.complaints WHERE id = _parent_id;

  IF v_child_regulator IS DISTINCT FROM v_parent_regulator THEN
    RAISE EXCEPTION 'regulator_mismatch' USING ERRCODE = '42501';
  END IF;

  UPDATE public.complaints
     SET parent_complaint_id = _parent_id,
         status = 'duplicate',
         updated_at = now()
   WHERE id = CASE WHEN _parent_id = v_pair.primary_complaint_id THEN v_pair.candidate_complaint_id ELSE v_pair.primary_complaint_id END;

  UPDATE public.complaint_duplicate_pairs
     SET status = 'confirmed',
         decided_at = now(),
         decided_by = auth.uid(),
         updated_at = now()
   WHERE id = _pair_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_values)
  VALUES (auth.uid(), 'confirm_duplicate', 'complaint_duplicate_pairs', _pair_id,
          jsonb_build_object('parent_complaint_id', _parent_id, 'notes', _notes));

  RETURN jsonb_build_object('pair_id', _pair_id, 'parent_complaint_id', _parent_id, 'status', 'confirmed');
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_complaint_duplicate(
  _pair_id uuid,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_complaint_perm(auth.uid(), 'triage')
     AND NOT public.has_complaint_perm(auth.uid(), 'view_all') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.complaint_duplicate_pairs
     SET status = 'dismissed',
         decided_at = now(),
         decided_by = auth.uid(),
         updated_at = now()
   WHERE id = _pair_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pair_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_values)
  VALUES (auth.uid(), 'dismiss_duplicate', 'complaint_duplicate_pairs', _pair_id,
          jsonb_build_object('reason', _reason));

  RETURN jsonb_build_object('pair_id', _pair_id, 'status', 'dismissed');
END;
$$;

-- 6. Manual escalation + dismissal RPCs --------------------------------------
CREATE OR REPLACE FUNCTION public.manual_escalate_complaint(
  _complaint_id uuid,
  _rule_key text,
  _target_tier text DEFAULT 'supervisor',
  _severity text DEFAULT 'medium',
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case_id uuid;
BEGIN
  IF NOT public.has_complaint_perm(auth.uid(), 'triage')
     AND NOT public.has_complaint_perm(auth.uid(), 'escalate')
     AND NOT public.has_complaint_perm(auth.uid(), 'view_all') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.complaints WHERE id = _complaint_id) THEN
    RAISE EXCEPTION 'complaint_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.complaint_escalation_cases
    (complaint_id, rule_key, rule_label, target_tier, severity, trigger_reason, status)
  VALUES
    (_complaint_id, _rule_key, initcap(replace(_rule_key,'_',' ')), _target_tier, _severity,
     COALESCE(_notes, 'Manual escalation'), 'pending')
  ON CONFLICT (complaint_id, rule_key)
  WHERE status IN ('pending','acknowledged','escalated')
  DO UPDATE SET updated_at = now(), notes = COALESCE(EXCLUDED.trigger_reason, complaint_escalation_cases.notes)
  RETURNING id INTO v_case_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_values)
  VALUES (auth.uid(), 'manual_escalate', 'complaint_escalation_cases', v_case_id,
          jsonb_build_object('complaint_id', _complaint_id, 'rule_key', _rule_key, 'target_tier', _target_tier));

  RETURN v_case_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_complaint_escalation(
  _case_id uuid,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_complaint_perm(auth.uid(), 'triage')
     AND NOT public.has_complaint_perm(auth.uid(), 'escalate')
     AND NOT public.has_complaint_perm(auth.uid(), 'view_all') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.complaint_escalation_cases
     SET status = 'dismissed',
         decided_at = now(),
         decided_by = auth.uid(),
         notes = COALESCE(_reason, notes),
         updated_at = now()
   WHERE id = _case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'escalation_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_values)
  VALUES (auth.uid(), 'dismiss_escalation', 'complaint_escalation_cases', _case_id,
          jsonb_build_object('reason', _reason));

  RETURN jsonb_build_object('case_id', _case_id, 'status', 'dismissed');
END;
$$;

-- 7. Orphaned attachment cleanup ---------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_complaint_evidence(
  _older_than interval DEFAULT interval '24 hours'
) RETURNS TABLE (deleted_evidence_id uuid, file_upload_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.has_role(auth.uid(), 'super_admin')
     AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH del AS (
    DELETE FROM public.complaint_evidence e
     WHERE e.finalized_at IS NULL
       AND e.staged_at < now() - _older_than
     RETURNING e.id, e.file_upload_id
  )
  SELECT id, file_upload_id FROM del;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_complaint_duplicate(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_complaint_duplicate(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manual_escalate_complaint(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_complaint_escalation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_complaint_evidence(interval) TO service_role;
