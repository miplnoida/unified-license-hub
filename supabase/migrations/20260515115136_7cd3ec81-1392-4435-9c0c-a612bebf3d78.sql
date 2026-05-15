
-- Allow PPOC users to view licenses & applications belonging to their mapped licensees,
-- and let the application list / stats RPCs accept an optional licensee filter.

-- 1. RLS: PPOC can read licenses for their mapped licensees
DROP POLICY IF EXISTS "PPOC read mapped licenses" ON public.licenses;
CREATE POLICY "PPOC read mapped licenses"
ON public.licenses
FOR SELECT
TO authenticated
USING (
  id IN (SELECT public.ppoc_accessible_license_ids(auth.uid()))
);

-- 2. RLS: PPOC can read applications for users tied to their mapped licensees
DROP POLICY IF EXISTS "PPOC read mapped applications" ON public.applications;
CREATE POLICY "PPOC read mapped applications"
ON public.applications
FOR SELECT
TO authenticated
USING (
  applicant_id IN (
    SELECT p.id FROM public.profiles p
    WHERE p.licensee_id IN (SELECT public.ppoc_mapped_licensee_ids(auth.uid()))
  )
);

-- 3. RPC: get_application_list_page — add optional _licensee_id filter and PPOC visibility
DROP FUNCTION IF EXISTS public.get_application_list_page(integer, integer, text, text, text, uuid, text, text);

CREATE OR REPLACE FUNCTION public.get_application_list_page(
  _page integer,
  _page_size integer,
  _search text,
  _search_mode text,
  _status text,
  _version_id uuid,
  _sort_by text,
  _sort_dir text,
  _licensee_id uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, application_number text, applicant_id uuid, applicant_name text, applicant_email text, license_type text, status text, data jsonb, submitted_at timestamp with time zone, created_at timestamp with time zone, form_version_id uuid, sector_name text, sub_sector_name text, category_name text, service_name text, payment_id uuid, payment_amount numeric, payment_status text, payment_currency text, payment_method text, payment_paid_at timestamp with time zone, action_count integer, total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_ppoc_licensees uuid[];
  v_licensee_user_ids uuid[];
  v_filter_user_ids uuid[];
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

  -- Compute PPOC-mapped licensees and member user ids (for non-internal users)
  IF NOT v_is_internal THEN
    SELECT array_agg(x) INTO v_ppoc_licensees
    FROM public.ppoc_mapped_licensee_ids(v_uid) AS x;

    IF v_ppoc_licensees IS NOT NULL AND array_length(v_ppoc_licensees, 1) > 0 THEN
      SELECT array_agg(p.id) INTO v_licensee_user_ids
      FROM public.profiles p
      WHERE p.licensee_id = ANY(v_ppoc_licensees);
    END IF;

    -- If a specific licensee is requested, restrict to that licensee (must be PPOC-mapped or own)
    IF _licensee_id IS NOT NULL THEN
      IF v_ppoc_licensees IS NOT NULL AND _licensee_id = ANY(v_ppoc_licensees) THEN
        SELECT array_agg(p.id) INTO v_filter_user_ids
        FROM public.profiles p
        WHERE p.licensee_id = _licensee_id;
      ELSE
        -- Caller is not PPOC-mapped to this licensee; still allow if it's their own
        IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.licensee_id = _licensee_id) THEN
          SELECT array_agg(p.id) INTO v_filter_user_ids
          FROM public.profiles p
          WHERE p.licensee_id = _licensee_id;
        ELSE
          v_filter_user_ids := ARRAY[v_uid];
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT a.*
    FROM public.applications a
    WHERE
      (
        v_is_internal
        OR a.applicant_id = v_uid
        OR (v_licensee_user_ids IS NOT NULL AND a.applicant_id = ANY(v_licensee_user_ids))
      )
      AND (
        v_filter_user_ids IS NULL
        OR a.applicant_id = ANY(v_filter_user_ids)
      )
      AND (
        NOT v_is_internal
        OR (
          a.status <> 'draft'
          AND NOT (
            a.status = 'in_progress'
            AND a.submitted_at IS NULL
            AND a.workflow_id IS NULL
            AND a.current_step_id IS NULL
          )
        )
      )
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
    LIMIT v_page_size OFFSET v_offset
  )
  SELECT
    o.id,
    o.application_number,
    o.applicant_id,
    coalesce(p.full_name, pl.full_name, '')::text AS applicant_name,
    coalesce(p.email, pl.email, '')::text AS applicant_email,
    o.license_type,
    o.status::text,
    o.data,
    o.submitted_at,
    o.created_at,
    o.form_version_id,
    sec.name::text  AS sector_name,
    sub.name::text  AS sub_sector_name,
    cat.name::text  AS category_name,
    svc.name::text  AS service_name,
    pay.id          AS payment_id,
    pay.amount      AS payment_amount,
    pay.status::text AS payment_status,
    pay.currency    AS payment_currency,
    pay.payment_method::text AS payment_method,
    pay.paid_at     AS payment_paid_at,
    coalesce(act.cnt, 0)::int AS action_count,
    (SELECT total FROM counted) AS total_count
  FROM ordered o
  LEFT JOIN public.profiles p ON p.id = o.applicant_id
  LEFT JOIN public.pre_license_users pl ON pl.id = o.applicant_id
  LEFT JOIN public.sectors     sec ON sec.id = (o.data->>'sector_id')::uuid
  LEFT JOIN public.sub_sectors sub ON sub.id = (o.data->>'sub_sector_id')::uuid
  LEFT JOIN public.categories  cat ON cat.id = (o.data->>'category_id')::uuid
  LEFT JOIN public.services    svc ON svc.id = (o.data->>'service_id')::uuid
  LEFT JOIN LATERAL (
    SELECT pp.id, pp.amount, pp.status, pp.currency, pp.payment_method, pp.paid_at
    FROM public.payments pp
    WHERE pp.application_id = o.id
    ORDER BY
      CASE
        WHEN lower(pp.status::text) IN ('completed','success','paid') THEN 1
        WHEN lower(pp.status::text) IN ('pending','processing','initiated') THEN 2
        ELSE 3
      END,
      pp.created_at DESC
    LIMIT 1
  ) pay ON TRUE
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS cnt
    FROM public.approval_actions aa
    WHERE aa.application_id = o.id
  ) act ON TRUE;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_application_list_page(integer, integer, text, text, text, uuid, text, text, uuid) TO authenticated;

