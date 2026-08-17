-- ─────────────────────────────────────────────────────────────────────────────
-- Step 17 of the standard Fit & Proper process ("Training & awareness") has
-- no implementation at all today. Per product decision this is track-only —
-- record who has acknowledged the current F&P policy/training and when,
-- without gating any other action on it (no lockouts for staff who haven't
-- attested yet).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fp_training_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  policy_version text NOT NULL,
  attested_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS idx_fp_training_attestations_user ON public.fp_training_attestations(user_id);
CREATE INDEX IF NOT EXISTS idx_fp_training_attestations_version ON public.fp_training_attestations(policy_version);

-- Append-only — an attestation is a point-in-time record, not something to edit later.
CREATE OR REPLACE FUNCTION public.tg_prevent_fp_attestation_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'fp_training_attestations is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_fp_attestation_no_mutation ON public.fp_training_attestations;
CREATE TRIGGER trg_fp_attestation_no_mutation
  BEFORE UPDATE OR DELETE ON public.fp_training_attestations
  FOR EACH ROW EXECUTE FUNCTION public.tg_prevent_fp_attestation_mutation();

ALTER TABLE public.fp_training_attestations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.fp_training_attestations FROM anon;
GRANT SELECT, INSERT ON public.fp_training_attestations TO authenticated;
GRANT ALL ON public.fp_training_attestations TO service_role;

DROP POLICY IF EXISTS "fp_training_attestations_read" ON public.fp_training_attestations;
CREATE POLICY "fp_training_attestations_read" ON public.fp_training_attestations
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin(auth.uid())
    OR public.is_fp_staff(auth.uid())
  );

DROP POLICY IF EXISTS "fp_training_attestations_insert" ON public.fp_training_attestations;
CREATE POLICY "fp_training_attestations_insert" ON public.fp_training_attestations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
