CREATE OR REPLACE FUNCTION public.cert_v2_verify(_dataset_key text DEFAULT 'CERT-SUPTECH-V2')
RETURNS TABLE(check_key text, status text, detail text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record; v_missing integer; v_total integer := 0; v_active integer;
BEGIN
  FOR r IN
    SELECT DISTINCT t.object_type, t.table_name
      FROM public.cert_fixture_object_types t
      JOIN public.cert_fixture_objects o ON o.object_type = t.object_type
     WHERE o.dataset_key = _dataset_key
  LOOP
    EXECUTE format(
      'SELECT count(*)::int FROM public.cert_fixture_objects o WHERE o.dataset_key = %L AND o.object_type = %L AND NOT EXISTS (SELECT 1 FROM public.%I x WHERE x.id = o.object_id)',
      _dataset_key, r.object_type, r.table_name) INTO v_missing;
    v_total := v_total + v_missing;
    IF v_missing > 0 THEN
      RETURN QUERY SELECT ('registry_object_exists:' || r.object_type)::text, 'FAIL'::text,
        (v_missing || ' registered objects no longer exist in ' || r.table_name)::text;
    END IF;
  END LOOP;

  RETURN QUERY SELECT 'registry_objects_resolve'::text,
    (CASE WHEN v_total = 0 THEN 'PASS' ELSE 'FAIL' END)::text,
    (v_total || ' dangling registry rows')::text;

  SELECT count(*)::int INTO v_active
    FROM public.cert_fixture_runs cr
   WHERE cr.dataset_key = _dataset_key AND cr.status = 'in_progress';

  RETURN QUERY SELECT 'single_active_run'::text,
    (CASE WHEN v_active <= 1 THEN 'PASS' ELSE 'FAIL' END)::text,
    (v_active || ' runs in progress')::text;

  RETURN QUERY SELECT 'objects_have_scenario'::text,
    (CASE WHEN NOT EXISTS (SELECT 1 FROM public.cert_fixture_objects co
                            WHERE co.dataset_key = _dataset_key
                              AND coalesce(btrim(co.scenario_code),'') = '')
          THEN 'PASS' ELSE 'FAIL' END)::text,
    'every fixture object carries a scenario code'::text;

  RETURN QUERY SELECT 'nonproduction_guard'::text,
    (CASE WHEN public.cert_v2_guard_ok() THEN 'PASS' ELSE 'FAIL' END)::text,
    'non-production reset guard state'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.cert_v2_verify(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_v2_verify(text) TO authenticated, service_role;