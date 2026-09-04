-- =====================================================================
-- W1A.1 Record picker canonical closure
-- =====================================================================

-- 1. Picker type -> canonical target type ------------------------------
CREATE OR REPLACE FUNCTION public.record_picker_normalise_type(_picker_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE lower(btrim(COALESCE(_picker_type, '')))
    WHEN 'inspection' THEN 'examination'   -- legacy alias, normalised at the boundary
    ELSE lower(btrim(COALESCE(_picker_type, '')))
  END;
$function$;

CREATE OR REPLACE FUNCTION public.record_picker_target_type(_picker_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE public.record_picker_normalise_type(_picker_type)
    WHEN 'entity'         THEN 'entity'
    WHEN 'application'    THEN 'application'
    WHEN 'license'        THEN 'licence'
    WHEN 'return'         THEN 'filing'
    WHEN 'complaint'      THEN 'complaint'
    WHEN 'investigation'  THEN 'investigation'
    WHEN 'examination'    THEN 'examination'
    WHEN 'assessment'     THEN 'assessment'
    WHEN 'finding'        THEN 'finding'
    WHEN 'enforcement'    THEN 'enforcement_action'
    WHEN 'correspondence' THEN 'correspondence_thread'
    WHEN 'fit_and_proper' THEN 'fit_and_proper_assessment'
    ELSE NULL
  END;
$function$;

REVOKE ALL ON FUNCTION public.record_picker_normalise_type(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_picker_target_type(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_picker_normalise_type(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_picker_target_type(text) TO authenticated, service_role;


-- 2. Canonical Filing source + examination alias in the row source -----
CREATE OR REPLACE FUNCTION public.record_picker_search(
  _record_type text,
  _search text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 25
)
RETURNS TABLE(record_id uuid, record_type text, reference text, title text, entity_name text,
              secondary text, record_status text, record_date timestamp with time zone, total_count bigint)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_size integer := LEAST(GREATEST(COALESCE(_page_size, 25), 1), 100);
  v_page integer := GREATEST(COALESCE(_page, 1), 1);
  v_off  integer;
  v_q text := NULLIF(btrim(COALESCE(_search, '')), '');
  v_like text;
  v_type text := public.record_picker_normalise_type(_record_type);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF public.record_picker_target_type(v_type) IS NULL THEN
    RAISE EXCEPTION 'unsupported_record_type';
  END IF;
  v_off := (v_page - 1) * v_size;
  v_like := CASE WHEN v_q IS NULL THEN NULL ELSE '%' || v_q || '%' END;

  IF v_type = 'entity' THEN
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

  ELSIF v_type = 'application' THEN
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

  ELSIF v_type = 'license' THEN
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

  ELSIF v_type = 'complaint' THEN
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

  ELSIF v_type = 'investigation' THEN
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

  ELSIF v_type = 'return' THEN
    -- Canonical Filing: return_filings (+ return_filing_versions for the version in force)
    RETURN QUERY
    WITH b AS (
      SELECT f.id,
             f.filing_reference AS ref,
             d.name AS ttl,
             e.name AS ent,
             concat_ws(' · ',
               NULLIF(p.period_label, ''),
               CASE WHEN p.period_start IS NOT NULL AND p.period_end IS NOT NULL
                    THEN to_char(p.period_start, 'DD Mon YYYY') || ' – ' || to_char(p.period_end, 'DD Mon YYYY')
               END,
               CASE WHEN f.current_version_number IS NOT NULL
                    THEN 'Version ' || f.current_version_number::text END
             ) AS sec,
             f.status::text AS st,
             COALESCE(f.submitted_at, f.created_at) AS dt,
             f.entity_id AS eid
        FROM public.return_filings f
        LEFT JOIN public.return_definitions d ON d.id = f.return_definition_id
        LEFT JOIN public.reporting_periods p ON p.id = f.reporting_period_id
        LEFT JOIN public.licensees e ON e.id = f.entity_id
       WHERE v_like IS NULL OR f.filing_reference ILIKE v_like OR d.name ILIKE v_like
             OR d.code ILIKE v_like OR e.name ILIKE v_like OR p.period_label ILIKE v_like
    ), c AS (SELECT b.*, count(*) OVER () n FROM b)
    SELECT c.id, 'return'::text, c.ref, c.ttl, c.ent, c.sec, c.st, c.dt, c.n FROM c
     ORDER BY (CASE WHEN _entity_id IS NOT NULL AND c.eid = _entity_id THEN 0 ELSE 1 END),
              c.dt DESC NULLS LAST, c.id
     OFFSET v_off LIMIT v_size;

  ELSIF v_type = 'correspondence' THEN
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

  ELSIF v_type = 'fit_and_proper' THEN
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

  ELSIF v_type = 'examination' THEN
    RETURN QUERY
    WITH b AS (
      SELECT x.id, x.reference AS ref, x.title AS ttl, e.name AS ent,
             x.domain_code AS sec, NULL::text AS st, x.created_at AS dt, x.entity_id AS eid
        FROM public.examinations x
        LEFT JOIN public.licensees e ON e.id = x.entity_id
       WHERE v_like IS NULL OR x.reference ILIKE v_like OR x.title ILIKE v_like OR e.name ILIKE v_like
    ), c AS (SELECT b.*, count(*) OVER () n FROM b)
    SELECT c.id, 'examination'::text, c.ref, c.ttl, c.ent, c.sec, c.st, c.dt, c.n FROM c
     ORDER BY (CASE WHEN _entity_id IS NOT NULL AND c.eid = _entity_id THEN 0 ELSE 1 END),
              c.dt DESC NULLS LAST, c.id
     OFFSET v_off LIMIT v_size;

  ELSIF v_type = 'assessment' THEN
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

  ELSIF v_type = 'finding' THEN
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

  ELSIF v_type = 'enforcement' THEN
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


-- 3. Envelope that preserves the authoritative total on an empty page ---
CREATE OR REPLACE FUNCTION public.record_picker_page(
  _record_type text,
  _search text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_size integer := LEAST(GREATEST(COALESCE(_page_size, 25), 1), 100);
  v_page integer := GREATEST(COALESCE(_page, 1), 1);
  v_type text := public.record_picker_normalise_type(_record_type);
  v_rows jsonb;
  v_total bigint := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF public.record_picker_target_type(v_type) IS NULL THEN
    RAISE EXCEPTION 'unsupported_record_type';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) - 'total_count'), '[]'::jsonb), COALESCE(max(s.total_count), 0)
    INTO v_rows, v_total
    FROM public.record_picker_search(v_type, _search, _entity_id, v_page, v_size) s;

  -- Out-of-range page: the page holds no row, so recover the authoritative
  -- total from the same filtered population instead of reporting zero.
  IF v_total = 0 THEN
    SELECT COALESCE(max(s.total_count), 0) INTO v_total
      FROM public.record_picker_search(v_type, _search, _entity_id, 1, 1) s;
  END IF;

  RETURN jsonb_build_object(
    'picker_type', v_type,
    'target_type', public.record_picker_target_type(v_type),
    'page', v_page,
    'page_size', v_size,
    'total_count', v_total,
    'last_page', GREATEST(1, CEIL(v_total::numeric / v_size)::integer),
    'rows', v_rows
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_picker_page(text, text, uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_picker_page(text, text, uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_picker_page(text, text, uuid, integer, integer)
  TO authenticated, service_role;


-- 4. Target resolution under the caller's own visibility ---------------
CREATE OR REPLACE FUNCTION public.record_picker_target_resolve(_picker_type text, _record_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_type text := public.record_picker_normalise_type(_picker_type);
  v_ref text;
  v_found boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF public.record_picker_target_type(v_type) IS NULL THEN RAISE EXCEPTION 'unsupported_record_type'; END IF;
  IF _record_id IS NULL THEN RAISE EXCEPTION 'record_required'; END IF;

  IF v_type = 'entity' THEN
    SELECT true, l.name FROM public.licensees l WHERE l.id = _record_id INTO v_found, v_ref;
  ELSIF v_type = 'application' THEN
    SELECT true, a.application_number FROM public.applications a WHERE a.id = _record_id INTO v_found, v_ref;
  ELSIF v_type = 'license' THEN
    SELECT true, l.license_number FROM public.licenses l WHERE l.id = _record_id INTO v_found, v_ref;
  ELSIF v_type = 'return' THEN
    SELECT true, f.filing_reference FROM public.return_filings f WHERE f.id = _record_id INTO v_found, v_ref;
  ELSIF v_type = 'complaint' THEN
    SELECT true, k.complaint_number FROM public.complaints k WHERE k.id = _record_id INTO v_found, v_ref;
  ELSIF v_type = 'investigation' THEN
    SELECT true, i.code FROM public.conduct_investigations i WHERE i.id = _record_id INTO v_found, v_ref;
  ELSIF v_type = 'examination' THEN
    SELECT true, x.reference FROM public.examinations x WHERE x.id = _record_id INTO v_found, v_ref;
  ELSIF v_type = 'assessment' THEN
    SELECT true, s.reference FROM public.supervisory_assessment s WHERE s.id = _record_id INTO v_found, v_ref;
  ELSIF v_type = 'finding' THEN
    SELECT true, f.reference FROM public.supervisory_finding f WHERE f.id = _record_id INTO v_found, v_ref;
  ELSIF v_type = 'enforcement' THEN
    SELECT true, n.case_number FROM public.enforcement_actions n WHERE n.id = _record_id INTO v_found, v_ref;
  ELSIF v_type = 'correspondence' THEN
    SELECT true, t.reference FROM public.correspondence_threads t WHERE t.id = _record_id INTO v_found, v_ref;
  ELSIF v_type = 'fit_and_proper' THEN
    SELECT true, f.external_reference FROM public.fp_assessments f WHERE f.id = _record_id INTO v_found, v_ref;
  END IF;

  RETURN jsonb_build_object(
    'visible', COALESCE(v_found, false),
    'picker_type', v_type,
    'target_type', public.record_picker_target_type(v_type),
    'reference', v_ref
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_picker_target_resolve(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_picker_target_resolve(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_picker_target_resolve(text, uuid) TO authenticated, service_role;


-- 5. Refuse the retired vocabulary on the authoritative link operation --
CREATE OR REPLACE FUNCTION public.dms_link_record(
  _group_id uuid, _target_type text, _target_id text,
  _relationship_type text DEFAULT 'attached_to'::text, _target_reference text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE g public.document_groups; new_id uuid;
BEGIN
  -- Retired vocabulary must never enter document_relationships.
  IF lower(COALESCE(_target_type, '')) IN ('inspection', 'return') THEN
    RAISE EXCEPTION 'non_canonical_target_type';
  END IF;

  g := public.dms_assert_can_manage(_group_id, 'link_record');
  IF _target_type = 'entity' THEN
    IF NOT (public.is_super_admin(auth.uid())
            OR public.can_current_user_access_licensee(_target_id::uuid, NULL)
            OR public.dms_has('bulk_manage')) THEN
      RAISE EXCEPTION 'forbidden_target_scope';
    END IF;
    IF g.primary_entity_id IS NOT NULL AND g.primary_entity_id::text <> _target_id
       AND NOT (public.is_super_admin(auth.uid())
                OR (public.can_current_user_access_licensee(g.primary_entity_id, NULL)
                    AND public.can_current_user_access_licensee(_target_id::uuid, NULL))) THEN
      RAISE EXCEPTION 'cross_entity_link_forbidden';
    END IF;
  END IF;

  INSERT INTO public.document_relationships (document_group_id, relationship_type, target_type, target_id, target_reference, created_by)
  VALUES (_group_id, _relationship_type, _target_type, _target_id, _target_reference, auth.uid())
  ON CONFLICT (document_group_id, target_type, target_id, relationship_type) DO UPDATE
    SET target_reference = COALESCE(EXCLUDED.target_reference, public.document_relationships.target_reference)
  RETURNING id INTO new_id;

  PERFORM public.dms_log(_group_id, NULL, 'record_linked',
    jsonb_build_object('target_type', _target_type, 'target_id', _target_id, 'relationship', _relationship_type));
  RETURN new_id;
END; $function$;


-- 6. Canonical link operation for records chosen in the picker ----------
CREATE OR REPLACE FUNCTION public.dms_link_picked_record(
  _group_id uuid,
  _picker_type text,
  _record_id uuid,
  _relationship_type text DEFAULT 'attached_to'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_target text := public.record_picker_target_type(public.record_picker_normalise_type(_picker_type));
  v_resolved jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_target IS NULL THEN RAISE EXCEPTION 'unsupported_record_type'; END IF;

  -- The picker read grants no linking authority: the target must exist and be
  -- visible to this caller under their own row-level scope.
  v_resolved := public.record_picker_target_resolve(_picker_type, _record_id);
  IF NOT (v_resolved->>'visible')::boolean THEN
    RAISE EXCEPTION 'target_not_found_or_out_of_scope';
  END IF;

  -- dms_link_record remains authoritative and re-checks document authority.
  RETURN public.dms_link_record(_group_id, v_target, _record_id::text,
                                COALESCE(_relationship_type, 'attached_to'),
                                v_resolved->>'reference');
END;
$function$;

REVOKE ALL ON FUNCTION public.dms_link_picked_record(uuid, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dms_link_picked_record(uuid, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.dms_link_picked_record(uuid, text, uuid, text) TO authenticated, service_role;