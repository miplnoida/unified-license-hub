ALTER TABLE public.fp_assessments ADD COLUMN IF NOT EXISTS external_reference text;
CREATE UNIQUE INDEX IF NOT EXISTS fp_assessments_external_reference_key
  ON public.fp_assessments (external_reference) WHERE external_reference IS NOT NULL;
COMMENT ON COLUMN public.fp_assessments.external_reference IS
  'Authoritative human-facing case reference (e.g. FPA-SLU-2026-0001). When present it replaces the derived FP-<uuid> reference in every read surface.';

DO $mig$
DECLARE d text; d2 text;
BEGIN
  -- 1. case workspace header reference
  d := pg_get_functiondef('public.fp_assessment_case(uuid)'::regprocedure);
  d2 := replace(d,
    $q$'reference', 'FP-' || upper(substr(a.id::text, 1, 8)),$q$,
    $q$'reference', COALESCE(NULLIF(btrim(a.external_reference),''), 'FP-' || upper(substr(a.id::text, 1, 8))),$q$);
  IF d2 = d THEN RAISE EXCEPTION 'fp_assessment_case reference expression not found'; END IF;
  EXECUTE d2;

  -- 2. Entity 360 fit & proper summary
  d := pg_get_functiondef('public.fp_entity_fp_summary(uuid)'::regprocedure);
  d2 := replace(d,
    $q$'reference', 'FP-' || upper(substr(a.id::text,1,8)),$q$,
    $q$'reference', COALESCE(NULLIF(btrim(a.external_reference),''), 'FP-' || upper(substr(a.id::text,1,8))),$q$);
  IF d2 = d THEN RAISE EXCEPTION 'fp_entity_fp_summary reference expression not found'; END IF;
  EXECUTE d2;

  -- 3. work queue: expose the reference and make it searchable
  d := pg_get_functiondef('public.list_fp_assessments(jsonb,text,integer,integer,text)'::regprocedure);
  d2 := replace(d,
    $q$      a.committee_id, a.created_at, a.submitted_at, a.determined_at, a.closed_at,$q$,
    $q$      a.committee_id, a.created_at, a.submitted_at, a.determined_at, a.closed_at,
      COALESCE(NULLIF(btrim(a.external_reference),''), 'FP-' || upper(substr(a.id::text,1,8))) AS reference,$q$);
  IF d2 = d THEN RAISE EXCEPTION 'list_fp_assessments scoped column list not found'; END IF;
  d := replace(d2,
    $q$            OR s.id::text ILIKE '%'||_search||'%')$q$,
    $q$            OR s.id::text ILIKE '%'||_search||'%'
            OR s.reference ILIKE '%'||_search||'%')$q$);
  IF d = d2 THEN RAISE EXCEPTION 'list_fp_assessments search clause not found'; END IF;
  EXECUTE d;
END $mig$;