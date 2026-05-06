
-- Hide in_progress (draft-being-filled) applications from internal admin/employee views.
-- Applies to listing RPC and stats RPC. Applicants still see their own in_progress.

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
  v_search text := NULLIF(trim(coalesce(_search,'')),'');
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
        -- Hide drafts AND in-progress (incomplete) applications from internal staff
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
  counted AS ( SELECT (SELECT count(*) FROM base) AS total ),
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
    o.id, o.application_number, o.applicant_id,
    COALESCE(p.full_name, pl.full_name, '—') AS applicant_name,
    COALESCE(p.email, pl.email, NULL) AS applicant_email,
    o.license_type, o.status, o.data, o.submitted_at, o.created_at, o.form_version_id,
    s.name, ss.name, c.name, sv.name,
    pay.id, pay.amount, pay.currency, pay.status, pay.payment_method, pay.paid_at,
    COALESCE(act.cnt, 0)::int,
    (SELECT total FROM counted)
  FROM ordered o
  LEFT JOIN public.profiles          p   ON p.id = o.applicant_id
  LEFT JOIN public.pre_license_users pl  ON pl.id = o.applicant_id
  LEFT JOIN public.sectors           s   ON s.id  = NULLIF(o.data->>'sector_id','')::uuid
  LEFT JOIN public.sub_sectors       ss  ON ss.id = NULLIF(o.data->>'sub_sector_id','')::uuid
  LEFT JOIN public.categories        c   ON c.id  = NULLIF(o.data->>'category_id','')::uuid
  LEFT JOIN public.services          sv  ON sv.id = NULLIF(o.data->>'service_id','')::uuid
  LEFT JOIN LATERAL (
    SELECT pp.id, pp.amount, pp.currency, pp.status, pp.payment_method, pp.paid_at
      FROM public.payments pp
     WHERE pp.application_id = o.id
     ORDER BY pp.created_at DESC LIMIT 1
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

CREATE OR REPLACE FUNCTION public.get_application_list_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_internal boolean;
  v_total int; v_approved int; v_rejected int; v_pending int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_is_internal := public.has_role(v_uid, 'super_admin'::app_role)
                OR public.has_role(v_uid, 'admin'::app_role)
                OR public.has_role(v_uid, 'supervisor'::app_role)
                OR public.has_role(v_uid, 'licensing_officer'::app_role)
                OR public.has_role(v_uid, 'analyst'::app_role);

  WITH base AS (
    SELECT status FROM public.applications a
     WHERE (v_is_internal OR a.applicant_id = v_uid)
       AND (NOT v_is_internal OR a.status NOT IN ('draft','in_progress'))
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
$$;
