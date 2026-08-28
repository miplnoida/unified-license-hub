-- =====================================================================
-- F5-A — POST-LICENSING SERVICES DISCOVERY (READ-ONLY CENSUS)
--
-- Purpose : establish live server truth for the F5 (post-licensing
--           services) area. DISCOVERY ONLY — this script performs NO
--           writes, NO DDL and NO data changes. Safe to run at any time.
--
-- Usage   : psql -v ON_ERROR_STOP=1 -f scripts/verify-f5-discovery.sql
--
-- Sections
--   A. F4 -> F5 boundary (licence estate, terms, entity binding)
--   B. Service catalogue census
--   C. Workflow architecture (canonical patterns)
--   D. Configuration completeness (forms / fees / SLA / authority)
--   E. Lifecycle instrumentation (renewals, variations, matters, tasks)
--   F. Application lifecycle usage (post-licence requests)
--   G. Security / privilege / write-contract census
-- =====================================================================

\pset pager off
\timing off

-- ---------------------------------------------------------------------
-- SECTION A — F4 -> F5 BOUNDARY
-- ---------------------------------------------------------------------
\echo '== A1. Licence estate and term integrity =='
SELECT
  (SELECT count(*) FROM public.licenses)                            AS licenses,
  (SELECT count(*) FROM public.entity_licenses)                     AS entity_licenses,
  (SELECT count(*) FROM public.license_terms)                       AS license_terms,
  (SELECT count(*) FROM public.licenses l
     WHERE NOT EXISTS (SELECT 1 FROM public.license_terms t
                        WHERE t.license_id = l.id AND t.is_current)) AS licences_without_current_term,
  (SELECT count(*) FROM public.licenses l
     WHERE NOT EXISTS (SELECT 1 FROM public.license_terms t
                        WHERE t.license_id = l.id
                          AND t.term_kind = 'original'))            AS licences_without_original_term;

\echo '== A2. Licences that cannot bind to an F5 request (no holder / no sector) =='
SELECT count(*) FILTER (WHERE holder_id IS NULL) AS no_holder,
       count(*) FILTER (WHERE sector_id IS NULL) AS no_sector
  FROM public.licenses;

-- ---------------------------------------------------------------------
-- SECTION B — SERVICE CATALOGUE CENSUS
-- ---------------------------------------------------------------------
\echo '== B1. Catalogue size by lifecycle stage / status =='
SELECT lifecycle_stage, status, count(*) AS services
  FROM public.services
 GROUP BY 1, 2
 ORDER BY 1, 2;

\echo '== B2. Distinct service definitions (name x sector fan-out) =='
SELECT name,
       count(*)                        AS rows,
       count(DISTINCT sector_id)       AS sectors,
       min(code)                       AS sample_code,
       bool_or(requires_fit_and_proper) AS any_fp,
       min(decision_type)              AS decision_type,
       min(sla_days)                   AS sla_days
  FROM public.services
 WHERE lifecycle_stage IN ('post_license', 'renewal')
 GROUP BY 1
 ORDER BY 1;

\echo '== B3. Catalogue configuration coverage =='
SELECT count(*)                                                        AS total,
       count(workflow_id)                                              AS with_workflow,
       count(*) - count(workflow_id)                                   AS without_workflow,
       count(*) FILTER (WHERE requires_fit_and_proper)                 AS fp_services,
       count(fee_reference)                                            AS with_fee_reference,
       count(*) FILTER (WHERE sla_days IS NULL)                        AS without_sla,
       count(*) FILTER (WHERE document_checklist IS NULL
                           OR document_checklist = '[]'::jsonb)        AS without_document_checklist,
       count(*) FILTER (WHERE code IS NULL)                            AS without_code
  FROM public.services
 WHERE lifecycle_stage IN ('post_license', 'renewal');

