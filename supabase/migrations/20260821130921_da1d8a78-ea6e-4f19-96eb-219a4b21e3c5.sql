-- EPR-05 / P03 — canonical Licensing read models (no new business state)

-- 1. Display-name helper (server-owned, avoids per-row browser lookups)
CREATE OR REPLACE FUNCTION public.app_actor_display_name(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT nullif(btrim(coalesce(p.full_name, p.email, '')), '') FROM profiles p WHERE p.id = _user_id),
    (SELECT nullif(btrim(coalesce(u.full_name, u.email, '')), '') FROM pre_license_users u WHERE u.id = _user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.app_applicant_org_name(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT nullif(btrim(coalesce(u.entity_name, '')), '') FROM pre_license_users u WHERE u.id = _user_id;
$$;

-- 2. Governed facts helpers (RLS-independent counts used by the read model)
CREATE OR REPLACE FUNCTION public.application_open_rfi_count(_application_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM application_rfis
   WHERE application_id = _application_id AND status = 'open';
$$;

CREATE OR REPLACE FUNCTION public.application_rfi_pauses_sla(_application_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT exists(SELECT 1 FROM application_rfis
                 WHERE application_id = _application_id AND status = 'open'
                   AND coalesce(pauses_sla, false));
$$;

-- Configured licensing SLA fallback (hours) when no workflow step SLA applies.
CREATE OR REPLACE FUNCTION public.licensing_default_sla_hours()
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE lower(sla_unit)
           WHEN 'hours' THEN sla_duration::numeric
           WHEN 'days' THEN sla_duration::numeric * 24
           WHEN 'weeks' THEN sla_duration::numeric * 24 * 7
           ELSE sla_duration::numeric
         END
    FROM sla_configurations
   WHERE active AND process_type IN ('licensing', 'application', 'pre_application')
   ORDER BY CASE process_type WHEN 'licensing' THEN 0 WHEN 'application' THEN 1 ELSE 2 END
   LIMIT 1;
$$;

-- 3. Fit & Proper gate for a licensing application (EPR-04 assessments, never "latest")
CREATE OR REPLACE FUNCTION public.application_fp_gate(_application_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entity uuid; v_rows jsonb; v_pending int := 0; v_adverse int := 0;
BEGIN
  SELECT entity_id INTO v_entity FROM applications WHERE id = _application_id;
  IF v_entity IS NULL THEN
    RETURN jsonb_build_object('required', false, 'linked', '[]'::jsonb,
      'pending', 0, 'adverse', 0, 'blocking', false);
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'assessment_id', c.assessment_id,
           'reference', c.reference,
           'person', c.individual_name,
           'role', c.role_title,
           'stage', c.stage,
           'status', c.status,
           'determination', c.determination,
           'href', '/fpa/assessments/' || c.assessment_id
         ) ORDER BY c.reference), '[]'::jsonb),
         count(*) FILTER (WHERE coalesce(c.determination, '') = ''),
         count(*) FILTER (WHERE lower(coalesce(c.determination, '')) IN ('not_fit', 'adverse', 'rejected'))
    INTO v_rows, v_pending, v_adverse
    FROM public.fp_assessment_case() c
   WHERE c.licensee_id = v_entity;

  RETURN jsonb_build_object(
    'required', jsonb_array_length(coalesce(v_rows, '[]'::jsonb)) > 0,
    'linked', coalesce(v_rows, '[]'::jsonb),
    'pending', coalesce(v_pending, 0),
    'adverse', coalesce(v_adverse, 0),
    'blocking', coalesce(v_pending, 0) > 0 OR coalesce(v_adverse, 0) > 0
  );
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('required', false, 'linked', '[]'::jsonb,
    'pending', 0, 'adverse', 0, 'blocking', false);
END;
$$;

-- 4. Blockers for progression (governed gates + F&P policy), server-owned
CREATE OR REPLACE FUNCTION public.application_blockers(_application_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_gates jsonb; v_out jsonb := '[]'::jsonb; g jsonb; v_fp jsonb;
BEGIN
  v_gates := public.decision_gate_status(_application_id);
  FOR g IN SELECT * FROM jsonb_array_elements(coalesce(v_gates->'gates', '[]'::jsonb)) LOOP
    IF (g->>'blocking')::boolean AND NOT (g->>'passed')::boolean THEN
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'code', g->>'key', 'label', g->>'label', 'detail', g->>'detail',
        'href', '/applications/' || _application_id));
    END IF;
  END LOOP;

  v_fp := public.application_fp_gate(_application_id);
  IF coalesce((v_fp->>'blocking')::boolean, false) THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'code', 'fit_and_proper',
      'label', 'Fit & Proper assessment outstanding',
      'detail', (v_fp->>'pending') || ' pending, ' || (v_fp->>'adverse') || ' adverse',
      'href', '/applications/' || _application_id));
  END IF;
  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_actor_display_name(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_applicant_org_name(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.application_open_rfi_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.application_rfi_pauses_sla(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.licensing_default_sla_hours() TO authenticated;
GRANT EXECUTE ON FUNCTION public.application_fp_gate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.application_blockers(uuid) TO authenticated;