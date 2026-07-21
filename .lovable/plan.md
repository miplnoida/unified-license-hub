# Roles & Permissions — Business-Facing Simplification

This plan reshapes the **UI** of Role Management around business language (module access levels, record scope, sensitive privileges) while keeping the backend permission catalog, RLS, RPCs, Edge Functions and storage policies exactly as granular as they are today. Backend enforcement is deny-by-default and stays authoritative. The scope is large — I've broken it into ordered slices so each is verifiable before moving on.

## Guiding principles

- **UI simplifies, backend does not weaken.** Every business selection maps to real granular permission keys already enforced in RLS/RPCs/Edge/Storage. Nothing is granted "just to make it work".
- **Deny-by-default preserved.** No module access → no menu, route, data, action. Access levels never imply sensitive privileges.
- **One source of truth.** A single `accessLevelMap` file drives: preset expansion, reverse classification of existing roles, and the plain-language summary.
- **Backend stays.** No changes to RLS/RPC/Edge/storage authorization logic. Only the row a role writes into `role_permissions` changes shape (still granular keys).

## Slices

### S1 — Access-level mapping (source of truth)
- Create `src/lib/rbac/accessLevels.ts` defining:
  - `AccessLevel = 'none' | 'view' | 'contributor' | 'reviewer' | 'approver' | 'manager'`
  - Per-module supported levels and level→permission-keys mapping, built on the existing `MODULE_REGISTRY` and enforced permission catalog (`permissions.enforced = true` only).
  - `expandLevel(module, level): PermissionKey[]`
  - `classifyRole(permissionKeys[]): { module, level, custom }` — reverse map for existing roles; if the set doesn't match any level exactly, mark **Custom** and preserve raw keys.
  - Sensitive-privilege registry (delete, publish, override workflow, manage users/roles, configure workflows, bulk actions, view-all-entities, export confidential, issue/suspend/revoke, access audit).
  - Record-scope options per module (own / assigned / team / department / regulator / sectors / all) — UI-only labels resolving to existing scope columns (`user_dynamic_roles`, entity assignments, `view_all_entities` flag). No new scope semantics are invented; only options that already have backend enforcement are exposed.
- Business labels for every permission (`View forms`, `Create forms`, …) in `src/lib/rbac/permissionLabels.ts`.

### S2 — Redesigned Role editor UI
Replace the current matrix in `src/pages/admin/RoleManagement.tsx` with a stepped/tabbed editor:
1. **Role details** — name, description, role type (Operational / Reviewer / Approver / Supervisor / Administrator / Read Only / Custom), active toggle. Role type only *prefills*.
2. **Module access** — grouped cards per business module (Dashboard, Applications, Licensing, Registration, Form Management, Complaints, Returns, F&P, Prudential, Market Conduct, Enforcement, Inspections, Reports, Workflows, Notifications, Users, Roles, Settings, Audit Logs, Fees & Payments). Each card shows only the levels meaningful for that module. Business-friendly action labels appear beneath the selected level so the admin sees exactly what the role can do.
3. **Record scope** — per-module scope selector, only where backend supports it (Complaints, Returns, Licensing, Enforcement, Inspections, F&P, Prudential, Market Conduct).
4. **Sensitive privileges** — separate section with warning styling; nothing here is auto-granted by a level, even Manager.
5. **Review & summary** — plain-language "This role can / cannot" list, generated from the actual expanded permission set + scope + sensitive privileges (no misleading summaries).
6. **Advanced permissions** (collapsed, super-admin only) — raw permission checkboxes with technical keys shown as secondary text, with a warning when they diverge from the selected level.

Existing dependency auto-fix (edit⇒view, etc.) stays and runs on the expanded key set before save. No dependency errors surface to the business user — resolution is silent, with a plain-language notice.

### S3 — Templates (non-locking)
Add optional templates (Read-Only User, Licensing Officer/Reviewer/Approver, Complaints Officer/Supervisor, Returns Reviewer, Prudential Analyst, Market Conduct Analyst, Enforcement Officer, Inspector, Auditor, System Administrator, Custom). Selecting a template pre-populates access levels and scope; the admin can still change anything.

### S4 — Hide developer-facing tools from business navigation
- Remove from normal admin nav: Permission Coverage report page, RPC map link, RLS/storage/edge coverage links, Orphan Permission report, raw catalog view.
- Move `/admin/permission-coverage` and related dashboards behind a super-admin-only "System Diagnostics" area (route + sidebar entry gated by `is_super_admin`). Coverage scripts, CI, and docs remain untouched.
- Verify `docs/rbac/*` links, sidebar entries in `src/config/navigation.tsx`, and any dashboard cards linking to these reports.

### S5 — Existing role migration (data + UI)
- SQL migration: for each existing role, read its `role_permissions`, run the classifier logic in a PL/pgSQL function that mirrors S1 (or emit a JSON summary consumed by a one-shot backfill Edge Function using service role) and populate two new columns on `roles`:
  - `role_type text` (nullable)
  - `access_summary jsonb` — `{module: {level, scope, sensitive: []}}` — used for display; **granular `role_permissions` rows remain authoritative**.
