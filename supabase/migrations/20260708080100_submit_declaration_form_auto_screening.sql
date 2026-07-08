-- ─────────────────────────────────────────────────────────────────────────────
-- submit_declaration_form: return which screening configs should auto-run
--
-- Return type changes from boolean to jsonb ({ success, auto_config_ids }) so
-- the caller can trigger fp-screening-run against exactly the processes
-- mapped by an active 'declaration_received' fp_screening_execution_rules row
-- matching this assessment's assessment_type (NULL rule = matches any type).
-- Postgres won't let CREATE OR REPLACE change a function's return type, so the
-- old boolean-returning function is dropped first. All notification behavior
-- from the previous version is preserved unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.submit_declaration_form(text, uuid, uuid, jsonb);

CREATE FUNCTION public.submit_declaration_form(
  p_token         text,
  p_inv_id        uuid,
  p_assessment_id uuid,
  p_form_data     jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash           text := encode(sha256(p_token::bytea), 'hex');
  v_existing       jsonb;
  v_merged         jsonb;
  v_assess_creator uuid;
  v_inv_sender     uuid;
  v_indiv_name     text;
  v_assess_type    text;
  v_notif_message  text;
  v_config_ids     uuid[];
BEGIN
  -- ── 1. Validate token → invitation is still open & unexpired ──────────────
  IF NOT EXISTS (
    SELECT 1
    FROM   public.declaration_invitations
    WHERE  id            = p_inv_id
      AND  token_hash    = v_hash
      AND  assessment_id = p_assessment_id
      AND  status       != 'SUBMITTED'
      AND  expires_at    > now()
  ) THEN
    RETURN jsonb_build_object('success', false);
  END IF;

  -- ── 2. Fetch context needed for notifications ─────────────────────────────
  SELECT a.created_by,
         i.full_name,
         a.assessment_type
  INTO   v_assess_creator,
         v_indiv_name,
         v_assess_type
  FROM   public.fp_assessments a
  JOIN   public.fp_individuals i ON i.id = a.individual_id
  WHERE  a.id = p_assessment_id;

  SELECT created_by
  INTO   v_inv_sender
  FROM   public.declaration_invitations
  WHERE  id = p_inv_id;

  -- ── 3. Merge form data into fp_assessments.declaration_data ───────────────
  SELECT COALESCE(declaration_data, '{}'::jsonb)
  INTO   v_existing
  FROM   public.fp_assessments
  WHERE  id = p_assessment_id;

  v_merged := v_existing
           || p_form_data
           || jsonb_build_object('submitted_at', now()::text);

  -- ── 4. Persist & advance assessment status ────────────────────────────────
  UPDATE public.fp_assessments
  SET    declaration_data = v_merged,
         status           = CASE
                              WHEN status IN ('draft', 'screening') THEN 'submitted'
                              ELSE status
                            END,
         updated_at       = now()
  WHERE  id = p_assessment_id;

  -- ── 5. Mark invitation SUBMITTED ──────────────────────────────────────────
  UPDATE public.declaration_invitations
  SET    status       = 'SUBMITTED',
         submitted_at = now()
  WHERE  id = p_inv_id;

  -- ── 6. Build notification message ─────────────────────────────────────────
  v_notif_message :=
    COALESCE(v_indiv_name, 'An individual')
    || ' has submitted their Personal Questionnaire Declaration'
    || CASE
         WHEN v_assess_type IS NOT NULL
         THEN ' (' || replace(v_assess_type, '_', ' ') || ' assessment)'
         ELSE ''
       END
    || '. The assessment is ready for your review.';

  -- ── 7. Notify the assessment creator ─────────────────────────────────────
  -- SECURITY DEFINER bypasses RLS — insert always succeeds.
  -- The INSERT triggers Supabase Realtime → bell badge updates instantly.
  IF v_assess_creator IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id, title, message, type,
      entity_type, entity_id,
      channel, delivery_status, read
    ) VALUES (
      v_assess_creator,
      'Declaration Submitted',
      v_notif_message,
      'success',
      'fp_assessment', p_assessment_id::text,
      'in_app', 'delivered', false
    );
  END IF;

  -- ── 8. Notify the invitation sender (if different from assessment creator) ─
  IF v_inv_sender IS NOT NULL
     AND v_inv_sender IS DISTINCT FROM v_assess_creator THEN
    INSERT INTO public.notifications (
      user_id, title, message, type,
      entity_type, entity_id,
      channel, delivery_status, read
    ) VALUES (
      v_inv_sender,
      'Declaration Submitted',
      v_notif_message,
      'success',
      'fp_assessment', p_assessment_id::text,
      'in_app', 'delivered', false
    );
  END IF;

  -- ── 9. Resolve active "Received Declaration" automatic screening rules ────
  SELECT COALESCE(array_agg(screening_config_id), ARRAY[]::uuid[])
  INTO   v_config_ids
  FROM   public.fp_screening_execution_rules
  WHERE  is_active     = true
    AND  trigger_event = 'declaration_received'
    AND  (assessment_type IS NULL OR assessment_type = v_assess_type);

  RETURN jsonb_build_object('success', true, 'auto_config_ids', to_jsonb(v_config_ids));
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_declaration_form(text, uuid, uuid, jsonb)
  TO anon, authenticated;
