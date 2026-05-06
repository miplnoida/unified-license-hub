-- Server-side guard: block draft creation when "Allow Re-Application" is disabled
-- and the user already has an active (non-finalized) application.
CREATE OR REPLACE FUNCTION public.prevent_new_application_when_active_exists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings jsonb;
  v_allow_reapply boolean := true;
  v_existing_id uuid;
BEGIN
  -- Admins / super_admins bypass
  IF public.has_role(auth.uid(), 'super_admin'::app_role)
     OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_settings
  FROM public.site_settings
  WHERE key = 'application_settings'
  LIMIT 1;

  IF v_settings IS NOT NULL AND (v_settings ? 'allow_reapplication') THEN
    v_allow_reapply := COALESCE((v_settings->>'allow_reapplication')::boolean, true);
  END IF;

  IF v_allow_reapply THEN
    RETURN NEW;
  END IF;

  -- Find any non-finalized application for this user (excluding self).
  -- Allowed (finalized) statuses: draft is allowed only if user has NO non-draft active.
  SELECT id INTO v_existing_id
  FROM public.applications
  WHERE applicant_id = NEW.applicant_id
    AND id <> NEW.id
    AND status NOT IN ('draft','cancelled','rejected','withdrawn','approved','closed')
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'REAPPLICATION_BLOCKED: You cannot submit a new application while your previous application is still being processed.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_new_application_when_active_exists ON public.applications;
CREATE TRIGGER trg_prevent_new_application_when_active_exists
  BEFORE INSERT ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_new_application_when_active_exists();