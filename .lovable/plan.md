## Cause (verified)

`/appeals` renders `MyAppeals` behind `PortalRoute` (licensing / can_view_status) — that guard is fine. The redirect comes from `RegistrationApprovalGate` in `src/routes/routeHelpers.tsx`: for an approved applicant/pre-licensee it allows the path only if it is in `PRE_LICENSEE_ALLOWED_ROUTES` (`src/hooks/useUserPermissions.ts`) or maps to a permission module the user holds. `/appeals` is in neither — `permissionModules.ts` only maps `/admin/license-appeals` and `/admin/appeal-panels` to `license_appeals`. So the gate falls through to `<Navigate to="/dashboard" replace />`.

## Fix

1. `src/hooks/useUserPermissions.ts` — add `'/appeals'` to `PRE_LICENSEE_ALLOWED_ROUTES` (prefix match also covers future `/appeals/:id`).
2. `src/lib/permissionModules.ts` — add a route→module entry `['/appeals', 'license_appeals']` so the gate's dynamic-permission branch also resolves correctly for other external roles.

No changes to `PortalRoute`, RLS, or appeal business logic. Applicants keep seeing only their own appeals (RLS-enforced).

## Verification

- Sign in as an applicant/pre-licensee, open My Appeals from the sidebar → page loads instead of bouncing to `/dashboard`.
- Confirm an internal user still reaches `/admin/license-appeals` unchanged.
