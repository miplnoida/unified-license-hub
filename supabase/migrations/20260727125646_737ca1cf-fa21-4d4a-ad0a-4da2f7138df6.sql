-- Preserve the existing projection logic, gate it behind a strict identity check.
ALTER FUNCTION public.get_public_complaint_tracking(text, text)
  RENAME TO get_public_complaint_tracking_raw;

REVOKE ALL ON FUNCTION public.get_public_complaint_tracking_raw(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_complaint_tracking(p_reference text, p_email text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_c record;
  v_caller uuid;
  v_caller_email text;
  v_allowed boolean := false;
BEGIN
  IF p_reference IS NULL OR length(trim(p_reference)) < 4 THEN
    RETURN jsonb_build_object('found', false, 'error', 'REFERENCE_REQUIRED');
  END IF;

  SELECT id, complainant_id, email INTO v_c
    FROM public.complaints
   WHERE complaint_number = trim(p_reference)
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  v_caller := auth.uid();
  IF v_caller IS NOT NULL THEN
    SELECT lower(btrim(u.email)) INTO v_caller_email FROM auth.users u WHERE u.id = v_caller;
  END IF;

  v_allowed :=
       (v_caller IS NOT NULL AND v_c.complainant_id = v_caller)
    OR (v_caller_email IS NOT NULL AND v_c.email IS NOT NULL
        AND lower(btrim(v_c.email)) = v_caller_email)
    OR (p_email IS NOT NULL AND v_c.email IS NOT NULL AND btrim(v_c.email) <> ''
        AND lower(btrim(p_email)) = lower(btrim(v_c.email)))
    OR (v_caller IS NOT NULL AND public.has_complaint_perm(v_caller, 'view'));

  IF NOT v_allowed THEN
    RETURN jsonb_build_object('found', false, 'error', 'CONTACT_MISMATCH');
  END IF;

  -- Authorised: return the existing redacted projection. The inner function
  -- keeps its own email check, so pass the complaint's contact email through.
  RETURN public.get_public_complaint_tracking_raw(p_reference, v_c.email);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_public_complaint_tracking(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_complaint_tracking(text, text) TO anon, authenticated, service_role;