
-- ============================================================================
-- 1. Status catalogue
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.complaint_status_catalogue (
  code text PRIMARY KEY,
  label text NOT NULL,
  description text,
  public_label text NOT NULL,
  public_description text,
  is_terminal boolean NOT NULL DEFAULT false,
  is_open boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  variant text NOT NULL DEFAULT 'outline',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.complaint_status_catalogue TO anon, authenticated;
GRANT ALL ON public.complaint_status_catalogue TO service_role;

ALTER TABLE public.complaint_status_catalogue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read status catalogue" ON public.complaint_status_catalogue;
CREATE POLICY "Anyone can read status catalogue"
  ON public.complaint_status_catalogue FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins manage status catalogue" ON public.complaint_status_catalogue;
CREATE POLICY "Admins manage status catalogue"
  ON public.complaint_status_catalogue FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.complaint_status_catalogue
  (code, label, description, public_label, public_description, is_terminal, is_open, sort_order, variant)
VALUES
  ('submitted',           'Submitted',           'Complaint received, awaiting triage.',           'Received',              'Your complaint has been received and is awaiting review.', false, true,  10, 'default'),
  ('under_investigation', 'Under Investigation', 'Complaint is being actively investigated.',      'Under review',          'Your complaint is being reviewed by the regulator.',       false, true,  20, 'outline'),
  ('resolved',            'Resolved',            'A resolution has been reached.',                 'Resolved',              'A resolution has been reached for your complaint.',        false, false, 30, 'default'),
  ('closed',              'Closed',              'Complaint file is closed.',                      'Closed',                'Your complaint file has been closed.',                     true,  false, 40, 'secondary'),
  ('rejected',            'Rejected',            'Complaint was rejected during triage or review.','Not accepted',          'Your complaint was not accepted for investigation.',       true,  false, 50, 'destructive'),
  ('duplicate',           'Duplicate',           'Complaint merged with an existing case.',        'Merged with earlier case','Your complaint has been linked to an earlier case.',     true,  false, 60, 'secondary')
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  public_label = EXCLUDED.public_label,
  public_description = EXCLUDED.public_description,
  is_terminal = EXCLUDED.is_terminal,
  is_open = EXCLUDED.is_open,
  sort_order = EXCLUDED.sort_order,
  variant = EXCLUDED.variant,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_complaint_status_catalogue_updated ON public.complaint_status_catalogue;
CREATE TRIGGER trg_complaint_status_catalogue_updated
  BEFORE UPDATE ON public.complaint_status_catalogue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 2. Atomic attachment finalization
-- ============================================================================
CREATE OR REPLACE FUNCTION public.finalize_complaint_with_attachments(
  p_complaint_id uuid,
  p_file_upload_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_complaint record;
  v_file record;
  v_results jsonb := '[]'::jsonb;
  v_linked int := 0;
  v_failed int := 0;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTH_REQUIRED';
  END IF;

  SELECT id, regulator_id, complainant_id, licensee_id
    INTO v_complaint
    FROM public.complaints
   WHERE id = p_complaint_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'COMPLAINT_NOT_FOUND';
  END IF;

  -- Caller must be: complainant, an internal staff member (any role), or
  -- a member of the licensee organisation. RLS on complaint_evidence enforces
  -- the eventual insert, but we short-circuit here for a cleaner error.
  IF NOT (
    v_complaint.complainant_id = v_uid
    OR public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'staff'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.entity_user_access eua
       WHERE eua.user_id = v_uid AND eua.licensee_id = v_complaint.licensee_id
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOT_AUTHORIZED_FOR_COMPLAINT';
  END IF;

  IF p_file_upload_ids IS NULL OR array_length(p_file_upload_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('linked', 0, 'failed', 0, 'results', '[]'::jsonb);
  END IF;

  FOREACH v_id IN ARRAY p_file_upload_ids LOOP
    BEGIN
      SELECT id, uploaded_by, file_name, entity_type, entity_id, is_quarantined
        INTO v_file
        FROM public.file_uploads
       WHERE id = v_id
       FOR UPDATE;

      IF NOT FOUND THEN
        v_failed := v_failed + 1;
        v_results := v_results || jsonb_build_object('file_upload_id', v_id, 'ok', false, 'error', 'FILE_NOT_FOUND');
        CONTINUE;
      END IF;

      IF v_file.uploaded_by <> v_uid THEN
        v_failed := v_failed + 1;
        v_results := v_results || jsonb_build_object('file_upload_id', v_id, 'ok', false, 'error', 'NOT_FILE_OWNER');
        CONTINUE;
      END IF;

      IF v_file.is_quarantined THEN
        v_failed := v_failed + 1;
        v_results := v_results || jsonb_build_object('file_upload_id', v_id, 'ok', false, 'error', 'FILE_QUARANTINED');
        CONTINUE;
      END IF;

      -- Reject files already linked to a different complaint / entity.
      IF v_file.entity_type IS NOT NULL AND v_file.entity_type NOT IN ('complaint','general','staging')
         OR (v_file.entity_type = 'complaint' AND v_file.entity_id IS NOT NULL AND v_file.entity_id <> p_complaint_id::text)
      THEN
        v_failed := v_failed + 1;
        v_results := v_results || jsonb_build_object('file_upload_id', v_id, 'ok', false, 'error', 'FILE_ALREADY_LINKED');
        CONTINUE;
      END IF;

      -- Idempotency: skip if already linked to this complaint.
      IF EXISTS (
        SELECT 1 FROM public.complaint_evidence
         WHERE complaint_id = p_complaint_id AND file_upload_id = v_id
      ) THEN
        v_linked := v_linked + 1;
        v_results := v_results || jsonb_build_object('file_upload_id', v_id, 'ok', true, 'idempotent', true);
        CONTINUE;
      END IF;

      INSERT INTO public.complaint_evidence (complaint_id, file_upload_id, label, uploaded_by)
      VALUES (p_complaint_id, v_id, v_file.file_name, v_uid);

      UPDATE public.file_uploads
         SET entity_type = 'complaint',
             entity_id = p_complaint_id::text,
             updated_at = now()
       WHERE id = v_id;

      v_linked := v_linked + 1;
      v_results := v_results || jsonb_build_object('file_upload_id', v_id, 'ok', true);
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_object('file_upload_id', v_id, 'ok', false, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('linked', v_linked, 'failed', v_failed, 'results', v_results);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_complaint_with_attachments(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_complaint_with_attachments(uuid, uuid[]) TO authenticated, service_role;

-- ============================================================================
-- 3. Public complaint tracking (redacted)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_public_complaint_tracking(
  p_reference text,
  p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c record;
  v_status record;
  v_timeline jsonb;
BEGIN
  IF p_reference IS NULL OR length(trim(p_reference)) < 4 THEN
    RETURN jsonb_build_object('found', false, 'error', 'REFERENCE_REQUIRED');
  END IF;

  SELECT id, complaint_number, subject, status, created_at, updated_at,
         resolved_at, closed_at, email, complainant_id
    INTO v_c
    FROM public.complaints
   WHERE complaint_number = trim(p_reference)
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- Contact verification: if the complaint has a contact email on file, the
  -- caller must supply a matching one. Anonymous complaints (no email) skip
  -- this check but return only the barest public fields.
  IF v_c.email IS NOT NULL AND v_c.email <> '' THEN
    IF p_email IS NULL OR lower(trim(p_email)) <> lower(v_c.email) THEN
      RETURN jsonb_build_object('found', false, 'error', 'CONTACT_MISMATCH');
    END IF;
  END IF;

  SELECT public_label, public_description, is_terminal
    INTO v_status
    FROM public.complaint_status_catalogue
   WHERE code = v_c.status;

  -- Build a redacted timeline from workflow instance history — public labels
  -- only, no assignee names, no internal comments.
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.event_at), '[]'::jsonb)
    INTO v_timeline
    FROM (
      SELECT
        aa.created_at AS event_at,
        COALESCE(cs.public_label, 'Progress update') AS label,
        COALESCE(cs.public_description, 'Your complaint has been updated.') AS description
      FROM public.workflow_instances wi
      JOIN public.approval_actions aa ON aa.workflow_instance_id = wi.id
      LEFT JOIN public.complaint_status_catalogue cs
        ON cs.code = aa.new_status
      WHERE wi.entity_type = 'complaint' AND wi.entity_id = v_c.id
      ORDER BY aa.created_at
    ) t;

  RETURN jsonb_build_object(
    'found', true,
    'reference', v_c.complaint_number,
    'subject', v_c.subject,
    'submitted_at', v_c.created_at,
    'updated_at', v_c.updated_at,
    'resolved_at', v_c.resolved_at,
    'closed_at', v_c.closed_at,
    'status', jsonb_build_object(
      'label', COALESCE(v_status.public_label, 'In progress'),
      'description', COALESCE(v_status.public_description, ''),
      'terminal', COALESCE(v_status.is_terminal, false)
    ),
    'timeline', COALESCE(v_timeline, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_complaint_tracking(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_complaint_tracking(text, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_complaint_tracking(text, text) IS
  'Redacted complaint tracking for external complainants. Requires reference number plus matching contact email. Never returns assignee identity or internal notes.';
