## Goal

Finish the Roles & Permissions hardening. Only `super_admin` bypasses. Existing static-admin users are migrated to an explicit "Legacy Admin" dynamic role. Entity assignment is a **separate capability**, never a synthetic `returns_management.view`. Real route guards, sidebar, buttons, RLS, storage, RPCs, reports/exports, and tests all use the same module/action keys.

Not a redesign — reuse `useUserDynamicPermissions`, `PermissionGate`, `ModuleRoute`, `permissionModules.ts`, existing tables (`permissions`, `role_permissions`, `user_dynamic_roles`, `licensees` assignment columns), and current RLS helpers.

---

## 1. Permission hook — remove admin bypass, split assignment capability

`src/hooks/usePermissions.ts`

- Bypass: only `user.role === 'super_admin'`. Drop `isLegacyAdmin` bypass.
- `hasPermission(module, action)`: strict catalog match. **Never** returns true from assignment. Remove the `actionKey === 'view' && isAssignmentUnlockedModule` branch.
- `hasModuleAccess(module)`: strict `view` on module. **Never** assignment-unlocked. Remove `isAssignmentUnlockedModule` branch.
- New, explicit assignment surface (returned alongside existing helpers):
  - `hasAssignmentReturnQueueAccess: boolean` — true when `hasAnyEntityAssignment` and user is internal.
  - `isAssignmentAllowedReturnsPath(pathname)` — narrow allow-list (queue list, `/admin/returns/queue/:id`, `/admin/returns/view/*`, `/entity/returns/*`). Explicit deny for every config/analytics/notification/schedule/ratio/threshold/late-fee/due-date/cutoff/return-type path.
  - `canViewAssignedReturn({ licenseeId, status })` — true only if `assignedLicenseeIds.includes(licenseeId)` **and** `status ∈ SUBMITTED_LIFECYCLE_STATUSES`.
- `canAccessPath(pathname)`:
  - Unmapped + `isProtectedInternalPath` → deny.
  - Mapped → require `hasPermission(module, 'view')`, OR (module === `returns_management` AND `hasAssignmentReturnQueueAccess` AND `isAssignmentAllowedReturnsPath(pathname)`).

## 2. Canonical submitted-lifecycle status helper

New `src/lib/returnLifecycle.ts`:

```
SUBMITTED_LIFECYCLE_STATUSES = ['submitted','under_review','approved','rejected','resubmission_required', ...]
export const isSubmittedLifecycle = (s) => SUBMITTED_LIFECYCLE_STATUSES.includes(...)
```

Reused in: hook (`canViewAssignedReturn`), Return Queue filter, Return detail gate, attachment download, reports/exports, dashboard counters, `can_view_entity_returns` (via `return_status_is_submitted_lifecycle(text)` SQL helper mirroring the same list).

## 3. Real route guards

`src/components/auth/RouteGuards.tsx` + `src/routes/returnsRoutes.tsx` + `src/routes/adminRoutes.tsx`

- `ModuleRoute` now reads `useLocation()` and enforces:
  1. `super_admin` → allow.
  2. `hasPermission(module, 'view')` → allow.
  3. Else if `module === 'returns_management'` AND `hasAssignmentReturnQueueAccess` AND `isAssignmentAllowedReturnsPath(location.pathname)` → allow.
  4. Else → `<AccessDenied />`.
- Remove any use of `hasModuleAccess(module)` inside `ModuleRoute` that could unlock the whole module for assignment users.
- New `ReturnsQueueRoute` wrapper for the queue path pair (`/admin/returns`, `/admin/returns/queue`, `/admin/returns/queue/:id`, `/admin/returns/view/*`) — same helper, made explicit for readability.
- Every Returns admin/config route (`return-config`, `returns/types`, `cutoff`, `due-dates`, `late-fees`, `notifications`, `schedule`, `validations`, `thresholds`, `ratios`, `analytics`, `dashboard`) uses plain `ModuleRoute` — assignment path predicate returns false, so guard denies.

## 4. Route map completeness

`src/lib/permissionModules.ts`

