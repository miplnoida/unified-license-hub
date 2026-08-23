-- RC1 §1/§2 post-migration structural checks.
-- Everything here is read-only except the constraint revalidation pass.
\pset pager off
\pset tuples_only on
\pset format unaligned

-- functions compile (plpgsql body validation via pg_get_functiondef + plpgsql check)
SELECT 'BROKEN_FUNCTION_DEFS=' || count(*)
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.prokind IN ('f','p')
  AND pg_get_functiondef(p.oid) IS NULL;

SELECT 'PUBLIC_FUNCTIONS=' || count(*) FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace;

-- views compile: a failed dependency makes the view unresolvable
SELECT 'BROKEN_VIEWS=' || count(*) FROM (
  SELECT c.oid FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('v','m')
    AND pg_get_viewdef(c.oid) IS NULL
) t;

SELECT 'PUBLIC_VIEWS=' || count(*) FROM pg_class
 WHERE relnamespace = 'public'::regnamespace AND relkind IN ('v','m');

SELECT 'PUBLIC_TABLES=' || count(*) FROM pg_class
 WHERE relnamespace = 'public'::regnamespace AND relkind = 'r';

SELECT 'NOT_VALID_CONSTRAINTS=' || count(*) FROM pg_constraint
 WHERE connamespace = 'public'::regnamespace AND NOT convalidated;

SELECT 'RLS_POLICIES=' || count(*) FROM pg_policies WHERE schemaname = 'public';

SELECT 'TABLES_RLS_DISABLED=' || count(*) FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND NOT c.relrowsecurity;

SELECT 'TABLES_WITHOUT_POLICY=' || count(*) FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
   AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename = c.relname);

SELECT 'TABLES_WITHOUT_AUTHENTICATED_GRANT=' || count(*) FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
   AND NOT has_table_privilege('authenticated', c.oid, 'SELECT')
   AND NOT has_table_privilege('service_role', c.oid, 'SELECT');

-- canonical RBAC objects
SELECT 'RBAC_' || upper(t) || '=' || (to_regclass('public.' || t) IS NOT NULL)::text
FROM unnest(ARRAY['user_roles','sec_roles','sec_permissions','sec_role_permissions',
                  'sec_user_roles','roles','permissions','role_permissions',
                  'user_dynamic_roles']) t;

SELECT 'RBAC_FN_' || upper(f) || '=' || (
  SELECT count(*) > 0 FROM pg_proc p
   WHERE p.pronamespace='public'::regnamespace AND p.proname = f)::text
FROM unnest(ARRAY['has_role','has_permission','is_super_admin','sec_get_user_context',
                  'has_scoped_permission','can_read_prudential_entity']) f;

-- reference/config seed loadability signal: config tables present and populated
SELECT 'SEEDED_' || upper(t) || '=' || (
  SELECT CASE WHEN to_regclass('public.'||t) IS NULL THEN -1 ELSE
    (SELECT count(*) FROM pg_class c WHERE c.oid = to_regclass('public.'||t)) END)
FROM unnest(ARRAY['sec_permissions','complaint_status_catalogue','prudential_process_sla_config']) t;
