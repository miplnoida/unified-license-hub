-- =========================================================
-- PHASE 6 — LICENSING RESIDUAL GAPS (additive, backward-safe)
-- =========================================================

-- ---------------------------------------------------------
-- 6.1 Submission acknowledgements
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.application_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  submission_version integer NOT NULL,
  reference text NOT NULL,
  applicant_id uuid,
  applicant_name text,
  applicant_email text,
  entity_name text,
  license_type text,
  submitted_at timestamptz NOT NULL,
  is_resubmission boolean NOT NULL DEFAULT false,
  ack_text text,
  document_bucket text,
  document_path text,
  document_checksum text,
  status text NOT NULL DEFAULT 'GENERATED',
  provider text,
  provider_message_id text,
  failure_reason text,
  retry_count integer NOT NULL DEFAULT 0,
  delivery_requested_at timestamptz,
  delivered_at timestamptz,
  delivery_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_acknowledgements_status_check CHECK (
    status = ANY (ARRAY['GENERATED','DELIVERY_PENDING','DELIVERED','DELIVERY_FAILED','PROVIDER_NOT_CONFIGURED'])
  ),
  CONSTRAINT application_acknowledgements_version_positive CHECK (submission_version >= 1),
  CONSTRAINT application_acknowledgements_app_version_key UNIQUE (application_id, submission_version),
  CONSTRAINT application_acknowledgements_app_submitted_key UNIQUE (application_id, submitted_at)
);

GRANT SELECT ON public.application_acknowledgements TO authenticated;
GRANT ALL ON public.application_acknowledgements TO service_role;

ALTER TABLE public.application_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acknowledgements_read" ON public.application_acknowledgements;
CREATE POLICY "acknowledgements_read"
  ON public.application_acknowledgements FOR SELECT TO authenticated
  USING (public.can_read_application(auth.uid(), application_id));

DROP POLICY IF EXISTS "acknowledgements_no_client_insert" ON public.application_acknowledgements;
CREATE POLICY "acknowledgements_no_client_insert"
  ON public.application_acknowledgements FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "acknowledgements_no_update" ON public.application_acknowledgements;
CREATE POLICY "acknowledgements_no_update"
  ON public.application_acknowledgements AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "acknowledgements_no_delete" ON public.application_acknowledgements;
CREATE POLICY "acknowledgements_no_delete"
  ON public.application_acknowledgements AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);

CREATE INDEX IF NOT EXISTS idx_app_ack_application
  ON public.application_acknowledgements (application_id, submission_version DESC);

-- Immutable identity columns: even the server cannot rewrite the record's
-- identity/provenance. Delivery-state columns remain updatable server-side.
CREATE OR REPLACE FUNCTION public.tg_acknowledgement_identity_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ACKNOWLEDGEMENT_APPEND_ONLY: acknowledgements cannot be deleted'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.application_id IS DISTINCT FROM OLD.application_id
     OR NEW.submission_version IS DISTINCT FROM OLD.submission_version
     OR NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (OLD.document_checksum IS NOT NULL AND NEW.document_checksum IS DISTINCT FROM OLD.document_checksum)
  THEN
    RAISE EXCEPTION 'ACKNOWLEDGEMENT_IMMUTABLE: identity/provenance columns cannot be changed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ack_identity_immutable ON public.application_acknowledgements;
CREATE TRIGGER trg_ack_identity_immutable
  BEFORE UPDATE OR DELETE ON public.application_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.tg_acknowledgement_identity_immutable();

