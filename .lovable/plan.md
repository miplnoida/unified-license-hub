
# Enterprise RBAC Completion — Sliced Execution Plan

I'm currently in plan mode and can't edit files until you approve this plan. Approving switches me to build mode so I can implement Slice 1 immediately, then continue slice-by-slice.

## Ground rules (apply to every slice)

- One slice per turn, each self-contained: code + migration + tests + verification + rollback safety.
- No documentation-only turns.
- Every migration that creates/alters a public table includes GRANTs and RLS.
- Every unauthorized mutation path returns SQLSTATE `42501`.
- All tests actually executed (Vitest, pgTAP, tsgo, build) with output captured before I claim a slice complete.
- Nothing rewritten wholesale (249 tables / 294 functions) in one migration — prioritized lists only.

## Slice ordering (locked)

1. Role Management verification + unified dependency source
2. Application action protection (PermissionGate + backend parity)
3. Route protection audit
4. Edge Function `requireUserPermission` sweep + scope types
5. RPC hardening (business-critical list)
6. RLS on prioritized tables
7. Storage bucket policies
8. Return Queue assignment-only finalization
9. Coverage scanner accuracy (surface separation)
10. Orphan permission triage (wire / deprecate / remove)
11. Full automated verification run

---

## Slice 1 — Role Management verification + unified dependencies (this turn after approval)

### 1a. Single source of truth for dependencies

- Create `supabase/migrations/<ts>_rbac_dependency_source.sql`:
  - `CREATE TABLE public.permission_dependent_actions(action text primary key)` seeded from the current TS list (`edit, update, create, delete, approve, reject, export, download, upload, import, publish, archive, restore, assign, reassign, bulk, bulk_update, bulk_delete, configure, status_change, workflow_action, dispatch, execute, close, reopen, resolve, escalate, issue, revoke, suspend, renew`).
  - GRANT SELECT to `anon, authenticated`; ALL to `service_role`. RLS enabled, read-only policy for authenticated.
  - Rewrite `assert_role_permission_dependencies` trigger to read from this table (no hardcoded array in SQL).
- Regenerate `src/lib/rbac/permissionDependencies.ts` to fetch the list from Supabase at module load with a static fallback constant kept in sync via a codegen script `scripts/sync-permission-dependencies.ts`. The script reads the table and rewrites the `DEPENDENT_ACTIONS` constant; CI check fails if drift is detected.
- Update `src/test/rbac/permissionDependencies.test.ts` to assert the constant matches the DB seed via a snapshot fixture.

### 1b. Role Management SQL-level enforcement audit

Add pgTAP file `supabase/tests/rbac/30_role_management_authz.sql` covering, per persona (anon, authenticated non-admin, dynamic-role-with/without `role_management.*`, super_admin, service_role):

- `roles` INSERT / UPDATE / DELETE
- `role_permissions` INSERT / DELETE
- `user_dynamic_roles` INSERT / UPDATE / DELETE
- `permission_modules` / `permission_actions` / `permissions` mutations
- `reset_system_role_permissions` RPC (success, unknown role, non-system role, deprecated-permission preservation, dependency preservation, bypass-flag cleanup post-rollback)

Every unauthorized case asserts `SQLSTATE 42501`. Bypass flag test wraps the reset in a rolled-back transaction and then re-attempts an unauthorized mutation to prove the flag doesn't leak.

Fix any policy/trigger gap the tests expose (expected: tighten `roles` INSERT/UPDATE/DELETE policies to require `has_permission(auth.uid(), 'role_management', <action>)`, same for `role_permissions`, `user_dynamic_roles`, catalog tables). Migration: `<ts>_role_management_authz_hardening.sql`.

### 1c. Read/write separation for Permission Catalog

- Ensure `PermissionCatalogTab` requires `role_management.view_catalog` to render and `role_management.manage_catalog` to mutate. Migration already registered these; verify seeding and add to Legacy Admin defaults if missing.
- Add DB-level guard on `permissions` mutations mirroring the existing module/action guard.

### 1d. Vitest additions