\echo '== B4. Uncoded / duplicate-risk catalogue rows =='
SELECT name, lifecycle_stage, count(*) AS rows
  FROM public.services
 WHERE lifecycle_stage IN ('post_license', 'renewal')
   AND code IS NULL
 GROUP BY 1, 2
 ORDER BY 1;

-- ---------------------------------------------------------------------
-- SECTION C — WORKFLOW ARCHITECTURE
-- ---------------------------------------------------------------------
\echo '== C1. Canonical workflow patterns and their service load =='
SELECT w.id, w.name, w.is_active,
       count(s.id)                                                   AS services_bound,
       (SELECT count(*) FROM public.approval_steps st
         WHERE st.workflow_id = w.id)                                AS steps
  FROM public.approval_workflows w
  JOIN public.services s ON s.workflow_id = w.id
 WHERE s.lifecycle_stage IN ('post_license', 'renewal')
 GROUP BY w.id, w.name, w.is_active
 ORDER BY services_bound DESC;

\echo '== C2. Post-licence services bound to an inactive or step-less workflow =='
SELECT s.name, s.code, w.name AS workflow, w.is_active,
       (SELECT count(*) FROM public.approval_steps st WHERE st.workflow_id = w.id) AS steps
  FROM public.services s
  JOIN public.approval_workflows w ON w.id = s.workflow_id
 WHERE s.lifecycle_stage IN ('post_license', 'renewal')
   AND (w.is_active IS NOT TRUE
        OR (SELECT count(*) FROM public.approval_steps st WHERE st.workflow_id = w.id) = 0)
 ORDER BY 1;

-- ---------------------------------------------------------------------
-- SECTION D — CONFIGURATION COMPLETENESS
-- ---------------------------------------------------------------------
\echo '== D1. Governed completeness view, by dimension and state =='
SELECT dimension, state, count(*) AS rows
  FROM public.service_configuration_completeness
 WHERE lifecycle_stage IN ('post_license', 'renewal')
 GROUP BY 1, 2
 ORDER BY 1, 2;

\echo '== D2. Incomplete dimensions (blocking F5 execution) =='
SELECT service_code, service_name, dimension, state, disposition
  FROM public.service_configuration_completeness
 WHERE lifecycle_stage IN ('post_license', 'renewal')
   AND is_complete IS NOT TRUE
 ORDER BY service_code, dimension;

\echo '== D3. Post-licence form templates =='
SELECT status,
       count(*)              AS templates,
       count(service_id)     AS bound_to_service,
       count(sub_sector_id)  AS bound_to_sub_sector
  FROM public.form_templates
 WHERE form_type = 'post_license'
 GROUP BY 1
 ORDER BY 1;

\echo '== D4. Active post-licence services with no published form reachable by service binding =='
SELECT s.code, s.name
  FROM public.services s
 WHERE s.lifecycle_stage IN ('post_license', 'renewal')
   AND s.status = 'active'
   AND NOT EXISTS (
     SELECT 1 FROM public.form_templates t
      WHERE t.form_type = 'post_license'
        AND t.status = 'published'
        AND (t.service_id = s.id
             OR (t.service_id IS NULL AND t.sub_sector_id = s.sub_sector_id)
             OR (t.service_id IS NULL AND t.sub_sector_id IS NULL AND t.sector_id = s.sector_id)))
 ORDER BY 1, 2;

-- ---------------------------------------------------------------------
-- SECTION E — LIFECYCLE INSTRUMENTATION
-- ---------------------------------------------------------------------
\echo '== E1. Post-approval effect stores =='
SELECT (SELECT count(*) FROM public.license_renewals)          AS renewals,
       (SELECT count(*) FROM public.license_variations)        AS variations,
       (SELECT count(*) FROM public.license_variation_items)   AS variation_items,
       (SELECT count(*) FROM public.license_lifecycle_matters) AS lifecycle_matters,
       (SELECT count(*) FROM public.license_lifecycle_configs) AS lifecycle_configs,
       (SELECT count(*) FROM public.regulatory_service_tasks)  AS service_tasks,
       (SELECT count(*) FROM public.license_terms
         WHERE term_kind <> 'original')                        AS non_original_terms;