-- Idempotent acknowledgement creation (service-role callers only).
CREATE OR REPLACE FUNCTION public.ensure_submission_acknowledgement(
  _application_id uuid,
  _ack_text text DEFAULT NULL,
  _applicant_name text DEFAULT NULL,
  _applicant_email text DEFAULT NULL,
  _entity_name text DEFAULT NULL,
  _is_resubmission boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app RECORD;
  v_row public.application_acknowledgements;
  v_version integer;
BEGIN
  SELECT id, application_number, applicant_id, license_type, submitted_at, status
    INTO v_app
  FROM public.applications
  WHERE id = _application_id;

  IF v_app.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Application not found', 'code', 'NOT_FOUND');
  END IF;
  IF v_app.submitted_at IS NULL THEN
    RETURN jsonb_build_object('error', 'Application has not been submitted', 'code', 'NOT_SUBMITTED');
  END IF;

  -- Existing acknowledgement for this exact submission => idempotent return.
  SELECT * INTO v_row
  FROM public.application_acknowledgements
  WHERE application_id = _application_id AND submitted_at = v_app.submitted_at;

  IF v_row.id IS NOT NULL THEN
    RETURN jsonb_build_object('created', false, 'acknowledgement', to_jsonb(v_row));
  END IF;

  SELECT coalesce(max(submission_version), 0) + 1 INTO v_version
  FROM public.application_acknowledgements
  WHERE application_id = _application_id;

  INSERT INTO public.application_acknowledgements (
    application_id, submission_version, reference, applicant_id, applicant_name,
    applicant_email, entity_name, license_type, submitted_at, is_resubmission,
    ack_text, status
  ) VALUES (
    _application_id, v_version, v_app.application_number, v_app.applicant_id, _applicant_name,
    _applicant_email, _entity_name, v_app.license_type, v_app.submitted_at, coalesce(_is_resubmission, false),
    left(coalesce(_ack_text, ''), 4000), 'GENERATED'
  )
  ON CONFLICT (application_id, submitted_at) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row
    FROM public.application_acknowledgements
    WHERE application_id = _application_id AND submitted_at = v_app.submitted_at;
    RETURN jsonb_build_object('created', false, 'acknowledgement', to_jsonb(v_row));
  END IF;

  RETURN jsonb_build_object('created', true, 'acknowledgement', to_jsonb(v_row));
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_submission_acknowledgement(uuid, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_submission_acknowledgement(uuid, text, text, text, text, boolean) TO service_role;

-- Record the real delivery/provider outcome. Never invented by the client.
CREATE OR REPLACE FUNCTION public.set_acknowledgement_delivery_state(
  _acknowledgement_id uuid,
  _status text,
  _provider text DEFAULT NULL,
  _provider_message_id text DEFAULT NULL,
  _failure_reason text DEFAULT NULL,
  _document_bucket text DEFAULT NULL,
  _document_path text DEFAULT NULL,
  _document_checksum text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.application_acknowledgements;
BEGIN
  IF _status NOT IN ('GENERATED','DELIVERY_PENDING','DELIVERED','DELIVERY_FAILED','PROVIDER_NOT_CONFIGURED') THEN
    RETURN jsonb_build_object('error', 'Invalid acknowledgement status', 'code', 'INVALID_STATUS');
  END IF;

  UPDATE public.application_acknowledgements a
  SET status = _status,
      provider = coalesce(_provider, a.provider),
      provider_message_id = coalesce(_provider_message_id, a.provider_message_id),
      failure_reason = CASE WHEN _status = 'DELIVERY_FAILED' THEN _failure_reason ELSE NULL END,
      retry_count = CASE WHEN _status = 'DELIVERY_FAILED' THEN a.retry_count + 1 ELSE a.retry_count END,
      delivery_requested_at = CASE
        WHEN _status = 'DELIVERY_PENDING' THEN coalesce(a.delivery_requested_at, now())
        ELSE a.delivery_requested_at END,
      delivered_at = CASE WHEN _status = 'DELIVERED' THEN now() ELSE a.delivered_at END,
      document_bucket = coalesce(_document_bucket, a.document_bucket),
      document_path = coalesce(_document_path, a.document_path),
      document_checksum = coalesce(a.document_checksum, _document_checksum),
      delivery_history = a.delivery_history || jsonb_build_object(
        'status', _status,
        'at', now(),
        'provider', _provider,
        'provider_message_id', _provider_message_id,
        'failure_reason', _failure_reason
      )
  WHERE a.id = _acknowledgement_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Acknowledgement not found', 'code', 'NOT_FOUND');
  END IF;
  RETURN jsonb_build_object('success', true, 'acknowledgement', to_jsonb(v_row));
END;
$$;

REVOKE ALL ON FUNCTION public.set_acknowledgement_delivery_state(uuid, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_acknowledgement_delivery_state(uuid, text, text, text, text, text, text, text) TO service_role;

-- ---------------------------------------------------------
-- 6.2 Sufficiency determinations (server-enforced)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sufficiency_determinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  evaluation_id uuid REFERENCES public.sufficiency_evaluations(id) ON DELETE SET NULL,
  decision text NOT NULL,
  reason text NOT NULL,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  unresolved_blocker_count integer NOT NULL DEFAULT 0,
  open_rfi_count integer NOT NULL DEFAULT 0,
  gate_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  determined_by uuid NOT NULL,
  determined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sufficiency_determinations_decision_check CHECK (decision = ANY (ARRAY['sufficient','insufficient','deferred'])),
  CONSTRAINT sufficiency_determinations_reason_len CHECK (length(btrim(reason)) >= 10)
);

GRANT SELECT ON public.sufficiency_determinations TO authenticated;
GRANT ALL ON public.sufficiency_determinations TO service_role;

ALTER TABLE public.sufficiency_determinations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sufficiency_determinations_read" ON public.sufficiency_determinations;
CREATE POLICY "sufficiency_determinations_read"
  ON public.sufficiency_determinations FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'application_management', 'view')
    OR public.has_role(auth.uid(), 'legal_compliance'::app_role)
  );

DROP POLICY IF EXISTS "sufficiency_determinations_no_client_insert" ON public.sufficiency_determinations;
CREATE POLICY "sufficiency_determinations_no_client_insert"
  ON public.sufficiency_determinations FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "sufficiency_determinations_no_update" ON public.sufficiency_determinations;
CREATE POLICY "sufficiency_determinations_no_update"
  ON public.sufficiency_determinations AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "sufficiency_determinations_no_delete" ON public.sufficiency_determinations;
CREATE POLICY "sufficiency_determinations_no_delete"
  ON public.sufficiency_determinations AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);

