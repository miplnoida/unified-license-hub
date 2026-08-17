-- ─────────────────────────────────────────────────────────────────────────────
-- Reconcile the Role Management "Edit Role" catalog (permission_modules /
-- permission_actions) for the Fit & Proper area with what the app's code and
-- menu actually enforce today. Evidence gathered by grepping the codebase for
-- every data-rbac attribute, route guard and has_permission() call against
-- fit_and_proper / fit_and_proper_screening / fit_and_proper_committee:
--
--  * 'fit_and_proper_initiation' has ZERO references anywhere in app code
--    (no data-rbac attribute, no route mapping, no has_permission call) — it
--    only ever existed as a BRD-era catalog stub. Its actions
--    ('initiate_assessment', 'manage_initiation_types') are equally unused.
--    Today's actual initiation pages (Initiation Paths, Individual Register,
--    Initiation Log) are gated by the flat 'fit_and_proper' module instead.
--
--  * 'fit_and_proper_screening' and 'fit_and_proper_committee' DO still gate
--    real buttons — data-rbac="fit_and_proper_screening.create/.edit" in
--    FpaScreening.tsx and AutoScreeningRulesTab.tsx, and
--    data-rbac="fit_and_proper_committee.create/.edit" in
--    admin/FpCommittees.tsx — and real admin routes
--    (/admin/fp-screening-configs, /admin/fp-sector-rules,
--    /admin/fp-committees). But their catalog action lists
--    ('cast_weighted_vote', 'manage_screening', 'issue_determination', ...)
--    are BRD-era fiction nothing checks, while the actions the buttons
--    ACTUALLY require ('create'/'edit') were never added to the catalog.
--
--  * The parent 'fit_and_proper' module's catalog only has 'view' plus the
--    just-added 'override_committee' — every other action the app actually
--    checks via data-rbac (create/edit/approve/export/configure/execute,
--    used across all 21 current F&P sidebar pages) is missing from the
--    catalog, so no role's Edit Role screen can see or grant them.
--
--  * permission_module_routes — the table that records which route belongs
--    to which module — has ZERO rows for any /fpa or /admin/fp-* route,
--    despite F&P being one of the largest areas in the app.
--
-- This migration: (1) adds a reversible is_active flag so stale catalog rows
-- can be hidden without losing history or breaking existing role grants,
-- (2) marks the unused module/actions inactive, (3) adds the real actions
-- that were missing from the catalog, (4) seeds the missing route
-- attachments from the current sidebar (navigation.tsx) and admin routes,
-- and (5) grants the Super Admin role every resulting active F&P permission.
--
-- NOTE: is_active is a brand-new column with no reader yet — the Role
-- Management catalog hooks (src/hooks/usePermissionCatalog.ts) still show
-- every row regardless of is_active. A follow-up front-end change is needed
-- for deactivated rows to actually disappear from the Edit Role screen.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Reversible active flag — soft-disable instead of deleting, so any
--    existing role_permissions referencing a to-be-deactivated action are
--    left untouched (nothing currently granted is revoked by this migration).
ALTER TABLE public.permission_modules
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.permission_actions
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE public.permission_modules
SET is_active = true;

UPDATE public.permission_actions
SET is_active = true;

-- 2. Deactivate the wholly-unused module.
UPDATE public.permission_modules
SET is_active = false
WHERE key = 'fit_and_proper_initiation';

-- 3. Deactivate BRD-era actions nothing in the codebase checks. 'view' is
--    left active on the sub-modules — still a meaningful, real capability.
UPDATE public.permission_actions a
SET is_active = false
FROM public.permission_modules m
WHERE a.module_id = m.id
  AND (
    (m.key = 'fit_and_proper_initiation')
    OR (m.key = 'fit_and_proper_committee' AND a.key IN ('cast_weighted_vote', 'provide_rationale'))
    OR (m.key = 'fit_and_proper_screening' AND a.key IN ('manage_screening', 'record_adverse_findings', 'run_ai_analysis', 'issue_determination', 'manage_conditions_monitoring'))
  );

-- 4. Add the real actions the app actually checks (data-rbac attributes
--    across the F&P pages) that the catalog never had.
INSERT INTO public.permission_actions (module_id, key, label, description, sort_order, is_system, audience)
SELECT m.id, v.action_key, v.label, NULL, v.sort_order, true, 'internal'
FROM (VALUES
  ('fit_and_proper', 'create', 'Create', 20),
  ('fit_and_proper', 'edit', 'Edit', 30),
  ('fit_and_proper', 'approve', 'Approve', 40),
  ('fit_and_proper', 'export', 'Export', 50),
  ('fit_and_proper', 'configure', 'Configure', 60),
  ('fit_and_proper', 'execute', 'Execute', 70),
  ('fit_and_proper_screening', 'create', 'Create', 70),
  ('fit_and_proper_screening', 'edit', 'Edit', 80),
  ('fit_and_proper_committee', 'create', 'Create', 40),
  ('fit_and_proper_committee', 'edit', 'Edit', 50)
) AS v(module_key, action_key, label, sort_order)
JOIN public.permission_modules m ON m.key = v.module_key
ON CONFLICT (module_id, key) DO NOTHING;

