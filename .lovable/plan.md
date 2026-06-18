## Goal

Replace the current complex role/permission UI with a **simple, opinionated RBAC** built around the 11 roles you listed. Permissions stay granular (per module × action), but admins no longer build roles from scratch — they pick a role and tweak.

No changes to: routes, sidebar wiring, workflow engine, RLS, edge functions, or how `useUserDynamicPermissions` resolves access at runtime. This is a **seed + UX** change only.

## The 11 Roles (seeded as system roles)

| Role | Scope |
|---|---|
| Applicant | External — submit & track own applications |
| Regulated Entity User | External — licensee portal (returns, complaints, FP) |
| Licensing Officer | Internal — intake & process applications |
| Analyst | Internal — review & analyse submissions |
| Legal/Compliance Reviewer | Internal — legal/compliance sign-off |
| Approver / Decision-Maker | Internal — approve/reject applications & licenses |
| Prudential Supervisor | Internal — prudential returns oversight |
| Market Conduct Supervisor | Internal — complaints & conduct oversight |
| Committee Member | Internal — read-only review + committee approve |
| Executive Supervisor | Internal — cross-module read + approve |
| System Administrator | Internal — full admin (users, roles, settings, forms, workflows) |

Super Administrator stays as the built-in bypass (unchanged).

## What changes

### 1. Seed the 11 roles with sensible default permissions
Migration inserts the 11 roles into `public.roles` (marked `is_system = true`, idempotent on name) and maps each to a curated set of rows in `role_permissions` using existing `permissions` rows. No new tables, no new columns beyond an `is_system boolean default false` flag on `roles` if not already present.

Default permission matrix (module → actions) per role — summary:

```text
                              app  lic  reg  ret  cmp  usr  rol  rpt  fee  frm  wf   set
Applicant                     v,c,e .    .    .    .    .    .    .    .    .    .    .
Regulated Entity User         v    v    .    v,c,e v,c,e .    .    .    .    .    .    .
Licensing Officer             v,c,e v,e  v,e  .    .    .    .    v    .    .    .    .
Analyst                       v,e  v    v    v    v    .    .    v    .    .    .    .
Legal/Compliance Reviewer     v,e  v    v    v    v,e  .    .    v    .    .    .    .
Approver / Decision-Maker     v,a,r v,a v,a,r v,a v,e  .    .    v    .    .    .    .
Prudential Supervisor         v    v    .    v,e,a v   .    .    v    .    .    .    .
Market Conduct Supervisor     v    v    .    .    v,e,a .    .    v    .    .    .    .
Committee Member              v,a  v,a  v,a  v,a  v    .    .    v    .    .    .    .
Executive Supervisor          v,a  v,a  v,a  v,a  v,a  .    .    v    v    .    .    v
System Administrator          ALL across every module
```
(v=view, c=create, e=edit, a=approve, r=reject)

### 2. Simplify Role Management UI (`src/pages/admin/RoleManagement.tsx`)

- New top-level layout: **left pane lists the 11 system roles + any custom roles; right pane shows that role's permissions grouped by module.**
- System roles are clearly badged ("System role") and:
  - cannot be renamed or deleted
  - permissions are editable (so admins can fine-tune), with a "Reset to defaults" button per role
- "Create custom role" button still available for org-specific roles (kept minimal — name, description, permissions).
- Remove the "Uncategorised / Legacy Permissions" complexity from the primary view; collapse it behind a small "Show legacy permissions" toggle (kept for safety, hidden by default).
- Health indicator stays but slimmed to: "11 system roles • N custom roles • M permissions mapped".

### 3. Keep runtime behaviour identical

- `useUserDynamicPermissions`, `PermissionGate`, `ModuleRoute`, `PortalRoute`, sidebar visibility — **untouched**.
- `user_dynamic_roles` mapping table — untouched. Assigning a user to one of the 11 roles uses the existing assignment flow in User Management.
- Workflow engine, RLS, edge functions — untouched.

## Out of scope

- No new permission modules or actions.
- No changes to how object-level (row-level) access is enforced — that stays in RLS/workflow rules.
- No bulk reassignment of existing users; current assignments keep working.

## Technical notes

- **Migration**: add `is_system boolean not null default false` to `public.roles` if missing; upsert the 11 roles by `name`; for each, delete+reinsert its `role_permissions` rows to match the matrix (only on first install — guarded by checking `is_system` was just set, so admin tweaks aren't wiped on re-run). Provide an explicit `reset_system_role_permissions(role_name text)` SQL function for the "Reset to defaults" button.
- **Files touched**:
  - `supabase/migrations/<new>.sql` — seed + reset function
  - `src/pages/admin/RoleManagement.tsx` — UI rework
  - `src/hooks/useRoles.ts` — expose `is_system` + `resetSystemRole` mutation
  - (read-only references) `src/lib/permissionRegistry.ts`, `src/lib/permissionModules.ts`

## Acceptance

- Admin opens Role Management and immediately sees the 11 roles pre-configured.
- Selecting a role shows its module×action grid; toggling and saving works; "Reset to defaults" restores the seeded matrix.
- System roles cannot be renamed/deleted; custom roles fully editable.
- Existing user→role assignments and all runtime gates continue to work unchanged.
- Build and lint pass.
