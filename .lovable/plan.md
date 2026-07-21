# Roles & Permissions — Full Enforcement Completion

This is a large, multi-layer hardening effort. I'll land it in sequenced slices so each slice is reviewable, testable, and reversible. Every slice ships production code + migrations + tests (no doc-only turns).

## Slice 1 — Catalog triage & Role Management self-protection
- Classify all 123 permissions (query DB + scanner) into: implemented / partial / orphan / deprecated / external / service. Write result to `permissions.classification` (new column) via migration; deprecated rows get `enforced=false` and are filtered out of Role Management's assignable list.
- Add missing role-management sub-permissions: `role_management.{create,edit,delete,reset,assign_permissions,view_coverage}` (migration + catalog.json).
- Wrap every action in `src/pages/admin/RoleManagement.tsx` and `PermissionCoverageReport.tsx` with `PermissionGate` / `GuardedButton` using the exact action.
- Add a `role_management_mutation_guard` trigger on `roles` and `role_permissions` that calls `has_permission(auth.uid(), 'role_management', <action>)` for INSERT/UPDATE/DELETE (service_role bypass). Guarantees backend enforces the same action as UI.
- pgTAP: direct SQL insert without `role_management.create` fails 42501; view-only user cannot edit/delete/reset.
- Vitest: view-only user sees list but no Create/Edit/Delete/Reset buttons.

## Slice 2 — Dependency enforcement completion
- Extend `DEPENDENT_ACTIONS` in `permissionDependencies.ts` with the full list (add `update, reassign, close, reopen, resolve, escalate, issue, revoke, suspend, renew, bulk_update, bulk_delete`).
- Update DB trigger `assert_role_permission_dependencies` to read from a new `permission_dependencies` table (source of truth) rather than a hardcoded list, seeded from the same catalog.
- Add BEFORE DELETE trigger on `role_permissions` that blocks removing `view` while any dependent action remains for that role+module.
- Repair migration: for every existing role holding a dependent action without `view`, insert the missing `view` row.
- Ensure quick-templates in `RoleManagement.tsx` route through `resolveDependencies()`.
- Tests: pgTAP (insert/update/delete matrix); Vitest (template + toggle + save flows).

## Slice 3 — `_shared/authz.ts` hardening + scope model
- Rewrite `supabase/functions/_shared/authz.ts`:
  - `requireAuth(req)` — Bearer required, JWT verified via `getClaims`, returns `{ userId, claims, supabase }`.
  - `requireUserPermission({ req, module, action, scope? })` — module/action required (no optional bypass for business fns).
  - `AuthzScope` typed discriminated union: `return | application | complaint | licensee | document | assessment | report | workflow_task`.
  - Per-scope resolver querying the correct table + `user_has_entity_assignment` / ownership / workflow assignee / PPOC / external-portal checks.
  - Deny by default; explicit `{ allow: 'global' }` opt-out required.
- Remove unused/unimplemented scope keys (`recordId`, etc.).
- Deno tests: 401 (no/invalid token), 403 (missing perm), 403 (perm but wrong scope), 200 (perm+scope).

## Slice 4 — Edge Function sweep
Refactor every high-risk function to use the new helper, in this order (batched by domain):
1. Reports/exports: `generate-report`, `audit-export`, any csv/excel/pdf functions.
2. AI: consolidated-analysis, prudential-analysis, market-conduct-analysis, fpa-analysis, rfi-auto-suggestions.
3. Notifications/email: notification-dispatch, email-send, sla-escalation.
4. Application decisions, complaint actions, return processing/validation/document ops.
5. Licensing certificate generation, workflow actions.

Each: `requireUserPermission` before service client creation, protected reads/writes, signed-URL generation, AI calls. Update `docs/rbac/edge-function-permission-map.tsv` from actual code (not aspirational). Deno test per function covering the 5 outcomes.

