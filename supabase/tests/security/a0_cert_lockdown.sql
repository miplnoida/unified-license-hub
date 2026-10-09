-- SEC-A0 v2 pgTAP. Staging only, after the migration is applied.
-- Catalog/privilege checks only: no cert, rc1 or sec_a0 function is ever called.
BEGIN;
SELECT plan(14);
SELECT is((SELECT count(*)::int FROM pg_proc WHERE pronamespace='public'::regnamespace
  AND (proname LIKE 'cert\_%' OR proname LIKE 'rc1\_%') AND proname NOT LIKE '%\_\_a0\_impl'), 57, '57 original signatures present');
SELECT is((SELECT count(*)::int FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE '%\_\_a0\_impl'), 25, '25 impl functions');
SELECT is((SELECT count(*)::int FROM pg_proc p CROSS JOIN unnest(ARRAY['anon','authenticated','app_certification_runner']) r
  WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE 'cert\_%' OR p.proname LIKE 'rc1\_%' OR p.proname LIKE 'sec\_a0\_%')
  AND has_function_privilege(r,p.oid,'EXECUTE')), 0, 'no anon/authenticated/runner EXECUTE');
SELECT is((SELECT count(*)::int FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
  AND (p.proname LIKE '%\_\_a0\_impl' OR p.proname LIKE 'sec\_a0\_%') AND has_function_privilege('service_role',p.oid,'EXECUTE')), 0, 'impls/helpers owner-only');
SELECT is((SELECT count(*)::int FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
  AND (p.proname LIKE 'cert\_%' OR p.proname LIKE 'rc1\_%') AND p.proname NOT LIKE '%\_\_a0\_impl'
  AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')), 0, 'service_role keeps wrapper access');
SELECT is((SELECT count(*)::int FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
  AND (p.proname||'('||pg_get_function_identity_arguments(p.oid)||')') = ANY(ARRAY[
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
  ])
  AND p.prosrc NOT LIKE '%sec_a0_require_armed%'), 0, 'every destructive wrapper calls the guard');
SELECT is((SELECT count(*)::int FROM pg_proc w JOIN pg_proc i ON i.pronamespace=w.pronamespace AND i.proname=w.proname||'__a0_impl'
  AND pg_get_function_identity_arguments(i.oid)=pg_get_function_identity_arguments(w.oid)
  WHERE w.pronamespace='public'::regnamespace AND (pg_get_function_result(w.oid) IS DISTINCT FROM pg_get_function_result(i.oid)
   OR pg_get_function_arguments(w.oid) IS DISTINCT FROM pg_get_function_arguments(i.oid)
   OR w.prosecdef<>i.prosecdef OR w.provolatile<>i.provolatile OR w.proisstrict<>i.proisstrict
   OR w.proparallel<>i.proparallel OR w.proretset<>i.proretset OR w.proowner<>i.proowner
   OR w.proconfig IS DISTINCT FROM i.proconfig)), 0, 'wrapper contract matches impl');
SELECT is((SELECT count(*)::int FROM pg_depend d JOIN pg_proc p ON p.oid=d.refobjid
  WHERE d.classid<>'pg_proc'::regclass AND p.pronamespace='public'::regnamespace AND p.proname LIKE '%\_\_a0\_impl'), 0, 'no object depends on an impl');
SELECT is((SELECT count(*)::int FROM unnest(ARRAY['public.sec_a0_grant_snapshot','public.sec_a0_environment_identity','public.sec_a0_destructive_arming']) t
  CROSS JOIN unnest(ARRAY['anon','authenticated','app_certification_runner']) r
  CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) pr WHERE has_table_privilege(r,t,pr)), 0, 'security tables closed');
SELECT is((SELECT array_agg(pr ORDER BY pr) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) pr
  WHERE has_table_privilege('service_role','public.sec_a0_grant_snapshot',pr)), ARRAY['SELECT'], 'service_role SELECT-only on snapshot');
SELECT is((SELECT count(*)::int FROM unnest(ARRAY['public.sec_a0_grant_snapshot_id_seq','public.sec_a0_destructive_arming_id_seq']) s
  CROSS JOIN unnest(ARRAY['anon','authenticated','service_role','app_certification_runner']) r
  CROSS JOIN unnest(ARRAY['USAGE','SELECT','UPDATE']) pr WHERE has_sequence_privilege(r,s,pr)), 0, 'sequences closed');
SELECT is((SELECT count(*)::int FROM public.sec_a0_destructive_arming), 0, 'arming table empty');
SELECT is((SELECT count(*)::int FROM public.sec_a0_environment_identity WHERE system_identifier='7581440907192989109' AND disposition='deny'), 1, 'shared backend deny row present');
SELECT is((SELECT count(*)::int FROM pg_trigger WHERE tgrelid='public.sec_a0_grant_snapshot'::regclass AND NOT tgisinternal), 2, 'snapshot mutate+truncate triggers');
SELECT * FROM finish();
ROLLBACK;