-- 5. Mirror the newly-added actions into the legacy permissions table so
--    role_permissions can link to them (same pattern as every prior catalog
--    migration). Some of these — e.g. ('fit_and_proper','create') — may
--    already exist from older ad-hoc seeding without an action_id; those are
--    left alone here and backfilled below instead of being duplicated.
INSERT INTO public.permissions (module, name, description, action_id, enforced)
SELECT m.key, a.key, NULL, a.id, true
FROM public.permission_actions a
JOIN public.permission_modules m ON m.id = a.module_id
WHERE m.key IN ('fit_and_proper', 'fit_and_proper_screening', 'fit_and_proper_committee')
  AND a.key IN ('create', 'edit', 'approve', 'export', 'configure', 'execute')
  AND NOT EXISTS (SELECT 1 FROM public.permissions p WHERE p.module = m.key AND p.name = a.key);

UPDATE public.permissions p
SET action_id = a.id
FROM public.permission_actions a
JOIN public.permission_modules m ON m.id = a.module_id
WHERE m.key = p.module AND a.key = p.name AND p.action_id IS NULL
  AND m.key IN ('fit_and_proper', 'fit_and_proper_screening', 'fit_and_proper_committee');

-- 6. Seed the missing route attachments from the current sidebar
--    (src/config/navigation.tsx) and the current admin routes
--    (src/routes/adminRoutes.tsx) — permission_module_routes had zero rows
--    for any F&P route before this.
INSERT INTO public.permission_module_routes (module_id, route_prefix, menu_label, sort_order)
SELECT m.id, r.route_prefix, r.menu_label, r.sort_order
FROM (VALUES
  ('fit_and_proper', '/fpa/processes', 'Process List', 10),
  ('fit_and_proper', '/fpa', 'Assessment Hub', 20),
  ('fit_and_proper', '/fpa/sector-rules', 'Sector Rules', 30),
  ('fit_and_proper', '/fpa/initiation', 'Initiation Paths', 40),
  ('fit_and_proper', '/fpa/individuals', 'Individual Register', 50),
  ('fit_and_proper', '/fpa/initiation-log', 'Initiation Log', 60),
  ('fit_and_proper', '/fpa/declarations', 'Declarations', 70),
  ('fit_and_proper', '/fpa/invitations', 'Invitation Tracker', 80),
  ('fit_and_proper', '/fpa/screening', 'Screening Hub', 90),
  ('fit_and_proper', '/fpa/manual-tasks', 'Manual Review Queue', 100),
  ('fit_and_proper', '/fpa/findings', 'Findings Console', 110),
  ('fit_and_proper', '/fpa/ai-analysis', 'AI Analysis', 120),
  ('fit_and_proper', '/fpa/committee', 'Committee Voting', 130),
  ('fit_and_proper', '/fpa/determinations', 'Determinations', 140),
  ('fit_and_proper', '/fpa/conditions', 'Conditions & SLA', 150),
  ('fit_and_proper', '/fpa/scheduler', 'Reassessment Scheduler', 160),
  ('fit_and_proper', '/fpa/monitoring', 'Monitoring & Audit', 170),
  ('fit_and_proper', '/fpa/appeals', 'Appeals', 180),
  ('fit_and_proper', '/fpa/notifications', 'Notification Log', 190),
  ('fit_and_proper', '/fpa/trends', 'Trends & History', 200),
  ('fit_and_proper', '/fpa/training', 'Training & Awareness', 210),
  ('fit_and_proper_screening', '/admin/fp-screening-configs', 'Screening Configurations', 10),
  ('fit_and_proper_screening', '/admin/fp-sector-rules', 'Sector Decision Rules', 20),
  ('fit_and_proper_committee', '/admin/fp-committees', 'Committees Admin', 10)
) AS r(module_key, route_prefix, menu_label, sort_order)
JOIN public.permission_modules m ON m.key = r.module_key
ON CONFLICT (module_id, route_prefix) DO NOTHING;

-- 7. Grant Super Admin every resulting ACTIVE F&P permission (existing +
--    newly added). Joining through permission_actions/permission_modules
--    and filtering on is_active means the just-deactivated BRD-era actions
--    (and the whole 'fit_and_proper_initiation' module) are correctly left
--    ungranted here.
--
--    Split into two statements deliberately: trg_role_permissions_action_guard
--    (assert_role_permission_dependencies) rejects granting a "dependent"
--    action (create/edit/approve/export/configure/execute — see
--    permission_dependent_actions) unless that role already has '<module>.view'.
--    A single multi-row INSERT ... SELECT runs on one statement-level
--    snapshot, so a 'view' row inserted by the SAME statement is not yet
--    visible to the trigger's check when it processes a sibling 'create'/
--    'edit' row — hence "dependency_missing: fit_and_proper_screening.create
--    requires fit_and_proper_screening.view on the same role". Granting
--    'view' first in its own statement (visible to the transaction's later
--    statements) and every other action second avoids that ordering trap.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
JOIN public.permission_actions a ON a.id = p.action_id
JOIN public.permission_modules m ON m.id = a.module_id
WHERE r.name = 'Super Admin'
  AND m.key IN ('fit_and_proper', 'fit_and_proper_screening', 'fit_and_proper_committee')
  AND m.is_active = true
  AND a.is_active = true
  AND lower(a.key) = 'view'
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
JOIN public.permission_actions a ON a.id = p.action_id
JOIN public.permission_modules m ON m.id = a.module_id
WHERE r.name = 'Super Admin'
  AND m.key IN ('fit_and_proper', 'fit_and_proper_screening', 'fit_and_proper_committee')
  AND m.is_active = true
  AND a.is_active = true
  AND lower(a.key) <> 'view'
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
