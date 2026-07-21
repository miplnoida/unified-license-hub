## Roles & Permissions — Final Completion Plan

This plan closes the 18 gaps you listed. It is sequenced so each slice produces verifiable evidence (migrations, tests, CI artifacts) before the next begins. Scope is intentionally large; I will not claim completion until every slice has passing automated evidence.

### Slice A — Module Scope Capability Registry (fixes §2, §3)

- Create `src/lib/rbac/scopeCapabilities.ts` — the single source of truth mapping each module → allowed scope options (`all | assigned | team | sector | department | institution | own`) plus which selector entities each scope requires (sector IDs, licensee IDs, department IDs, team IDs).
- Backend mirror: `public.rbac_module_scopes` table + seed migration so DB helpers read the same capability list as the UI.
- Refactor `RecordScopePanel.tsx` to render only capability-driven scopes per module and replace free-text `notes` with real ID selectors (Sector, Licensee, Department, Team comboboxes). Remove the `notes` field from persisted `scope_config`.

### Slice B — Scope becomes authoritative (fixes §1)

- Extend `public.has_permission(uid, module, action)` with an overload `has_permission_scoped(uid, module, action, record_ctx jsonb)` that resolves the caller's aggregated `scope_config` across their active roles and evaluates against the supplied record context (licensee_id, sector_id, department_id, assigned_user_ids, owner_id).
- Add helper `public.user_scope_for(uid, module) returns jsonb` returning the merged (most-permissive) scope so RLS policies can inline it.
- Rewrite RLS on the modules the requirements enumerate (Complaints, Returns, Licensing/Applications, Registration, Conduct, Prudential, Fit & Proper, Enforcement, Inspection, Forms, Payments, Reports, Audit, Workflow) to call `has_permission_scoped` — reusing existing helpers (`can_view_entity_returns`, `user_has_entity_assignment`) rather than duplicating logic.
- Update storage policies for the 16 buckets and every `SECURITY DEFINER` RPC touched in the last audit to route through `has_permission_scoped`.
- Update Edge Functions via `_shared/authz.ts` — extend `requireUserPermission` to accept a `recordCtx` and call `has_permission_scoped`.
- Frontend query hooks (`useComplaints`, `useReturns`, `useApplications`, etc.) call `user_scope_for` once and filter client-side lists to match — so menus/tables never show rows the backend would deny.

### Slice C — Transactional role writes (fixes §4)

- New RPC `public.rbac_save_role(payload jsonb)` runs Create/Update/Clone/Reset inside a single transaction: upserts `roles`, replaces `role_permissions`, writes `role_migration_log`, validates dependencies + orphans + sensitive-privilege rules server-side. Raises `not_authorized` / `invalid_role` on failure so nothing partial persists.
- `useCreateRole` / `useUpdateRole` / `useCloneRole` / role-reset all call this one RPC. Remove the current multi-step client flow.
- Bulk update (multi-role edit) goes through `public.rbac_bulk_update_roles(payload)` — same transactional guarantees.

### Slice D — Inactive roles enforced (fixes §6)

- `has_permission` and `user_dynamic_roles` resolution both filter `roles.status = 'active'`.
- Assignment dialogs (`AssignRoleDialog`, user provisioning) filter inactive roles.
- Migration to write `role_migration_log` entries when a user's only role becomes inactive; documented behaviour: they retain login but lose module access until reassigned.
- Documented in `docs/rbac/role-lifecycle.md`.

### Slice E — Real role migration (fixes §5)

- `public.rbac_run_role_migration()` returns `{ migrated, matched, custom, warnings, conflicts }` and writes each decision to `role_migration_log`.
- `RoleMigrationRunnerDialog` displays that report with drill-down per role. No role remains unclassified — unmatched roles land in `custom` with a warning row.

### Slice F — Custom roles preserved (fixes §12)

- Save flow detects custom roles (category = `custom` or divergence from template) and skips template rewriting.
- Warning banner in `RoleManagement` when editing a custom role; Advanced Permissions tab always available.
- Unit tests confirm custom permission sets survive re-save.

### Slice G — Validation rules (fixes §11)

- Server-side validator inside `rbac_save_role`: rejects reviewer/approver/manager/delete/publish/export without prerequisite view/edit. Business-worded error strings surfaced via `useCreateRole` error handler.
- Client mirrors the same rules from a shared JSON so messages match, but the DB is the authority.

### Slice H — Summary + sensitive privilege verification (fixes §9, §13)