- Remove any generic `/admin ⇒ settings` fallback.
- Add explicit entries for every internal route grep'd from `src/routes/*`: RFI rules, supervisory templates, bulk intake, sufficiency rules, decision options, case audit, integration logs, rule overrides, conduct admin, prudential pages, fit-and-proper admin, all returns pages, notification & master-data pages, workflows, forms, fees, users, roles.
- Export `PROTECTED_INTERNAL_PATH_PREFIXES` (already present) — keep, extend with any newly discovered prefix.
- Add `src/test/routeModuleMap.test.ts` — walks `src/routes/*.tsx`, extracts `<Route path=...>` strings, asserts each protected path resolves to a non-null module OR is on an explicit "public/utility" allow-list.

## 5. Sidebar visibility

`src/components/layout/*Sidebar*` (identify exact files at build time — likely `AppSidebar.tsx`, `sidebarConfig.ts`)

- Standard items: visible iff `hasPermission(item.module, 'view')`.
- Returns group: parent hidden unless `hasPermission('returns_management','view')`. If only `hasAssignmentReturnQueueAccess`, render a flat "Return Queue" entry and nothing else — no Types/Config/Cutoff/Due Dates/Late Fees/Schedule/Notifications/Validations/Thresholds/Ratios/Analytics/Dashboard.
- Add `src/test/sidebar.rbac.test.tsx` rendering the real sidebar under three personas: super_admin, view-only, assignment-only.

## 6. Button-level gating (PermissionGate audit)

Wrap every business action across modules with `<PermissionGate module=... action=...>`. Action keys: `create | edit | delete | approve | reject | assign | export | download | upload | bulk | status_change | configure | workflow_action | reopen | resubmit | finalize | escalate | issue | publish | archive`.

Modules to sweep (files identified at build time via grep for `<Button` in each page dir):

- Applications (Queue, Detail, RFI, Legal Notes)
- Licenses / Licensees (Detail tabs, WebUsers, BackgroundInfo)
- Registration Review
- Returns (Queue, Detail, UploadPanel, EditRequest, config pages)
- Complaints
- Fit & Proper
- Prudential
- Market Conduct
- Twin Peaks Coordination
- Reports (Export/Download)
- Users, Roles, Forms, Workflows, Fees, Settings

## 7. Return Queue restrictions for assignment-only users

`src/pages/admin/ReturnsQueue.tsx` / `ViewReturns.tsx` / `ReturnDetail.tsx`

- Compute `mode = 'assignment_only' | 'permitted' | 'view_all'` from the hook.
- Assignment-only:
  - Filter list to `assignedLicenseeIds` × `isSubmittedLifecycle(status)`.
  - Hide filters: draft, WIP, TEMP, due-soon.
  - Hide toolbar buttons: Export, Bulk, Create.
  - Hide row actions: Edit, Approve/Reject, Edit Request, Workflow, Upload, Delete.
  - Download hidden unless `hasPermission('returns_management','download_documents')`.
  - Only "View" enabled.
- Permitted users keep current behaviour (gated by per-action PermissionGate).

## 8. Role Management validation

`src/pages/admin/RoleManagement*` (locate at build time)

- Dependent actions (`create|edit|delete|approve|reject|assign|export|download|upload|bulk|configure|status_change|workflow_action|...`) require `view` on same module.
- Behaviour: auto-check `view` when a dependent action is toggled on; disable removing `view` while any dependent remains. Save also blocks with toast if invalid combination detected server-echoed.
- Orphaned-permission panel: cross-reference `permissions` rows against a static `permissionRegistry` (menus + routes + button gates + RLS action list) — anything unreferenced shown as "Unsupported / not enforced" with the surface it's missing from.

## 9. Backend: has_permission + RLS + storage

Single migration `rbac_hardening_<timestamp>`:

1. `create or replace function public.has_permission(_user_id uuid, _module text, _action text) returns boolean language sql stable security definer set search_path = public` — joins `user_dynamic_roles → role_permissions → permissions`. Only `super_admin` (via `has_role`) bypasses. Case-insensitive on module/action.
2. Legacy Admin backfill (idempotent):
   - `insert into public.roles(name, description) values ('Legacy Admin', ...) on conflict do nothing`.
   - Populate `role_permissions` with every `(module, view/create/edit/delete/approve/reject/assign/export/download/upload/bulk/configure/status_change/workflow_action)` present in `permissions`.
   - `insert into public.user_dynamic_roles(user_id, role_id) select p.id, legacy_role_id from public.profiles p where p.system_role = 'admin' and not exists (select 1 from public.user_dynamic_roles udr where udr.user_id = p.id)`.
