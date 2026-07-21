## 0. Fix the build regression first (blocking)

`src/pages/admin/PermissionCoverageReport.tsx` imports `classifyCoverage` from `src/lib/rbac/coverage.ts`, which also imports `node:fs` / `node:path`. Vite tries to bundle those Node built-ins for the browser and Rollup fails with `"readdirSync" is not exported by "__vite-browser-external"`.

Split `coverage.ts` into two files so browser code never pulls in Node built-ins:

- `src/lib/rbac/coverageTypes.ts` — pure types (`SurfaceKey`, `SurfaceReference`, `CoverageRow`, `CoverageMatrix`, `CatalogEntry`) and the pure classifier `classifyCoverage()`. **No Node imports.** Consumed by `PermissionCoverageReport.tsx` and any UI code.
- `src/lib/rbac/coverageScanner.ts` — the FS-walking scanner (`buildCoverage()`), imports `node:fs` / `node:path`. Re-exports types from `coverageTypes` for convenience. Consumed by `scripts/generate-permission-coverage.ts` and `src/test/rbac/permissionCoverage.test.ts`.

Update all three consumers to import from the correct file. Re-run `bun run build:dev` and confirm it passes before starting the audit.

## 1. Audit scope and evidence method

Every finding is grounded in an actual scan — no assumptions. All scans are additive; no functionality is modified unless a security gap is found (and each such change is listed under "Fix status: fixed" with the migration or file).

Data sources used for evidence:

- Filesystem scanners (`buildCoverage` from step 0) enumerating menu, route, button, RLS, RPC, storage, and report references per (module, action).
- Live DB queries via `supabase--read_query` for: catalogued permissions, `role_permissions` grants, `pg_policies` per table, `pg_proc` for RPC bodies, storage.objects policies, and RLS-enabled table list.
- `supabase--linter` for platform-detected issues (missing RLS, permissive policies, exposed columns).
- Route map (`src/lib/permissionModules.ts` `ROUTE_MODULE_MAP`) + static walk of `src/routes/**` to detect any protected route missing a guard.
- Menu config walk (`src/config/navigation.tsx`) to detect menu entries with no `module` key or pointing at an unmapped route.
- Button walk across `src/pages/**` + `src/components/**` looking for action verbs (Approve/Reject/Delete/Export/Download/Upload/Import/Publish/Archive/Restore/Assign/Escalate/Close/Reopen/Resubmit/Configure/Send/Generate/Print/Email) whose surrounding JSX has no `PermissionGate`, `GuardedButton`, or `data-rbac` marker.

## 2. Audits performed

For each area below, the audit produces the listed report. Findings are recorded in a single `docs/rbac/audit-2026-07-21/findings.csv` with columns: `severity, area, file, line, permission, reason, impact, recommendation, fix_status`. Severities: Critical / High / Medium / Low / Info.

Areas scanned:

1. **Menus** — every `src/config/navigation.tsx` item; flag missing `module`, unmapped `href`, or `module` referencing an orphaned permission.
2. **Routes** — every `<Route>` in `src/routes/**`; flag any protected route lacking `<M>` / `<ModuleRoute>` / `<PortalRoute>`; cross-check `ROUTE_MODULE_MAP`.
3. **Buttons** — action-verb heuristic; flag unguarded destructive/mutating actions and Return Queue actions visible to assignment-only regulators.
4. **PermissionGate / hook usage** — flag pages that read from a table but never call `useCan` or gate destructive actions.
5. **Role Management** — verify dependency + orphaned triggers cannot be bypassed; verify catalog snapshot in `src/lib/rbac/catalog.json` matches the live `permissions` table.
6. **RLS** — every table under `public.*`; flag: RLS disabled, no policies, `USING (true)` on write policies, policies without `has_permission()` on sensitive tables (Returns, Complaints, Applications, Licensing, FP, Prudential, Market Conduct, TwinPeaks, Users, Roles, Forms, Fees, Settings).
7. **RPCs** — every SECURITY DEFINER function; flag: no `has_permission()` check, no `search_path` pin, unfiltered `SELECT *`, callable by `anon` without intent.
8. **Storage** — every policy on `storage.objects`; flag: buckets with no policy, policies not scoped via `has_permission()` for privileged buckets.
9. **Reports / Dashboards** — `src/pages/reports/**` + `src/pages/dashboards/**`; flag consolidated reports and AI-analysis exports lacking gates.
10. **Search / Exports / Downloads / Uploads** — every file with `csv`, `xlsx`, `pdf`, `download`, `export`, `upload`, `import` in name or content; flag unguarded triggers.
11. **Workflow / Comments / Attachments** — approval action panels, review markup, and file link RPCs; flag missing action gates.
12. **Return Queue lockdown** — verify assignment-only regulators see only submitted-status mapped entities and no admin actions (existing `returnQueueAssignmentOnly.test.tsx` must still pass; add cases if gaps are found).
13. **Per-module deep dives** — Complaints, Applications, Licensing, Fit & Proper, Prudential, Market Conduct, Twin Peaks, Users, Roles, Forms, Fees, Settings. For each: enumerate menu → route → page → mutating actions → tables/RPCs touched → RLS + RPC coverage.

