CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_licensees_name_trgm
  ON public.licensees USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_licensees_sector_id
  ON public.licensees (sector_id);

DROP FUNCTION IF EXISTS public.search_licensees(text, integer, integer);

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
  v_is_super boolean;
  v_reg uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501', HINT = 'auth_required';
  END IF;

  v_is_super := public.has_role(v_uid, 'super_admin'::app_role);

  IF NOT v_is_super THEN
    SELECT p.regulator_id INTO v_reg FROM public.profiles p WHERE p.id = v_uid;
    IF v_reg IS NULL THEN
      RAISE EXCEPTION 'No regulator scope for user'
        USING ERRCODE = '42501', HINT = 'no_regulator_scope';
    END IF;
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT l.id, l.name, l.status, l.sector_id,
           s.name AS sector_name, s.regulator_id AS regulator_id
    FROM public.licensees l
    LEFT JOIN public.sectors s ON s.id = l.sector_id
    WHERE (v_is_super OR s.regulator_id = v_reg)
      AND (v_q IS NULL OR l.name ILIKE '%' || v_q || '%')
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