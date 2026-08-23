-- Certification V2 fixture registry and governed seed harness (non-production only)

CREATE TABLE public.cert_fixture_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dataset_key text NOT NULL DEFAULT 'CERT-SUPTECH-V2',
  fixture_version text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',
  notes text,
  started_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cert_fixture_runs_status_chk CHECK (status IN ('in_progress','completed','failed','reset'))
);

GRANT SELECT ON public.cert_fixture_runs TO authenticated;
GRANT ALL ON public.cert_fixture_runs TO service_role;
ALTER TABLE public.cert_fixture_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read cert fixture runs" ON public.cert_fixture_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.cert_fixture_object_types (
  object_type text NOT NULL PRIMARY KEY,
  table_name text NOT NULL,
  delete_order integer NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cert_fixture_object_types TO authenticated;
GRANT ALL ON public.cert_fixture_object_types TO service_role;
ALTER TABLE public.cert_fixture_object_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read cert fixture object types" ON public.cert_fixture_object_types
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.cert_fixture_objects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.cert_fixture_runs(id) ON DELETE CASCADE,
  dataset_key text NOT NULL DEFAULT 'CERT-SUPTECH-V2',
  scenario_code text NOT NULL,
  object_type text NOT NULL REFERENCES public.cert_fixture_object_types(object_type),
  object_id uuid NOT NULL,
  object_reference text,
  cleanup_policy text NOT NULL DEFAULT 'purge',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cert_fixture_objects_cleanup_chk CHECK (cleanup_policy IN ('purge','retain_audit','retain_config')),
  CONSTRAINT cert_fixture_objects_unique UNIQUE (dataset_key, object_type, object_id)
);

CREATE INDEX cert_fixture_objects_run_idx ON public.cert_fixture_objects (run_id);
CREATE INDEX cert_fixture_objects_scenario_idx ON public.cert_fixture_objects (dataset_key, scenario_code);

GRANT SELECT ON public.cert_fixture_objects TO authenticated;
GRANT ALL ON public.cert_fixture_objects TO service_role;
ALTER TABLE public.cert_fixture_objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read cert fixture objects" ON public.cert_fixture_objects
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Object type registry: table + dependency-aware deletion order (higher deletes first)
INSERT INTO public.cert_fixture_object_types (object_type, table_name, delete_order, description) VALUES
  ('return_filing_version','return_filing_versions',100,'Return filing versions'),
  ('return_filing','return_filings',95,'Canonical return filings'),
  ('entity_reporting_obligation','entity_reporting_obligations',90,'Reporting obligations'),
  ('enforcement_action','enforcement_actions',85,'Enforcement cases'),
  ('conduct_investigation','conduct_investigations',80,'Conduct investigations'),
  ('complaint','complaints',75,'Consumer complaints'),
  ('examination','examinations',70,'Onsite examinations'),
  ('fp_assessment','fp_assessments',65,'Fit & proper assessments'),
  ('correspondence_thread','correspondence_threads',60,'Correspondence threads'),
  ('application','applications',55,'Licence applications'),
  ('entity_license','entity_licenses',50,'Entity-licence links'),
  ('license','licenses',45,'Licences'),
  ('entity_user_membership','entity_user_memberships',40,'Entity memberships'),
  ('entity_user_access','entity_user_access',38,'Entity user access'),
  ('ppoc_entity_mapping','ppoc_entity_mappings',36,'PPOC mappings'),
  ('entity_resolution_case','entity_resolution_cases',34,'Entity resolution cases'),
  ('pre_license_user','pre_license_users',30,'Pre-licensee registrations'),
  ('licensee','licensees',20,'Regulated entities'),
  ('organization','organizations',15,'Organization spine'),
  ('party','parties',10,'Party spine'),
  ('profile','profiles',5,'User profiles');

-- Non-production guard -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cert_v2_guard_ok()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cert_nonproduction_guard
     WHERE environment = 'non_production' AND reset_enabled
  );
$$;

CREATE OR REPLACE FUNCTION public.cert_v2_assert_allowed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.cert_v2_guard_ok() THEN
    RAISE EXCEPTION 'Certification V2 harness is disabled: non-production guard not satisfied'
      USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NULL THEN
    -- service_role / trusted server context
    RETURN;
  END IF;
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only a super administrator may operate the certification harness'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.cert_v2_guard_ok() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cert_v2_assert_allowed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_v2_guard_ok() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_v2_assert_allowed() TO authenticated, service_role;

