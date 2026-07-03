
-- Phase 5A (v2) — replace 'internal_staff' with the enum values actually present.

-- ---- Gap 4: license certificate dispatch + signature ledger ----
ALTER TABLE public.license_certificates
  ADD COLUMN IF NOT EXISTS dispatch_status text NOT NULL DEFAULT 'draft'
    CHECK (dispatch_status IN ('draft','ready','dispatched','revoked')),
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.license_certificate_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id uuid NOT NULL REFERENCES public.license_certificates(id) ON DELETE CASCADE,
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  signer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  signer_name text NOT NULL,
  signer_title text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  content_sha256 text NOT NULL,
  signature_hmac text NOT NULL,
  signing_key_fingerprint text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.license_certificate_signatures TO authenticated;
GRANT ALL ON public.license_certificate_signatures TO service_role;

ALTER TABLE public.license_certificate_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal staff can read certificate signatures"
  ON public.license_certificate_signatures FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR public.has_role(auth.uid(), 'licensing_officer')
    OR public.has_role(auth.uid(), 'analyst')
    OR public.has_role(auth.uid(), 'legal_compliance')
  );

CREATE POLICY "Service role writes certificate signatures"
  ON public.license_certificate_signatures FOR INSERT TO service_role
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_lic_cert_sig_cert ON public.license_certificate_signatures(certificate_id);
CREATE INDEX IF NOT EXISTS idx_lic_cert_sig_license ON public.license_certificate_signatures(license_id);

-- ---- Gap 11: F&P weighted voting + casting vote ----
ALTER TABLE public.fp_committees
  ADD COLUMN IF NOT EXISTS casting_vote_member_id uuid REFERENCES public.fp_committee_members(id) ON DELETE SET NULL;

ALTER TABLE public.fp_committee_members
  ADD COLUMN IF NOT EXISTS vote_weight numeric NOT NULL DEFAULT 1
    CHECK (vote_weight > 0 AND vote_weight <= 100);

ALTER TABLE public.fp_committee_votes
  ADD COLUMN IF NOT EXISTS weight numeric NOT NULL DEFAULT 1
    CHECK (weight >= 0 AND weight <= 100),
  ADD COLUMN IF NOT EXISTS rationale_required boolean NOT NULL DEFAULT false;

-- ---- Gap 2: AI-proposed routing acceptance ----
ALTER TABLE public.application_ai_assessments
  ADD COLUMN IF NOT EXISTS proposed_routing_step_id uuid REFERENCES public.approval_steps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposed_routing_rationale text,
  ADD COLUMN IF NOT EXISTS routing_decision text
    CHECK (routing_decision IN ('accepted','overridden')),
  ADD COLUMN IF NOT EXISTS routing_decision_reason text,
  ADD COLUMN IF NOT EXISTS routing_decision_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS routing_decision_at timestamptz;

-- ---- Gap 3: legal-access helper + tightened legal-notes RLS ----
CREATE OR REPLACE FUNCTION public.has_legal_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin','admin','legal_compliance')
  )
$$;

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='application_legal_notes'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.application_legal_notes', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "Legal reviewers read legal notes"
  ON public.application_legal_notes FOR SELECT TO authenticated
  USING (public.has_legal_access(auth.uid()) OR actor_id = auth.uid());

CREATE POLICY "Legal reviewers insert legal notes"
  ON public.application_legal_notes FOR INSERT TO authenticated
  WITH CHECK (public.has_legal_access(auth.uid()) AND actor_id = auth.uid());

CREATE POLICY "Legal reviewers update own legal notes"
  ON public.application_legal_notes FOR UPDATE TO authenticated
  USING (public.has_legal_access(auth.uid()) AND actor_id = auth.uid())
  WITH CHECK (public.has_legal_access(auth.uid()) AND actor_id = auth.uid());

CREATE POLICY "Service role manages legal notes"
  ON public.application_legal_notes FOR ALL TO service_role
  USING (true) WITH CHECK (true);
