
-- Backfill: clear stray notes when indicator is false
UPDATE public.complaints
SET vulnerability_notes = NULL
WHERE vulnerability_indicator = false
  AND vulnerability_notes IS NOT NULL
  AND btrim(vulnerability_notes) <> '';

-- Backfill: for legacy rows with indicator=true but no notes, insert a placeholder note
UPDATE public.complaints
SET vulnerability_notes = '(not recorded)'
WHERE vulnerability_indicator = true
  AND (vulnerability_notes IS NULL OR btrim(vulnerability_notes) = '');

CREATE OR REPLACE FUNCTION public.enforce_complaint_vulnerability_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.vulnerability_indicator IS TRUE THEN
    IF NEW.vulnerability_notes IS NULL OR btrim(NEW.vulnerability_notes) = '' THEN
      RAISE EXCEPTION 'Vulnerability notes are required when vulnerability_indicator is true'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.vulnerability_notes IS NOT NULL AND btrim(NEW.vulnerability_notes) <> '' THEN
      RAISE EXCEPTION 'Vulnerability notes must be empty when vulnerability_indicator is false'
        USING ERRCODE = '23514';
    END IF;
    -- Normalize empty strings to null
    NEW.vulnerability_notes := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complaints_vulnerability_consistency ON public.complaints;
CREATE TRIGGER trg_complaints_vulnerability_consistency
BEFORE INSERT OR UPDATE OF vulnerability_indicator, vulnerability_notes
ON public.complaints
FOR EACH ROW
EXECUTE FUNCTION public.enforce_complaint_vulnerability_consistency();

-- Paginated licensee search
CREATE OR REPLACE FUNCTION public.search_licensees(
  _q text DEFAULT NULL,
  _limit int DEFAULT 25,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  status text,
  sector_id uuid,
  sector_name text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q text := NULLIF(btrim(coalesce(_q, '')), '');
  v_limit int := LEAST(GREATEST(coalesce(_limit, 25), 1), 100);
  v_offset int := GREATEST(coalesce(_offset, 0), 0);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT l.id, l.name, l.status, l.sector_id, s.name AS sector_name
    FROM public.licensees l
    LEFT JOIN public.sectors s ON s.id = l.sector_id
    WHERE v_q IS NULL OR l.name ILIKE '%' || v_q || '%'
  ),
  counted AS (
    SELECT COUNT(*)::bigint AS c FROM filtered
  )
  SELECT f.id, f.name, f.status, f.sector_id, f.sector_name, (SELECT c FROM counted)
  FROM filtered f
  ORDER BY f.name
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.search_licensees(text, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.search_licensees(text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_licensees(text, int, int) TO service_role;
