CREATE OR REPLACE FUNCTION public.search_licensees(
  _q text DEFAULT NULL,
  _limit integer DEFAULT 25,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  status text,
  sector_id uuid,
  sector_name text,
  regulator_id uuid,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q text := NULLIF(btrim(coalesce(_q, '')), '');
  v_limit int := LEAST(GREATEST(coalesce(_limit, 25), 1), 100);
  v_offset int := GREATEST(coalesce(_offset, 0), 0);
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501', HINT = 'auth_required';
  END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR public.has_any_permission(v_uid, ARRAY[
      'complaint_management.view',
      'licensee_management.view',
      'license_management.view'
    ])
  ) THEN
    RAISE EXCEPTION 'permission denied for entity search'
      USING ERRCODE = '42501', HINT = 'permission_denied';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT l.id, l.name, l.status, l.sector_id,
           s.name AS sector_name, s.regulator_id AS regulator_id
    FROM public.licensees l
    LEFT JOIN public.sectors s ON s.id = l.sector_id
    WHERE (v_q IS NULL OR l.name ILIKE '%' || v_q || '%')
  ),
  counted AS (SELECT count(*)::bigint AS c FROM filtered)
  SELECT f.id, f.name, f.status, f.sector_id, f.sector_name, f.regulator_id,
         (SELECT c FROM counted)
  FROM filtered f
  ORDER BY f.name
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.search_licensees(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_licensees(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_licensees(text, integer, integer) TO service_role;