## 3. Reports produced

Written to `docs/rbac/audit-2026-07-21/`:

1. `01-permission-coverage-matrix.md` — regenerate via existing generator; embed here.
2. `02-route-coverage.md` — one row per protected route; guarded Y/N, module, file:line.
3. `03-menu-coverage.md` — one row per menu item; module, matches route map Y/N.
4. `04-button-coverage.md` — action verbs found; guarded Y/N; module.action expected; file:line.
5. `05-backend-authorization.md` — summary of `has_permission()` usage across RLS + RPC + storage.
6. `06-rls-coverage.md` — per table: RLS enabled, policy count, uses `has_permission` Y/N, weakest policy.
7. `07-storage-policy.md` — per bucket / per policy row: role, USING/WITH CHECK, uses `has_permission` Y/N.
8. `08-rpc-security.md` — per SECURITY DEFINER function: search_path pinned Y/N, permission check Y/N, callable roles.
9. `09-orphan-permissions.md` — regenerate from coverage matrix; list of `enforced=true` permissions with zero surfaces.
10. `10-final-security-score.md` — weighted score (RLS 30 / RPC 20 / Storage 15 / Routes 10 / Buttons 15 / Menus 5 / Tests 5) plus explicit list of open Critical/High findings blocking a 100% claim.

The score explicitly refuses to claim 100% unless: zero Critical findings, zero High findings, `permissionCoverage.test.ts` + `permissionDependencies.test.ts` + `routeCoverage.test.ts` + `sidebarVisibility.test.tsx` + `returnQueueAssignmentOnly.test.tsx` all pass, and `bun run build:dev` succeeds.

## 4. Fix policy

- **Critical** (missing RLS on user data, unauthenticated write RPCs, storage bucket world-readable): fix in this turn via migration.
- **High** (unguarded destructive button on privileged route, RPC with SECURITY DEFINER but no permission check): fix in this turn.
- **Medium / Low / Info**: recorded in the findings CSV with recommendation and left for the user to prioritise; **no functionality changes**.

Every applied fix appears in `findings.csv` with `fix_status = fixed` and points to its migration or diff. Findings not touched are `fix_status = open`.

## 5. Deliverables

- Build passes (`bun run build:dev`).
- All existing RBAC tests still pass (`bunx vitest run src/test/rbac`).
- 10 reports under `docs/rbac/audit-2026-07-21/`.
- `findings.csv` with every issue, severity, file, reason, impact, recommendation, fix status.
- Short executive summary at the top of `10-final-security-score.md` with the honest score and the list of remaining Critical/High items (if any).

## Technical details

- Scanner split is a pure refactor of `src/lib/rbac/coverage.ts` — no behaviour change, only two files where there was one.
- SQL introspection queries are read-only. If Critical/High DB fixes are needed, they land as a single migration named `20260721_rbac_audit_hardening.sql` following the standard grant/RLS/policy ordering.
- The audit does not modify menu labels, route paths, or user-visible business logic beyond adding missing guards on already-existing buttons.
