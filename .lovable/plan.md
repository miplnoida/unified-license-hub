## Problem

When a pre-licensee (applicant) is granted the Complaints permission via Role Management, the **Complaints** menu correctly appears in the sidebar, but clicking it redirects to `/dashboard` instead of opening the Complaints page.

## Root cause

`src/routes/routeHelpers.tsx` → `RegistrationApprovalGate` enforces a static whitelist (`PRE_LICENSEE_ALLOWED_ROUTES` in `src/hooks/useUserPermissions.ts`) for approved pre-licensees:

```
/dashboard, /applications, /payments, /profile, /change-password, /notifications, /registration-status
```

`/complaints` is not in the list, so the gate forces `Navigate to="/dashboard"` even though:
- the route guard (`ExternalPortalOrModule` → `PortalRoute`) would allow access via the user's dynamic permission
- the sidebar already shows the link because that same dynamic permission resolves true

The whitelist and the dynamic-permission system are out of sync.

## Fix

Make the pre-licensee gate respect dynamically-granted permissions in addition to the baseline whitelist. Concretely:

1. **`src/routes/routeHelpers.tsx`** — in `RegistrationApprovalGate`, before the `Navigate to="/dashboard"` fallback, also allow the path when the user's dynamic permissions grant access to the module that owns it. Use the existing `getModuleForPath` (from `src/lib/permissionModules.ts`) + `useUserDynamicPermissions().hasPermission(module, 'view')` (with a fallback to `'submit'` for portal-only capabilities like Complaints). If allowed, render children instead of redirecting.

2. **No change** to the static `PRE_LICENSEE_ALLOWED_ROUTES` baseline — those remain always-on for the minimum pre-licensee portal (dashboard, applications, payments, profile, change-password, notifications, registration-status).

3. **No change** to:
   - `PortalRoute` / `ExternalPortalOrModule` route guards (already correct)
   - Sidebar visibility (already correct)
   - The `/complaints` route definition in `dashboardRoutes.tsx` (already lists `pre_licensee` in `allowedRoles`)
   - Any other module or business logic

## Result

- Granting any module (e.g. Complaint Handling) to a pre-licensee role in Role Management makes that route navigable, not just visible.
- Revoking the permission hides the menu and blocks the route again, exactly as today.
- All existing pre-licensee restrictions for routes the admin has NOT explicitly granted (e.g. `/workflows`, `/admin/*`) remain enforced via their own module/role guards plus the unchanged baseline whitelist.

## Files to edit

- `src/routes/routeHelpers.tsx` — extend `RegistrationApprovalGate` with the dynamic-permission check described above.
