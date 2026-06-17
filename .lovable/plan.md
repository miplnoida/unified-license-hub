# Unified RBAC: Single Permission Framework

Replace the parallel "external portal access" system with the existing dynamic Role Management engine. All users (internal and external) get roles from one table, permissions from one catalog, and one runtime check.

## Target Roles (seeded as system roles)

1. Applicant
2. Regulated Entity User
3. Licensing Officer
4. Analyst
5. Legal/Compliance Reviewer
6. Approver/Decision-Maker
7. Prudential Supervisor
8. Market Conduct Supervisor
9. Committee Member
10. Executive Supervisor
11. System Administrator

Auto-assignment:
- Registration (pre-license) → Applicant
- Approved licensee user (primary/secondary) → Regulated Entity User
- Internal users → assigned by System Administrator via /admin/roles

## Permission Model

One catalog (`permissions` table, existing). Permissions are `module.action` pairs, granular and object-level when combined with RLS. Examples:

- `licensing.submit`, `licensing.view_status`, `licensing.upload_documents`, `licensing.respond_rfi`
- `returns.submit`, `returns.view`, `returns.upload_documents`, `returns.respond_rfi`
- `complaints.submit`, `complaints.view`, `complaints.upload_documents`
- `fp_declarations.submit`, `fp_declarations.view`
- existing internal modules untouched (`form_management`, `workflow_management`, etc.)

Object-level scoping (which entity/application a user can see) stays in RLS — RBAC says *what action*, RLS says *which rows*.

## DB Migration

1. Seed `permissions` with the new portal-area actions (idempotent insert).
2. Seed/upsert the 11 system roles into `roles` (is_system=true) with their default permission sets via `role_permissions`.
3. Backfill `user_dynamic_roles` for existing external users:
   - pre_license_users + applicants → "Applicant" role
   - licensee_primary / licensee_secondary profiles → "Regulated Entity User" role
4. Update `seed_external_portal_defaults` (and the two edge functions that call it) to insert into `user_dynamic_roles` instead of `external_portal_access`.
5. Drop dependencies on the legacy tables:
   - `external_portal_access`
   - `external_portal_roles`
   - `external_portal_role_capabilities`
   - `external_user_portal_roles`
   - function `has_portal_capability`
   Tables are dropped after backfill in the same migration.

## Frontend Changes

- `src/types/platform.ts`: keep `AppRole` (system role grouping) but treat the dynamic role as the source of truth for permissions. Add `regulated_entity_user` mapping for licensee_primary/secondary at the display layer only.
- `src/hooks/useUserDynamicPermissions`: already the single check engine — extend `enforceDynamic` so it also applies to external users (currently only `super_admin` bypass + internal admins). All users with at least one dynamic role get gated by permissions.
- `FormRenderer.tsx`: replace `useExternalPortalAccess` / `submitCapabilityFor` with `hasPermission('licensing','submit')` etc., parameterised by `portalArea`.
- `SubmittedForms.tsx`, `LicenseeDashboard.tsx`, `ApplicantDashboard.tsx`: swap `can(...)` calls for `hasPermission(...)`.
- Delete:
  - `src/pages/admin/ExternalPortalAccess.tsx`
  - `src/hooks/useExternalPortalAccess.ts`
  - `src/hooks/useExternalPortalRoles.ts`
  - `src/hooks/useExternalUserPortalRoles.ts`
  - `src/lib/externalPortalRoles.ts`
  - `src/lib/portalAccess.ts`
  - `src/lib/portalAreaForContext.ts`
  - route `/admin/external-portal-access` and its sidebar/Admin Hub entry
- `RoleManagement` page: surface the new portal modules in its existing module-grouped permission picker so admins can edit them like any other permission.

## Route & Menu Gating

No change to the engine — `ModuleRoute` + `getModuleForPath` already drives both sidebar visibility and route access via `hasModuleAccess`. New portal modules (`licensing`, `returns`, `complaints`, `fp_declarations`) join the existing `ROUTE_MODULE_MAP` for the licensee/applicant portal paths.

## Verification

- `bunx vitest run` (RouteGuards, registrationApprovalGate, workflow tests).
- Manual: log in as a backfilled licensee_primary, confirm Submit/Upload still work on a licensing form, and that disabling the `licensing.submit` permission on the "Regulated Entity User" role disables Submit live (no code change).
- Manual: register a new applicant; confirm the "Applicant" role is auto-assigned and they reach the application form.
- `supabase--linter` after migration; fix any RLS warnings introduced.

## Out of Scope

- Restructuring RLS policies on business tables (kept as-is; they already isolate by user/entity).
- Internal Role Management UI redesign (additive only — same UI, more modules visible).
- Workflow/notification engine changes.
