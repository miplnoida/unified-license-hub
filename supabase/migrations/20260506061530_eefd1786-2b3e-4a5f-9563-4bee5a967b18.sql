CREATE OR REPLACE FUNCTION public.prevent_new_application_when_active_exists()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allow_reapp boolean;
  v_active_count int;
BEGIN
  IF public.has_role(NEW.applicant_id, 'admin') OR public.has_role(NEW.applicant_id, 'super_admin') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((value->>'allow_reapplication')::boolean, true) INTO v_allow_reapp
  FROM public.site_settings WHERE key = 'application_settings';

  IF v_allow_reapp IS NULL OR v_allow_reapp = true THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_active_count
  FROM public.applications
  WHERE applicant_id = NEW.applicant_id
    AND id <> NEW.id
    AND status NOT IN ('draft','cancelled','rejected','withdrawn','closed');

  IF v_active_count > 0 THEN
    RAISE EXCEPTION 'You cannot submit a new application while your previous application is still being processed.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;