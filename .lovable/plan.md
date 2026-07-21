## Scope

Close the remaining RBAC gaps identified in `docs/rbac/audit-2026-07-21/` and the completion criteria above. Work proceeds in reviewable slices but continues until every item is addressed. No documentation-only or coverage-only changes; every claim is backed by an executed test.

## Slices (executed sequentially, each with migration + code + tests)

### Slice 12 — Return Queue assignment-only lifecycle lockdown
- Reintroduce `SUBMITTED_LIFECYCLE_STATUSES` as the single canonical source in `src/lib/returnLifecycle.ts` and mirror it in a new SQL function `public.return_status_is_submitted_lifecycle(text)`.
- Update `public.can_view_entity_returns` and `public.can_read_return_filed` so **assignment-only** users get returns ONLY when status is in the submitted lifecycle; internal users with `returns_management.view` retain full access.
- Update Return Queue list query, Return Detail loader, dashboard counters, attachments RLS, storage policies (`return-uploads`), reports/exports edge functions to apply the same filter for assignment-only.
- Remove any "Due Soon" tile/filter visibility for assignment-only via `usePermissions.ts` gate.
- Ensure assignment alone never grants export/download/upload/edit/approve/workflow — those keep exact-permission checks.
- Tests: extend `supabase/tests/regulator_access/01_can_view_entity_returns.sql` with pre-submission denial cases; add `src/test/rbac/returnQueueAssignmentOnly.test.tsx`; add Deno test on the returns export function.

### Slice 13 — Enforcement / Inspection scope tightening
- Rewrite `can_read_enforcement`, `can_read_inspection` helpers so assignment alone is NEVER sufficient. Required read rule: `super_admin OR view_all_entities OR (exact view perm AND assignment)`.
- Write rule for create/edit/delete/workflow_action: `exact action perm AND assignment` (or `view_all_entities` for global roles where documented).
- Update RLS on `enforcement_actions`, `enforcement_case_events`, `inspections`, `inspection_findings`.
- Extend `supabase/tests/rbac/120_enforcement_inspection_rls.sql` with the six required cases (assignment-only denied, view-only cross-entity denied, correct combo allowed, view_all allowed, super_admin allowed, create without assignment denied).

### Slice 14 — Critical RPC hardening + map
- Enumerate SECURITY DEFINER RPCs touching mutations/approvals/assignments/exports/notifications. For each: pin `search_path = public`, `REVOKE EXECUTE FROM PUBLIC`, `GRANT` narrowly, call `has_permission` + scope check, raise `SQLSTATE 42501` on denial, use `auth.uid()`.
- Regenerate `docs/rbac/rpc-permission-map.tsv` with the required columns (function, module, action, scope_type, security_definer, safe_search_path, public_execute_revoked, permission_guarded, tested).
- Add pgTAP `supabase/tests/rbac/130_critical_rpcs.sql` with authorized + unauthorized assertions per RPC.

### Slice 15 — Remaining RLS modules
Batch by cluster, one migration per cluster, each with a pgTAP file:
1. **Complaints** cluster (`complaints`, `complaint_evidence`, `complaint_correspondence`, `complaint_investigation_tasks`, `complaint_escalation_cases`, `complaint_duplicate_*`, `complaint_intake_rules`, `complaint_status_catalogue`, `complaint_types`) — `140_complaints_rls.sql`.
2. **Market Conduct** (`conduct_*` tables) — `150_conduct_rls.sql`.
3. **Reports/Exports** (`report_definitions`, `reports`, `report_logs`, `report_schedules`, `report_run_*`, `audit_export_jobs`, `return_consolidated_analysis`) — `160_reports_rls.sql`.
4. **Security & Ops** (`audit_logs`, `security_event_logs`, `notification_outbox`, `notification_dispatch_log`, `notification_digest_log`, `site_settings`) — `170_security_ops_rls.sql`.
5. **Registration / Fees / Payments / Refunds / Correspondence / Master data / remaining workflow tables** — `180_misc_rls.sql`.
- Pattern for every table: drop `USING (true)` on sensitive tables; require exact permission + scope; preserve applicant / entity user / PPOC / assigned regulator / workflow assignee / service-role paths.