3. `can_view_return_filed(return_id)` / `can_view_entity_returns(licensee_id, status)` rewrites:
   - `super_admin` → true.
   - `has_permission(uid,'returns_management','view_all_entities')` AND `return_status_is_submitted_lifecycle(status)` → true.
   - `has_permission(uid,'returns_management','view')` AND existing scope rules → true.
   - Assignment (lead/regulator/alternate on licensee) AND `return_status_is_submitted_lifecycle(status)` → true. **Assignment alone no longer relies on `returns_management.view`.**
   - Preserve creator/PPOC/entity-user/external/workflow-approver branches unchanged.
4. Storage policies for `returns` bucket read: mirror `can_view_return_filed` on the linked return row. Upload/replace/delete require explicit action permission via `has_permission`.
5. Write policies on `returns_filed`, `return_form_data`, `return_documents`, `return_audit_log`, `return_comments`, `return_calculated_ratios`, `return_edit_requests`, `return_upload_attempts`, `return_upload_imports`: switch each action to `has_permission(uid,'returns_management','<specific action>')`. `view_all_entities` gives no write.
6. Report/RPC/search functions returning returns rows: pipe through `can_view_return_filed`, either as a WHERE join or SECURITY DEFINER wrapper.

## 10. Tests

Frontend (Vitest):

- `permissionsRbac.test.tsx` — extend: static-admin without dynamic role is denied post-migration model; view-only user; edit-without-view denied; unknown protected route denied.
- `sidebar.rbac.test.tsx` — new; three-persona render assertions.
- `regulatorAssignment.test.tsx` — extend: assignment-only sees only Return Queue in sidebar; `ModuleRoute` denies every returns config path; Return Queue toolbar hides Export/Bulk/Create; row hides Edit/Approve/Download; only submitted-lifecycle rows appear.
- `returnQueueAssignmentOnly.test.tsx` — new; renders real page under mocked hook + supabase query, asserts filter chips/status filter hidden.
- `routeModuleMap.test.ts` — new; every protected route mapped.
- `permissionCoverage.test.ts` — new; per permission key print surfaces it's enforced on (menu/route/button/rls listed via a hand-maintained `permissionRegistry`).

Backend (pgTAP under `supabase/tests/regulator_access/`):

- `02_has_permission.sql` — matrix test of the helper.
- `03_returns_rls_matrix.sql` — unmapped internal denied; view user sees permitted; assignment-only sees mapped submitted, not TEMP/WIP/draft/due-soon, not unmapped entity; view_all sees all submitted, no write; storage download allowed only for permitted submitted; direct row access denied for unassigned.
- `04_legacy_admin_backfill.sql` — after migration each pre-existing static admin has the Legacy Admin dynamic role and every action listed in the plan resolves via `has_permission`.

## 11. Delivery report (emitted at completion)

- Files changed
- Migration names
- Permission keys used (module × action matrix)
- Admin users migrated (count + role name)
- Menus updated
- Routes updated (with module mapping table)
- Buttons protected, grouped by module
- RLS policies updated
- RPCs / functions updated
- Storage policies updated
- Orphaned permissions found
- Tests added + `vitest run` / pgTAP results
- Remaining limitations (any orphans deliberately not wired)

---

## Technical notes / risks

- **Legacy Admin backfill is the load-bearing step.** Any existing static-admin user that isn't migrated will lose access the moment the `super_admin`-only bypass ships. The migration seeds Legacy Admin with full action coverage across every module currently in the `permissions` table, then inserts `user_dynamic_roles` rows for every `profiles.system_role='admin'` user missing a dynamic role. Idempotent.
- **Assignment split is a behaviour change**, not just wording: any code path that previously relied on `hasPermission('returns_management','view')` returning true for assignment-only users must now use `hasAssignmentReturnQueueAccess` / `canViewAssignedReturn`. Grep sweep in build mode before flipping.
- **Route map completeness is enforced by a test**, so any newly added route without a module mapping breaks CI — intentional.
- Status list must be defined once and mirrored in SQL. A drift test (`03_returns_rls_matrix.sql`) checks the SQL list against a JSON snapshot committed alongside `returnLifecycle.ts`.
- `view_all_entities` explicitly does not imply any write action — enforced at RLS write-policy level, not just UI.
