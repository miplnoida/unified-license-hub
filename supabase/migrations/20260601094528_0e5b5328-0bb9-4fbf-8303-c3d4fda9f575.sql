CREATE OR REPLACE FUNCTION public.get_my_ppoc_mapped_entities()
RETURNS TABLE(
  mapping_id uuid,
  licensee_id uuid,
  entity_name text,
  sector_id uuid,
  resolved_sector_id uuid,
  created_at timestamptz,
  application_id uuid,
  license_number text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH my_mappings AS (
    SELECT m.id, m.licensee_id, m.created_at
    FROM public.ppoc_entity_mappings m
    WHERE m.ppoc_user_id = auth.uid()
      AND m.is_active = true
  ),
  sectors_by_mapping AS (
    SELECT s.mapping_id, array_agg(s.sector_id) AS sector_ids
    FROM public.ppoc_mapping_sectors s
    WHERE s.mapping_id IN (SELECT id FROM my_mappings)
    GROUP BY s.mapping_id
  )
  SELECT
    m.id AS mapping_id,
    l.id AS licensee_id,
    COALESCE(
      NULLIF(r.applicant_name, ''),
      NULLIF(a.data->>'applicant_name', ''),
      NULLIF(a.data->>'entity_name', ''),
      NULLIF(pl.entity_name, ''),
      NULLIF(p.entity_name, ''),
      NULLIF(l.name, ''),
      '—'
    ) AS entity_name,
    COALESCE(r.sector_id, NULLIF(a.data->>'sector_id', '')::uuid, l.sector_id) AS sector_id,
    COALESCE(l.sector_id, r.sector_id, NULLIF(a.data->>'sector_id', '')::uuid) AS resolved_sector_id,
    COALESCE(l.created_at, m.created_at) AS created_at,
    a.id AS application_id,
    lic.license_number
  FROM my_mappings m
  JOIN public.licensees l ON l.id = m.licensee_id
  LEFT JOIN public.licenses lic ON lic.id = l.license_id
  LEFT JOIN public.applications a ON a.id = lic.application_id
  LEFT JOIN public.registrations r ON r.user_id = a.applicant_id
  LEFT JOIN public.pre_license_users pl ON pl.id = a.applicant_id
  LEFT JOIN public.profiles p ON p.id = a.applicant_id
  LEFT JOIN sectors_by_mapping sms ON sms.mapping_id = m.id
  WHERE (
    sms.sector_ids IS NULL
    OR array_length(sms.sector_ids, 1) IS NULL
    OR COALESCE(l.sector_id, r.sector_id, NULLIF(a.data->>'sector_id', '')::uuid) = ANY(sms.sector_ids)
  )
  ORDER BY COALESCE(l.created_at, m.created_at),
           COALESCE(
             NULLIF(r.applicant_name, ''),
             NULLIF(a.data->>'applicant_name', ''),
             NULLIF(a.data->>'entity_name', ''),
             NULLIF(pl.entity_name, ''),
             NULLIF(p.entity_name, ''),
             NULLIF(l.name, ''),
             '—'
           );
$function$;

REVOKE ALL ON FUNCTION public.get_my_ppoc_mapped_entities() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_ppoc_mapped_entities() TO authenticated, service_role;