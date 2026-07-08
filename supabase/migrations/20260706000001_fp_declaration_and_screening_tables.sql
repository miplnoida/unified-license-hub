
-- ────────────────────────────────────────────────────────────────────────────
-- declaration_invitations
-- Token-based invitation links sent to individuals for completing declaration.
-- Raw token is NEVER stored; only the SHA-256 hex digest is persisted.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.declaration_invitations (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  individual_id             uuid        NOT NULL REFERENCES public.fp_individuals(id)  ON DELETE CASCADE,
  assessment_id             uuid        NOT NULL REFERENCES public.fp_assessments(id)  ON DELETE CASCADE,
  token_hash                text        NOT NULL UNIQUE,
  verification_hash         text        NOT NULL,  -- sha256(dob||'|'||upper(last4_national_id)) for identity gate
  channel                   text        NOT NULL DEFAULT 'EMAIL'
                                        CHECK (channel IN ('EMAIL', 'SMS', 'BOTH')),
  status                    text        NOT NULL DEFAULT 'PENDING'
                                        CHECK (status IN ('PENDING','SENT','OPENED','SUBMITTED','EXPIRED','RESENT')),
  recipient_email           text,
  recipient_phone           text,
  sent_at                   timestamptz,
  opened_at                 timestamptz,
  submitted_at              timestamptz,
  expires_at                timestamptz NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  failed_identity_attempts  int         NOT NULL DEFAULT 0,
  created_by                uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decl_inv_individual  ON public.declaration_invitations(individual_id);
CREATE INDEX IF NOT EXISTS idx_decl_inv_assessment  ON public.declaration_invitations(assessment_id);
CREATE INDEX IF NOT EXISTS idx_decl_inv_token_hash  ON public.declaration_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_decl_inv_status      ON public.declaration_invitations(status);

ALTER TABLE public.declaration_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fp_staff_read_invitations"
  ON public.declaration_invitations FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
  );

CREATE POLICY "fp_staff_insert_invitations"
  ON public.declaration_invitations FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
  );

CREATE POLICY "fp_staff_update_invitations"
  ON public.declaration_invitations FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
  );

-- Public function: look up invitation metadata by raw token (no sensitive data exposed)
CREATE OR REPLACE FUNCTION public.get_declaration_invitation_public(p_token text)
RETURNS TABLE (
  id                       uuid,
  assessment_id            uuid,
  status                   text,
  expires_at               timestamptz,
  failed_identity_attempts int,
  individual_name          text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text := encode(sha256(p_token::bytea), 'hex');
BEGIN
  RETURN QUERY
  SELECT di.id,
         di.assessment_id,
         di.status,
         di.expires_at,
         di.failed_identity_attempts,
         fp.full_name
  FROM   public.declaration_invitations di
  JOIN   public.fp_individuals           fp ON fp.id = di.individual_id
  WHERE  di.token_hash = v_hash;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_declaration_invitation_public(text) TO anon, authenticated;

-- Identity verification: checks DOB + last-4 national ID against stored hash; increments failure counter
CREATE OR REPLACE FUNCTION public.verify_declaration_identity(
  p_token   text,
  p_dob     text,
  p_last4id text
)
RETURNS TABLE (verified boolean, invitation_id uuid, assessment_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash  text := encode(sha256(p_token::bytea), 'hex');
  v_vhash text := encode(sha256((p_dob || '|' || upper(p_last4id))::bytea), 'hex');
  v_inv   public.declaration_invitations%ROWTYPE;
BEGIN
  SELECT * INTO v_inv FROM public.declaration_invitations WHERE token_hash = v_hash;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- Block expired, locked-out, or already-submitted invitations
  IF v_inv.expires_at < now()
     OR v_inv.failed_identity_attempts >= 5
     OR v_inv.status IN ('SUBMITTED', 'EXPIRED') THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  IF v_inv.verification_hash = v_vhash THEN
    UPDATE public.declaration_invitations
    SET    status    = CASE WHEN status IN ('PENDING','SENT','RESENT') THEN 'OPENED' ELSE status END,
           opened_at = COALESCE(opened_at, now())
    WHERE  id = v_inv.id;
    RETURN QUERY SELECT true, v_inv.id, v_inv.assessment_id;
  ELSE
    UPDATE public.declaration_invitations
    SET    failed_identity_attempts = failed_identity_attempts + 1
    WHERE  id = v_inv.id;
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_declaration_identity(text, text, text) TO anon, authenticated;

-- Mark invitation as SUBMITTED after declaration form is completed
CREATE OR REPLACE FUNCTION public.submit_declaration_by_token(
  p_token         text,
  p_inv_id        uuid,
  p_assessment_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text := encode(sha256(p_token::bytea), 'hex');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.declaration_invitations
    WHERE id = p_inv_id AND token_hash = v_hash AND assessment_id = p_assessment_id
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.declaration_invitations
  SET    status       = 'SUBMITTED',
         submitted_at = now()
  WHERE  id = p_inv_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_declaration_by_token(text, uuid, uuid) TO anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- fp_manual_screening_tasks
-- Manual review queue for AI findings with low confidence or HIGH severity
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fp_manual_screening_tasks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id    uuid        NOT NULL REFERENCES public.fp_findings(id)    ON DELETE CASCADE,
  assessment_id uuid        NOT NULL REFERENCES public.fp_assessments(id) ON DELETE CASCADE,
  individual_id uuid        NOT NULL REFERENCES public.fp_individuals(id)  ON DELETE CASCADE,
  assigned_to   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  status        text        NOT NULL DEFAULT 'UNASSIGNED'
                            CHECK (status IN ('UNASSIGNED','IN_PROGRESS','COMPLETED')),
  due_date      date,
  completed_at  timestamptz,
  completed_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  outcome       text        CHECK (outcome IN ('CLEARED','CONFIRMED_ADVERSE')),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fp_tasks_finding    ON public.fp_manual_screening_tasks(finding_id);
CREATE INDEX IF NOT EXISTS idx_fp_tasks_assessment ON public.fp_manual_screening_tasks(assessment_id);
CREATE INDEX IF NOT EXISTS idx_fp_tasks_individual ON public.fp_manual_screening_tasks(individual_id);
CREATE INDEX IF NOT EXISTS idx_fp_tasks_assigned   ON public.fp_manual_screening_tasks(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fp_tasks_status     ON public.fp_manual_screening_tasks(status);

ALTER TABLE public.fp_manual_screening_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fp_staff_read_tasks"
  ON public.fp_manual_screening_tasks FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
  );

CREATE POLICY "fp_staff_insert_tasks"
  ON public.fp_manual_screening_tasks FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
  );

CREATE POLICY "fp_staff_update_tasks"
  ON public.fp_manual_screening_tasks FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR assigned_to = auth.uid()
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
  );

-- ────────────────────────────────────────────────────────────────────────────
-- fp_task_evidence
-- Files uploaded against a manual screening task
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fp_task_evidence (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid        NOT NULL REFERENCES public.fp_manual_screening_tasks(id) ON DELETE CASCADE,
  file_path   text        NOT NULL,
  file_name   text        NOT NULL,
  uploaded_by uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fp_task_evidence_task ON public.fp_task_evidence(task_id);

ALTER TABLE public.fp_task_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fp_staff_read_task_evidence"
  ON public.fp_task_evidence FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
  );

CREATE POLICY "fp_staff_insert_task_evidence"
  ON public.fp_task_evidence FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'supervisor'::app_role)
      OR has_role(auth.uid(), 'analyst'::app_role)
      OR has_role(auth.uid(), 'licensing_officer'::app_role)
    )
  );