CREATE INDEX IF NOT EXISTS idx_sufficiency_determinations_app
  ON public.sufficiency_determinations (application_id, determined_at DESC);

CREATE OR REPLACE FUNCTION public.tg_sufficiency_determination_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'SUFFICIENCY_DETERMINATION_APPEND_ONLY: determinations cannot be modified or deleted'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_sufficiency_determination_append_only ON public.sufficiency_determinations;
CREATE TRIGGER trg_sufficiency_determination_append_only
  BEFORE UPDATE OR DELETE ON public.sufficiency_determinations
  FOR EACH ROW EXECUTE FUNCTION public.tg_sufficiency_determination_append_only();

CREATE OR REPLACE FUNCTION public.record_sufficiency_determination(
  _application_id uuid,
  _decision text,
  _reason text,
  _checklist jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app RECORD;
  v_eval RECORD;
  v_blockers int := 0;
  v_open_rfi int := 0;
  v_gates jsonb;
  v_row public.sufficiency_determinations;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated', 'code', 'UNAUTHENTICATED');
  END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR public.has_permission(v_uid, 'application_management', 'workflow_action')
    OR public.has_permission(v_uid, 'application_management', 'edit')
  ) THEN
    RETURN jsonb_build_object('error', 'You are not permitted to record a sufficiency determination', 'code', 'FORBIDDEN');
  END IF;

  IF _decision NOT IN ('sufficient','insufficient','deferred') THEN
    RETURN jsonb_build_object('error', 'Invalid decision', 'code', 'INVALID_DECISION');
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 10 THEN
    RETURN jsonb_build_object('error', 'Reason must be at least 10 characters', 'code', 'REASON_REQUIRED');
  END IF;

  SELECT id, status, submitted_at INTO v_app FROM public.applications WHERE id = _application_id;
  IF v_app.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Application not found', 'code', 'NOT_FOUND');
  END IF;
  IF v_app.submitted_at IS NULL THEN
    RETURN jsonb_build_object('error', 'Application has not been submitted', 'code', 'NOT_SUBMITTED');
  END IF;

  SELECT * INTO v_eval
  FROM public.sufficiency_evaluations
  WHERE application_id = _application_id
  ORDER BY evaluated_at DESC
  LIMIT 1;

  IF v_eval.id IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'Run a sufficiency evaluation before recording a determination',
      'code', 'NO_EVALUATION');
  END IF;

  SELECT count(*) INTO v_blockers
  FROM public.sufficiency_evaluation_results r
  WHERE r.evaluation_id = v_eval.id
    AND r.status = 'fail'
    AND r.severity = 'blocker'
    AND NOT EXISTS (SELECT 1 FROM public.sufficiency_overrides o WHERE o.evaluation_result_id = r.id);

  SELECT count(*) INTO v_open_rfi
  FROM public.application_rfis
  WHERE application_id = _application_id AND status IN ('open','responded');

  v_gates := public.decision_gate_status(_application_id);

  -- Server-enforced: a "sufficient" outcome is impossible while blocking
  -- conditions remain, regardless of what the reviewer ticked in the UI.
  IF _decision = 'sufficient' AND (v_blockers > 0 OR v_open_rfi > 0) THEN
    RETURN jsonb_build_object(
      'error', 'Cannot declare sufficient: '
        || v_blockers || ' unresolved blocker(s), ' || v_open_rfi || ' open/unclosed RFI(s)',
      'code', 'SUFFICIENCY_GATES_UNMET',
      'unresolved_blocker_count', v_blockers,
      'open_rfi_count', v_open_rfi,
      'gates', v_gates);
  END IF;

  INSERT INTO public.sufficiency_determinations (
    application_id, evaluation_id, decision, reason, checklist,
    unresolved_blocker_count, open_rfi_count, gate_snapshot, determined_by
  ) VALUES (
    _application_id, v_eval.id, _decision, btrim(_reason), coalesce(_checklist, '[]'::jsonb),
    v_blockers, v_open_rfi, coalesce(v_gates, '{}'::jsonb), v_uid
  )
  RETURNING * INTO v_row;

  UPDATE public.applications
  SET sufficiency_status = CASE
        WHEN _decision = 'sufficient' THEN 'passed'
        WHEN _decision = 'insufficient' THEN 'blocked'
        ELSE 'warning' END,
      last_sufficiency_evaluation_id = v_eval.id,
      updated_at = now()
  WHERE id = _application_id;

  RETURN jsonb_build_object('success', true, 'determination', to_jsonb(v_row));
