CREATE OR REPLACE FUNCTION public.apply_application_guard(
  _sector_id uuid,
  _sub_sector_id uuid,
  _category_id uuid,
  _service_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_settings jsonb;
  v_allow_reapply boolean;
  v_app_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('action','block','code','UNAUTHORIZED',
      'message','You must be signed in.');
  END IF;

  IF _sector_id IS NULL THEN
    RETURN jsonb_build_object('action','block','code','BAD_REQUEST',
      'message','Sector is required.');
  END IF;

  SELECT value INTO v_settings
  FROM public.site_settings
  WHERE key = 'application_settings'
  LIMIT 1;

  v_allow_reapply := COALESCE((v_settings->>'allow_reapplication')::boolean, true);

  -- 1) When Allow Re-Application is OFF, BLOCK on any existing editable
  --    application (draft / in_progress / resubmission_requested / query_raised)
  --    for the same triple. The user must explicitly resume from "My
  --    Applications" — no silent auto-continue from the New Application flow.
  IF NOT v_allow_reapply THEN
    SELECT a.id INTO v_app_id
    FROM public.applications a
    WHERE a.applicant_id = v_uid
      AND lower(COALESCE(a.status,'')) IN ('draft','in_progress','resubmission_requested','query_raised')
      AND COALESCE(a.data->>'sector_id','') = COALESCE(_sector_id::text,'')
      AND COALESCE(a.data->>'sub_sector_id','') = COALESCE(_sub_sector_id::text,'')
      AND COALESCE(a.data->>'category_id','') = COALESCE(_category_id::text,'')
      AND COALESCE(a.data->>'service_id','') = COALESCE(_service_id::text,'')
    ORDER BY a.updated_at DESC
    LIMIT 1;

    IF v_app_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'action','block',
        'code','DUPLICATE_EDITABLE',
        'application_id', v_app_id,
        'message','You already have an application for this sector, sub-sector, and category/service. Re-application is currently not allowed.'
      );
    END IF;
  END IF;

  -- 2) Block on truly active / submitted applications, or payment-pending
  --    applications that already have a successful payment recorded.
  WITH matching AS (
    SELECT
      a.id,
      lower(COALESCE(a.status, '')) AS app_status,
      a.updated_at,
      COALESCE(pay.has_successful_payment, false) AS has_successful_payment,
      pay.latest_payment_status
    FROM public.applications a
    LEFT JOIN LATERAL (
      SELECT
        bool_or(lower(COALESCE(p.status, '')) IN ('completed','success','paid')) AS has_successful_payment,
        (array_agg(lower(COALESCE(p.status, '')) ORDER BY p.created_at DESC NULLS LAST))[1] AS latest_payment_status
      FROM public.payments p
      WHERE p.application_id = a.id
    ) pay ON true
    WHERE a.applicant_id = v_uid
      AND COALESCE(a.data->>'sector_id','') = COALESCE(_sector_id::text,'')
      AND COALESCE(a.data->>'sub_sector_id','') = COALESCE(_sub_sector_id::text,'')
      AND COALESCE(a.data->>'category_id','') = COALESCE(_category_id::text,'')
      AND COALESCE(a.data->>'service_id','') = COALESCE(_service_id::text,'')
      AND lower(COALESCE(a.status, '')) NOT IN ('draft','in_progress','resubmission_requested','query_raised')
  )
  SELECT m.id INTO v_app_id
  FROM matching m
  WHERE m.app_status IN (
      'submitted','in_review','pending_review','under_review',
      'forwarded','awaiting_approval'
    )
    OR (
      m.app_status IN ('payment_pending','awaiting_payment','pending_payment')
      AND m.has_successful_payment
    )
  ORDER BY m.updated_at DESC
  LIMIT 1;

  IF v_app_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'action','block',
      'code','DUPLICATE_ACTIVE',
      'application_id', v_app_id,
      'message','You already have an active application for this sector, sub-sector, and category. You cannot start a new application until the existing application is finalized.'
    );
  END IF;

  -- 3) Pending-payment redirect when no successful payment has settled yet.
  WITH matching AS (
    SELECT
      a.id,
      lower(COALESCE(a.status, '')) AS app_status,
      a.updated_at,
      COALESCE(pay.has_successful_payment, false) AS has_successful_payment,
      pay.latest_payment_status
    FROM public.applications a
    LEFT JOIN LATERAL (
      SELECT
        bool_or(lower(COALESCE(p.status, '')) IN ('completed','success','paid')) AS has_successful_payment,
        (array_agg(lower(COALESCE(p.status, '')) ORDER BY p.created_at DESC NULLS LAST))[1] AS latest_payment_status
      FROM public.payments p
      WHERE p.application_id = a.id
    ) pay ON true
    WHERE a.applicant_id = v_uid
      AND COALESCE(a.data->>'sector_id','') = COALESCE(_sector_id::text,'')
      AND COALESCE(a.data->>'sub_sector_id','') = COALESCE(_sub_sector_id::text,'')
      AND COALESCE(a.data->>'category_id','') = COALESCE(_category_id::text,'')
      AND COALESCE(a.data->>'service_id','') = COALESCE(_service_id::text,'')
      AND lower(COALESCE(a.status, '')) NOT IN ('draft','in_progress','resubmission_requested','query_raised')
  )
  SELECT m.id INTO v_app_id
  FROM matching m
  WHERE NOT m.has_successful_payment
    AND (
      m.app_status IN ('payment_pending','awaiting_payment','pending_payment')
      OR m.latest_payment_status IN ('pending','processing','initiated')
    )
  ORDER BY m.updated_at DESC
  LIMIT 1;

  IF v_app_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'action','redirect_payment',
      'application_id', v_app_id,
      'message','You have an application with pending payment. Please complete payment to continue.'
    );
  END IF;

  -- 4) Re-application policy: only block approved/rejected duplicates when
  --    the admin "Allow Re-Application" setting is OFF.
  IF NOT v_allow_reapply THEN
    SELECT a.id INTO v_app_id
    FROM public.applications a
    WHERE a.applicant_id = v_uid
      AND COALESCE(a.data->>'sector_id','') = COALESCE(_sector_id::text,'')
      AND COALESCE(a.data->>'sub_sector_id','') = COALESCE(_sub_sector_id::text,'')
      AND COALESCE(a.data->>'category_id','') = COALESCE(_category_id::text,'')
      AND COALESCE(a.data->>'service_id','') = COALESCE(_service_id::text,'')
      AND lower(COALESCE(a.status, '')) = 'approved'
    ORDER BY a.updated_at DESC
    LIMIT 1;

    IF v_app_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'action','block',
        'code','DUPLICATE_APPROVED',
        'application_id', v_app_id,
        'message','You already have an application for this sector, sub-sector, and category/service. Re-application is currently not allowed.'
      );
    END IF;

    SELECT a.id INTO v_app_id
    FROM public.applications a
    WHERE a.applicant_id = v_uid
      AND COALESCE(a.data->>'sector_id','') = COALESCE(_sector_id::text,'')
      AND COALESCE(a.data->>'sub_sector_id','') = COALESCE(_sub_sector_id::text,'')
      AND COALESCE(a.data->>'category_id','') = COALESCE(_category_id::text,'')
      AND COALESCE(a.data->>'service_id','') = COALESCE(_service_id::text,'')
      AND lower(COALESCE(a.status, '')) = 'rejected'
    ORDER BY a.updated_at DESC
    LIMIT 1;

    IF v_app_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'action','block',
        'code','DUPLICATE_REJECTED',
        'application_id', v_app_id,
        'message','You already have an application for this sector, sub-sector, and category/service. Re-application is currently not allowed.'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('action','allow');
END;
$function$;