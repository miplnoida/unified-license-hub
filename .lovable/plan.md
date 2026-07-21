## Goal

Fix the Roles & Permissions module so unmapped internal users are denied by default, menus/routes require `view`, actions require their specific permission, unknown protected routes are denied, and the assignment-only regulator rule stays a narrow exception. Align frontend, backend, and tests.

## 1. Core hook rewrite — `src/hooks/usePermissions.ts`

Change the enforcement model:

- `super_admin` → always allowed (bypass).
- Legacy admin fallback → **removed** for the general case. Replace `!enforceDynamic ⇒ allow all` with `!enforceDynamic ⇒ deny all` for internal users. Keep a narrow exception only for `user.role === 'super_admin'`. Any real "admin" account must be given an explicit dynamic role; document this in the plan and surface a one-time DB seed to map existing `admin` users to a "Legacy Admin" dynamic role that carries all `view/create/edit/...` permissions so we don't break real admins.
- `hasModuleAccess(module)` → true only if the user has **any permission whose action is `view`** on that module (menus are view-gated), or the assignment-unlock rule applies.
- `hasPermission(module, action)` → strict match, no fallback.
- `canAccessPath(pathname)`:
  - If `getModuleForPath` returns `null` **and** the path is under a protected prefix (`/admin`, `/settings`, `/workflows`, `/reports`, `/analytics`, `/fit-and-proper`, `/conduct`, `/coordination`, `/prudential`, `/payments`, `/complaints`, `/supervision`, `/delegation-rules`, `/change-sector`) → **deny** (previously allowed).
  - If module resolved → require `view` on that module (not just "any permission on module").
- Assignment-only regulator exception stays, but tightened:
  - `isAssignmentAllowedReturnsPath` restricted to exactly: `/admin/returns`, `/admin/returns/queue`, `/admin/returns/queue/:id`, `/admin/returns/view/*`, `/entity/returns/*`. Explicitly exclude `/admin/returns/config`, `/admin/return-config`, `/admin/returns/types`, `/admin/returns/cutoff`, `/admin/returns/due-dates`, `/admin/returns/late-fees`, `/admin/returns/notifications`, `/admin/returns/schedule`, `/admin/returns/validations`, `/admin/returns/thresholds`, `/admin/returns/ratios`, `/admin/returns/analytics`.
  - Assignment implicitly grants only `returns_management.view` — never create/edit/approve/reject/export/download/upload/configure.

## 2. Remove generic `/admin` → `settings` fallback — `src/lib/permissionModules.ts`

- Drop the trailing `['/admin', 'settings']` catch-all.
- Add explicit entries for every real admin route (audit findings + `docs/`), each mapped to its true module.
- Introduce `PROTECTED_PATH_PREFIXES` used by `canAccessPath` to enforce "unknown protected route ⇒ deny".

## 3. Route guards — `src/components/auth/RouteGuards.tsx` & `src/routes/routeHelpers.tsx`

- `ModuleRoute`: require `hasPermission(module, 'view')`, not `hasModuleAccess`. Keep internal-audience check.
- `ProtectedRoute` / `RegistrationApprovalGate`: for approved internal users on a protected prefix with no mapped module, route through `canAccessPath` (now deny-by-default). Non-internal users unchanged.
- `PortalRoute`: unchanged for external users; `useExternalPortalAccess` continues to use `hasPermission`.

## 4. Sidebar / menu visibility

- Wherever the sidebar builds items using `hasModuleAccess`, switch to `hasPermission(module, 'view')`. Files to touch: sidebar config + `src/components/layout/*` (need to view exact file). This ensures `create`-only users don't see the menu.
- Return Queue menu: visible if `hasPermission('returns_management', 'view')` OR (`hasAnyEntityAssignment` AND path is queue only). Other Returns admin submenus require the specific config permission.

## 5. Action-level gating with `PermissionGate`

Audit every action button and wrap with `<PermissionGate module="..." action="...">`. Standard action keys: `create`, `edit`, `delete`, `approve`, `reject`, `assign`, `export`, `download`, `upload`, `bulk`, `status_change`, `configure`, `workflow_action`. Focus files (list confirmed to have unprotected buttons via grep to run in build mode):

