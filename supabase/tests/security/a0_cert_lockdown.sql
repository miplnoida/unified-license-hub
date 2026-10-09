-- SEC-A0 pgTAP (staging only, after migration applied). Catalog checks only; never calls cert functions.
BEGIN;
SELECT plan(4);
SELECT is((SELECT count(*)::int FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
  AND (p.proname LIKE 'cert\_%' OR p.proname LIKE 'rc1\_%') AND has_function_privilege('authenticated',p.oid,'EXECUTE')), 0, 'no cert/rc1 runnable by authenticated');
SELECT is((SELECT count(*)::int FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
  AND (p.proname LIKE 'cert\_%' OR p.proname LIKE 'rc1\_%') AND has_function_privilege('anon',p.oid,'EXECUTE')), 0, 'no cert/rc1 runnable by anon');
SELECT is((SELECT count(*)::int FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
  AND (p.proname LIKE 'cert\_%' OR p.proname LIKE 'rc1\_%') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')), 0, 'service_role keeps access');
SELECT is((SELECT count(*)::int FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
  AND (p.proname IN ('cert_reset_force_delete','cert_reset_nonproduction_business_data_v1','cert_v2_put_metric') OR p.proname LIKE 'cert\_seed\_%')
  AND pg_get_functiondef(p.oid) NOT LIKE '%sec_a0_require_armed%'), 0, 'destructive functions carry arming guard');
SELECT * FROM finish();
ROLLBACK;
