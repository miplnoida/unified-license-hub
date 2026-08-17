# Fix Complaints access for internal roles

## What is actually wrong

Complaints access is already fully permission-driven — nothing is hardcoded:

- Sidebar item "Complaints" requires the `complaint_management` module.
- The `/complaints` routes are guarded by a module check for a `view` action.
- The `complaints` table read/update policies call `has_scoped_permission(user, 'complaint_management', 'view'/'edit', ...)`.

Verified in the database: the role **Licensing Officer** has **zero** `complaint_management` permissions and no `complaint_management` entry in its scope config. So all three layers deny, which is exactly the reported symptom. Four other internal roles are in the same state: Approver / Decision-Maker, F&P Assessor, Insurance Regulator, Payment Systems Supervisor.

Why the earlier grant did not persist is not confirmed. The save path (role screen -> `rbac_save_role`) validates dependencies and scopes and surfaces errors as toasts, so the likely cause is a rejected save (e.g. an action ticked without "View") whose error was missed. Step 3 below makes that impossible to miss instead of guessing.

## Fix

### 1. Grant complaint capabilities to the internal roles that need them

Permission-driven, scope = **all complaints** for each. Available actions in the catalogue are: View, Create, Edit, Upload documents, Approve RFI, View status.

| Role | Proposed grant |
| --- | --- |
| Licensing Officer | View, Create, Edit, Upload documents |
| Insurance Regulator | View, Create, Edit, Upload documents, Approve RFI |
| Payment Systems Supervisor | View, Create, Edit, Upload documents |
| Approver / Decision-Maker | View, Approve RFI |
| F&P Assessor | View |

Each role also gets `scope_config.complaint_management = { scope: "all" }`, and its access summary is refreshed so the role card reflects the new capability. These are seeded grants only — after this, changing complaint access stays a normal role-screen edit.

### 2. Make the grant take effect for already signed-in users

After a role's permissions change, cached permissions for affected users are refreshed so the sidebar and routes unlock without a hard reload.

### 3. Make a failed grant impossible to miss

On the role screen, a rejected save currently shows a raw error string. It will show a plain-language reason ("Complaints: tick View before Edit", "choose a data scope for Complaints") and the dialog stays open on the offending module, so an admin never leaves believing a grant was saved when it was not. After a successful save the screen re-reads the stored permissions and warns if what was saved differs from what was ticked.

### 4. Related defect: permissions that can never authorize

Ten permission rows are stored with module-prefixed names (`report_management.view`, `audit_management.export`, `notification_management.dispatch`, etc.) while all authorization checks compare against the bare action (`view`, `export`). Any role granted only those rows silently has no access. These names get normalized to bare actions, de-duplicated against existing rows, with role grants remapped so no role loses access.

## Technical notes

- One migration: insert `role_permissions` rows for the five roles, update `roles.scope_config` / `access_summary`, normalize the ten prefixed permission names and remap their `role_permissions`.
- No changes to `rbac_save_role` logic, RLS policies, route guards, or navigation config.
- Frontend touches limited to `src/pages/admin/RoleManagement.tsx` (error messaging, post-save verification) and `src/hooks/useRoles.ts` (cache invalidation).

## Verification before reporting done

- Query each of the five roles and confirm the expected `complaint_management` rows and scope entry exist.
- Confirm `has_scoped_permission` returns true for the Licensing Officer user against `complaint_management` / `view`.
- Sign in to the preview as that user and confirm the Complaints menu appears, the list loads, and a complaint detail page opens.
- Confirm no role lost permissions after the name normalization.
