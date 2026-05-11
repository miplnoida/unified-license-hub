
-- Tighten duplicate-active-application trigger to match the full triple/quadruple
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

  -- Active / in-progress / payment-pending duplicates ALWAYS blocked.
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

  -- Re-application policy: block approved/rejected duplicates if disabled.
  SELECT value INTO v_settings
  FROM public.site_settings WHERE key = 'application_settings' LIMIT 1;

  v_allow_reapply := COALESCE((v_settings->>'allow_reapplication')::boolean, true);

  IF NOT v_allow_reapply THEN
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

-- Server-side guard called from the wizard before creating/continuing a draft.
CREATE OR REPLACE FUNCTION public.apply_application_guard(
  _sector_id uuid,
  _sub_sector_id uuid,
  _category_id uuid,
  _service_id uuid DEFAULT NULL
) RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_settings jsonb;
  v_allow_reapply boolean;
  v_app record;
  v_pay_pending boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('action','block','code','UNAUTHORIZED',
      'message','You must be signed in.');
  END IF;
  IF _sector_id IS NULL THEN
    RETURN jsonb_build_object('action','block','code','BAD_REQUEST',
      'message','Sector is required.');
  END IF;

  SELECT value INTO v_settings FROM public.site_settings
   WHERE key = 'application_settings' LIMIT 1;
  v_allow_reapply := COALESCE((v_settings->>'allow_reapplication')::boolean, true);

  -- 1. Existing draft for the same triple → continue it.
  SELECT id INTO v_app.id
  FROM public.applications
  WHERE applicant_id = v_uid
    AND status = 'draft'
    AND COALESCE(data->>'sector_id','')      = COALESCE(_sector_id::text,'')
    AND COALESCE(data->>'sub_sector_id','')  = COALESCE(_sub_sector_id::text,'')
    AND COALESCE(data->>'category_id','')    = COALESCE(_category_id::text,'')
    AND COALESCE(data->>'service_id','')     = COALESCE(_service_id::text,'')
  ORDER BY updated_at DESC LIMIT 1;
  IF v_app.id IS NOT NULL THEN
    RETURN jsonb_build_object('action','continue_draft','application_id', v_app.id,
      'message','You already have a draft for this sector / sub-sector / service. Continuing your draft.');
  END IF;

  -- 2. Pending payment for the same triple — either by status or by an
  --    application that has a non-completed payment row.
  FOR v_app IN
    SELECT a.id, a.status
      FROM public.applications a
     WHERE a.applicant_id = v_uid
       AND COALESCE(a.data->>'sector_id','')     = COALESCE(_sector_id::text,'')
       AND COALESCE(a.data->>'sub_sector_id','') = COALESCE(_sub_sector_id::text,'')
       AND COALESCE(a.data->>'category_id','')   = COALESCE(_category_id::text,'')
       AND COALESCE(a.data->>'service_id','')    = COALESCE(_service_id::text,'')
       AND a.status NOT IN ('cancelled','rejected','withdrawn','approved','draft')
  LOOP
    IF v_app.status IN ('payment_pending','awaiting_payment','pending_payment') THEN
      RETURN jsonb_build_object('action','redirect_payment','application_id', v_app.id,
        'message','You have an application with pending payment. Please complete payment to continue.');
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.payments p
       WHERE p.application_id = v_app.id
         AND p.status NOT IN ('completed','success','paid','refunded','cancelled','failed')
    ) INTO v_pay_pending;
    IF v_pay_pending THEN
      RETURN jsonb_build_object('action','redirect_payment','application_id', v_app.id,
        'message','You have an application with pending payment. Please complete payment to continue.');
    END IF;
  END LOOP;

  -- 3. Active / in-review duplicates ALWAYS blocked.
  SELECT id INTO v_app.id
  FROM public.applications
  WHERE applicant_id = v_uid
    AND COALESCE(data->>'sector_id','')      = COALESCE(_sector_id::text,'')
    AND COALESCE(data->>'sub_sector_id','')  = COALESCE(_sub_sector_id::text,'')
    AND COALESCE(data->>'category_id','')    = COALESCE(_category_id::text,'')
    AND COALESCE(data->>'service_id','')     = COALESCE(_service_id::text,'')
    AND status IN (
      'submitted','in_progress','in_review','pending_review','under_review',
      'forwarded','query_raised','resubmission_requested','awaiting_approval'
    )
  LIMIT 1;
  IF v_app.id IS NOT NULL THEN
    RETURN jsonb_build_object('action','block','code','DUPLICATE_ACTIVE',
      'application_id', v_app.id,
      'message','You already have an active application for this sector / sub-sector / service. You cannot start a new one until it is finalised.');
  END IF;

  -- 4. Approved/Rejected duplicates — depends on the policy switch.
  IF NOT v_allow_reapply THEN
    SELECT id INTO v_app.id
    FROM public.applications
    WHERE applicant_id = v_uid
      AND COALESCE(data->>'sector_id','')      = COALESCE(_sector_id::text,'')
      AND COALESCE(data->>'sub_sector_id','')  = COALESCE(_sub_sector_id::text,'')
      AND COALESCE(data->>'category_id','')    = COALESCE(_category_id::text,'')
      AND COALESCE(data->>'service_id','')     = COALESCE(_service_id::text,'')
      AND status = 'approved'
    LIMIT 1;
    IF v_app.id IS NOT NULL THEN
      RETURN jsonb_build_object('action','block','code','DUPLICATE_APPROVED',
        'application_id', v_app.id,
        'message','You already have an Approved application for this sector / sub-sector / service. Please use the renewal flow if available.');
    END IF;
    SELECT id INTO v_app.id
    FROM public.applications
    WHERE applicant_id = v_uid
      AND COALESCE(data->>'sector_id','')      = COALESCE(_sector_id::text,'')
      AND COALESCE(data->>'sub_sector_id','')  = COALESCE(_sub_sector_id::text,'')
      AND COALESCE(data->>'category_id','')    = COALESCE(_category_id::text,'')
      AND COALESCE(data->>'service_id','')     = COALESCE(_service_id::text,'')
      AND status = 'rejected'
    LIMIT 1;
    IF v_app.id IS NOT NULL THEN
      RETURN jsonb_build_object('action','block','code','DUPLICATE_REJECTED',
        'application_id', v_app.id,
        'message','Your previous application for this sector / sub-sector / service was Rejected. Re-application is not allowed.');
    END IF;
  END IF;

  RETURN jsonb_build_object('action','allow');
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_application_guard(uuid,uuid,uuid,uuid) TO authenticated;
