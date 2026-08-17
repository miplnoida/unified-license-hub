-- ─────────────────────────────────────────────────────────────────────────────
-- Backing RPC for the new Fit & Proper Process List screen (/fpa/processes).
-- Mirrors list_complaints() (20260716074617_...sql) — server-side search,
-- filter, sort and pagination, reusing the existing can_read_fp_assessment()
-- visibility rule (Twin Peaks regulator segregation + entity assignment)
-- rather than re-deriving it.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_fp_assessments(
  _filters jsonb DEFAULT '{}'::jsonb,
  _sort text DEFAULT 'created_at.desc',
  _page int DEFAULT 1,
  _page_size int DEFAULT 25,
  _search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_offset int; v_limit int; v_sort_col text; v_sort_dir text;
  v_total bigint; v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;

  v_limit := LEAST(GREATEST(COALESCE(_page_size,25),1),200);
  v_offset := GREATEST((COALESCE(_page,1)-1)*v_limit, 0);
  v_sort_col := split_part(_sort,'.',1);
  v_sort_dir := LOWER(COALESCE(NULLIF(split_part(_sort,'.',2),''),'desc'));
  IF v_sort_col NOT IN ('created_at','status','assessment_type','last_activity_at') THEN
    v_sort_col := 'created_at';
  END IF;
  IF v_sort_dir NOT IN ('asc','desc') THEN v_sort_dir := 'desc'; END IF;

  WITH scoped AS (
    SELECT
      a.id, a.individual_id, a.assessment_type, a.status, a.regulator_id,
      a.committee_id, a.created_at, a.submitted_at, a.determined_at, a.closed_at,
      GREATEST(a.created_at, COALESCE(a.submitted_at, a.created_at), COALESCE(a.determined_at, a.created_at), COALESCE(a.closed_at, a.created_at)) AS last_activity_at,
      i.full_name AS individual_name,
      i.national_id AS individual_national_id,
      r.name AS regulator_name
    FROM public.fp_assessments a
    JOIN public.fp_individuals i ON i.id = a.individual_id
    LEFT JOIN public.regulators r ON r.id = a.regulator_id
    WHERE public.can_read_fp_assessment(v_uid, a.id)
  ), filtered AS (
    SELECT * FROM scoped s
     WHERE (NULLIF(_filters->>'status','') IS NULL
            OR (_filters->>'status'='open' AND s.status IN ('draft','submitted','screening','awaiting_committee'))
            OR s.status = _filters->>'status')
       AND (NULLIF(_filters->>'assessment_type','') IS NULL OR s.assessment_type = _filters->>'assessment_type')
       AND (NULLIF(_filters->>'regulator_id','') IS NULL OR s.regulator_id = (_filters->>'regulator_id')::uuid)
       AND (NULLIF(_filters->>'date_from','') IS NULL OR s.created_at >= (_filters->>'date_from')::timestamptz)
       AND (NULLIF(_filters->>'date_to','')   IS NULL OR s.created_at <= (_filters->>'date_to')::timestamptz)
       AND (NULLIF(_search,'') IS NULL
            OR s.individual_name ILIKE '%'||_search||'%'
            OR COALESCE(s.individual_national_id,'') ILIKE '%'||_search||'%'
            OR s.id::text ILIKE '%'||_search||'%')
  ), paged AS (
    SELECT * FROM filtered f
     ORDER BY
       CASE WHEN v_sort_col='created_at'       AND v_sort_dir='asc'  THEN f.created_at END ASC NULLS LAST,
       CASE WHEN v_sort_col='created_at'       AND v_sort_dir='desc' THEN f.created_at END DESC NULLS LAST,
       CASE WHEN v_sort_col='status'           AND v_sort_dir='asc'  THEN f.status END ASC NULLS LAST,
       CASE WHEN v_sort_col='status'           AND v_sort_dir='desc' THEN f.status END DESC NULLS LAST,
       CASE WHEN v_sort_col='assessment_type'  AND v_sort_dir='asc'  THEN f.assessment_type END ASC NULLS LAST,
       CASE WHEN v_sort_col='assessment_type'  AND v_sort_dir='desc' THEN f.assessment_type END DESC NULLS LAST,
       CASE WHEN v_sort_col='last_activity_at' AND v_sort_dir='asc'  THEN f.last_activity_at END ASC NULLS LAST,
       CASE WHEN v_sort_col='last_activity_at' AND v_sort_dir='desc' THEN f.last_activity_at END DESC NULLS LAST
     LIMIT v_limit OFFSET v_offset
  )
  SELECT (SELECT count(*) FROM filtered), COALESCE(jsonb_agg(to_jsonb(p.*)), '[]'::jsonb)
    INTO v_total, v_rows FROM paged p;

  RETURN jsonb_build_object('total', v_total, 'page', GREATEST(_page,1), 'page_size', v_limit, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.list_fp_assessments(jsonb,text,int,int,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_fp_assessments(jsonb,text,int,int,text) TO authenticated, service_role;
