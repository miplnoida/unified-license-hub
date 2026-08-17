-- ─────────────────────────────────────────────────────────────────────────────
-- The declaration portal's identity gate ("Last 4 digits of national ID /
-- passport number") only ever validated against a single stored hash, and
-- every invitation-creation path (Assessment Initiation, Assessment Detail,
-- FpaDeclarations) only ever computed that hash from fp_individuals.national_id
-- — passport_number was never used. An individual on file with only a
-- passport number (or who simply enters their passport's last 4 instead of
-- their national ID's) could never pass verification, regardless of how
-- correct their answer was.
--
-- Add a second, optional hash column so an invitation can be created against
-- whichever identity document(s) the individual actually has on file, and
-- accept either at verification time. verification_hash keeps its existing
-- meaning (whichever document was used when only one was available); the new
-- column holds the second document's hash when both are on file.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.declaration_invitations
  ADD COLUMN IF NOT EXISTS verification_hash_alt text;

COMMENT ON COLUMN public.declaration_invitations.verification_hash IS
  'sha256(dob||''|''||upper(last4)) for whichever identity document (national ID or passport) was used — see verification_hash_alt for the second, when both are on file.';
COMMENT ON COLUMN public.declaration_invitations.verification_hash_alt IS
  'Second identity document''s hash (national ID or passport, whichever verification_hash is not), when the individual has both on file. Either may be presented at verification.';

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

  -- Accept either identity document's hash — national ID or passport.
  IF v_inv.verification_hash = v_vhash
     OR (v_inv.verification_hash_alt IS NOT NULL AND v_inv.verification_hash_alt = v_vhash) THEN
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