- Applications: `src/pages/admin/ApplicationsQueue.tsx`, `ApplicationDetail.tsx`
- Returns: `src/pages/admin/ReturnsQueue.tsx`, `ReturnDetail.tsx`, `ReturnUploadPanel.tsx`, `ReturnEditRequest*`, config pages
- Complaints: `ComplaintsList.tsx`, `ComplaintDetail.tsx`
- Licenses/Licensees: `LicenseeDetail.tsx`, `WebUsersTab.tsx`, `BackgroundInfoTab.tsx`
- Fit & Proper, Conduct, Coordination, Prudential list/detail pages
- Reports: export/download buttons
- Users/Roles/Forms/Workflows/Fees admin pages

## 6. Role Management UI validation

`src/pages/admin/RoleManagement*` (identify exact file in build mode):

- Add client validation: if any of `create|edit|delete|approve|reject|export|download|upload|assign|bulk|configure|status_change|workflow_action` is checked for a module, force-check `view` (auto-select) and disable unchecking `view` until dependents are cleared. If user tries to save invalid combo, block with toast.
- Add a "Permission linter" panel that flags orphaned catalog entries (permissions in DB not referenced by any route/menu/button in `permissionRegistry`).

## 7. Backend alignment

Migration:

- Update `public.can_view_entity_returns` / `public.can_view_return_filed` so that assignment-based access:
  - Applies to any status for mapped entities (current behavior) — but stays **assignment-only** (no admin/config routes affected; that's a UI/RLS distinction: config tables get their own policies unchanged).
  - Does not imply `view_all_entities`.
- Storage policies for `returns` bucket: mirror `can_view_return_filed`; downloads only when read is allowed. Uploads still require explicit `returns_management.upload_documents` or ownership.
- Audit RLS on `returns_filed`, `return_form_data`, `return_documents`, `return_audit_log`, `return_comments`, `return_calculated_ratios`, `return_edit_requests`, `return_upload_attempts`, `return_upload_imports` to confirm they route through `can_view_return_filed` and that write policies check specific `returns_management.<action>` permissions (not just `view`).
- Search / dashboard / report RPCs that return returns rows: run them through `can_view_return_filed` filter or SECURITY DEFINER wrappers that call it.
- Add `has_permission(_user_id uuid, _module text, _action text)` SECURITY DEFINER helper so RLS/RPCs can consult the unified catalog directly (mirrors frontend hook).

## 8. Tests

Frontend (Vitest):

- `src/test/permissions.rbac.test.tsx`:
  - super_admin bypass
  - admin mapped to dynamic role → uses dynamic perms
  - internal user with no mapping → denied
  - user with `edit` only, no `view` → menu hidden, route denied, edit button hidden until `view` present (post-validation)
  - user with `view` → menu shown, route allowed, action buttons still hidden without their action perm
  - unknown protected route → denied
- `src/test/regulatorAssignment.test.tsx` (extend):
  - assignment-only regulator sees Return Queue menu only
  - cannot open Return Types / Config / Cutoff / Due Dates / Late Fees / Notifications / Schedule / Validations / Thresholds / Ratios / Analytics
  - export/download/edit hidden
  - `view_all_entities` grants read-only across all submitted returns, no edit/approve/export

Backend (pgTAP under `supabase/tests/regulator_access/`):

- Direct API denial for unmapped internal user on `returns_filed`
- Assignment-only regulator can select mapped entity returns, cannot select others
- Storage policy denies download for non-permitted rows
- `has_permission` matches frontend semantics for a fixture matrix

## 9. Deliverables reported at completion

- Files changed list
- Permission keys used (module + action matrix)
- Menus & routes updated
- Buttons protected (per module)
- Backend policies/functions updated (with migration name)
- Test results (Vitest + pgTAP)
- Remaining limitations (any orphaned catalog entries flagged but not wired)

## Technical notes / risks

- Removing the legacy admin fallback is a **breaking change** for any real admin currently relying on it. Mitigation: same-migration seed that maps any user with `system_role='admin'` (and no dynamic role) into a new `Legacy Admin` dynamic role holding full permissions. Documented as a one-shot backfill; new admins must be granted a dynamic role.
- The generic `/admin ⇒ settings` fallback removal may block routes we haven't enumerated. Mitigation: add every existing `/admin/*` route to `ROUTE_MODULE_MAP` up front (grep the router in build mode) before flipping the deny-by-default switch.
- pgTAP changes require the CI Supabase test job — already wired.