- Roles whose keys don't match any level cleanly are stored with `access_summary.<module>.level = 'custom'` and their raw keys remain visible under Advanced Permissions. **No permission is added or removed** — access is preserved exactly.
- Migration report table `role_migration_log` records classification per role for admin review.

### S6 — Backend safety net (no functional change, only guardrails)
- No new RLS/RPC/Edge/storage logic. Reconfirm that the existing `role_permissions` dependency trigger, orphan trigger, and `has_permission` continue to gate everything. Any keys the new UI writes are already in the enforced catalog — the trigger will reject stray keys, which is the desired invariant.
- Add a pgTAP test asserting: for every access level of every module, expanding it yields only `permissions.enforced = true` keys.

### S7 — Frontend enforcement audit (no scope change, verification only)
Because the request insists menus/routes/buttons/data all follow permissions, run the existing coverage scanner and confirm the new mapping produces the same or stricter guards. Nothing to build here beyond fixing any regression the S2 refactor introduces in `RoleManagement.tsx` itself (its own action buttons must remain gated by `role_management.edit/create/delete`).

### S8 — Tests
- Vitest:
  - `accessLevels.test.ts` — round-trip: expand(level) → classify() returns same level; sensitive privileges never included in Manager expansion unless declared.
  - `roleEditor.test.tsx` — selecting Contributor for Form Management writes exactly `form_management.view/create/edit`; Sensitive Privileges section is the only path to `delete`/`publish`.
  - `roleMigration.test.ts` — fixtures of representative existing roles classify without access drift; ambiguous set → Custom.
- pgTAP: level→enforced-keys assertion (S6).
- Manual scenarios documented in `docs/rbac/business-role-scenarios.md` covering the four scenarios in the spec (Form View-Only, Form Contributor, Complaints View-Only+Assigned, Licensing Approver+Assigned).

### S9 — Documentation
- New `docs/rbac/business-roles.md` — screenshots + how access levels, scope, sensitive privileges relate.
- Update `docs/rbac/README.md` to point business users at the new page and developers at the still-existing coverage scripts.

## Out of scope (explicitly)

- No changes to RLS policies, RPC signatures, Edge Function authz, storage policies, `has_permission`, `can_view_entity_returns`, or any assignment-only logic. These already enforce the model the spec demands; the UI change does not need them altered.
- No new "role testing" feature.
- No changes to how record scope is stored server-side beyond exposing existing scope columns under friendlier labels.

## Technical details

**Files added**
- `src/lib/rbac/accessLevels.ts`, `permissionLabels.ts`, `scopeOptions.ts`, `sensitivePrivileges.ts`, `roleTemplates.ts`
- `src/pages/admin/role-management/` — `RoleEditor.tsx`, `ModuleAccessCard.tsx`, `RecordScopePanel.tsx`, `SensitivePrivilegesPanel.tsx`, `RoleSummary.tsx`, `AdvancedPermissionsPanel.tsx`, `TemplatePicker.tsx`
- `docs/rbac/business-roles.md`, `docs/rbac/business-role-scenarios.md`
- Vitest + pgTAP tests as listed

**Files modified**
- `src/pages/admin/RoleManagement.tsx` — swap matrix for `RoleEditor`; keep list/clone/status flows
- `src/config/navigation.tsx` — move diagnostics under super-admin group
- `src/routes/adminRoutes.tsx` — gate coverage/diagnostics routes to `is_super_admin`

**Migrations**
- `roles.role_type text`, `roles.access_summary jsonb`
- `role_migration_log` table
- Backfill statement classifying every existing role via a `plpgsql` function that mirrors `accessLevels.ts` (kept in sync via a generator script) — **no `role_permissions` rows inserted or deleted**; only descriptive columns populated
- pgTAP test file `supabase/tests/rbac/20_access_levels.sql`

**Risks / mitigations**
- *Level ↔ granular mismatch drift* → single generator script `scripts/generate-access-level-sql.ts` derives the PL/pgSQL classifier from `accessLevels.ts`; CI runs it and fails on diff.
- *Silent access change during migration* → migration is **description-only**; `role_permissions` untouched. Any UI change to a role writes fresh granular keys through the same dependency + orphan triggers.
- *Business users hitting "Custom" wall* → the editor renders Custom roles read-only in the level view with a clear "This role uses advanced permissions — open Advanced to edit" affordance.

## Verification checklist (per completion requirements)

Before declaring done: build, `tsgo`, `vitest run`, pgTAP suite, and manual walkthrough of the four spec scenarios (Form View-Only, Form Contributor, Complaints View-Only+Assigned, Licensing Approver+Assigned) using existing seeded users. Report will list commit SHA, files changed, migrations, screens updated, diagnostics moved, level mappings, scope options, sensitive privileges list, roles migrated (with counts of Custom), and verification results.