- `buildRoleSummary` re-reads from the resolved permission IDs (not template); includes scope phrases ("assigned complaints", "sectors: Insurance, Pension").
- Automated test enumerates every access-level × module × sensitive-privilege pair and asserts that lower access levels never resolve to a sensitive permission.

### Slice I — Parity verification (fixes §7, §8, §17)

Replace `verify-rbac-parity.mjs` with `scripts/verify-rbac-parity.ts` that cross-checks four sources:

1. Catalogue (`src/lib/rbac/catalog.json`)
2. UI references (`data-rbac`, `useCan`, `<ModuleRoute>`, sidebar config)
3. Backend enforcement map — generated by scanning `pg_policies`, `pg_proc` bodies, storage policies, and `_shared/authz` calls
4. Scope capability registry

For every module × action × access level it emits a matrix row and fails when UI shows what backend denies, or backend allows what UI hides. Output written to `docs/rbac/audit-2026-07-21/parity-matrix.tsv` and printed as CI summary.

### Slice J — Template validation (fixes §10)

- Unit test iterates `roleTemplates.ts`; each template must pass the same server validators (no missing prerequisites, no sensitive leakage, category correct).

### Slice K — Test + CI closure (fixes §14, §15, §16)

New Vitest files:

- `roleValidation.test.ts`, `sensitivePrivileges.test.ts`, `recordScope.test.ts`, `migration.test.ts`, `transactionRollback.test.ts` (using pg-mem or a Supabase local harness), `inactiveRoles.test.ts`, `templateValidation.test.ts`, `summaryGeneration.test.ts`, `permissionParity.test.ts`, `roleCrud.test.ts`.

New pgTAP files under `supabase/tests/rbac/`:

- `160_role_status.sql`, `170_rbac_save_role_transaction.sql`, `180_scope_enforcement.sql`, `190_migration_log.sql`, `200_grants_and_columns.sql`.

CI (`.github/workflows/ci.yml`): jobs for build, typecheck, eslint, `vitest run`, `pgtap` (via supabase-cli container), `verify-rbac-parity`, `verify-role-migration --dry-run`. No `continue-on-error` on any of these.

### Slice L — Whole-application walk (fixes §17, §18)

Automated inventory script `scripts/rbac-module-walk.ts` renders each module's Menu/Route/List/Create/Edit/Delete/Assign/Approve/Reject/Status/Workflow/Export/Download/RPC/Edge/Storage/RLS/Scope/Sensitive columns and writes `docs/rbac/audit-2026-07-21/module-walk.tsv`. CI diff-checks it against a committed baseline; drift fails the build.

### Final Report

After all slices pass, I will post the exact factual report you specified (commit SHA, migrations, RPCs, files, test counts, matrix links, limitations) and only then use one of the two declarations you mandated.

### Technical notes

```text
Data model
──────────
roles                       (existing) + status filter everywhere
rbac_module_scopes          new — module→allowed scopes + required selectors
role_migration_log          (existing) — expanded columns
scope_config JSONB          normalized to { module: { scope, sectorIds, licenseeIds, departmentIds, teamIds } }

Authorization funnel
────────────────────
UI guard  ─┐
RLS       ─┼─► public.has_permission_scoped(uid, module, action, ctx)
Storage   ─┤       └─ resolves active roles → merges scope_config
RPC/Edge  ─┘       └─ delegates entity checks to existing helpers

Parity oracle
─────────────
catalogue.json  ⇄  UI refs  ⇄  backend enforcement scan  ⇄  scope registry
                       │
                       ▼
             parity-matrix.tsv (CI-enforced)
```

### Explicit non-goals

- No visual redesign of Role Management beyond what's required to remove fake scopes and add real selectors.
- No changes to modules' business logic — only their authorization plumbing.

### Known risk / dependency

The scope-authoritative rewrite (Slice B) touches ~30 RLS policies and ~15 storage policies. Each requires a migration + pgTAP. I will land them module-by-module (Complaints → Returns → Applications → Registration → Conduct → Prudential → F&P → Enforcement → Inspection → Reports → Payments → Forms → Audit → Workflow) so any regression is isolated to one migration.

If any module lacks the backend hooks needed for a scope option (e.g. no `department_id` on a table), I will (a) surface it in the final report as a limitation, (b) remove that scope option from the capability registry so the UI cannot offer it, and (c) propose the schema change — never leave metadata-only enforcement in place.