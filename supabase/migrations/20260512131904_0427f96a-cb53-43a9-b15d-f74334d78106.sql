-- Make the trigger honor the Allow Re-Application admin setting.
-- When allow_reapplication = true, the trigger MUST NOT raise
-- DUPLICATE_ACTIVE_APPLICATION even if a prior submitted / in-review /
-- payment-pending application exists for the same sector / sub-sector /
-- category / service. The wizard-side guard (apply_application_guard) and the
-- edge function still handle the OFF case and silent draft-continue.
CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_application()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sector uuid;
  v_sub uuid;
  v_cat uuid;
  v_svc uuid;
  v_existing_id uuid;
  v_settings jsonb;
  v_allow_reapply boolean;
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

  v_sector := NULLIF(NEW.data->>'sector_id','')::uuid;
  v_sub    := NULLIF(NEW.data->>'sub_sector_id','')::uuid;
  v_cat    := NULLIF(NEW.data->>'category_id','')::uuid;
  v_svc    := NULLIF(NEW.data->>'service_id','')::uuid;
  IF v_sector IS NULL THEN
    RETURN NEW;
  END IF;

  -- Read admin setting.
  SELECT value INTO v_settings
  FROM public.site_settings WHERE key = 'application_settings' LIMIT 1;
  v_allow_reapply := COALESCE(
    (v_settings->>'allow_reapplication')::boolean,
    (v_settings->>'allow_reapplication_after_final')::boolean,
    true
  );

  -- Active / in-progress / payment-pending duplicates are ONLY blocked when
  -- re-application is disabled. When allow_reapply = true, the user is
  -- explicitly permitted to start a parallel application for the same triple.
  IF NOT v_allow_reapply THEN
    SELECT id INTO v_existing_id
    FROM public.applications
    WHERE applicant_id = NEW.applicant_id
      AND id <> NEW.id
      AND COALESCE(data->>'sector_id','')      = COALESCE(v_sector::text,'')
      AND COALESCE(data->>'sub_sector_id','')  = COALESCE(v_sub::text,'')
      AND COALESCE(data->>'category_id','')    = COALESCE(v_cat::text,'')
      AND COALESCE(data->>'service_id','')     = COALESCE(v_svc::text,'')
      AND status IN (
        'submitted','in_progress','in_review','pending_review','under_review',
        'forwarded','query_raised','resubmission_requested','awaiting_approval',
        'payment_pending','awaiting_payment','pending_payment'
      )
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'DUPLICATE_ACTIVE_APPLICATION: An active application already exists for this sector / sub-sector / service (id=%).', v_existing_id
        USING ERRCODE = 'check_violation';
    END IF;

    -- Block approved/rejected duplicates only when policy is OFF.
    SELECT id INTO v_existing_id
    FROM public.applications
    WHERE applicant_id = NEW.applicant_id
      AND id <> NEW.id
      AND COALESCE(data->>'sector_id','')      = COALESCE(v_sector::text,'')
      AND COALESCE(data->>'sub_sector_id','')  = COALESCE(v_sub::text,'')
      AND COALESCE(data->>'category_id','')    = COALESCE(v_cat::text,'')
      AND COALESCE(data->>'service_id','')     = COALESCE(v_svc::text,'')
      AND status IN ('approved','rejected')
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'REAPPLICATION_DISABLED: Re-application is not permitted for this sector / sub-sector / service (existing id=%).', v_existing_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;