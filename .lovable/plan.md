# Roles & Permissions — Enterprise Completion

Note: I'm in plan mode and cannot execute writes until you approve. This plan is the single implementation contract I will execute end-to-end once approved. No further "audit-only" turns.

## 1. Role Management — finish enforcement

- Catalog additions (migration): `role_management.{delete, reset, assign_permissions, view_catalog, manage_catalog, view_coverage}` (some already added last turn — idempotent seeding, plus classify each as `enforced=true`).
- Frontend (`RoleManagement.tsx`, `PermissionCoverageReport.tsx`):
  - Gate list view via `role_management.view` route + page-level `useCan`.
  - Wrap Create/Edit/Delete/Reset row actions in `PermissionGate`.
  - **Disable** the permission-checkbox matrix and Quick Templates when user lacks `role_management.assign_permissions` (not just hide Save).
  - Gate Permission Catalog tab: read = `view_catalog`, mutate = `manage_catalog`.
  - Every mutation handler (`handleSave`, `handleDelete`, `handleReset`, catalog upserts/deletes) re-checks `useCan` and short-circuits with a toast before invoking Supabase.

## 2. Backend enforcement (migration)

- BEFORE INSERT/UPDATE/DELETE triggers on `roles`, `role_permissions`, `permission_modules`, `permission_actions`, `permissions`, `user_dynamic_roles`, using `auth.uid()` + `has_permission()`. Deny with `RAISE EXCEPTION USING ERRCODE = '42501'`.
- System-role reset path (RPC `admin_reset_system_role`) requires `role_management.reset`.
- REVOKE broad grants; `service_role` bypass only where a security-definer path needs it.

## 3. Permission dependency — single source of truth

- Keep `src/lib/rbac/permissionDependencies.ts` as the canonical TS list (already extended).
- Regenerate SQL enum `_dependent_actions` from the same list via a code-gen script (`scripts/generate-dependency-sql.ts`) run in CI; migration seeds identical list into a `permission_dependent_actions` table read by `assert_role_permission_dependencies` trigger.
- Repair migration: for every existing `role_permissions` row whose action is dependent but view is missing, insert the view row (idempotent).

## 4. Orphan resolution

Classify all 99 previously-orphan permissions into: implemented / partial / external-portal / service-only / deprecated / true-orphan. Actions:
- Wire real UI/backend gates for those with existing surfaces (documented in `docs/rbac/orphan-resolution.md`).
- Mark unimplemented ones `deprecated=true` (new column) and hide from Role Management + coverage.
- Delete truly redundant duplicates.
Target: **0 unexplained orphans**. Before/after counts included in final report.

## 5. Coverage scanner rewrite

Rewrite `src/lib/rbac/coverageScanner.ts` to emit per-permission classification:
```
real_ui_guard | audit_marker_only | menu_guard | route_guard |
rls_guard | rpc_guard | storage_guard | edge_function_guard |
report_guard | scope_guard | test_coverage
```
`data-rbac` alone → `audit_marker_only` (does NOT count as enforced). "Fully enforced" requires the composite rule stated in the brief (UI + backend + scope + test). Regenerate `docs/rbac/permission-coverage.{md,csv,json}`.

## 6. Frontend action protection sweep

Replace unguarded action buttons across modules (Applications, Registration, Licensing, Licensees, Complaints, Returns, F&P, Prudential, Conduct, Coordination, Reports, Users, Roles, Forms, Workflows, Fees, Settings, Audit, Notifications) with `<PermissionGate>` or `<GuardedButton>`. Scanner floor raised from 0% → measured post-sweep baseline; CI test fails on regression.

## 7. Route & menu authorization

- Add `<M module=…>` guards to `/admin`, `/preview/:versionId`, `/notifications`, plus any remaining internal routes flagged by `src/test/routeCoverage.test.ts`.
- `/admin` hub: gate each tile + KPI query behind its own permission; unauthorized tiles are not fetched.
- Public/external routes explicit allow-list in `permissionModules.ts`.
- New test: unknown/unmapped internal route → 403.

## 8. Edge Function authorization

