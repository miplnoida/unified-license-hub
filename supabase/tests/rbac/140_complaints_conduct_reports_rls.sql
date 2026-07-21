-- Slice 15: Behavioural RLS tests for Complaints / Conduct / Reports lockdown.
-- Verifies that has_permission gating replaces the legacy hardcoded role checks
-- and that super-admin bypass remains intact.

BEGIN;
SELECT plan(18);

-- ---- Fixture: three users -------------------------------------------------
DO $$
DECLARE
  super_id  uuid := '00000000-0000-0000-0000-0000000000a1';
  ops_id    uuid := '00000000-0000-0000-0000-0000000000a2';
  none_id   uuid := '00000000-0000-0000-0000-0000000000a3';
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (super_id, 'super-15@test'),
    (ops_id,   'ops-15@test'),
    (none_id,  'none-15@test')
  ON CONFLICT (id) DO NOTHING;

  -- Super admin (app_role)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (super_id, 'super_admin') ON CONFLICT DO NOTHING;

  -- Give ops_id a dynamic role with the specific permissions we test
  INSERT INTO public.roles (id, name, description, is_system, is_active)
  VALUES ('00000000-0000-0000-0000-00000000b001', 'slice15_ops', 'test', false, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_dynamic_roles (user_id, role_id)
  VALUES (ops_id, '00000000-0000-0000-0000-00000000b001')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT '00000000-0000-0000-0000-00000000b001', p.id
  FROM public.permissions p
  WHERE (p.module = 'complaint_management' AND p.name IN ('view','edit','create'))
     OR (p.module = 'market_conduct' AND p.name IN ('view','manage_complaints','manage_monitoring_rules','issue_enforcement_action','run_conduct_analytics'))
     OR (p.module = 'market_conduct_investigation' AND p.name IN ('view','access_investigation_workspace','manage_evidence_repository'))
     OR (p.module = 'report_management' AND p.name IN ('report_management.view','create'))
  ON CONFLICT DO NOTHING;
END $$;

-- ---- Helper to assert has_permission wiring is functional ----------------
SELECT ok(public.has_permission('00000000-0000-0000-0000-0000000000a2'::uuid, 'complaint_management', 'view'),
          'ops user has complaint_management.view');
SELECT ok(NOT public.has_permission('00000000-0000-0000-0000-0000000000a3'::uuid, 'complaint_management', 'view'),
          'unprivileged user lacks complaint_management.view');

-- ---- Policy expression sanity checks (structural, non-flaky) --------------
-- Complaints
SELECT like(pg_get_expr(qual, polrelid),
            '%has_permission%complaint_management%view%',
            'complaints SELECT policy references has_permission')
  FROM pg_policy
  WHERE polname = 'Read complaints'
    AND polrelid = 'public.complaints'::regclass;

SELECT like(pg_get_expr(qual, polrelid),
            '%has_permission%complaint_management%edit%',
            'complaints UPDATE policy uses has_permission edit')
  FROM pg_policy
  WHERE polname = 'Update complaints'
    AND polrelid = 'public.complaints'::regclass;

SELECT like(pg_get_expr(with_check, polrelid),
            '%has_permission%complaint_management%create%',
            'complaints INSERT policy requires create permission')
  FROM pg_policy
  WHERE polname = 'Internal can insert complaints'
    AND polrelid = 'public.complaints'::regclass;

-- Legacy role literal must be gone
SELECT is(
  (SELECT count(*)::int
     FROM pg_policy
     WHERE polrelid IN (
       'public.complaints'::regclass,
       'public.complaint_evidence'::regclass,
       'public.complaint_correspondence'::regclass,
       'public.complaint_investigation_tasks'::regclass)
       AND (pg_get_expr(qual, polrelid) ILIKE '%licensing_officer%'
         OR pg_get_expr(with_check, polrelid) ILIKE '%licensing_officer%')),
  0,
  'no legacy licensing_officer literals remain on complaint tables');

-- Conduct
SELECT like(pg_get_expr(qual, polrelid),
            '%has_permission%market_conduct%view%',
            'conduct_alerts SELECT references market_conduct.view')
  FROM pg_policy
  WHERE polname = 'Read conduct alerts'
    AND polrelid = 'public.conduct_alerts'::regclass;

SELECT like(pg_get_expr(qual, polrelid),
            '%manage_complaints%',
            'conduct_alerts write requires manage_complaints')
  FROM pg_policy
  WHERE polname = 'Manage conduct alerts'
    AND polrelid = 'public.conduct_alerts'::regclass;

SELECT like(pg_get_expr(qual, polrelid),
            '%issue_enforcement_action%',
            'conduct_actions write requires enforcement or manage')
  FROM pg_policy
  WHERE polname = 'Manage conduct actions'
    AND polrelid = 'public.conduct_actions'::regclass;

SELECT like(pg_get_expr(qual, polrelid),
            '%market_conduct_investigation%access_investigation_workspace%',
            'conduct_investigations write requires workspace access')
  FROM pg_policy
  WHERE polname = 'ci_write'
    AND polrelid = 'public.conduct_investigations'::regclass;

SELECT like(pg_get_expr(qual, polrelid),
            '%manage_evidence_repository%',
            'conduct_evidence write requires evidence permission')
  FROM pg_policy
  WHERE polname = 'ce_write'
    AND polrelid = 'public.conduct_evidence'::regclass;

SELECT like(pg_get_expr(qual, polrelid),
            '%manage_monitoring_rules%',
            'conduct_monitoring_rules write requires monitoring perm')
  FROM pg_policy
  WHERE polname = 'Write cmr'
    AND polrelid = 'public.conduct_monitoring_rules'::regclass;

-- Conduct config tables all wired the same way
SELECT is(
  (SELECT count(*)::int
     FROM pg_policy
     WHERE polname = 'conduct_cfg_write'
       AND polrelid::regclass::text IN (
         'conduct_channels','conduct_products','conduct_risk_categories',
         'conduct_triage_rules','conduct_alert_thresholds')),
  5,
  'all five conduct config tables carry conduct_cfg_write policy');

-- Reports
SELECT like(pg_get_expr(qual, polrelid),
            '%report_management%report_management.view%',
            'reports SELECT gated by report_management.view')
  FROM pg_policy
  WHERE polname = 'Internal users read reports'
    AND polrelid = 'public.reports'::regclass;

SELECT like(pg_get_expr(with_check, polrelid),
            '%report_management%create%',
            'reports INSERT gated by report_management.create')
  FROM pg_policy
  WHERE polname = 'Internal users create reports'
    AND polrelid = 'public.reports'::regclass;

SELECT like(pg_get_expr(qual, polrelid),
            '%report_management%report_management.view%',
            'report_definitions SELECT gated by view')
  FROM pg_policy
  WHERE polname = 'Read report definitions'
    AND polrelid = 'public.report_definitions'::regclass;

SELECT is(
  (SELECT count(*)::int
     FROM pg_policy
     WHERE polname = 'rpt_cfg_write'
       AND polrelid::regclass::text IN (
         'report_sources','report_source_columns','report_source_filters',
         'report_dashboard_layouts','report_dashboard_widgets')),
  5,
  'all five report config tables carry rpt_cfg_write policy');

-- Super-admin bypass surface: every rewritten policy references is_super_admin
SELECT is(
  (SELECT count(*)::int
     FROM pg_policy
     WHERE polname IN (
       'Read complaints','Update complaints','Internal can insert complaints',
       'Internal manage complaint evidence','Internal manage complaint correspondence',
       'Internal manage complaint tasks',
       'Read conduct alerts','Manage conduct alerts',
       'Read conduct actions','Manage conduct actions',
       'ci_read','ci_write','ce_read','ce_write',
       'Read cmres','Write cmres','Read cmr','Write cmr',
       'cmrr_read','cmrr_write',
       'Internal users read reports','Internal users create reports',
       'Admins delete reports','Owners update reports',
       'Read report definitions','Manage report definitions',
       'Read report logs')
       AND (pg_get_expr(qual, polrelid) ILIKE '%is_super_admin%'
         OR pg_get_expr(with_check, polrelid) ILIKE '%is_super_admin%')),
  27,
  'every rewritten slice-15 policy references is_super_admin bypass');

SELECT * FROM finish();
ROLLBACK;