## Slice 5 — RPC authorization
- Add `has_permission` gate at top of every business-sensitive `SECURITY DEFINER` RPC (returns raise `insufficient_privilege`/42501).
- Revoke `EXECUTE ... FROM PUBLIC`; grant to `authenticated` (or `service_role` only for worker RPCs).
- Ensure pinned `search_path = public` on all.
- Generate `docs/rbac/rpc-permission-map.tsv` from a pgTAP-verified query, not by hand.
- pgTAP: unauthorized caller → 42501; authorized → success; PUBLIC has no execute; search_path pinned.

## Slice 6 — RLS rewrite (highest-sensitivity first)
Order: `roles`, `permissions`, `role_permissions`, `user_dynamic_roles`, `user_roles`, `profiles` admin fields, `audit_logs`, `security_event_logs`, `notification_outbox`, `applications`, `returns_filed`, `return_form_data`, `complaints`, `complaint_evidence`, `licensees`, `licenses`, `reports`, `report_logs`, `site_settings`, `workflow_instances`.

Pattern per table: drop broad `USING (true)`; replace with `is_super_admin(uid) OR (has_permission(uid, module, action) AND <scope predicate>) OR <legitimate independent path>` where the legitimate path covers applicant ownership / PPOC / entity portal / workflow assignee / assignment-only-regulator (only where explicitly allowed).

`docs/rbac/table-permission-map.tsv` generated from `pg_policies` post-migration. pgTAP persona matrix per table.

## Slice 7 — Return Queue assignment-only isolation
- Remove any code path that treats assignment-only regulators as holding `returns_management.view`.
- Add `is_post_submission_status(text)` SQL helper; use it everywhere the queue filters rows (RLS, RPC, edge, storage, `ViewReturns.tsx`, ratios/reports).
- Hide Due Soon / Drafts / WIP / TEMP / analytics / ratios / return-configuration UI when `isAssignmentOnly`.
- Storage: signed-URL edge functions require `returns_management.download` OR assignment-only-with-view exception ONLY for the specific mapped, submitted return.
- Vitest + pgTAP + Deno persona suite.

## Slice 8 — Storage policy hardening
Rewrite policies on private buckets (`documents`, `secure-documents`, `return-uploads`, `fp-evidence`, `complaint-evidence`, `application-documents`, `payment-documents`, `certificates`, `audit-exports`) to `has_permission(uid, module, action) AND <scope>`. Signed-URL-issuing edge functions call `requireUserPermission` with matching action (`download`/`upload`). pgTAP + Deno tests.

## Slice 9 — Frontend action sweep
Automated: extend the RBAC scanner to (a) require `<PermissionGate>`/`GuardedButton` for real protection and (b) treat `data-rbac` as marker only. Fail CI when a business-action button lacks a real guard. Then wrap remaining unprotected actions module-by-module until scanner reports 100% coverage.

## Slice 10 — Menu & route completion
- `ROUTE_MODULE_MAP` audit; every internal route mapped or explicitly on the allow-list.
- Route coverage test fails on unmapped internal route.
- Sidebar: parents auto-hide when no visible child; assignment-only synthesis check.

## Slice 11 — Coverage methodology + final report
- Rewrite `coverageScanner.ts` to distinguish `real_ui_guard` vs `audit_marker_only` and per-layer guard types; report classes: fully / ui-only / backend-only / partial / marker-only / orphan / deprecated.
- Regenerate coverage artifacts only after all prior slices land.
- Final report: commit SHA, files changed per slice, orphan before/after, edge/RPC/RLS/storage/route/button counts, test results, CI status, remaining limitations.

## Technical notes
- Every slice ends with `bun test`, `tsgo`, `supabase--linter`, pgTAP for touched suites, and Deno test for touched functions.
- Migrations are additive + reversible where possible; RLS changes ship with a `SET LOCAL role authenticated` pgTAP persona check before merging.
- No behavior change to unrelated modules; scope predicates preserve existing legitimate access (applicant, PPOC, entity portal, workflow assignee).
- Where a permission has no realistic surface, it is marked `deprecated` (not silently deleted) and hidden from Role Management.

## Delivery cadence
I'll implement Slices 1-2 in the first build turn (self-protection + dependency completion — smallest blast radius, unlocks the rest), then request approval to continue. Each subsequent turn lands 1-2 slices with tests green before moving on.