END;
$$;

REVOKE ALL ON FUNCTION public.record_sufficiency_determination(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_sufficiency_determination(uuid, text, text, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------
-- 6.3 Legal / specialist referrals
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.application_legal_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  workflow_instance_id uuid,
  step_id uuid REFERENCES public.approval_steps(id) ON DELETE SET NULL,
  specialism text NOT NULL DEFAULT 'legal',
  referral_reason text NOT NULL,
  referred_by uuid NOT NULL,
  referred_to uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'referred',
  returned_at timestamptz,
  returned_by uuid,
  completion_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_legal_referrals_status_check CHECK (status = ANY (ARRAY['referred','in_review','returned','completed','cancelled'])),
  CONSTRAINT application_legal_referrals_reason_len CHECK (length(btrim(referral_reason)) >= 10),
  CONSTRAINT application_legal_referrals_specialism_check CHECK (specialism = ANY (ARRAY['legal','compliance','aml','actuarial','it_risk','other']))
);

GRANT SELECT, INSERT, UPDATE ON public.application_legal_referrals TO authenticated;
GRANT ALL ON public.application_legal_referrals TO service_role;

ALTER TABLE public.application_legal_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "legal_referrals_read" ON public.application_legal_referrals;
CREATE POLICY "legal_referrals_read"
  ON public.application_legal_referrals FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_legal_access(auth.uid())
    OR referred_to = auth.uid()
    OR referred_by = auth.uid()
    OR public.has_permission(auth.uid(), 'application_management', 'workflow_action')
  );

DROP POLICY IF EXISTS "legal_referrals_insert" ON public.application_legal_referrals;
CREATE POLICY "legal_referrals_insert"
  ON public.application_legal_referrals FOR INSERT TO authenticated
  WITH CHECK (
    referred_by = auth.uid()
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(), 'application_management', 'workflow_action')
      OR public.has_permission(auth.uid(), 'application_management', 'edit')
    )
  );