-- 4. RPC: get_application_list_stats — accept optional _licensee_id with same scoping
DROP FUNCTION IF EXISTS public.get_application_list_stats();
DROP FUNCTION IF EXISTS public.get_application_list_stats(uuid);

CREATE OR REPLACE FUNCTION public.get_application_list_stats(_licensee_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_internal boolean;
  v_total int; v_approved int; v_rejected int; v_pending int;
  v_ppoc_licensees uuid[];
  v_licensee_user_ids uuid[];
  v_filter_user_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_is_internal := public.has_role(v_uid, 'super_admin'::app_role)
                OR public.has_role(v_uid, 'admin'::app_role)
                OR public.has_role(v_uid, 'supervisor'::app_role)
                OR public.has_role(v_uid, 'licensing_officer'::app_role)
                OR public.has_role(v_uid, 'analyst'::app_role);

  IF NOT v_is_internal THEN
    SELECT array_agg(x) INTO v_ppoc_licensees
    FROM public.ppoc_mapped_licensee_ids(v_uid) AS x;

    IF v_ppoc_licensees IS NOT NULL AND array_length(v_ppoc_licensees, 1) > 0 THEN
      SELECT array_agg(p.id) INTO v_licensee_user_ids
      FROM public.profiles p
      WHERE p.licensee_id = ANY(v_ppoc_licensees);
    END IF;

    IF _licensee_id IS NOT NULL THEN
      IF (v_ppoc_licensees IS NOT NULL AND _licensee_id = ANY(v_ppoc_licensees))
         OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.licensee_id = _licensee_id)
      THEN
        SELECT array_agg(p.id) INTO v_filter_user_ids
        FROM public.profiles p
        WHERE p.licensee_id = _licensee_id;
      ELSE
        v_filter_user_ids := ARRAY[v_uid];
      END IF;
    END IF;
  END IF;

  WITH base AS (
    SELECT status FROM public.applications a
     WHERE (
        v_is_internal
        OR a.applicant_id = v_uid
        OR (v_licensee_user_ids IS NOT NULL AND a.applicant_id = ANY(v_licensee_user_ids))
       )
       AND (
        v_filter_user_ids IS NULL
        OR a.applicant_id = ANY(v_filter_user_ids)
       )
       AND (
         NOT v_is_internal
         OR (
           a.status <> 'draft'
           AND NOT (
             a.status = 'in_progress'
             AND a.submitted_at IS NULL
             AND a.workflow_id IS NULL
             AND a.current_step_id IS NULL
           )
         )
       )
  )
  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'approved'),
    count(*) FILTER (WHERE status = 'rejected'),
    count(*) FILTER (WHERE status NOT IN ('approved','rejected','cancelled'))
    INTO v_total, v_approved, v_rejected, v_pending
    FROM base;

  RETURN jsonb_build_object('total', v_total, 'approved', v_approved, 'rejected', v_rejected, 'pending', v_pending);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_application_list_stats(uuid) TO authenticated;