-- Run lifecycle --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cert_v2_begin_run(_fixture_version text, _notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.cert_v2_assert_allowed();
  IF coalesce(btrim(_fixture_version),'') = '' THEN
    RAISE EXCEPTION 'fixture_version is required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.cert_fixture_runs (fixture_version, notes, started_by)
  VALUES (btrim(_fixture_version), _notes, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cert_v2_complete_run(_run_id uuid, _status text DEFAULT 'completed')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.cert_v2_assert_allowed();
  UPDATE public.cert_fixture_runs
     SET status = _status, completed_at = now(), updated_at = now()
   WHERE id = _run_id;
END;
$$;

-- Object registration (idempotent) ------------------------------------------
CREATE OR REPLACE FUNCTION public.cert_v2_register_object(
  _run_id uuid,
  _scenario_code text,
  _object_type text,
  _object_id uuid,
  _object_reference text DEFAULT NULL,
  _cleanup_policy text DEFAULT 'purge',
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.cert_v2_assert_allowed();
  IF NOT EXISTS (SELECT 1 FROM public.cert_fixture_object_types WHERE object_type = _object_type) THEN
    RAISE EXCEPTION 'Unknown certification object type: %', _object_type USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.cert_fixture_objects
    (run_id, scenario_code, object_type, object_id, object_reference, cleanup_policy, metadata)
  VALUES (_run_id, _scenario_code, _object_type, _object_id, _object_reference, _cleanup_policy, coalesce(_metadata,'{}'::jsonb))
  ON CONFLICT (dataset_key, object_type, object_id) DO UPDATE
    SET run_id = EXCLUDED.run_id,
        scenario_code = EXCLUDED.scenario_code,
        object_reference = EXCLUDED.object_reference,
        cleanup_policy = EXCLUDED.cleanup_policy,
        metadata = EXCLUDED.metadata
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- RESET: delete only V2-owned purgeable objects, in dependency order ---------
CREATE OR REPLACE FUNCTION public.cert_v2_reset(_dataset_key text DEFAULT 'CERT-SUPTECH-V2')
RETURNS TABLE(object_type text, table_name text, deleted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record; v_deleted integer;
BEGIN
  PERFORM public.cert_v2_assert_allowed();
  FOR r IN
    SELECT t.object_type, t.table_name, t.delete_order
      FROM public.cert_fixture_object_types t
     WHERE EXISTS (
       SELECT 1 FROM public.cert_fixture_objects o
        WHERE o.object_type = t.object_type
          AND o.dataset_key = _dataset_key
          AND o.cleanup_policy = 'purge')
     ORDER BY t.delete_order DESC
  LOOP
    EXECUTE format(
      'DELETE FROM public.%I WHERE id IN (SELECT object_id FROM public.cert_fixture_objects WHERE dataset_key = %L AND object_type = %L AND cleanup_policy = ''purge'')',
      r.table_name, _dataset_key, r.object_type);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN QUERY SELECT r.object_type, r.table_name, v_deleted;
  END LOOP;

  DELETE FROM public.cert_fixture_objects
   WHERE dataset_key = _dataset_key AND cleanup_policy = 'purge';

  UPDATE public.cert_fixture_runs
     SET status = 'reset', completed_at = now(), updated_at = now()
   WHERE dataset_key = _dataset_key AND status <> 'reset';
END;
$$;

-- REPORT: registered object counts per scenario ------------------------------
CREATE OR REPLACE FUNCTION public.cert_v2_report(_dataset_key text DEFAULT 'CERT-SUPTECH-V2')
RETURNS TABLE(scenario_code text, object_type text, object_count integer, run_ids uuid[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.scenario_code, o.object_type, count(*)::int, array_agg(DISTINCT o.run_id)
    FROM public.cert_fixture_objects o
   WHERE o.dataset_key = _dataset_key
   GROUP BY 1,2
   ORDER BY 1,2;
$$;

-- VERIFY: registry-level integrity assertions --------------------------------
CREATE OR REPLACE FUNCTION public.cert_v2_verify(_dataset_key text DEFAULT 'CERT-SUPTECH-V2')
RETURNS TABLE(check_key text, status text, detail text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record; v_missing integer; v_total integer := 0;
BEGIN
  -- every registered object still exists in its table
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
      RETURN QUERY SELECT 'registry_object_exists:' || r.object_type, 'FAIL',
        v_missing || ' registered objects no longer exist in ' || r.table_name;
    END IF;
  END LOOP;

  RETURN QUERY SELECT 'registry_objects_resolve', CASE WHEN v_total = 0 THEN 'PASS' ELSE 'FAIL' END,
    v_total || ' dangling registry rows';

  RETURN QUERY SELECT 'single_active_run',
    CASE WHEN (SELECT count(*) FROM public.cert_fixture_runs
                WHERE dataset_key = _dataset_key AND status = 'in_progress') <= 1
         THEN 'PASS' ELSE 'FAIL' END,
    (SELECT count(*)::text FROM public.cert_fixture_runs
      WHERE dataset_key = _dataset_key AND status = 'in_progress') || ' runs in progress';

  RETURN QUERY SELECT 'objects_have_scenario',
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.cert_fixture_objects
                           WHERE dataset_key = _dataset_key AND coalesce(btrim(scenario_code),'') = '')
         THEN 'PASS' ELSE 'FAIL' END,
    'every fixture object carries a scenario code';

  RETURN QUERY SELECT 'nonproduction_guard',
    CASE WHEN public.cert_v2_guard_ok() THEN 'PASS' ELSE 'FAIL' END,
    'non-production reset guard state';
END;
$$;

REVOKE ALL ON FUNCTION public.cert_v2_begin_run(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cert_v2_complete_run(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cert_v2_register_object(uuid,text,text,uuid,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cert_v2_reset(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cert_v2_report(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cert_v2_verify(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_v2_begin_run(text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_v2_complete_run(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_v2_register_object(uuid,text,text,uuid,text,text,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_v2_reset(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_v2_report(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_v2_verify(text) TO authenticated, service_role;