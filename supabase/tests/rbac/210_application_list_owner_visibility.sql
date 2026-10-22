-- Applicant-owned applications stay visible in get_application_list_page
-- regardless of the selected organisation (_licensee_id), while organisation
-- scope and cross-user isolation are unchanged. Read-only; rolled back.
BEGIN;
SELECT plan(6);

CREATE TEMP TABLE t_ctx ON COMMIT DROP AS
SELECT
  (SELECT a.applicant_id FROM public.applications a
     WHERE a.application_number = 'APP-2026-002011') AS owner_id,
  (SELECT a.id FROM public.applications a
     WHERE a.application_number = 'APP-2026-002011') AS owner_app,
  (SELECT l.id FROM public.licensees l ORDER BY l.created_at LIMIT 1) AS other_org,
  (SELECT pem.ppoc_user_id FROM public.ppoc_entity_mappings pem
     WHERE pem.is_active ORDER BY pem.created_at LIMIT 1) AS member_id,
  (SELECT pem.licensee_id FROM public.ppoc_entity_mappings pem
     WHERE pem.is_active ORDER BY pem.created_at LIMIT 1) AS member_org,
  (SELECT a.applicant_id FROM public.applications a
     WHERE a.applicant_id <> (SELECT applicant_id FROM public.applications
                               WHERE application_number = 'APP-2026-002011')
       AND NOT public.has_role(a.applicant_id, 'super_admin'::app_role)
       AND NOT public.has_role(a.applicant_id, 'admin'::app_role)
       AND NOT public.has_role(a.applicant_id, 'supervisor'::app_role)
       AND NOT public.has_role(a.applicant_id, 'licensing_officer'::app_role)
       AND NOT public.has_role(a.applicant_id, 'analyst'::app_role)
     LIMIT 1) AS stranger_id;
GRANT SELECT ON t_ctx TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.ids(_lic uuid) RETURNS SETOF uuid LANGUAGE sql AS $$
  SELECT id FROM public.get_application_list_page(0, 200, NULL, 'contains', 'all', NULL, 'created_at', 'desc', _lic, NULL, NULL, NULL);
$$;

SELECT pg_temp.as_user((SELECT owner_id FROM t_ctx));
SET LOCAL ROLE authenticated;

SELECT ok((SELECT owner_app FROM t_ctx) IN (SELECT pg_temp.ids((SELECT other_org FROM t_ctx))),
  '1. owner sees own app with another organisation selected');
SELECT ok((SELECT owner_app FROM t_ctx) IN (SELECT pg_temp.ids(NULL)),
  '2. owner sees own app with no / own organisation selected');
SELECT is((SELECT count(*) - count(DISTINCT x) FROM pg_temp.ids((SELECT other_org FROM t_ctx)) x)::int, 0,
  '5. no duplicate rows for owner');

RESET ROLE;
SELECT pg_temp.as_user((SELECT member_id FROM t_ctx));
SET LOCAL ROLE authenticated;
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.applications a
    WHERE NULLIF(a.data->>'licensee_id','')::uuid = (SELECT member_org FROM t_ctx)
      AND a.id NOT IN (SELECT pg_temp.ids((SELECT member_org FROM t_ctx)))
  ),
  '3. organisation member still sees every visible application of their organisation');

RESET ROLE;
SELECT pg_temp.as_user((SELECT stranger_id FROM t_ctx));
SET LOCAL ROLE authenticated;
SELECT ok((SELECT owner_app FROM t_ctx) NOT IN (SELECT pg_temp.ids(NULL)),
  '4a. unrelated user cannot see owner app (no organisation)');
SELECT ok((SELECT owner_app FROM t_ctx) NOT IN (SELECT pg_temp.ids((SELECT other_org FROM t_ctx))),
  '4b. unrelated user cannot see owner app (organisation selected)');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
