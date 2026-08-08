CREATE OR REPLACE FUNCTION public.list_internal_users(
  _search text DEFAULT NULL,
  _include_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  primary_role text,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_internal_staff(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH external_roles AS (
    SELECT ARRAY['pre_licensee','licensee','licensee_primary','licensee_secondary','applicant']::text[] AS roles
  ),
  staff AS (
    SELECT ur.user_id,
           (ARRAY_AGG(ur.role::text ORDER BY ur.role::text))[1] AS primary_role
    FROM public.user_roles ur
    WHERE ur.role::text <> ALL ((SELECT roles FROM external_roles))
    GROUP BY ur.user_id
  )
  SELECT p.id,
         p.full_name,
         p.email,
         s.primary_role,
         p.status
  FROM staff s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE NOT EXISTS (
          SELECT 1 FROM public.user_roles ux
          WHERE ux.user_id = p.id
            AND ux.role::text = ANY ((SELECT roles FROM external_roles))
        )
    AND COALESCE(LOWER(p.user_type::text), '') <> ALL (
          ARRAY['primary','secondary','applicant','licensee','licensee_primary','licensee_secondary','pre_licensee']
        )
    AND NOT EXISTS (
          SELECT 1 FROM public.entity_user_access eua
          WHERE eua.user_id = p.id
        )
    AND (
      _search IS NULL
      OR BTRIM(_search) = ''
      OR COALESCE(p.full_name, '') ILIKE '%' || BTRIM(_search) || '%'
      OR COALESCE(p.email, '') ILIKE '%' || BTRIM(_search) || '%'
    )
  UNION
  SELECT p.id,
         p.full_name,
         p.email,
         (SELECT (ARRAY_AGG(ur.role::text ORDER BY ur.role::text))[1]
            FROM public.user_roles ur WHERE ur.user_id = p.id),
         p.status
  FROM public.profiles p
  WHERE _include_ids IS NOT NULL
    AND p.id = ANY (_include_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.list_internal_users(text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_internal_users(text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_internal_users(text, uuid[]) TO service_role;