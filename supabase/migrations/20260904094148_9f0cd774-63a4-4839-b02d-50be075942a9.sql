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
  v_q text := NULLIF(btrim(COALESCE(_search, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF _record_type IS NULL OR _record_type NOT IN (
    'entity','application','license','complaint','investigation','return',
    'correspondence','fit_and_proper','person','inspection',
    'assessment','finding','enforcement'
  ) THEN
    RAISE EXCEPTION 'unsupported_record_type';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT l.id, 'entity'::text AS rt, NULL::text AS ref, l.name AS ttl,
           l.name AS ent, NULL::text AS sec, l.status::text AS st,
           l.created_at AS dt, l.id AS ent_id
      FROM public.licensees l
     WHERE _record_type = 'entity'

    UNION ALL
    SELECT a.id, 'application', a.application_number, NULL,
           e.name, NULL, a.status::text, a.created_at, a.entity_id
      FROM public.applications a
      LEFT JOIN public.licensees e ON e.id = a.entity_id
     WHERE _record_type = 'application'

    UNION ALL
    SELECT lic.id, 'license', lic.license_number, lic.license_type,
           e.name, NULL, lic.status::text, lic.created_at, lic.holder_id
      FROM public.licenses lic
      LEFT JOIN public.licensees e ON e.id = lic.holder_id
     WHERE _record_type = 'license'

    UNION ALL
    SELECT c.id, 'complaint', c.complaint_number, NULL,
           e.name, c.complainant_name, c.status::text, c.created_at, c.licensee_id
      FROM public.complaints c
      LEFT JOIN public.licensees e ON e.id = c.licensee_id
     WHERE _record_type = 'complaint'

    UNION ALL
    SELECT i.id, 'investigation', i.code, NULL,
           e.name, NULL, i.status::text, i.created_at, i.licensee_id
      FROM public.conduct_investigations i
      LEFT JOIN public.licensees e ON e.id = i.licensee_id
     WHERE _record_type = 'investigation'

    UNION ALL
    SELECT r.id, 'return', cfg.name, NULL,
           e.name,
           to_char(r.period_start, 'DD Mon YYYY') || ' – ' || to_char(r.period_end, 'DD Mon YYYY'),
           r.status::text, r.created_at, lic.holder_id
      FROM public.compliance_returns r
      LEFT JOIN public.return_configurations cfg ON cfg.id = r.return_config_id
      LEFT JOIN public.licenses lic ON lic.id = r.license_id
      LEFT JOIN public.licensees e ON e.id = lic.holder_id
     WHERE _record_type = 'return'

    UNION ALL
    SELECT t.id, 'correspondence', t.reference, NULL,
           e.name, t.sender_name, t.status::text, t.created_at, t.licensee_id
      FROM public.correspondence_threads t
      LEFT JOIN public.licensees e ON e.id = t.licensee_id
     WHERE _record_type = 'correspondence'

    UNION ALL
    SELECT f.id, 'fit_and_proper', f.external_reference, ind.full_name,
           e.name, NULL, f.status::text, f.created_at, f.licensee_id
      FROM public.fp_assessments f
      LEFT JOIN public.fp_individuals ind ON ind.id = f.individual_id
      LEFT JOIN public.licensees e ON e.id = f.licensee_id
     WHERE _record_type = 'fit_and_proper'

    UNION ALL
    SELECT p.party_id, 'person', NULL, p.full_name,
           NULL, NULL, NULL, p.created_at, NULL::uuid
      FROM public.persons p
     WHERE _record_type = 'person'

    UNION ALL
    SELECT x.id, 'inspection', x.reference, x.title,
           e.name, x.domain_code, NULL, x.created_at, x.entity_id
      FROM public.examinations x
      LEFT JOIN public.licensees e ON e.id = x.entity_id
     WHERE _record_type = 'inspection'

    UNION ALL
    SELECT s.id, 'assessment', s.reference, NULL,
           e.name, s.domain_code, s.status::text, s.created_at, s.entity_id
      FROM public.supervisory_assessment s
      LEFT JOIN public.licensees e ON e.id = s.entity_id
     WHERE _record_type = 'assessment'

    UNION ALL
    SELECT fd.id, 'finding', fd.reference, fd.title,
           e.name, fd.domain_code, fd.status::text, fd.created_at, fd.entity_id
      FROM public.supervisory_finding fd
      LEFT JOIN public.licensees e ON e.id = fd.entity_id
     WHERE _record_type = 'finding'

    UNION ALL
    SELECT en.id, 'enforcement', en.case_number, NULL,
           e.name, en.notice_reference, en.status::text, en.created_at, en.entity_id
      FROM public.enforcement_actions en
      LEFT JOIN public.licensees e ON e.id = en.entity_id
     WHERE _record_type = 'enforcement'
  ),
  filtered AS (
    SELECT b.*
      FROM base b
     WHERE v_q IS NULL
        OR b.ref ILIKE '%' || v_q || '%'
        OR b.ttl ILIKE '%' || v_q || '%'
        OR b.ent ILIKE '%' || v_q || '%'
        OR b.sec ILIKE '%' || v_q || '%'
  ),
  counted AS (
    SELECT f.*, count(*) OVER () AS n,
           CASE WHEN _entity_id IS NOT NULL AND f.ent_id = _entity_id THEN 0 ELSE 1 END AS ctx_rank
      FROM filtered f
  )
  SELECT c.id, c.rt, c.ref, c.ttl, c.ent, c.sec, c.st, c.dt, c.n
    FROM counted c
   ORDER BY c.ctx_rank, c.dt DESC NULLS LAST, c.id
   OFFSET (v_page - 1) * v_size
   LIMIT v_size;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_picker_search(text, text, uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_picker_search(text, text, uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_picker_search(text, text, uuid, integer, integer) TO authenticated, service_role;