CREATE OR REPLACE FUNCTION public.apply_application_guard(_sector_id uuid, _sub_sector_id uuid, _category_id uuid, _service_id uuid DEFAULT NULL::uuid)
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

  SELECT a.id INTO v_app_id
  FROM public.applications a
  WHERE a.applicant_id = v_uid
    AND a.status = 'draft'
    AND COALESCE(a.data->>'sector_id','') = COALESCE(_sector_id::text,'')
    AND COALESCE(a.data->>'sub_sector_id','') = COALESCE(_sub_sector_id::text,'')
    AND COALESCE(a.data->>'category_id','') = COALESCE(_category_id::text,'')
    AND COALESCE(a.data->>'service_id','') = COALESCE(_service_id::text,'')
  ORDER BY a.updated_at DESC
  LIMIT 1;

  IF v_app_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'action','continue_draft',
      'application_id', v_app_id,
      'message','You already have a draft for this sector / sub-sector / category. Continuing your draft.'
    );
  END IF;

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
        bool_or(lower(COALESCE(p.status, '')) IN ('completed', 'success', 'paid')) AS has_successful_payment,
        (
          array_agg(lower(COALESCE(p.status, '')) ORDER BY p.created_at DESC NULLS LAST)
        )[1] AS latest_payment_status
      FROM public.payments p
      WHERE p.application_id = a.id
    ) pay ON true
    WHERE a.applicant_id = v_uid
      AND COALESCE(a.data->>'sector_id','') = COALESCE(_sector_id::text,'')
      AND COALESCE(a.data->>'sub_sector_id','') = COALESCE(_sub_sector_id::text,'')
      AND COALESCE(a.data->>'category_id','') = COALESCE(_category_id::text,'')
      AND COALESCE(a.data->>'service_id','') = COALESCE(_service_id::text,'')
      AND lower(COALESCE(a.status, '')) <> 'draft'
  )
  SELECT m.id INTO v_app_id
  FROM matching m
  WHERE m.app_status IN (
      'submitted','in_progress','in_review','pending_review','under_review',
      'forwarded','query_raised','resubmission_requested','awaiting_approval'
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
        bool_or(lower(COALESCE(p.status, '')) IN ('completed', 'success', 'paid')) AS has_successful_payment,
        (
          array_agg(lower(COALESCE(p.status, '')) ORDER BY p.created_at DESC NULLS LAST)
        )[1] AS latest_payment_status
      FROM public.payments p
      WHERE p.application_id = a.id
    ) pay ON true
    WHERE a.applicant_id = v_uid
      AND COALESCE(a.data->>'sector_id','') = COALESCE(_sector_id::text,'')
      AND COALESCE(a.data->>'sub_sector_id','') = COALESCE(_sub_sector_id::text,'')
      AND COALESCE(a.data->>'category_id','') = COALESCE(_category_id::text,'')
      AND COALESCE(a.data->>'service_id','') = COALESCE(_service_id::text,'')
      AND lower(COALESCE(a.status, '')) <> 'draft'
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
        'message','You already have an Approved application for this sector / sub-sector / category. Please use the renewal flow if available.'
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
        'message','Your previous application for this sector / sub-sector / category was Rejected. Re-application is not allowed.'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('action','allow');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.apply_application_guard(uuid,uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_application_list_page(
  _page          integer DEFAULT 0,
  _page_size     integer DEFAULT 10,
  _search        text    DEFAULT NULL,
  _search_mode   text    DEFAULT 'contains',
  _status        text    DEFAULT NULL,
  _version_id    uuid    DEFAULT NULL,
  _sort_by       text    DEFAULT 'created_at',
  _sort_dir      text    DEFAULT 'desc'
) RETURNS TABLE (
  id                  uuid,
  application_number  text,
  applicant_id        uuid,
  applicant_name      text,
  applicant_email     text,
  license_type        text,
  status              text,
  data                jsonb,
  submitted_at        timestamptz,
  created_at          timestamptz,
  form_version_id     uuid,
  sector_name         text,
  sub_sector_name     text,
  category_name       text,
  service_name        text,
  payment_id          uuid,
  payment_amount      numeric,
  payment_currency    text,
  payment_status      text,
  payment_method      text,
  payment_paid_at     timestamptz,
  action_count        integer,
  total_count         bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_internal boolean;
  v_page_size int := GREATEST(1, LEAST(_page_size, 100));
  v_offset int := GREATEST(0, _page) * v_page_size;
  v_search text := NULLIF(trim(coalesce(_search,'')), '');
  v_mode text := lower(coalesce(_search_mode,'contains'));
  v_status text := NULLIF(_status,'all');
  v_sort text := lower(coalesce(_sort_by,'created_at'));
  v_dir text := lower(coalesce(_sort_dir,'desc'));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_is_internal := public.has_role(v_uid, 'super_admin'::app_role)
                OR public.has_role(v_uid, 'admin'::app_role)
                OR public.has_role(v_uid, 'supervisor'::app_role)
                OR public.has_role(v_uid, 'licensing_officer'::app_role)
                OR public.has_role(v_uid, 'analyst'::app_role);

  IF v_sort NOT IN ('created_at','submitted_at','application_number') THEN v_sort := 'created_at'; END IF;
  IF v_dir NOT IN ('asc','desc') THEN v_dir := 'desc'; END IF;
  IF v_mode NOT IN ('contains','starts_with','exact') THEN v_mode := 'contains'; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT a.*
    FROM public.applications a
    WHERE
      (v_is_internal OR a.applicant_id = v_uid)
      AND (NOT v_is_internal OR a.status NOT IN ('draft','in_progress'))
      AND (
        v_status IS NULL
        OR (v_status = 'resubmission_requested' AND a.status IN ('resubmission_requested','query_raised'))
        OR a.status = v_status
      )
      AND (
        _version_id IS NULL
        OR a.form_version_id = _version_id
        OR (a.data ? 'form_version_ids'
            AND EXISTS (
              SELECT 1 FROM jsonb_each_text(a.data->'form_version_ids') v(k, val)
              WHERE val::uuid = _version_id
            ))
      )
      AND (
        v_search IS NULL
        OR (
          CASE v_mode
            WHEN 'exact'       THEN lower(a.application_number) = lower(v_search)
            WHEN 'starts_with' THEN lower(a.application_number) LIKE lower(v_search) || '%'
            ELSE                    lower(a.application_number) LIKE '%' || lower(v_search) || '%'
          END
        )
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = a.applicant_id
            AND (
              CASE v_mode
                WHEN 'exact'       THEN lower(coalesce(p.full_name,'')) = lower(v_search) OR lower(coalesce(p.email,'')) = lower(v_search)
                WHEN 'starts_with' THEN lower(coalesce(p.full_name,'')) LIKE lower(v_search) || '%' OR lower(coalesce(p.email,'')) LIKE lower(v_search) || '%'
                ELSE                    lower(coalesce(p.full_name,'')) LIKE '%' || lower(v_search) || '%' OR lower(coalesce(p.email,'')) LIKE '%' || lower(v_search) || '%'
              END
            )
        )
        OR EXISTS (
          SELECT 1 FROM public.pre_license_users pl
          WHERE pl.id = a.applicant_id
            AND (
              CASE v_mode
                WHEN 'exact'       THEN lower(coalesce(pl.full_name,'')) = lower(v_search) OR lower(coalesce(pl.email,'')) = lower(v_search)
                WHEN 'starts_with' THEN lower(coalesce(pl.full_name,'')) LIKE lower(v_search) || '%' OR lower(coalesce(pl.email,'')) LIKE lower(v_search) || '%'
                ELSE                    lower(coalesce(pl.full_name,'')) LIKE '%' || lower(v_search) || '%' OR lower(coalesce(pl.email,'')) LIKE '%' || lower(v_search) || '%'
              END
            )
        )
      )
  ),
  counted AS (
    SELECT (SELECT count(*) FROM base) AS total
  ),
  ordered AS (
    SELECT b.*
    FROM base b
    ORDER BY
      CASE WHEN v_sort = 'application_number' AND v_dir = 'asc'  THEN b.application_number END ASC,
      CASE WHEN v_sort = 'application_number' AND v_dir = 'desc' THEN b.application_number END DESC,
      CASE WHEN v_sort = 'submitted_at'       AND v_dir = 'asc'  THEN b.submitted_at       END ASC NULLS LAST,
      CASE WHEN v_sort = 'submitted_at'       AND v_dir = 'desc' THEN b.submitted_at       END DESC NULLS LAST,
      CASE WHEN v_sort = 'created_at'         AND v_dir = 'asc'  THEN b.created_at         END ASC,
      CASE WHEN v_sort = 'created_at'         AND v_dir = 'desc' THEN b.created_at         END DESC
    OFFSET v_offset LIMIT v_page_size
  )
  SELECT
    o.id,
    o.application_number,
    o.applicant_id,
    COALESCE(p.full_name, pl.full_name, '—') AS applicant_name,
    COALESCE(p.email, pl.email, NULL) AS applicant_email,
    o.license_type,
    o.status,
    o.data,
    o.submitted_at,
    o.created_at,
    o.form_version_id,
    s.name,
    ss.name,
    c.name,
    sv.name,
    pay.id,
    pay.amount,
    pay.currency,
    pay.status,
    pay.payment_method,
    pay.paid_at,
    COALESCE(act.cnt, 0)::int,
    (SELECT total FROM counted)
  FROM ordered o
  LEFT JOIN public.profiles p ON p.id = o.applicant_id
  LEFT JOIN public.pre_license_users pl ON pl.id = o.applicant_id
  LEFT JOIN public.sectors s ON s.id = NULLIF(o.data->>'sector_id','')::uuid
  LEFT JOIN public.sub_sectors ss ON ss.id = NULLIF(o.data->>'sub_sector_id','')::uuid
  LEFT JOIN public.categories c ON c.id = NULLIF(o.data->>'category_id','')::uuid
  LEFT JOIN public.services sv ON sv.id = NULLIF(o.data->>'service_id','')::uuid
  LEFT JOIN LATERAL (
    WITH ranked_payments AS (
      SELECT
        pp.id,
        pp.amount,
        pp.currency,
        pp.payment_method,
        pp.paid_at,
        pp.created_at,
        CASE
          WHEN lower(COALESCE(pp.status, '')) IN ('completed','success','paid') THEN 'paid'
          WHEN lower(COALESCE(pp.status, '')) IN ('pending','processing','initiated') THEN 'pending'
          WHEN lower(COALESCE(pp.status, '')) = 'failed' THEN 'failed'
          ELSE lower(COALESCE(pp.status, ''))
        END AS status,
        CASE
          WHEN lower(COALESCE(pp.status, '')) IN ('completed','success','paid') THEN 1
          WHEN lower(COALESCE(pp.status, '')) IN ('pending','processing','initiated') THEN 2
          WHEN lower(COALESCE(pp.status, '')) = 'failed' THEN 3
          ELSE 4
        END AS status_priority
      FROM public.payments pp
      WHERE pp.application_id = o.id
    )
    SELECT
      rp.id,
      rp.amount,
      rp.currency,
      rp.status,
      rp.payment_method,
      rp.paid_at
    FROM ranked_payments rp
    ORDER BY rp.status_priority ASC, COALESCE(rp.paid_at, rp.created_at) DESC, rp.created_at DESC
    LIMIT 1
  ) pay ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS cnt
    FROM public.approval_actions aa
    WHERE aa.application_id = o.id
  ) act ON true
  ORDER BY
    CASE WHEN v_sort = 'application_number' AND v_dir = 'asc'  THEN o.application_number END ASC,
    CASE WHEN v_sort = 'application_number' AND v_dir = 'desc' THEN o.application_number END DESC,
    CASE WHEN v_sort = 'submitted_at'       AND v_dir = 'asc'  THEN o.submitted_at       END ASC NULLS LAST,
    CASE WHEN v_sort = 'submitted_at'       AND v_dir = 'desc' THEN o.submitted_at       END DESC NULLS LAST,
    CASE WHEN v_sort = 'created_at'         AND v_dir = 'asc'  THEN o.created_at         END ASC,
    CASE WHEN v_sort = 'created_at'         AND v_dir = 'desc' THEN o.created_at         END DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_application_list_page(integer, integer, text, text, text, uuid, text, text) TO authenticated;