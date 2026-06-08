CREATE OR REPLACE FUNCTION public.get_my_licenses_page(_page integer, _page_size integer, _search text DEFAULT NULL::text, _status text DEFAULT NULL::text, _sort_by text DEFAULT 'created_at'::text, _sort_dir text DEFAULT 'desc'::text, _licensee_id uuid DEFAULT NULL::uuid, _sector_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, license_number text, license_type text, holder_id uuid, status text, issued_at timestamp with time zone, valid_from timestamp with time zone, valid_until timestamp with time zone, conditions text, created_at timestamp with time zone, application_id uuid, sector_id uuid, resolved_sector_id uuid, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_internal boolean;
  v_page_size int := GREATEST(1, LEAST(COALESCE(_page_size, 50), 200));
  v_offset int := GREATEST(0, COALESCE(_page, 0)) * v_page_size;
  v_search text := NULLIF(trim(coalesce(_search, '')), '');
  v_status text := NULLIF(_status, 'all');
  v_sort text := lower(coalesce(_sort_by, 'created_at'));
  v_dir text := lower(coalesce(_sort_dir, 'desc'));
  v_self_licensee_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_is_internal := public.has_role(v_uid, 'super_admin'::app_role)
                OR public.has_role(v_uid, 'admin'::app_role)
                OR public.has_role(v_uid, 'supervisor'::app_role)
                OR public.has_role(v_uid, 'licensing_officer'::app_role)
                OR public.has_role(v_uid, 'analyst'::app_role);

  SELECT p.licensee_id INTO v_self_licensee_id FROM public.profiles p WHERE p.id = v_uid;

  RETURN QUERY
  WITH access_scope AS (
    SELECT DISTINCT target_licensee_id
    FROM (
      SELECT CASE
        WHEN v_is_internal AND _licensee_id IS NOT NULL THEN _licensee_id
        WHEN _licensee_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM public.ppoc_entity_mappings pem
          WHERE pem.ppoc_user_id = v_uid
            AND pem.licensee_id = _licensee_id
            AND pem.is_active = true
        ) THEN _licensee_id
        WHEN _licensee_id IS NOT NULL AND v_self_licensee_id = _licensee_id THEN _licensee_id
        WHEN _licensee_id IS NULL AND v_self_licensee_id IS NOT NULL THEN v_self_licensee_id
        ELSE NULL::uuid
      END AS target_licensee_id
    ) s
    WHERE target_licensee_id IS NOT NULL
  ),
  scoped_users AS (
    SELECT DISTINCT p.id AS user_id, p.licensee_id
    FROM access_scope sc
    JOIN public.profiles p ON p.licensee_id = sc.target_licensee_id

    UNION

    SELECT v_uid AS user_id, v_self_licensee_id
    WHERE NOT v_is_internal AND v_self_licensee_id IS NULL
  ),
  scoped_applications AS (
    SELECT DISTINCT a.id, a.applicant_id, a.data
    FROM public.applications a
    WHERE NOT v_is_internal
      AND _licensee_id IS NULL
      AND a.applicant_id = v_uid

    UNION

    SELECT DISTINCT a.id, a.applicant_id, a.data
    FROM access_scope sc
    JOIN public.applications a ON a.applicant_id IN (
      SELECT su.user_id FROM scoped_users su WHERE su.licensee_id = sc.target_licensee_id
    )

    UNION

    SELECT DISTINCT a.id, a.applicant_id, a.data
    FROM access_scope sc
    JOIN public.licensees l ON l.id = sc.target_licensee_id
    JOIN public.licenses lic ON lic.id = l.license_id
    JOIN public.applications a ON a.id = lic.application_id
  ),
  base AS (
    SELECT DISTINCT
      lic.id AS lic_id,
      lic.license_number AS lic_number,
      lic.license_type AS lic_type,
      lic.holder_id AS lic_holder_id,
      lic.status AS lic_status,
      lic.issued_at AS lic_issued_at,
      lic.valid_from AS lic_valid_from,
      lic.valid_until AS lic_valid_until,
      lic.conditions AS lic_conditions,
      lic.created_at AS lic_created_at,
      lic.application_id AS lic_application_id,
      lic.sector_id AS lic_sector_id,
      COALESCE(
        lic.sector_id,
        linked_licensee.sector_id,
        NULLIF(app.data->>'sector_id', '')::uuid
      ) AS lic_resolved_sector_id
    FROM public.licenses lic
    LEFT JOIN public.licensees linked_licensee
      ON linked_licensee.license_id = lic.id
    LEFT JOIN public.applications app
      ON app.id = lic.application_id
    WHERE
      (v_is_internal AND _licensee_id IS NULL)
      OR lic.id IN (
        SELECT l.license_id
        FROM public.licensees l
        JOIN access_scope sc ON sc.target_licensee_id = l.id
        WHERE l.license_id IS NOT NULL
      )
      OR lic.id IN (
        SELECT linked_licensee.license_id
        FROM scoped_users su
        JOIN public.licensees linked_licensee ON linked_licensee.id = su.licensee_id
        WHERE linked_licensee.license_id IS NOT NULL
      )
      OR lic.application_id IN (SELECT sa.id FROM scoped_applications sa)
      OR lic.holder_id IN (
        SELECT su.user_id FROM scoped_users su
      )
      OR lic.holder_id IN (
        SELECT sc.target_licensee_id FROM access_scope sc
      )
  ),
  filtered AS (
    SELECT *
    FROM base b
    WHERE (v_status IS NULL OR b.lic_status = v_status)
      AND (_sector_id IS NULL OR b.lic_resolved_sector_id = _sector_id)
      AND (
        v_search IS NULL
        OR lower(coalesce(b.lic_number, '')) LIKE '%' || lower(v_search) || '%'
        OR lower(coalesce(b.lic_type, '')) LIKE '%' || lower(v_search) || '%'
      )
  ),
  counted AS (
    SELECT count(*) AS total FROM filtered
  ),
  ordered AS (
    SELECT *
    FROM filtered f
    ORDER BY
      CASE WHEN v_sort = 'license_number' AND v_dir = 'asc' THEN f.lic_number END ASC,
      CASE WHEN v_sort = 'license_number' AND v_dir = 'desc' THEN f.lic_number END DESC,
      CASE WHEN v_sort = 'issued_at' AND v_dir = 'asc' THEN f.lic_issued_at END ASC NULLS LAST,
      CASE WHEN v_sort = 'issued_at' AND v_dir = 'desc' THEN f.lic_issued_at END DESC NULLS LAST,
      CASE WHEN v_sort = 'created_at' AND v_dir = 'asc' THEN f.lic_created_at END ASC,
      CASE WHEN v_sort = 'created_at' AND v_dir = 'desc' THEN f.lic_created_at END DESC,
      f.lic_created_at DESC
    LIMIT v_page_size OFFSET v_offset
  )
  SELECT
    o.lic_id,
    o.lic_number,
    o.lic_type,
    o.lic_holder_id,
    o.lic_status::text,
    o.lic_issued_at,
    o.lic_valid_from,
    o.lic_valid_until,
    o.lic_conditions,
    o.lic_created_at,
    o.lic_application_id,
    o.lic_sector_id,
    o.lic_resolved_sector_id,
    c.total
  FROM ordered o
  CROSS JOIN counted c;
END;
$function$;