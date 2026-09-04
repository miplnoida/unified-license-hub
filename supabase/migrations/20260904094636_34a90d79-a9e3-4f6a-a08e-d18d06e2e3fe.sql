DROP FUNCTION IF EXISTS public.record_picker_search(text, text, uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.record_picker_search(
  _record_type text,
  _search text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 25
)
RETURNS TABLE (
  record_id uuid,
  record_type text,
  reference text,
  title text,
  entity_name text,
  secondary text,
  record_status text,
  record_date timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_size integer := LEAST(GREATEST(COALESCE(_page_size, 25), 1), 100);
  v_page integer := GREATEST(COALESCE(_page, 1), 1);
  v_off  integer;
  v_q text := NULLIF(btrim(COALESCE(_search, '')), '');
  v_like text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  v_off := (v_page - 1) * v_size;
  v_like := CASE WHEN v_q IS NULL THEN NULL ELSE '%' || v_q || '%' END;

  IF _record_type = 'entity' THEN
    RETURN QUERY
    WITH b AS (
      SELECT l.id, l.name AS ttl, l.name AS ent, NULL::text AS sec,
             l.status::text AS st, l.created_at AS dt, l.id AS eid
        FROM public.licensees l
       WHERE v_like IS NULL OR l.name ILIKE v_like
    ), c AS (SELECT b.*, count(*) OVER () n FROM b)
    SELECT c.id, 'entity'::text, NULL::text, c.ttl, c.ent, c.sec, c.st, c.dt, c.n FROM c
     ORDER BY (CASE WHEN _entity_id IS NOT NULL AND c.eid = _entity_id THEN 0 ELSE 1 END),
              c.dt DESC NULLS LAST, c.id
     OFFSET v_off LIMIT v_size;

  ELSIF _record_type = 'application' THEN
    RETURN QUERY
    WITH b AS (
      SELECT a.id, a.application_number AS ref, NULL::text AS ttl, e.name AS ent,
             NULL::text AS sec, a.status::text AS st, a.created_at AS dt, a.entity_id AS eid
        FROM public.applications a
        LEFT JOIN public.licensees e ON e.id = a.entity_id
       WHERE v_like IS NULL OR a.application_number ILIKE v_like OR e.name ILIKE v_like
    ), c AS (SELECT b.*, count(*) OVER () n FROM b)
    SELECT c.id, 'application'::text, c.ref, c.ttl, c.ent, c.sec, c.st, c.dt, c.n FROM c
     ORDER BY (CASE WHEN _entity_id IS NOT NULL AND c.eid = _entity_id THEN 0 ELSE 1 END),
              c.dt DESC NULLS LAST, c.id
     OFFSET v_off LIMIT v_size;

  ELSIF _record_type = 'license' THEN
    RETURN QUERY
    WITH b AS (
      SELECT l.id, l.license_number AS ref, l.license_type AS ttl, e.name AS ent,
             NULL::text AS sec, l.status::text AS st, l.created_at AS dt, l.holder_id AS eid
        FROM public.licenses l
        LEFT JOIN public.licensees e ON e.id = l.holder_id
       WHERE v_like IS NULL OR l.license_number ILIKE v_like OR l.license_type ILIKE v_like
             OR e.name ILIKE v_like
    ), c AS (SELECT b.*, count(*) OVER () n FROM b)
    SELECT c.id, 'license'::text, c.ref, c.ttl, c.ent, c.sec, c.st, c.dt, c.n FROM c
     ORDER BY (CASE WHEN _entity_id IS NOT NULL AND c.eid = _entity_id THEN 0 ELSE 1 END),
              c.dt DESC NULLS LAST, c.id
     OFFSET v_off LIMIT v_size;

  ELSIF _record_type = 'complaint' THEN
    RETURN QUERY
    WITH b AS (
      SELECT k.id, k.complaint_number AS ref, NULL::text AS ttl, e.name AS ent,
             k.complainant_name AS sec, k.status::text AS st, k.created_at AS dt, k.licensee_id AS eid
        FROM public.complaints k
        LEFT JOIN public.licensees e ON e.id = k.licensee_id
       WHERE v_like IS NULL OR k.complaint_number ILIKE v_like OR k.complainant_name ILIKE v_like
             OR e.name ILIKE v_like
    ), c AS (SELECT b.*, count(*) OVER () n FROM b)
    SELECT c.id, 'complaint'::text, c.ref, c.ttl, c.ent, c.sec, c.st, c.dt, c.n FROM c
     ORDER BY (CASE WHEN _entity_id IS NOT NULL AND c.eid = _entity_id THEN 0 ELSE 1 END),
              c.dt DESC NULLS LAST, c.id
     OFFSET v_off LIMIT v_size;

  ELSIF _record_type = 'investigation' THEN
    RETURN QUERY
    WITH b AS (
      SELECT i.id, i.code AS ref, NULL::text AS ttl, e.name AS ent,
             NULL::text AS sec, i.status::text AS st, i.created_at AS dt, i.licensee_id AS eid
        FROM public.conduct_investigations i
        LEFT JOIN public.licensees e ON e.id = i.licensee_id
       WHERE v_like IS NULL OR i.code ILIKE v_like OR e.name ILIKE v_like
    ), c AS (SELECT b.*, count(*) OVER () n FROM b)
    SELECT c.id, 'investigation'::text, c.ref, c.ttl, c.ent, c.sec, c.st, c.dt, c.n FROM c
     ORDER BY (CASE WHEN _entity_id IS NOT NULL AND c.eid = _entity_id THEN 0 ELSE 1 END),
              c.dt DESC NULLS LAST, c.id
     OFFSET v_off LIMIT v_size;

  ELSIF _record_type = 'return' THEN
    RETURN QUERY
    WITH b AS (
      SELECT r.id, cfg.name AS ref, NULL::text AS ttl, e.name AS ent,
             to_char(r.period_start, 'DD Mon YYYY') || ' – ' || to_char(r.period_end, 'DD Mon YYYY') AS sec,
             r.status::text AS st, r.created_at AS dt, lic.holder_id AS eid
        FROM public.compliance_returns r
        LEFT JOIN public.return_configurations cfg ON cfg.id = r.return_config_id
        LEFT JOIN public.licenses lic ON lic.id = r.license_id
        LEFT JOIN public.licensees e ON e.id = lic.holder_id
       WHERE v_like IS NULL OR cfg.name ILIKE v_like OR e.name ILIKE v_like
    ), c AS (SELECT b.*, count(*) OVER () n FROM b)
    SELECT c.id, 'return'::text, c.ref, c.ttl, c.ent, c.sec, c.st, c.dt, c.n FROM c
     ORDER BY (CASE WHEN _entity_id IS NOT NULL AND c.eid = _entity_id THEN 0 ELSE 1 END),
              c.dt DESC NULLS LAST, c.id
     OFFSET v_off LIMIT v_size;

  ELSIF _record_type = 'correspondence' THEN
    RETURN QUERY
    WITH b AS (
      SELECT t.id, t.reference AS ref, NULL::text AS ttl, e.name AS ent,
             t.sender_name AS sec, t.status::text AS st, t.created_at AS dt, t.licensee_id AS eid
        FROM public.correspondence_threads t
        LEFT JOIN public.licensees e ON e.id = t.licensee_id
       WHERE v_like IS NULL OR t.reference ILIKE v_like OR t.sender_name ILIKE v_like
             OR e.name ILIKE v_like
    ), c AS (SELECT b.*, count(*) OVER () n FROM b)
    SELECT c.id, 'correspondence'::text, c.ref, c.ttl, c.ent, c.sec, c.st, c.dt, c.n FROM c
     ORDER BY (CASE WHEN _entity_id IS NOT NULL AND c.eid = _entity_id THEN 0 ELSE 1 END),
              c.dt DESC NULLS LAST, c.id
     OFFSET v_off LIMIT v_size;

  ELSIF _record_type = 'fit_and_proper' THEN
    RETURN QUERY
    WITH b AS (
      SELECT f.id, f.external_reference AS ref, ind.full_name AS ttl, e.name AS ent,
             NULL::text AS sec, f.status::text AS st, f.created_at AS dt, f.licensee_id AS eid
        FROM public.fp_assessments f
        LEFT JOIN public.fp_individuals ind ON ind.id = f.individual_id
        LEFT JOIN public.licensees e ON e.id = f.licensee_id
       WHERE v_like IS NULL OR f.external_reference ILIKE v_like OR ind.full_name ILIKE v_like
             OR e.name ILIKE v_like
    ), c AS (SELECT b.*, count(*) OVER () n FROM b)
    SELECT c.id, 'fit_and_proper'::text, c.ref, c.ttl, c.ent, c.sec, c.st, c.dt, c.n FROM c
     ORDER BY (CASE WHEN _entity_id IS NOT NULL AND c.eid = _entity_id THEN 0 ELSE 1 END),
              c.dt DESC NULLS LAST, c.id
     OFFSET v_off LIMIT v_size;

  ELSIF _record_type = 'inspection' THEN
    RETURN QUERY
    WITH b AS (
      SELECT x.id, x.reference AS ref, x.title AS ttl, e.name AS ent,
             x.domain_code AS sec, NULL::text AS st, x.created_at AS dt, x.entity_id AS eid
        FROM public.examinations x
        LEFT JOIN public.licensees e ON e.id = x.entity_id
       WHERE v_like IS NULL OR x.reference ILIKE v_like OR x.title ILIKE v_like OR e.name ILIKE v_like
    ), c AS (SELECT b.*, count(*) OVER () n FROM b)
    SELECT c.id, 'inspection'::text, c.ref, c.ttl, c.ent, c.sec, c.st, c.dt, c.n FROM c
     ORDER BY (CASE WHEN _entity_id IS NOT NULL AND c.eid = _entity_id THEN 0 ELSE 1 END),
              c.dt DESC NULLS LAST, c.id
     OFFSET v_off LIMIT v_size;

  ELSIF _record_type = 'assessment' THEN
    RETURN QUERY
    WITH b AS (
      SELECT s.id, s.reference AS ref, NULL::text AS ttl, e.name AS ent,
             s.domain_code AS sec, s.status::text AS st, s.created_at AS dt, s.entity_id AS eid
        FROM public.supervisory_assessment s
        LEFT JOIN public.licensees e ON e.id = s.entity_id
       WHERE v_like IS NULL OR s.reference ILIKE v_like OR e.name ILIKE v_like
    ), c AS (SELECT b.*, count(*) OVER () n FROM b)
    SELECT c.id, 'assessment'::text, c.ref, c.ttl, c.ent, c.sec, c.st, c.dt, c.n FROM c
     ORDER BY (CASE WHEN _entity_id IS NOT NULL AND c.eid = _entity_id THEN 0 ELSE 1 END),
              c.dt DESC NULLS LAST, c.id
     OFFSET v_off LIMIT v_size;

  ELSIF _record_type = 'finding' THEN
    RETURN QUERY
    WITH b AS (
      SELECT f.id, f.reference AS ref, f.title AS ttl, e.name AS ent,
             f.domain_code AS sec, f.status::text AS st, f.created_at AS dt, f.entity_id AS eid
        FROM public.supervisory_finding f
        LEFT JOIN public.licensees e ON e.id = f.entity_id
       WHERE v_like IS NULL OR f.reference ILIKE v_like OR f.title ILIKE v_like OR e.name ILIKE v_like
    ), c AS (SELECT b.*, count(*) OVER () n FROM b)
    SELECT c.id, 'finding'::text, c.ref, c.ttl, c.ent, c.sec, c.st, c.dt, c.n FROM c
     ORDER BY (CASE WHEN _entity_id IS NOT NULL AND c.eid = _entity_id THEN 0 ELSE 1 END),
              c.dt DESC NULLS LAST, c.id
     OFFSET v_off LIMIT v_size;

  ELSIF _record_type = 'enforcement' THEN
    RETURN QUERY
    WITH b AS (
      SELECT n.id, n.case_number AS ref, NULL::text AS ttl, e.name AS ent,
             n.notice_reference AS sec, n.status::text AS st, n.created_at AS dt, n.entity_id AS eid
        FROM public.enforcement_actions n
        LEFT JOIN public.licensees e ON e.id = n.entity_id
       WHERE v_like IS NULL OR n.case_number ILIKE v_like OR n.notice_reference ILIKE v_like
             OR e.name ILIKE v_like
    ), c AS (SELECT b.*, count(*) OVER () n FROM b)
    SELECT c.id, 'enforcement'::text, c.ref, c.ttl, c.ent, c.sec, c.st, c.dt, c.n FROM c
     ORDER BY (CASE WHEN _entity_id IS NOT NULL AND c.eid = _entity_id THEN 0 ELSE 1 END),
              c.dt DESC NULLS LAST, c.id
     OFFSET v_off LIMIT v_size;

  ELSE
    RAISE EXCEPTION 'unsupported_record_type';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_picker_search(text, text, uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_picker_search(text, text, uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_picker_search(text, text, uuid, integer, integer) TO authenticated, service_role;