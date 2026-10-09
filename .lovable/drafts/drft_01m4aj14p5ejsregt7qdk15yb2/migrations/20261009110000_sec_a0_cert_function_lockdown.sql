-- SEC-A0 v2: Wave A0 certification function lockdown (SEC-003, SEC-004)
-- STATUS: STAGED ONLY. Ready for Deployment - Blocked (no staging, backup unverified).
-- Scope: public.cert_* / public.rc1_* only. Default privileges NOT changed.
-- Catalog evidence: read-only inventory 2026-10-09 (57 signatures, all owner postgres;
-- 25 destructive = plpgsql, SECURITY DEFINER, search_path=public, writes data).
-- Atomicity: relies on the migration runner wrapping this file in one transaction (UNVERIFIED).

-- 0. Inventory gate: exact 57 signatures and exact destructive list must match the catalog.
DO $inv$
DECLARE expected text[] := ARRAY[
    'cert_reset_classify_tables()',
    'cert_reset_dependency_order(_hard_edges_only boolean)',
    'cert_reset_detach_optional_links(_tables text[])',
    'cert_reset_force_delete(_tables text[])',
    'cert_reset_nonproduction_business_data_v1(_confirmation text, _project_ref text)',
    'cert_reset_preserved_tables()',
    'cert_seed_identity_v1()',
    'cert_seed_returns_v1()',
    'cert_seed_structure_v1()',
    'cert_seed_wave_d_v1()',
    'cert_uuid(_key text)',
    'cert_v2_assert_allowed()',
    'cert_v2_auth_identity_classification()',
    'cert_v2_auth_purge_precheck()',
    'cert_v2_begin_run(_fixture_version text, _notes text)',
    'cert_v2_cascade_delete(_table text, _ids uuid[], _depth integer)',
    'cert_v2_clean_message_runtime()',
    'cert_v2_clear_message_runtime()',
    'cert_v2_complete_run(_run_id uuid, _status text)',
    'cert_v2_config_integrity_gate()',
    'cert_v2_detach_users(_keep_user_ids uuid[], _reassign_to uuid)',
    'cert_v2_entity_spec()',
    'cert_v2_exec_unguarded(_table text, _sql text, _ids uuid[])',
    'cert_v2_filing_plan()',
    'cert_v2_golden_ratios()',
    'cert_v2_guard_ok()',
    'cert_v2_integrity_gate()',
    'cert_v2_loss_ratio_series(_code text)',
    'cert_v2_operational_area_matrix()',
    'cert_v2_pk_column(_table text)',
    'cert_v2_protected_tables()',
    'cert_v2_put_metric(_version_id uuid, _entity_id uuid, _period_id uuid, _code text, _value numeric)',
    'cert_v2_ratio_series(_scenario text, _key text)',
    'cert_v2_register_legacy_baseline(_notes text)',
    'cert_v2_register_object(_run_id uuid, _scenario_code text, _object_type text, _object_id uuid, _object_reference text, _cleanup_policy text, _metadata jsonb)',
    'cert_v2_repair_web_user_links()',
    'cert_v2_report(_dataset_key text)',
    'cert_v2_reported_inputs(_code text, _scenario text, _ret_kind text, _size numeric, _series_idx integer, _is_newest boolean)',
    'cert_v2_reset(_dataset_key text)',
    'cert_v2_role_catalogue()',
    'cert_v2_seed_calculate(_run_id uuid)',
    'cert_v2_seed_entities(_run_id uuid)',
    'cert_v2_seed_reference(_run_id uuid)',
    'cert_v2_seed_returns(_run_id uuid)',
    'cert_v2_seed_universe(_notes text)',
    'cert_v2_table_classification()',
    'cert_v2_table_classification_base()',
    'cert_v2_universe_gate()',
    'cert_v2_user_identity_tables()',
    'cert_v2_uuid(_key text)',
    'cert_v2_verify(_dataset_key text)',
    'cert_v2_zero_message_runtime()',
    'cert_v2_zero_runtime(_keep_user_ids uuid[])',
    'cert_v2_zero_state_gate()',
    'cert_verify_dataset_v1()',
    'rc1_time_as_user_ms(_uid uuid, _sql text, _reps integer)',
    'rc1_time_ms(_sql text, _reps integer)'
  ];
  actual text[];
