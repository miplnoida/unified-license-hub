-- =====================================================================
-- AML-01 §3.1 — AML ROUTE REGISTER PARITY : CERTIFICATION
-- =====================================================================
-- Gates ROUTE-01 .. ROUTE-06. Read-only: no route, permission or audience
-- is changed by this script.
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off

-- ROUTE-01 — all eight AML runtime routes are registered
DO $$
DECLARE expected text[] := ARRAY[
  '/supervision/aml','/supervision/aml/work-queue','/supervision/aml/entities',
  '/supervision/aml/assessments','/supervision/aml/assessments/:id',
  '/supervision/aml/heatmap','/supervision/aml/examinations','/supervision/aml/findings'];
  missing text[];
BEGIN
  SELECT array_agg(p) INTO missing FROM unnest(expected) p
   WHERE NOT EXISTS (SELECT 1 FROM public.sec_routes r WHERE r.path_pattern = p);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL ROUTE-01: unregistered AML routes: %', missing; END IF;
  RAISE NOTICE 'PASS ROUTE-01: all 8 AML runtime routes are present in the canonical route register';
END $$;

-- ROUTE-02 — every AML route is protected and active
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.sec_routes
   WHERE path_pattern LIKE '/supervision/aml%' AND (NOT is_protected OR NOT is_active);
  IF n > 0 THEN RAISE EXCEPTION 'FAIL ROUTE-02: % AML routes are unprotected or inactive', n; END IF;
  RAISE NOTICE 'PASS ROUTE-02: every registered AML route is protected and active';
END $$;

-- ROUTE-03 — each AML route requires the existing aml_supervision.view right
DO $$
DECLARE bad text[];
BEGIN
  SELECT array_agg(r.path_pattern) INTO bad
    FROM public.sec_routes r
    LEFT JOIN public.sec_permissions p ON p.id = r.required_permission_id
    LEFT JOIN public.sec_modules m ON m.id = p.module_id
   WHERE r.path_pattern LIKE '/supervision/aml%'
     AND (m.key IS DISTINCT FROM 'aml_supervision' OR p.key IS DISTINCT FROM 'view');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL ROUTE-03: routes with an unexpected permission: %', bad; END IF;
  RAISE NOTICE 'PASS ROUTE-03: AML routes require aml_supervision.view — no permission was invented';
END $$;

-- ROUTE-04 — audience is internal only
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.sec_routes
   WHERE path_pattern LIKE '/supervision/aml%' AND audience <> 'internal';
  IF n > 0 THEN RAISE EXCEPTION 'FAIL ROUTE-04: % AML routes are not internal-only', n; END IF;
  RAISE NOTICE 'PASS ROUTE-04: AML routes are internal-audience only';
END $$;

-- ROUTE-05 — the policy profile administration routes are registered on manage_config
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM public.sec_routes r
    JOIN public.sec_permissions p ON p.id = r.required_permission_id
    JOIN public.sec_modules m ON m.id = p.module_id
   WHERE r.path_pattern IN ('/admin/supervisory-policy-profiles','/admin/supervisory-policy-profiles/:profileId')
     AND r.is_protected AND r.is_active AND m.key='aml_supervision' AND p.key='manage_config';
  IF n <> 2 THEN
    RAISE EXCEPTION 'FAIL ROUTE-05: % of 2 policy profile routes correctly registered', n; END IF;
  RAISE NOTICE 'PASS ROUTE-05: both policy profile administration routes require aml_supervision.manage_config';
END $$;

-- ROUTE-06 — navigation items point at the registered routes with approved icons
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM public.sec_navigation_items ni
    JOIN public.sec_routes r ON r.id = ni.route_id
   WHERE ni.key IN ('nav_cfg_sup_policy_profiles','nav_cfg_sup_policy_profile_detail')
     AND ni.is_active AND ni.icon_key IS NOT NULL
     AND r.path_pattern LIKE '/admin/supervisory-policy-profiles%';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL ROUTE-06: % of 2 navigation items resolve to a registered route', n; END IF;
  RAISE NOTICE 'PASS ROUTE-06: policy profile navigation resolves to registered routes';
END $$;

\echo '=== AML route register parity certification complete — ROUTE-01..06 PASS ==='
