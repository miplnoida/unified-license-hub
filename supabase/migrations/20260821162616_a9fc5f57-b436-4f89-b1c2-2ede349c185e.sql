CREATE OR REPLACE FUNCTION public.license_related_cases(_license_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); l record;
BEGIN
  IF uid IS NULL OR NOT public.is_internal_staff_user(uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO l FROM public.licenses WHERE id = _license_id;
  IF l IS NULL THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND' USING ERRCODE='22023'; END IF;

  RETURN jsonb_build_object(
    'originating_application', (
      SELECT jsonb_build_object('id', a.id, 'status', a.status, 'created_at', a.created_at,
                                'href', '/applications/' || a.id)
        FROM public.applications a WHERE a.id = l.application_id),
    'lifecycle_matters', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', m.id, 'matter_kind', m.matter_kind,
              'stage', m.stage, 'status', m.status, 'source_kind', m.source_kind,
              'created_at', m.created_at) ORDER BY m.created_at DESC), '[]'::jsonb)
        FROM public.license_lifecycle_matters m WHERE m.license_id = l.id),
    'conditions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'status', c.status,
              'description', LEFT(COALESCE(c.description,''), 160)) ORDER BY c.created_at DESC), '[]'::jsonb)
        FROM public.license_conditions c WHERE c.license_id = l.id),
    'fp_roles', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id, 'person_id', r.person_id,
              'href', '/fpa/individuals/' || r.person_id) ORDER BY r.created_at DESC), '[]'::jsonb)
        FROM public.fp_individual_roles r WHERE r.license_id = l.id),
    'fp_appeals', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', ap.id, 'status', ap.status) ORDER BY ap.created_at DESC), '[]'::jsonb)
        FROM public.fp_appeals ap WHERE ap.license_id = l.id),
    'supervisory_plans', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', sp.id, 'status', sp.status) ORDER BY sp.created_at DESC), '[]'::jsonb)
        FROM public.supervisory_plans sp WHERE sp.license_id = l.id),
    'enforcement', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', e.id, 'case_number', e.case_number,
              'status', e.status, 'href', '/enforcement/' || e.id) ORDER BY e.created_at DESC), '[]'::jsonb)
        FROM public.enforcement_actions e
       WHERE e.source_type = 'license' AND e.source_id = l.id),
    'decision_appeals', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', da.id, 'status', da.status) ORDER BY da.created_at DESC), '[]'::jsonb)
        FROM public.license_decision_appeals da
        JOIN public.license_decisions d ON d.id = da.decision_id
       WHERE d.license_id = l.id),
    'correspondence', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'subject', t.subject,
              'status', t.status, 'thread_type', t.thread_type, 'created_at', t.created_at,
              'href', '/correspondence/' || t.id) ORDER BY t.created_at DESC), '[]'::jsonb)
        FROM public.correspondence_threads t
       WHERE t.source_type = 'license' AND t.source_id = l.id));
END $$;

REVOKE EXECUTE ON FUNCTION public.license_related_cases(uuid) FROM anon;