BEGIN
  SELECT array_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' ORDER BY 1) INTO actual
  FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE 'cert\_%' OR p.proname LIKE 'rc1\_%');
  IF actual IS DISTINCT FROM (SELECT array_agg(x ORDER BY 1) FROM unnest(expected) x) THEN
    RAISE EXCEPTION 'SEC-A0 inventory mismatch: catalog=% expected=57', coalesce(array_length(actual,1),0);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE '%\_\_a0\_impl') THEN
    RAISE EXCEPTION 'SEC-A0 already applied or partial state present';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'cert\_%')
     OR EXISTS (SELECT 1 FROM pg_depend d JOIN pg_proc p ON p.oid=d.refobjid WHERE d.classid<>'pg_proc'::regclass AND d.deptype='n'
                AND p.pronamespace='public'::regnamespace AND (p.proname LIKE 'cert\_%' OR p.proname LIKE 'rc1\_%')) THEN
    RAISE EXCEPTION 'SEC-A0: object dependency on a cert function found; rename-and-wrap unsafe';
  END IF;
END $inv$;

-- 1. Owner-only security tables
CREATE TABLE public.sec_a0_grant_snapshot (
  id bigserial PRIMARY KEY,
  phase text NOT NULL CHECK (phase IN ('before','after')),
  signature text NOT NULL, role_name text NOT NULL, can_execute boolean NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.sec_a0_environment_identity (
  system_identifier text PRIMARY KEY, disposition text NOT NULL CHECK (disposition='deny'),
  label text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.sec_a0_destructive_arming (
  id bigserial PRIMARY KEY, system_identifier text NOT NULL, armed_by text NOT NULL,
  reason text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

REVOKE ALL ON public.sec_a0_grant_snapshot, public.sec_a0_environment_identity, public.sec_a0_destructive_arming
  FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
REVOKE ALL ON SEQUENCE public.sec_a0_grant_snapshot_id_seq, public.sec_a0_destructive_arming_id_seq
  FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
GRANT SELECT ON public.sec_a0_grant_snapshot TO service_role;
ALTER TABLE public.sec_a0_grant_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_a0_environment_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_a0_destructive_arming ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.sec_a0_snapshot_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'SEC-A0 evidence is append-only' USING ERRCODE = '42501'; END $$;
REVOKE ALL ON FUNCTION public.sec_a0_snapshot_immutable() FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE TRIGGER trg_sec_a0_snapshot_no_mutate BEFORE UPDATE OR DELETE ON public.sec_a0_grant_snapshot
  FOR EACH ROW EXECUTE FUNCTION public.sec_a0_snapshot_immutable();
CREATE TRIGGER trg_sec_a0_snapshot_no_truncate BEFORE TRUNCATE ON public.sec_a0_grant_snapshot
  FOR EACH STATEMENT EXECUTE FUNCTION public.sec_a0_snapshot_immutable();
CREATE TRIGGER trg_sec_a0_identity_no_mutate BEFORE UPDATE OR DELETE ON public.sec_a0_environment_identity
  FOR EACH ROW EXECUTE FUNCTION public.sec_a0_snapshot_immutable();
CREATE TRIGGER trg_sec_a0_identity_no_truncate BEFORE TRUNCATE ON public.sec_a0_environment_identity
  FOR EACH STATEMENT EXECUTE FUNCTION public.sec_a0_snapshot_immutable();

-- Permanent deny: shared/published backend cluster identifier (read-only evidence 2026-10-09).
INSERT INTO public.sec_a0_environment_identity(system_identifier, disposition, label)
VALUES ('7581440907192989109', 'deny', 'shared preview/published backend - never arm');

-- 2. Guard. No session settings, JWT claims or caller identity used:
--    authority = EXECUTE privilege (owner + service_role only on wrappers).
CREATE FUNCTION public.sec_a0_require_armed(_op text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id text;
BEGIN
  SELECT system_identifier::text INTO v_id FROM pg_control_system();
  IF v_id IS NULL THEN RAISE EXCEPTION 'SEC-A0: % denied (identity unknown)', _op USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.sec_a0_environment_identity WHERE system_identifier = v_id AND disposition = 'deny') THEN
    RAISE EXCEPTION 'SEC-A0: % permanently denied on this backend', _op USING ERRCODE='42501';
  END IF;
  PERFORM public.assert_nonproduction(_op);
  IF NOT EXISTS (SELECT 1 FROM public.sec_a0_destructive_arming WHERE system_identifier = v_id AND expires_at > now()) THEN
    RAISE EXCEPTION 'SEC-A0: % is disarmed', _op USING ERRCODE='42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.sec_a0_require_armed(text) FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;

-- 3. Before snapshot
INSERT INTO public.sec_a0_grant_snapshot(phase, signature, role_name, can_execute)
SELECT 'before', p.oid::regprocedure::text, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE')
FROM pg_proc p CROSS JOIN pg_roles r
WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE 'cert\_%' OR p.proname LIKE 'rc1\_%')
  AND r.rolname IN ('anon','authenticated','service_role','app_certification_runner','authenticator');

-- 4. Revoke all 57 (catalog-driven so overloads are covered)
DO $rv$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure::text AS sig FROM pg_proc p
           WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE 'cert\_%' OR p.proname LIKE 'rc1\_%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, app_certification_runner', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $rv$;

-- 5. Destructive wrappers (25). Explicit, reviewed SQL; original bodies untouched (renamed).
-- cert_reset_detach_optional_links(_tables text[]) -> jsonb
ALTER FUNCTION public.cert_reset_detach_optional_links(_tables text[]) RENAME TO cert_reset_detach_optional_links__a0_impl;
REVOKE ALL ON FUNCTION public.cert_reset_detach_optional_links__a0_impl(_tables text[]) FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_reset_detach_optional_links(_tables text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_reset_detach_optional_links');
  RETURN public.cert_reset_detach_optional_links__a0_impl(_tables);
END $w$;
REVOKE ALL ON FUNCTION public.cert_reset_detach_optional_links(_tables text[]) FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_reset_detach_optional_links(_tables text[]) TO service_role;

-- cert_reset_force_delete(_tables text[]) -> jsonb
ALTER FUNCTION public.cert_reset_force_delete(_tables text[]) RENAME TO cert_reset_force_delete__a0_impl;
REVOKE ALL ON FUNCTION public.cert_reset_force_delete__a0_impl(_tables text[]) FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_reset_force_delete(_tables text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_reset_force_delete');
  RETURN public.cert_reset_force_delete__a0_impl(_tables);
END $w$;
REVOKE ALL ON FUNCTION public.cert_reset_force_delete(_tables text[]) FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_reset_force_delete(_tables text[]) TO service_role;

-- cert_reset_nonproduction_business_data_v1(_confirmation text, _project_ref text) -> jsonb
ALTER FUNCTION public.cert_reset_nonproduction_business_data_v1(_confirmation text, _project_ref text) RENAME TO cert_reset_nonproduction_business_data_v1__a0_impl;
REVOKE ALL ON FUNCTION public.cert_reset_nonproduction_business_data_v1__a0_impl(_confirmation text, _project_ref text) FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_reset_nonproduction_business_data_v1(_confirmation text, _project_ref text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_reset_nonproduction_business_data_v1');
  RETURN public.cert_reset_nonproduction_business_data_v1__a0_impl(_confirmation, _project_ref);
END $w$;
REVOKE ALL ON FUNCTION public.cert_reset_nonproduction_business_data_v1(_confirmation text, _project_ref text) FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_reset_nonproduction_business_data_v1(_confirmation text, _project_ref text) TO service_role;

-- cert_seed_identity_v1() -> void
ALTER FUNCTION public.cert_seed_identity_v1() RENAME TO cert_seed_identity_v1__a0_impl;
REVOKE ALL ON FUNCTION public.cert_seed_identity_v1__a0_impl() FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_seed_identity_v1()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_seed_identity_v1');
  PERFORM public.cert_seed_identity_v1__a0_impl();
END $w$;
REVOKE ALL ON FUNCTION public.cert_seed_identity_v1() FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_seed_identity_v1() TO service_role;

-- cert_seed_returns_v1() -> void
ALTER FUNCTION public.cert_seed_returns_v1() RENAME TO cert_seed_returns_v1__a0_impl;
REVOKE ALL ON FUNCTION public.cert_seed_returns_v1__a0_impl() FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_seed_returns_v1()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_seed_returns_v1');
  PERFORM public.cert_seed_returns_v1__a0_impl();
END $w$;
REVOKE ALL ON FUNCTION public.cert_seed_returns_v1() FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_seed_returns_v1() TO service_role;

-- cert_seed_structure_v1() -> void
ALTER FUNCTION public.cert_seed_structure_v1() RENAME TO cert_seed_structure_v1__a0_impl;
REVOKE ALL ON FUNCTION public.cert_seed_structure_v1__a0_impl() FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_seed_structure_v1()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_seed_structure_v1');
  PERFORM public.cert_seed_structure_v1__a0_impl();
END $w$;
REVOKE ALL ON FUNCTION public.cert_seed_structure_v1() FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_seed_structure_v1() TO service_role;

-- cert_seed_wave_d_v1() -> jsonb
ALTER FUNCTION public.cert_seed_wave_d_v1() RENAME TO cert_seed_wave_d_v1__a0_impl;
REVOKE ALL ON FUNCTION public.cert_seed_wave_d_v1__a0_impl() FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_seed_wave_d_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_seed_wave_d_v1');
  RETURN public.cert_seed_wave_d_v1__a0_impl();
END $w$;
REVOKE ALL ON FUNCTION public.cert_seed_wave_d_v1() FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_seed_wave_d_v1() TO service_role;

-- cert_v2_begin_run(_fixture_version text, _notes text) -> uuid
ALTER FUNCTION public.cert_v2_begin_run(_fixture_version text, _notes text) RENAME TO cert_v2_begin_run__a0_impl;
REVOKE ALL ON FUNCTION public.cert_v2_begin_run__a0_impl(_fixture_version text, _notes text) FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_v2_begin_run(_fixture_version text, _notes text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_v2_begin_run');
  RETURN public.cert_v2_begin_run__a0_impl(_fixture_version, _notes);
END $w$;
REVOKE ALL ON FUNCTION public.cert_v2_begin_run(_fixture_version text, _notes text) FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_v2_begin_run(_fixture_version text, _notes text) TO service_role;

-- cert_v2_cascade_delete(_table text, _ids uuid[], _depth integer) -> integer
ALTER FUNCTION public.cert_v2_cascade_delete(_table text, _ids uuid[], _depth integer) RENAME TO cert_v2_cascade_delete__a0_impl;
REVOKE ALL ON FUNCTION public.cert_v2_cascade_delete__a0_impl(_table text, _ids uuid[], _depth integer) FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_v2_cascade_delete(_table text, _ids uuid[], _depth integer DEFAULT 0)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_v2_cascade_delete');
  RETURN public.cert_v2_cascade_delete__a0_impl(_table, _ids, _depth);
END $w$;
REVOKE ALL ON FUNCTION public.cert_v2_cascade_delete(_table text, _ids uuid[], _depth integer) FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_v2_cascade_delete(_table text, _ids uuid[], _depth integer) TO service_role;

-- cert_v2_clean_message_runtime() -> TABLE(table_name text, rows_deleted bigint)
ALTER FUNCTION public.cert_v2_clean_message_runtime() RENAME TO cert_v2_clean_message_runtime__a0_impl;
REVOKE ALL ON FUNCTION public.cert_v2_clean_message_runtime__a0_impl() FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_v2_clean_message_runtime()
RETURNS TABLE(table_name text, rows_deleted bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100 ROWS 1000
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_v2_clean_message_runtime');
  RETURN QUERY SELECT * FROM public.cert_v2_clean_message_runtime__a0_impl();
END $w$;
REVOKE ALL ON FUNCTION public.cert_v2_clean_message_runtime() FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_v2_clean_message_runtime() TO service_role;

-- cert_v2_clear_message_runtime() -> TABLE(table_name text, rows_deleted bigint)
ALTER FUNCTION public.cert_v2_clear_message_runtime() RENAME TO cert_v2_clear_message_runtime__a0_impl;
REVOKE ALL ON FUNCTION public.cert_v2_clear_message_runtime__a0_impl() FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_v2_clear_message_runtime()
RETURNS TABLE(table_name text, rows_deleted bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100 ROWS 1000
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_v2_clear_message_runtime');
  RETURN QUERY SELECT * FROM public.cert_v2_clear_message_runtime__a0_impl();
END $w$;
REVOKE ALL ON FUNCTION public.cert_v2_clear_message_runtime() FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_v2_clear_message_runtime() TO service_role;

-- cert_v2_complete_run(_run_id uuid, _status text) -> void
ALTER FUNCTION public.cert_v2_complete_run(_run_id uuid, _status text) RENAME TO cert_v2_complete_run__a0_impl;
REVOKE ALL ON FUNCTION public.cert_v2_complete_run__a0_impl(_run_id uuid, _status text) FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_v2_complete_run(_run_id uuid, _status text DEFAULT 'completed'::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_v2_complete_run');
  PERFORM public.cert_v2_complete_run__a0_impl(_run_id, _status);
END $w$;
REVOKE ALL ON FUNCTION public.cert_v2_complete_run(_run_id uuid, _status text) FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_v2_complete_run(_run_id uuid, _status text) TO service_role;

-- cert_v2_detach_users(_keep_user_ids uuid[], _reassign_to uuid) -> TABLE(target text, action text, rows_affected integer)
ALTER FUNCTION public.cert_v2_detach_users(_keep_user_ids uuid[], _reassign_to uuid) RENAME TO cert_v2_detach_users__a0_impl;
REVOKE ALL ON FUNCTION public.cert_v2_detach_users__a0_impl(_keep_user_ids uuid[], _reassign_to uuid) FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_v2_detach_users(_keep_user_ids uuid[], _reassign_to uuid)
RETURNS TABLE(target text, action text, rows_affected integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100 ROWS 1000
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_v2_detach_users');
  RETURN QUERY SELECT * FROM public.cert_v2_detach_users__a0_impl(_keep_user_ids, _reassign_to);
END $w$;
REVOKE ALL ON FUNCTION public.cert_v2_detach_users(_keep_user_ids uuid[], _reassign_to uuid) FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_v2_detach_users(_keep_user_ids uuid[], _reassign_to uuid) TO service_role;

-- cert_v2_exec_unguarded(_table text, _sql text, _ids uuid[]) -> integer
ALTER FUNCTION public.cert_v2_exec_unguarded(_table text, _sql text, _ids uuid[]) RENAME TO cert_v2_exec_unguarded__a0_impl;
REVOKE ALL ON FUNCTION public.cert_v2_exec_unguarded__a0_impl(_table text, _sql text, _ids uuid[]) FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_v2_exec_unguarded(_table text, _sql text, _ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_v2_exec_unguarded');
  RETURN public.cert_v2_exec_unguarded__a0_impl(_table, _sql, _ids);
END $w$;
REVOKE ALL ON FUNCTION public.cert_v2_exec_unguarded(_table text, _sql text, _ids uuid[]) FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_v2_exec_unguarded(_table text, _sql text, _ids uuid[]) TO service_role;

-- cert_v2_put_metric(_version_id uuid, _entity_id uuid, _period_id uuid, _code text, _value numeric) -> void
ALTER FUNCTION public.cert_v2_put_metric(_version_id uuid, _entity_id uuid, _period_id uuid, _code text, _value numeric) RENAME TO cert_v2_put_metric__a0_impl;
REVOKE ALL ON FUNCTION public.cert_v2_put_metric__a0_impl(_version_id uuid, _entity_id uuid, _period_id uuid, _code text, _value numeric) FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_v2_put_metric(_version_id uuid, _entity_id uuid, _period_id uuid, _code text, _value numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_v2_put_metric');
  PERFORM public.cert_v2_put_metric__a0_impl(_version_id, _entity_id, _period_id, _code, _value);
END $w$;
REVOKE ALL ON FUNCTION public.cert_v2_put_metric(_version_id uuid, _entity_id uuid, _period_id uuid, _code text, _value numeric) FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_v2_put_metric(_version_id uuid, _entity_id uuid, _period_id uuid, _code text, _value numeric) TO service_role;

-- cert_v2_register_legacy_baseline(_notes text) -> TABLE(object_type text, registered integer)
ALTER FUNCTION public.cert_v2_register_legacy_baseline(_notes text) RENAME TO cert_v2_register_legacy_baseline__a0_impl;
REVOKE ALL ON FUNCTION public.cert_v2_register_legacy_baseline__a0_impl(_notes text) FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_v2_register_legacy_baseline(_notes text DEFAULT NULL::text)
RETURNS TABLE(object_type text, registered integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100 ROWS 1000
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_v2_register_legacy_baseline');
  RETURN QUERY SELECT * FROM public.cert_v2_register_legacy_baseline__a0_impl(_notes);
END $w$;
REVOKE ALL ON FUNCTION public.cert_v2_register_legacy_baseline(_notes text) FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_v2_register_legacy_baseline(_notes text) TO service_role;

-- cert_v2_register_object(_run_id uuid, _scenario_code text, _object_type text, _object_id uuid, _object_reference text, _cleanup_policy text, _metadata jsonb) -> uuid
ALTER FUNCTION public.cert_v2_register_object(_run_id uuid, _scenario_code text, _object_type text, _object_id uuid, _object_reference text, _cleanup_policy text, _metadata jsonb) RENAME TO cert_v2_register_object__a0_impl;
REVOKE ALL ON FUNCTION public.cert_v2_register_object__a0_impl(_run_id uuid, _scenario_code text, _object_type text, _object_id uuid, _object_reference text, _cleanup_policy text, _metadata jsonb) FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_v2_register_object(_run_id uuid, _scenario_code text, _object_type text, _object_id uuid, _object_reference text DEFAULT NULL::text, _cleanup_policy text DEFAULT 'purge'::text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_v2_register_object');
  RETURN public.cert_v2_register_object__a0_impl(_run_id, _scenario_code, _object_type, _object_id, _object_reference, _cleanup_policy, _metadata);
END $w$;
REVOKE ALL ON FUNCTION public.cert_v2_register_object(_run_id uuid, _scenario_code text, _object_type text, _object_id uuid, _object_reference text, _cleanup_policy text, _metadata jsonb) FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_v2_register_object(_run_id uuid, _scenario_code text, _object_type text, _object_id uuid, _object_reference text, _cleanup_policy text, _metadata jsonb) TO service_role;

-- cert_v2_reset(_dataset_key text) -> TABLE(object_type text, table_name text, deleted_count integer)
ALTER FUNCTION public.cert_v2_reset(_dataset_key text) RENAME TO cert_v2_reset__a0_impl;
REVOKE ALL ON FUNCTION public.cert_v2_reset__a0_impl(_dataset_key text) FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_v2_reset(_dataset_key text DEFAULT 'CERT-SUPTECH-V2'::text)
RETURNS TABLE(object_type text, table_name text, deleted_count integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100 ROWS 1000
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_v2_reset');
  RETURN QUERY SELECT * FROM public.cert_v2_reset__a0_impl(_dataset_key);
END $w$;
REVOKE ALL ON FUNCTION public.cert_v2_reset(_dataset_key text) FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_v2_reset(_dataset_key text) TO service_role;

-- cert_v2_seed_calculate(_run_id uuid) -> jsonb
ALTER FUNCTION public.cert_v2_seed_calculate(_run_id uuid) RENAME TO cert_v2_seed_calculate__a0_impl;
REVOKE ALL ON FUNCTION public.cert_v2_seed_calculate__a0_impl(_run_id uuid) FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_v2_seed_calculate(_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_v2_seed_calculate');
  RETURN public.cert_v2_seed_calculate__a0_impl(_run_id);
END $w$;
REVOKE ALL ON FUNCTION public.cert_v2_seed_calculate(_run_id uuid) FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_v2_seed_calculate(_run_id uuid) TO service_role;

-- cert_v2_seed_entities(_run_id uuid) -> jsonb
ALTER FUNCTION public.cert_v2_seed_entities(_run_id uuid) RENAME TO cert_v2_seed_entities__a0_impl;
REVOKE ALL ON FUNCTION public.cert_v2_seed_entities__a0_impl(_run_id uuid) FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_v2_seed_entities(_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_v2_seed_entities');
  RETURN public.cert_v2_seed_entities__a0_impl(_run_id);
END $w$;
REVOKE ALL ON FUNCTION public.cert_v2_seed_entities(_run_id uuid) FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_v2_seed_entities(_run_id uuid) TO service_role;

-- cert_v2_seed_reference(_run_id uuid) -> jsonb
ALTER FUNCTION public.cert_v2_seed_reference(_run_id uuid) RENAME TO cert_v2_seed_reference__a0_impl;
REVOKE ALL ON FUNCTION public.cert_v2_seed_reference__a0_impl(_run_id uuid) FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_v2_seed_reference(_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_v2_seed_reference');
  RETURN public.cert_v2_seed_reference__a0_impl(_run_id);
END $w$;
REVOKE ALL ON FUNCTION public.cert_v2_seed_reference(_run_id uuid) FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_v2_seed_reference(_run_id uuid) TO service_role;

-- cert_v2_seed_returns(_run_id uuid) -> jsonb
ALTER FUNCTION public.cert_v2_seed_returns(_run_id uuid) RENAME TO cert_v2_seed_returns__a0_impl;
REVOKE ALL ON FUNCTION public.cert_v2_seed_returns__a0_impl(_run_id uuid) FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_v2_seed_returns(_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_v2_seed_returns');
  RETURN public.cert_v2_seed_returns__a0_impl(_run_id);
END $w$;
REVOKE ALL ON FUNCTION public.cert_v2_seed_returns(_run_id uuid) FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_v2_seed_returns(_run_id uuid) TO service_role;

-- cert_v2_seed_universe(_notes text) -> jsonb
ALTER FUNCTION public.cert_v2_seed_universe(_notes text) RENAME TO cert_v2_seed_universe__a0_impl;
REVOKE ALL ON FUNCTION public.cert_v2_seed_universe__a0_impl(_notes text) FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_v2_seed_universe(_notes text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_v2_seed_universe');
  RETURN public.cert_v2_seed_universe__a0_impl(_notes);
END $w$;
REVOKE ALL ON FUNCTION public.cert_v2_seed_universe(_notes text) FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_v2_seed_universe(_notes text) TO service_role;

-- cert_v2_zero_message_runtime() -> TABLE(table_name text, rows_before bigint, rows_after bigint)
ALTER FUNCTION public.cert_v2_zero_message_runtime() RENAME TO cert_v2_zero_message_runtime__a0_impl;
REVOKE ALL ON FUNCTION public.cert_v2_zero_message_runtime__a0_impl() FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_v2_zero_message_runtime()
RETURNS TABLE(table_name text, rows_before bigint, rows_after bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100 ROWS 1000
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_v2_zero_message_runtime');
  RETURN QUERY SELECT * FROM public.cert_v2_zero_message_runtime__a0_impl();
END $w$;
REVOKE ALL ON FUNCTION public.cert_v2_zero_message_runtime() FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_v2_zero_message_runtime() TO service_role;

-- cert_v2_zero_runtime(_keep_user_ids uuid[]) -> TABLE(table_name text, rows_before bigint, rows_after bigint)
ALTER FUNCTION public.cert_v2_zero_runtime(_keep_user_ids uuid[]) RENAME TO cert_v2_zero_runtime__a0_impl;
REVOKE ALL ON FUNCTION public.cert_v2_zero_runtime__a0_impl(_keep_user_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;
CREATE FUNCTION public.cert_v2_zero_runtime(_keep_user_ids uuid[] DEFAULT '{}'::uuid[])
RETURNS TABLE(table_name text, rows_before bigint, rows_after bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public VOLATILE PARALLEL UNSAFE COST 100 ROWS 1000
AS $w$
BEGIN
  PERFORM public.sec_a0_require_armed('cert_v2_zero_runtime');
  RETURN QUERY SELECT * FROM public.cert_v2_zero_runtime__a0_impl(_keep_user_ids);
END $w$;
REVOKE ALL ON FUNCTION public.cert_v2_zero_runtime(_keep_user_ids uuid[]) FROM PUBLIC, anon, authenticated, app_certification_runner;
GRANT EXECUTE ON FUNCTION public.cert_v2_zero_runtime(_keep_user_ids uuid[]) TO service_role;

-- 6. After snapshot + self-check (aborts the whole migration on any failure)
INSERT INTO public.sec_a0_grant_snapshot(phase, signature, role_name, can_execute)
SELECT 'after', p.oid::regprocedure::text, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE')
FROM pg_proc p CROSS JOIN pg_roles r
WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE 'cert\_%' OR p.proname LIKE 'rc1\_%' OR p.proname LIKE 'sec\_a0\_%')
  AND r.rolname IN ('anon','authenticated','service_role','app_certification_runner','authenticator');

DO $chk$
DECLARE destr text[] := ARRAY[
    'cert_reset_detach_optional_links(_tables text[])',
    'cert_reset_force_delete(_tables text[])',
    'cert_reset_nonproduction_business_data_v1(_confirmation text, _project_ref text)',
    'cert_seed_identity_v1()',
    'cert_seed_returns_v1()',
    'cert_seed_structure_v1()',
    'cert_seed_wave_d_v1()',
    'cert_v2_begin_run(_fixture_version text, _notes text)',
    'cert_v2_cascade_delete(_table text, _ids uuid[], _depth integer)',
    'cert_v2_clean_message_runtime()',
    'cert_v2_clear_message_runtime()',
    'cert_v2_complete_run(_run_id uuid, _status text)',
    'cert_v2_detach_users(_keep_user_ids uuid[], _reassign_to uuid)',
    'cert_v2_exec_unguarded(_table text, _sql text, _ids uuid[])',
    'cert_v2_put_metric(_version_id uuid, _entity_id uuid, _period_id uuid, _code text, _value numeric)',
    'cert_v2_register_legacy_baseline(_notes text)',
    'cert_v2_register_object(_run_id uuid, _scenario_code text, _object_type text, _object_id uuid, _object_reference text, _cleanup_policy text, _metadata jsonb)',
    'cert_v2_reset(_dataset_key text)',
    'cert_v2_seed_calculate(_run_id uuid)',
    'cert_v2_seed_entities(_run_id uuid)',
    'cert_v2_seed_reference(_run_id uuid)',
    'cert_v2_seed_returns(_run_id uuid)',
    'cert_v2_seed_universe(_notes text)',
    'cert_v2_zero_message_runtime()',
    'cert_v2_zero_runtime(_keep_user_ids uuid[])'
  ];
  n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND (proname LIKE 'cert\_%' OR proname LIKE 'rc1\_%') AND proname NOT LIKE '%\_\_a0\_impl';
  IF n <> 57 THEN RAISE EXCEPTION 'SEC-A0 self-check: expected 57 public signatures, found %', n; END IF;
  SELECT count(*) INTO n FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE '%\_\_a0\_impl';
  IF n <> array_length(destr,1) THEN RAISE EXCEPTION 'SEC-A0 self-check: expected % impls, found %', array_length(destr,1), n; END IF;
  SELECT count(*) INTO n FROM pg_proc p CROSS JOIN unnest(ARRAY['anon','authenticated','app_certification_runner']) r
    WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE 'cert\_%' OR p.proname LIKE 'rc1\_%' OR p.proname LIKE 'sec\_a0\_%')
      AND has_function_privilege(r, p.oid, 'EXECUTE');
  IF n > 0 THEN RAISE EXCEPTION 'SEC-A0 self-check: % EXECUTE paths remain for anon/authenticated/runner', n; END IF;
  SELECT count(*) INTO n FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
    AND (p.proname LIKE '%\_\_a0\_impl' OR p.proname LIKE 'sec\_a0\_%') AND has_function_privilege('service_role', p.oid, 'EXECUTE');
  IF n > 0 THEN RAISE EXCEPTION 'SEC-A0 self-check: service_role can reach % impl/helper functions', n; END IF;
  SELECT count(*) INTO n FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
    AND (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')') = ANY(destr)
    AND p.prosrc NOT LIKE '%sec_a0_require_armed%';
  IF n > 0 THEN RAISE EXCEPTION 'SEC-A0 self-check: % destructive wrappers lack the guard', n; END IF;
  SELECT count(*) INTO n FROM unnest(ARRAY['public.sec_a0_grant_snapshot','public.sec_a0_environment_identity','public.sec_a0_destructive_arming']) t
    CROSS JOIN unnest(ARRAY['anon','authenticated','app_certification_runner']) r
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) pr
    WHERE has_table_privilege(r, t, pr);
  IF n > 0 THEN RAISE EXCEPTION 'SEC-A0 self-check: % table privileges remain', n; END IF;
  SELECT count(*) INTO n FROM unnest(ARRAY['public.sec_a0_environment_identity','public.sec_a0_destructive_arming']) t
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) pr WHERE has_table_privilege('service_role', t, pr);
  IF n > 0 THEN RAISE EXCEPTION 'SEC-A0 self-check: service_role has % rights on identity/arming', n; END IF;
  SELECT count(*) INTO n FROM unnest(ARRAY['public.sec_a0_grant_snapshot_id_seq','public.sec_a0_destructive_arming_id_seq']) s
    CROSS JOIN unnest(ARRAY['anon','authenticated','service_role','app_certification_runner']) r
    CROSS JOIN unnest(ARRAY['USAGE','SELECT','UPDATE']) pr WHERE has_sequence_privilege(r, s, pr);
  IF n > 0 THEN RAISE EXCEPTION 'SEC-A0 self-check: % sequence privileges remain', n; END IF;
  IF EXISTS (SELECT 1 FROM public.sec_a0_destructive_arming) THEN RAISE EXCEPTION 'SEC-A0: arming table must ship empty'; END IF;
END $chk$;
