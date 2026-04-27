CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_application()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sector_id uuid;
  v_existing_id uuid;
  v_allow_reapply boolean;
  v_settings jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('draft','cancelled','rejected','withdrawn') THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = OLD.status THEN RETURN NEW; END IF;
    IF NEW.status IN ('draft','cancelled','rejected','withdrawn') THEN
      RETURN NEW;
    END IF;
  END IF;

  IF public.has_role(auth.uid(), 'super_admin'::app_role)
     OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Read the unified application_settings JSON object (admin UI saves it here)
  SELECT value INTO v_settings
  FROM public.site_settings
  WHERE key = 'application_settings'
  LIMIT 1;

  IF v_settings IS NOT NULL AND (v_settings->>'allow_reapplication')::boolean IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Fallback: legacy flat key
  SELECT (value::text)::boolean INTO v_allow_reapply
  FROM public.site_settings
  WHERE key = 'allow_reapplication'
  LIMIT 1;

  IF COALESCE(v_allow_reapply, false) THEN
    RETURN NEW;
  END IF;

  v_sector_id := NULLIF(NEW.data->>'sector_id','')::uuid;
  IF v_sector_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_existing_id
  FROM public.applications
  WHERE applicant_id = NEW.applicant_id
    AND id <> NEW.id
    AND COALESCE((data->>'sector_id'),'') = v_sector_id::text
    AND status NOT IN ('draft','cancelled','rejected','withdrawn')
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_SECTOR_APPLICATION: An active application already exists for this sector (id=%). Re-apply is allowed only after cancellation, rejection, or withdrawal.', v_existing_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;