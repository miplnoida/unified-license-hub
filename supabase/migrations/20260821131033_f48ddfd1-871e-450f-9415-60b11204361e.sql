CREATE OR REPLACE FUNCTION public.application_fp_gate(_application_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entity uuid; v_rows jsonb; v_pending int := 0; v_adverse int := 0;
BEGIN
  SELECT entity_id INTO v_entity FROM applications WHERE id = _application_id;
  IF v_entity IS NULL THEN
    RETURN jsonb_build_object('required', false, 'linked', '[]'::jsonb,
      'pending', 0, 'adverse', 0, 'blocking', false);
  END IF;

  SELECT coalesce(jsonb_agg(x.row ORDER BY x.person), '[]'::jsonb),
         count(*) FILTER (WHERE x.outcome IS NULL),
         count(*) FILTER (WHERE lower(coalesce(x.outcome, '')) IN ('not_fit', 'adverse', 'rejected', 'fail', 'refused'))
    INTO v_rows, v_pending, v_adverse
  FROM (
    SELECT coalesce(i.full_name, 'Unknown') AS person,
           d.outcome AS outcome,
           jsonb_build_object(
             'assessment_id', a.id,
             'person', coalesce(i.full_name, 'Unknown'),
             'role', coalesce(r.role_title, r.role_type, a.assessment_type),
             'stage', a.status,
             'status', a.status,
             'determination', d.outcome,
             'determined_at', d.determined_at,
             'href', '/fpa/assessments/' || a.id
           ) AS row
      FROM fp_assessments a
      LEFT JOIN fp_individuals i ON i.id = a.individual_id
      LEFT JOIN fp_individual_roles r ON r.id = a.role_id
      LEFT JOIN fp_determinations d ON d.assessment_id = a.id AND coalesce(d.is_current, true)
     WHERE a.licensee_id = v_entity
       AND coalesce(a.status, '') NOT IN ('withdrawn', 'cancelled')
  ) x;

  RETURN jsonb_build_object(
    'required', jsonb_array_length(coalesce(v_rows, '[]'::jsonb)) > 0,
    'linked', coalesce(v_rows, '[]'::jsonb),
    'pending', coalesce(v_pending, 0),
    'adverse', coalesce(v_adverse, 0),
    'blocking', coalesce(v_pending, 0) > 0 OR coalesce(v_adverse, 0) > 0
  );
END;
$$;