\echo '== E2. Routines that mention post-licence request semantics =='
SELECT p.proname, p.prosecdef
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND pg_get_functiondef(p.oid) ILIKE '%post_license%'
 ORDER BY 1;

-- ---------------------------------------------------------------------
-- SECTION F — APPLICATION LIFECYCLE USAGE
-- ---------------------------------------------------------------------
\echo '== F1. Post-licence requests by status =='
SELECT status, count(*) AS requests
  FROM public.applications
 WHERE data->>'type' = 'post_license'
 GROUP BY 1
 ORDER BY 2 DESC;

\echo '== F2. Post-licence request integrity =='
SELECT count(*)                                                       AS post_license_requests,
       count(*) FILTER (WHERE data->>'license_id' IS NULL)            AS missing_license_binding,
       count(*) FILTER (WHERE data->>'service_id' IS NULL)            AS missing_service_binding,
       count(*) FILTER (WHERE workflow_id IS NULL)                    AS missing_workflow,
       count(DISTINCT data->>'service_id')                            AS distinct_services_exercised
  FROM public.applications
 WHERE data->>'type' = 'post_license';

-- ---------------------------------------------------------------------
-- SECTION G — SECURITY / PRIVILEGE CENSUS
-- ---------------------------------------------------------------------
\echo '== G1. External-role privileges on F5 tables =='
SELECT c.relname,
       c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policies pp
         WHERE pp.schemaname = 'public' AND pp.tablename = c.relname) AS policies,
       (SELECT string_agg(DISTINCT r.rolname || ':' || a.privilege_type, ', '
                          ORDER BY r.rolname || ':' || a.privilege_type)
          FROM aclexplode(c.relacl) a
          JOIN pg_roles r ON r.oid = a.grantee
         WHERE r.rolname IN ('anon', 'authenticated'))                AS external_grants
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind = 'r'
   AND c.relname IN ('services', 'applications', 'licenses', 'entity_licenses',
                     'license_terms', 'license_renewals', 'license_variations',
                     'license_variation_items', 'license_lifecycle_matters',
                     'license_lifecycle_configs', 'regulatory_service_tasks',
                     'regulatory_request_types', 'service_config_expectations')
 ORDER BY 1;

\echo '== G2. F5 tables writable directly by anon or authenticated (governance risk) =='
SELECT c.relname, r.rolname, a.privilege_type
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN aclexplode(c.relacl) a ON true
  JOIN pg_roles r ON r.oid = a.grantee
 WHERE n.nspname = 'public'
   AND c.relkind = 'r'
   AND r.rolname IN ('anon', 'authenticated')
   AND a.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
   AND c.relname IN ('services', 'license_terms', 'license_renewals',
                     'license_variations', 'license_variation_items',
                     'license_lifecycle_matters', 'license_lifecycle_configs',
                     'regulatory_request_types', 'regulatory_service_tasks',
                     'service_config_expectations')
 ORDER BY 1, 2, 3;

\echo '== G3. Loose EXECUTE on F5 governed routines =='
SELECT p.proname, p.prosecdef, r.rolname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a ON true
  LEFT JOIN pg_roles r ON r.oid = a.grantee
 WHERE n.nspname = 'public'
   AND a.privilege_type = 'EXECUTE'
   AND (a.grantee = 0 OR r.rolname IN ('anon', 'authenticated'))
   AND p.proname IN ('can_act_on_license', 'entity_license_entitlements',
                     'license_variation_operation', 'license_variation_case',
                     'regulatory_service_task_execution',
                     'license_lifecycle_config_resolve',
                     'post_license_open_statuses')
 ORDER BY 1, 3;

\echo '== F5 DISCOVERY CENSUS COMPLETE (no writes performed) =='