- Extend `supabase/functions/_shared/authz.ts` with typed `AuthzScope` union: `return|application|complaint|licensee|document|assessment|report|workflow_task`.
- Wire `requireUserPermission` into every high-risk function: `audit-export`, `generate-report`, `generate-certificate`, `dispatch-notifications`, `send-email`, `ai-*` analysis functions, complaint action functions, return processing, application decision, prudential/conduct/fp analysis, signed-url issuers.
- 401 auth / 403 permission-scope / no DB detail leakage.
- Regenerate `docs/rbac/edge-function-permission-map.tsv` with `guard_imported | guard_called | tested` columns.

## 9. RPC hardening

Sweep `SECURITY DEFINER` functions in `public`:
- Add `has_permission(auth.uid(), module, action)` gate at top; raise 42501 on deny.
- Pin `SET search_path = public`.
- `REVOKE EXECUTE … FROM PUBLIC`; grant to `authenticated` / `service_role` deliberately.
Publish `docs/rbac/rpc-permission-map.tsv` with all columns from the brief.

## 10. RLS enforcement

Rewrite policies for sensitive tables to `has_permission() AND <scope>`:
- Auth admin: `roles`, `permissions`, `role_permissions`, `user_dynamic_roles`, `user_roles`, `permission_modules`, `permission_actions`.
- Business: `applications`, `complaints`, `returns_filed`, `licensees`, `licenses`, `fp_*`, `prudential_*`, `conduct_*`, `coordination_*`, `reports`, `workflow_*`, `settings`.
- Ops: `audit_logs`, `security_event_logs`, `notification_outbox`.
Preserve applicant/entity-user/PPOC/assigned-regulator/workflow-assignee paths as explicit `OR` branches. Remove any `USING (true)` on sensitive tables. Publish `docs/rbac/table-permission-map.tsv`.

## 11. Return Queue assignment-only

- Consolidate lifecycle constants into `src/lib/returnLifecycle.ts` + mirror SQL function `public.is_post_submission_return_status(text)`; delete every duplicate list.
- Assignment-only readers: only mapped + post-submission statuses; no Draft/TEMP/WIP/Due-Soon KPIs; export/upload/edit/approve/reject/reopen/workflow/analytics/ratios/thresholds/configure all denied at UI, RLS, RPC, Edge.
- Existing test `returnQueueAssignmentOnly.test.tsx` extended to cover every denied surface.

## 12. Storage

Policies for buckets: `documents`, `secure-documents`, `return-uploads`, `application-documents`, `complaint-evidence`, `fp-evidence`, `payment-docs`, `certificate-assets`, `audit-exports`.
- Each of SELECT/INSERT/UPDATE/DELETE requires `has_permission()` AND path→record scope check via helpers (`storage_scope_*`).
- Signed URL issuance goes through an Edge Function that re-runs the same check.

## 13. Automated tests

- Vitest (`src/test/rbac/*`): role-mgmt persona matrix, dependency auto-add, view-removal block, template resolution, route/menu visibility, action-button protection, return-queue assignment-only full matrix.
- pgTAP (`supabase/tests/rbac/*`): unauthorized role/permissions mutations, dependency violations, deprecated-permission assignment, RPC denial, definer search_path, PUBLIC revoke, RLS persona matrix, storage authorization, audit/security table lockdown.
- Deno (`supabase/functions/*/test.ts`): missing/invalid JWT → 401; wrong permission → 403; wrong scope → 403; correct → 200 for each high-risk function.

## 14. Verification (executed, not claimed)

Post-implementation I will run and paste real output for:
```
bun run build:dev
bunx tsgo --noEmit
bunx eslint .
bunx vitest run src/test/rbac
supabase test db
deno test supabase/functions
```
plus generated coverage docs.

## 15. Final report deliverables

`docs/rbac/audit-2026-07-21/completion-report.md` covering: commit SHA, files changed, migrations, protected actions/routes/edges/RPCs/RLS/storage, orphan before/after, coverage numbers, test-command output, CI status, remaining limitations.

## Technical notes

- Dependency SQL is generated, not hand-maintained — the trigger reads `permission_dependent_actions` table populated from the TS list.
- `deprecated` column on `permissions` added in the same migration that hides them from Role Management + coverage.
- `AuthzScope` becomes a discriminated union in `_shared/authz.ts`; existing callers migrated in the same slice.
- No behavior changes to legitimate applicant / entity-user / PPOC read paths; verified by preserving the existing OR branches in every touched policy.

Approve to begin execution. I will implement in a single continuous run, batching migrations, code, and tests, and finish with the verification output above.
