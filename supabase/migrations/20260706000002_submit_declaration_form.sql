-- ─────────────────────────────────────────────────────────────────────────────
-- submit_declaration_form
-- Replaces the demo-only submit_declaration_by_token with a version that:
--   1. Validates the raw token → invitation
--   2. Merges questionnaire responses into fp_assessments.declaration_data
--   3. Advances fp_assessments.status to 'submitted'
--   4. Marks declaration_invitations.status = 'SUBMITTED'
-- Called by the public portal (anon role) — SECURITY DEFINER.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_declaration_form(
  p_token         text,
  p_inv_id        uuid,
  p_assessment_id uuid,
  p_form_data     jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash      text := encode(sha256(p_token::bytea), 'hex');
  v_existing  jsonb;
  v_merged    jsonb;
BEGIN
  -- Validate that the token, invitation, and assessment all match
  IF NOT EXISTS (
    SELECT 1
    FROM   public.declaration_invitations
    WHERE  id             = p_inv_id
      AND  token_hash     = v_hash
      AND  assessment_id  = p_assessment_id
      AND  status        != 'SUBMITTED'
      AND  expires_at     > now()
  ) THEN
    RETURN false;
  END IF;

  -- Merge the submitted form data with any existing declaration_data on the assessment
  SELECT COALESCE(declaration_data, '{}'::jsonb)
  INTO   v_existing
  FROM   public.fp_assessments
  WHERE  id = p_assessment_id;

  v_merged := v_existing || p_form_data || jsonb_build_object('submitted_at', now()::text);

  -- Save questionnaire responses and advance assessment status
  UPDATE public.fp_assessments
  SET    declaration_data = v_merged,
         status           = CASE
                              WHEN status IN ('draft', 'screening') THEN 'submitted'
                              ELSE status
                            END,
         updated_at       = now()
  WHERE  id = p_assessment_id;

  -- Mark invitation as SUBMITTED
  UPDATE public.declaration_invitations
  SET    status       = 'SUBMITTED',
         submitted_at = now()
  WHERE  id = p_inv_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_declaration_form(text, uuid, uuid, jsonb) TO anon, authenticated;