`src/test/rbac/roleManagement.authz.test.tsx`:
- Renders `RoleManagement` under personas (super_admin, legacy admin with all role_management perms, admin with only view, dynamic role without role_management, external user).
- Asserts Create/Edit/Delete/Reset/Assign controls are enabled/disabled correctly.
- Asserts `applyTemplate` short-circuits without `assign_permissions`.
- Asserts catalog tab hidden without `view_catalog`.

### 1e. Verification commands run before completing the slice

- `bunx tsgo --noEmit`
- `bunx vitest run src/test/rbac src/test/permissionsRbac.test.tsx`
- `supabase test db` (pgTAP) on new files
- Build

Slice 1 done only when all above pass with captured output.

---

## Slices 2–11 — one turn each, same structure

Each will be re-issued as its own plan once the previous slice lands, but the intended scope is:

- **S2 Actions**: audit `src/pages/**` and `src/components/**` for buttons/menu items that trigger mutations; wrap with `PermissionGate` / replace `<Button>` with `GuardedButton`; parity check against backend permission for each. Produce `docs/rbac/button-coverage.tsv`.
- **S3 Routes**: enumerate `src/routes/**` + `src/App.tsx`; every non-public route wrapped in `ModuleRoute`; add catch-all `<AccessDenied>` for unknown internal routes; extend `src/test/routeCoverage.test.ts`.
- **S4 Edge Functions**: sweep `supabase/functions/*/index.ts`; ensure `requireUserPermission` precedes any privileged work; introduce `AuthzScope` variants `application|return|complaint|licensee|entity|workflow|report|document|assessment` and prune unused; add tests via `supabase--curl_edge_functions` per function.
- **S5 RPCs**: pick top ~30 business-critical SECURITY DEFINER functions (workflow transitions, complaint intake, license issuance, return submit, notification dispatch, exports); add `has_permission` check, `SET search_path = public`, `REVOKE ... FROM PUBLIC`, explicit GRANTs; log in `docs/rbac/rpc-permission-map.tsv`; pgTAP.
- **S6 RLS**: prioritized tables (roles, permissions, role_permissions, user_dynamic_roles, applications, complaints, returns_filed, licenses, reports, audit_logs, notification_outbox, site_settings, workflow_templates/instances/approval_steps). Every policy = permission gate + scope predicate; kill `USING(true)` on these; pgTAP per table.
- **S7 Storage**: policies on `application-documents`, `return-documents`, `complaint-evidence`, `fp-evidence`, `license-certificates`, `audit-exports` — permission + ownership on all verbs and signed-URL generation path.
- **S8 Return Queue**: finalize assignment-only via `hasAssignmentReturnQueueAccess`; ensure no `returns_management.view` leak; single lifecycle allow-list in `src/lib/returnLifecycle.ts` mirrored by `public.return_lifecycle_visible_statuses()` SQL function used by RLS, RPCs, Edge Functions, reports.
- **S9 Coverage scanner**: expand `SurfaceKey` to include `scope` and `test`; `classifyCoverage` returns "Fully Enforced" only when UI + backend + scope + test all present; `data-rbac` remains `marker`, never contributes.
- **S10 Orphans**: SQL report enumerating `permissions` rows with no coverage; for each: wire, deprecate (`deprecated=true`), or delete duplicate. Before/after counts in `docs/rbac/orphan-permissions.md`.
- **S11 Verification**: run build, tsgo, ESLint, Vitest, pgTAP suite, edge-function tests; publish results in `docs/rbac/audit-2026-07-21/12_final_verification.md`.

---

## Rollback safety

Every migration has an `-- ROLLBACK` comment block at the bottom describing the compensating SQL, so operators can revert without guessing. No destructive column drops in slices 1–4.

## Technical notes

- The unified dependency table pattern lets the trigger read live data while TS keeps a build-time constant for offline dev; the codegen script prevents drift.
- Reset-bypass test uses `BEGIN; SET LOCAL rbac.bypass = 'on'; ... ROLLBACK;` then a fresh transaction to prove flag scoping is transactional.
- pgTAP personas use `SET LOCAL role authenticated; SET LOCAL request.jwt.claims = '{"sub":"..."}'` and pre-seeded `user_dynamic_roles` rows.

---

Approve to start Slice 1. I will stop after Slice 1 lands with verification output and re-plan Slice 2.
