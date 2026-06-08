CREATE OR REPLACE FUNCTION public.get_application_list_page(
  _page integer,
  _page_size integer,
  _search text,
  _search_mode text,
  _status text,
  _version_id uuid,
  _sort_by text,
  _sort_dir text,
  _licensee_id uuid DEFAULT NULL::uuid,
  _sector_id uuid DEFAULT NULL::uuid,
  _sla text DEFAULT NULL::text,
  _status_group text DEFAULT NULL::text
)
 RETURNS TABLE(id uuid, application_number text, applicant_id uuid, applicant_name text, applicant_email text, license_type text, status text, data jsonb, submitted_at timestamp with time zone, created_at timestamp with time zone, form_version_id uuid, sector_id uuid, resolved_sector_id uuid, sub_sector_id uuid, category_id uuid, service_id uuid, sector_name text, sub_sector_name text, category_name text, service_name text, payment_id uuid, payment_amount numeric, payment_status text, payment_currency text, payment_method text, payment_paid_at timestamp with time zone, action_count integer, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_internal boolean;
  v_page_size int := GREATEST(1, LEAST(_page_size, 200));
  v_offset int := GREATEST(0, _page) * v_page_size;
  v_search text := NULLIF(trim(coalesce(_search, '')), '');
  v_mode text := lower(coalesce(_search_mode, 'contains'));
  v_status text := NULLIF(_status, 'all');
  v_sla text := NULLIF(lower(coalesce(_sla, '')), '');
  v_status_group text := NULLIF(lower(coalesce(_status_group, '')), '');
  v_sort text := lower(coalesce(_sort_by, 'created_at'));
  v_dir text := lower(coalesce(_sort_dir, 'desc'));
  v_self_licensee_id uuid;
  v_submitted_set text[] := ARRAY['submitted','in_progress'];
  v_returned_set text[] := ARRAY['resubmission_requested','query_raised'];
  v_sla_cutoff timestamptz := now() - interval '30 days';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_is_internal := public.has_role(v_uid, 'super_admin'::app_role)
                OR public.has_role(v_uid, 'admin'::app_role)
                OR public.has_role(v_uid, 'supervisor'::app_role)
                OR public.has_role(v_uid, 'licensing_officer'::app_role)
                OR public.has_role(v_uid, 'analyst'::app_role);

  SELECT p.licensee_id
  INTO v_self_licensee_id
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_sort NOT IN ('created_at', 'submitted_at', 'application_number') THEN v_sort := 'created_at'; END IF;
  IF v_dir NOT IN ('asc', 'desc') THEN v_dir := 'desc'; END IF;
  IF v_mode NOT IN ('contains', 'starts_with', 'exact') THEN v_mode := 'contains'; END IF;

  RETURN QUERY
  WITH access_scope AS (
    SELECT DISTINCT target_licensee_id
    FROM (
      SELECT CASE
        WHEN v_is_internal THEN NULL::uuid
        WHEN _licensee_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM public.ppoc_entity_mappings pem
          WHERE pem.ppoc_user_id = v_uid
            AND pem.licensee_id = _licensee_id
            AND pem.is_active = true
        ) THEN _licensee_id
        WHEN _licensee_id IS NOT NULL AND v_self_licensee_id = _licensee_id THEN _licensee_id
        WHEN _licensee_id IS NULL AND v_self_licensee_id IS NOT NULL THEN v_self_licensee_id
        WHEN _licensee_id IS NULL THEN NULL::uuid
        ELSE NULL::uuid
      END AS target_licensee_id
    ) s
    WHERE target_licensee_id IS NOT NULL
  ),
  linked_applications AS (
    SELECT DISTINCT a.id AS application_id
    FROM public.applications a
    WHERE a.applicant_id = v_uid
      AND (
        _licensee_id IS NULL
        OR v_self_licensee_id = _licensee_id
      )

    UNION

    SELECT DISTINCT lic.application_id AS application_id
    FROM access_scope sc
    JOIN public.licensees l ON l.id = sc.target_licensee_id
    JOIN public.licenses lic ON lic.id = l.license_id
    WHERE lic.application_id IS NOT NULL

    UNION

    SELECT DISTINCT a.id AS application_id
    FROM access_scope sc
    JOIN public.applications a
      ON NULLIF(a.data->>'licensee_id', '')::uuid = sc.target_licensee_id

    UNION

    SELECT DISTINCT a.id AS application_id
    FROM access_scope sc
    JOIN public.licensees l ON l.id = sc.target_licensee_id
    JOIN public.profiles p ON p.licensee_id = l.id
    JOIN public.applications a ON a.applicant_id = p.id
  ),
  enriched AS (
    SELECT
      a.*,
      lic.id AS linked_license_id,
      lic.sector_id AS linked_license_sector_id,
      lic.sub_sector_id AS linked_license_sub_sector_id,
      lic.category_id AS linked_license_category_id,
      l.id AS linked_licensee_id,
      l.sector_id AS linked_licensee_sector_id,
      l.sub_sector_id AS linked_licensee_sub_sector_id,
      l.category_id AS linked_licensee_category_id,
      COALESCE(
        NULLIF(a.data->>'sector_id', '')::uuid,
        lic.sector_id,
        l.sector_id
      ) AS resolved_sector_id_value,
      COALESCE(NULLIF(a.data->>'sub_sector_id', '')::uuid, lic.sub_sector_id, l.sub_sector_id) AS resolved_sub_sector_id_value,
      COALESCE(NULLIF(a.data->>'category_id', '')::uuid, lic.category_id, l.category_id) AS resolved_category_id_value,
      NULLIF(a.data->>'service_id', '')::uuid AS resolved_service_id_value
    FROM public.applications a
    LEFT JOIN public.licenses lic ON lic.application_id = a.id
    LEFT JOIN public.licensees l ON l.license_id = lic.id
    WHERE
      (
        v_is_internal
        OR a.id IN (SELECT la.application_id FROM linked_applications la)
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
        OR (v_status = 'resubmission_requested' AND a.status IN ('resubmission_requested', 'query_raised'))
        OR a.status = v_status
      )
      AND (
        v_status_group IS NULL
        OR (v_status_group = 'pending' AND a.status = ANY(v_submitted_set))
        OR (v_status_group = 'returned' AND a.status = ANY(v_returned_set))
        OR (v_status_group = 'approved' AND a.status = 'approved')
        OR (v_status_group = 'rejected' AND a.status = 'rejected')
      )
      AND (
        v_sla IS NULL
        OR (v_sla = 'pending' AND a.status = ANY(v_submitted_set))
        OR (v_sla = 'breached' AND a.status = ANY(v_submitted_set) AND a.submitted_at IS NOT NULL AND a.submitted_at < v_sla_cutoff)
        OR (v_sla = 'due_soon' AND a.status = ANY(v_submitted_set) AND a.submitted_at IS NOT NULL AND a.submitted_at < (now() - interval '20 days') AND a.submitted_at >= v_sla_cutoff)
      )
      AND (
        _version_id IS NULL
        OR a.form_version_id = _version_id
        OR (
          a.data ? 'form_version_ids'
          AND EXISTS (
            SELECT 1
            FROM jsonb_each_text(a.data->'form_version_ids') v(k, val)
            WHERE val::uuid = _version_id
          )
        )
      )
      AND (
        _sector_id IS NULL
        OR COALESCE(NULLIF(a.data->>'sector_id', '')::uuid, lic.sector_id, l.sector_id) = _sector_id
      )
      AND (
        v_search IS NULL
        OR (
          CASE v_mode
            WHEN 'exact' THEN lower(a.application_number) = lower(v_search)
            WHEN 'starts_with' THEN lower(a.application_number) LIKE lower(v_search) || '%'
            ELSE lower(a.application_number) LIKE '%' || lower(v_search) || '%'
          END
        )
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = a.applicant_id
            AND (
              CASE v_mode
                WHEN 'exact' THEN lower(coalesce(p.full_name, '')) = lower(v_search) OR lower(coalesce(p.email, '')) = lower(v_search)
                WHEN 'starts_with' THEN lower(coalesce(p.full_name, '')) LIKE lower(v_search) || '%' OR lower(coalesce(p.email, '')) LIKE lower(v_search) || '%'
                ELSE lower(coalesce(p.full_name, '')) LIKE '%' || lower(v_search) || '%' OR lower(coalesce(p.email, '')) LIKE '%' || lower(v_search) || '%'
              END
            )
        )
        OR EXISTS (
          SELECT 1
          FROM public.pre_license_users pl
          WHERE pl.id = a.applicant_id
            AND (
              CASE v_mode
                WHEN 'exact' THEN lower(coalesce(pl.full_name, '')) = lower(v_search) OR lower(coalesce(pl.email, '')) = lower(v_search)
                WHEN 'starts_with' THEN lower(coalesce(pl.full_name, '')) LIKE lower(v_search) || '%' OR lower(coalesce(pl.email, '')) LIKE lower(v_search) || '%'
                ELSE lower(coalesce(pl.full_name, '')) LIKE '%' || lower(v_search) || '%' OR lower(coalesce(pl.email, '')) LIKE '%' || lower(v_search) || '%'
              END
            )
        )
      )
  ),
  counted AS (
    SELECT count(*) AS total FROM enriched
  ),
  ordered AS (
    SELECT e.*
    FROM enriched e
    ORDER BY
      CASE WHEN v_sort = 'application_number' AND v_dir = 'asc' THEN e.application_number END ASC,
      CASE WHEN v_sort = 'application_number' AND v_dir = 'desc' THEN e.application_number END DESC,
      CASE WHEN v_sort = 'submitted_at' AND v_dir = 'asc' THEN e.submitted_at END ASC NULLS LAST,
      CASE WHEN v_sort = 'submitted_at' AND v_dir = 'desc' THEN e.submitted_at END DESC NULLS LAST,
      CASE WHEN v_sort = 'created_at' AND v_dir = 'asc' THEN e.created_at END ASC,
      CASE WHEN v_sort = 'created_at' AND v_dir = 'desc' THEN e.created_at END DESC,
      e.created_at DESC
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
    NULLIF(o.data->>'sector_id', '')::uuid AS sector_id,
    o.resolved_sector_id_value AS resolved_sector_id,
    NULLIF(o.data->>'sub_sector_id', '')::uuid AS sub_sector_id,
    NULLIF(o.data->>'category_id', '')::uuid AS category_id,
    NULLIF(o.data->>'service_id', '')::uuid AS service_id,
    sec.name::text AS sector_name,
    sub.name::text AS sub_sector_name,
    cat.name::text AS category_name,
    svc.name::text AS service_name,
    pay.id AS payment_id,
    pay.amount AS payment_amount,
    pay.status::text AS payment_status,
    pay.currency AS payment_currency,
    pay.payment_method::text AS payment_method,
    pay.paid_at AS payment_paid_at,
    coalesce(act.cnt, 0)::int AS action_count,
    (SELECT total FROM counted) AS total_count
  FROM ordered o
  LEFT JOIN public.profiles p ON p.id = o.applicant_id
  LEFT JOIN public.pre_license_users pl ON pl.id = o.applicant_id
  LEFT JOIN public.sectors sec ON sec.id = o.resolved_sector_id_value
  LEFT JOIN public.sub_sectors sub ON sub.id = o.resolved_sub_sector_id_value
  LEFT JOIN public.categories cat ON cat.id = o.resolved_category_id_value
  LEFT JOIN public.services svc ON svc.id = o.resolved_service_id_value
  LEFT JOIN LATERAL (
    SELECT pp.id, pp.amount, pp.status, pp.currency, pp.payment_method, pp.paid_at
    FROM public.payments pp
    WHERE pp.application_id = o.id
    ORDER BY
      CASE
        WHEN lower(pp.status::text) IN ('completed', 'success', 'paid') THEN 1
        WHEN lower(pp.status::text) IN ('pending', 'processing', 'initiated') THEN 2
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