DROP POLICY IF EXISTS "legal_referrals_update" ON public.application_legal_referrals;
CREATE POLICY "legal_referrals_update"
  ON public.application_legal_referrals FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_legal_access(auth.uid())
    OR referred_to = auth.uid()
    OR referred_by = auth.uid()
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_legal_access(auth.uid())
    OR referred_to = auth.uid()
    OR referred_by = auth.uid()
  );

DROP POLICY IF EXISTS "legal_referrals_no_delete" ON public.application_legal_referrals;
CREATE POLICY "legal_referrals_no_delete"
  ON public.application_legal_referrals AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);

CREATE INDEX IF NOT EXISTS idx_legal_referrals_application
  ON public.application_legal_referrals (application_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_referrals_open
  ON public.application_legal_referrals (status, due_at) WHERE status IN ('referred','in_review');

-- Link legal opinions to their referral (additive, nullable).
ALTER TABLE public.application_legal_notes
  ADD COLUMN IF NOT EXISTS referral_id uuid REFERENCES public.application_legal_referrals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_application_legal_notes_referral
  ON public.application_legal_notes (referral_id);

-- Opinion history must be preserved: no overwrite, no delete by app users.
DROP POLICY IF EXISTS "Legal reviewers update own legal notes" ON public.application_legal_notes;

DROP POLICY IF EXISTS "legal_notes_no_update" ON public.application_legal_notes;
CREATE POLICY "legal_notes_no_update"
  ON public.application_legal_notes AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "legal_notes_no_delete" ON public.application_legal_notes;
CREATE POLICY "legal_notes_no_delete"
  ON public.application_legal_notes AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);

REVOKE UPDATE, DELETE ON public.application_legal_notes FROM authenticated;
REVOKE UPDATE, DELETE ON public.application_legal_notes FROM anon;

-- Referral status transitions + completion requires a recorded opinion.
CREATE OR REPLACE FUNCTION public.tg_legal_referral_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allowed boolean := false;
  v_opinions int := 0;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_allowed := (OLD.status, NEW.status) IN (
      ('referred','in_review'),
      ('referred','cancelled'),
      ('in_review','returned'),
      ('in_review','cancelled'),
      ('returned','completed'),
      ('returned','in_review')
    );
    IF NOT v_allowed THEN
      RAISE EXCEPTION 'LEGAL_REFERRAL_INVALID_TRANSITION: % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'returned' THEN
      SELECT count(*) INTO v_opinions
      FROM public.application_legal_notes n
      WHERE n.referral_id = NEW.id;
      IF v_opinions = 0 THEN
        RAISE EXCEPTION 'LEGAL_REFERRAL_OPINION_REQUIRED: record a legal opinion before returning the referral to the case'
          USING ERRCODE = 'check_violation';
      END IF;
      NEW.returned_at := coalesce(NEW.returned_at, now());
      NEW.returned_by := coalesce(NEW.returned_by, auth.uid());
    END IF;
  END IF;

  -- Provenance columns are immutable.
  IF NEW.application_id IS DISTINCT FROM OLD.application_id
     OR NEW.referred_by IS DISTINCT FROM OLD.referred_by
     OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
     OR NEW.referral_reason IS DISTINCT FROM OLD.referral_reason
  THEN
    RAISE EXCEPTION 'LEGAL_REFERRAL_IMMUTABLE: referral provenance cannot be changed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_legal_referral_transition ON public.application_legal_referrals;
CREATE TRIGGER trg_legal_referral_transition
  BEFORE UPDATE ON public.application_legal_referrals
  FOR EACH ROW EXECUTE FUNCTION public.tg_legal_referral_transition();

DROP TRIGGER IF EXISTS trg_legal_referral_audit ON public.application_legal_referrals;
CREATE TRIGGER trg_legal_referral_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.application_legal_referrals
  FOR EACH ROW EXECUTE FUNCTION public.tg_auto_compliance_audit();