### Slice 16 — Storage authorization
- Explicit SELECT/INSERT/UPDATE/DELETE policies on: `return-uploads`, `application-documents`, `complaint-evidence`, `fp-evidence`, `secure-documents`, `payment-documents`, `certificates`, `audit-exports`, `report-exports`.
- Rule: `exact permission AND path→record scope resolution`.
- Update signed-URL edge functions (`storage-signed-url`, etc.) to enforce JWT + permission + record scope; refuse 403 out-of-scope.
- pgTAP `supabase/tests/rbac/190_storage_policies.sql` + Deno tests per function.

### Slice 17 — Edge Function full-coverage tests
- For every high-risk user-facing function: 5 tests (missing JWT / invalid JWT / missing permission / wrong scope / success).
- Verify guard runs BEFORE service-role client creation (lint via `scripts/verify-edge-authz.mjs` extended check).
- Regenerate `docs/rbac/edge-function-permission-map.tsv` with all required columns.

### Slice 18 — Frontend action & route protection sweep
- Replace unprotected action buttons across Applications, Returns, Complaints, Licensing, Licensees, Registration, F&P, Prudential, Market Conduct, Enforcement, Inspections, Reports, Workflows, Users, Roles, Settings, Notifications, Audit, Fees/Payments with `GuardedButton` or `PermissionGate`.
- Handlers re-check `hasPermission` before mutation.
- Protect routes: `/admin`, `/preview/:versionId`, `/notifications`, `/settings`, `/users`, `/reports`, `/workflows`, `/admin/roles`, `/admin/permission-coverage`.
- Router: unknown internal routes → `<AccessDenied />`.
- Admin Hub tiles each gated; KPI queries only fire when user has view permission.
- Extend `src/test/routeCoverage.test.ts` to fail on any unmapped internal route; add persona Vitest suites in `src/test/rbac/personas/`.

### Slice 19 — Orphan triage + coverage scanner accuracy
- Classify every catalogued permission (fully/partially/UI-only/backend-only/marker-only/missing-scope/untested/orphan/deprecated/external/service-only/duplicate).
- Remove or `enforced=false` + `deprecated=true` on orphans; block them from Role Management UI + `assert_role_permission_dependencies` trigger.
- Upgrade `src/lib/rbac/coverageScanner.ts` to distinguish `real_ui_guard` vs `audit_marker_only`, `guard_imported` vs `guard_called`, `route_mapping` vs `route_guard`, `rls_with_scope` vs `rls_without_scope`, and require test presence.
- Regenerate `permission-coverage.{json,csv,md}` with new classifications and before/after counts in `docs/rbac/change-log.md`.

### Slice 20 — CI gates & final verification
- Extend `.github/workflows/ci.yml` and add scripts to fail on: unmapped internal routes, unguarded high-risk actions, edge functions lacking real auth, critical RPCs without guards, unsafe SD `search_path`, `PUBLIC` execute on sensitive fns, orphan permissions, marker-counted-as-enforced rows, broad `authenticated USING (true)` policies, missing required RBAC tests.
- Execute and capture output of: `bun run build:dev`, `bunx tsgo --noEmit`, `bunx eslint .`, `bunx vitest run src/test/rbac`, `supabase test db`, `deno test supabase/functions`, `bunx tsx scripts/generate-permission-coverage.ts`, `node scripts/verify-edge-authz.mjs`, and Supabase migration validation.

## Final report format
Commit SHA · files changed · migrations · fixes by area · orphan before/after · coverage before/after · commands with real pass/fail · CI status · any remaining limitations explicitly listed.

## Technical notes
- All new SQL helpers: `SECURITY DEFINER`, `STABLE`, `SET search_path = public`, `REVOKE EXECUTE FROM PUBLIC`, granted only to `authenticated` / `service_role` as required.
- New public tables: full GRANT block + RLS + policies in the same migration.
- No blanket `authenticated USING (true)` on sensitive tables — always joined to permission + scope.
- Assignment-only never synthesizes `returns_management.view`; it is expressed via a dedicated `hasAssignmentReturnQueueAccess` flag on the client and via helper functions server-side.
- Every migration paired with a pgTAP file; every UI change paired with a Vitest file.
