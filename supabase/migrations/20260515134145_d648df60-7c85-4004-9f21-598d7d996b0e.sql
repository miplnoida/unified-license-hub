CREATE OR REPLACE FUNCTION public.get_my_licenses_page(
  _page integer,
  _page_size integer,
  _search text DEFAULT NULL,
  _status text DEFAULT NULL,
  _sort_by text DEFAULT 'created_at',
  _sort_dir text DEFAULT 'desc',
  _licensee_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  license_number text,
  license_type text,
  holder_id uuid,
  status text,
  issued_at timestamptz,
  valid_from timestamptz,
  valid_until timestamptz,
  conditions text,
  created_at timestamptz,
  application_id uuid,
  sector_id uuid,
  resolved_sector_id uuid,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  SELECT p.licensee_id
  INTO v_self_licensee_id
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_sort NOT IN ('created_at', 'issued_at', 'license_number') THEN v_sort := 'created_at'; END IF;
  IF v_dir NOT IN ('asc', 'desc') THEN v_dir := 'desc'; END IF;

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
    WHERE a.applicant_id = v_uid

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
      lic.id,
      lic.license_number,
      lic.license_type,
      lic.holder_id,
      lic.status,
      lic.issued_at,
      lic.valid_from,
      lic.valid_until,
      lic.conditions,
      lic.created_at,
      lic.application_id,
      lic.sector_id,
      COALESCE(
        lic.sector_id,
        linked_licensee.sector_id,
        NULLIF(app.data->>'sector_id', '')::uuid
      ) AS resolved_sector_id
    FROM public.licenses lic
    LEFT JOIN public.licensees linked_licensee
      ON linked_licensee.license_id = lic.id
    LEFT JOIN public.applications app
      ON app.id = lic.application_id
    WHERE
      v_is_internal
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
    WHERE (v_status IS NULL OR b.status = v_status)
      AND (_sector_id IS NULL OR b.resolved_sector_id = _sector_id)
      AND (
        v_search IS NULL
        OR lower(coalesce(b.license_number, '')) LIKE '%' || lower(v_search) || '%'
        OR lower(coalesce(b.license_type, '')) LIKE '%' || lower(v_search) || '%'
      )
  ),
  counted AS (
    SELECT count(*) AS total FROM filtered
  ),
  ordered AS (
    SELECT *
    FROM filtered
    ORDER BY
      CASE WHEN v_sort = 'license_number' AND v_dir = 'asc' THEN license_number END ASC,
      CASE WHEN v_sort = 'license_number' AND v_dir = 'desc' THEN license_number END DESC,
      CASE WHEN v_sort = 'issued_at' AND v_dir = 'asc' THEN issued_at END ASC NULLS LAST,
      CASE WHEN v_sort = 'issued_at' AND v_dir = 'desc' THEN issued_at END DESC NULLS LAST,
      CASE WHEN v_sort = 'created_at' AND v_dir = 'asc' THEN created_at END ASC,
      CASE WHEN v_sort = 'created_at' AND v_dir = 'desc' THEN created_at END DESC,
      created_at DESC
    LIMIT v_page_size OFFSET v_offset
  )
  SELECT
    o.id,
    o.license_number,
    o.license_type,
    o.holder_id,
    o.status::text,
    o.issued_at,
    o.valid_from,
    o.valid_until,
    o.conditions,
    o.created_at,
    o.application_id,
    o.sector_id,
    o.resolved_sector_id,
    c.total
  FROM ordered o
  CROSS JOIN counted c;
END;
$$;

DROP POLICY IF EXISTS "Licensee users read linked licenses" ON public.licenses;
CREATE POLICY "Licensee users read linked licenses"
ON public.licenses
FOR SELECT
TO authenticated
USING (
  auth.uid() = holder_id
  OR EXISTS (
    SELECT 1
    FROM public.profiles self
    LEFT JOIN public.licensees own_licensee ON own_licensee.id = self.licensee_id
    WHERE self.id = auth.uid()
      AND self.licensee_id IS NOT NULL
      AND (
        licenses.id = own_licensee.license_id
        OR licenses.holder_id = self.id
        OR licenses.holder_id = self.licensee_id
        OR licenses.application_id IN (
          SELECT a.id
          FROM public.applications a
          WHERE a.applicant_id = self.id
        )
        OR licenses.application_id IN (
          SELECT lic.application_id
          FROM public.licenses lic
          JOIN public.licensees l ON l.license_id = lic.id
          WHERE l.id = self.licensee_id
            AND lic.application_id IS NOT NULL
        )
      )
  )
  OR licenses.id IN (SELECT public.ppoc_accessible_license_ids(auth.uid()))
);

GRANT EXECUTE ON FUNCTION public.get_my_licenses_page(integer, integer, text, text, text, text, uuid, uuid) TO authenticated;