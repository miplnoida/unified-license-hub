## Fix: Pre-licensee "New application" button silently stays on /dashboard

### Root cause
On the applicant/pre-licensee dashboard (`src/components/dashboard/ApplicantDashboard.tsx:34`), the "New application" button navigates pre-licensees to `/pre-license/new`. That route is wrapped in `RegistrationApprovalGate` (`src/routes/routeHelpers.tsx`), which for pre-licensees enforces an allowlist via `isPreLicenseeAllowedRoute(pathname)` from `src/hooks/useUserPermissions.ts`.

The allowlist `PRE_LICENSEE_ALLOWED_ROUTES` includes `/applications`, `/post-license`, etc. but **not** `/pre-license`. `getModuleForPath('/pre-license/new')` also returns `null`, so the gate falls through to `<Navigate to="/dashboard" replace />`. Because it uses `replace`, the URL snaps back instantly and it looks like the button did nothing.

Non-pre-licensee applicants aren't affected: they get `/applications/new`, which passes the allowlist via the `/applications` prefix.

### Fix (one-line allowlist change)

`src/hooks/useUserPermissions.ts` — add `/pre-license` to `PRE_LICENSEE_ALLOWED_ROUTES`:

```ts
export const PRE_LICENSEE_ALLOWED_ROUTES = [
  '/dashboard',
  '/applications',
  '/licenses',
  '/post-licensee/applications',
  '/post-license',
  '/pre-license',        // ← add — covers /pre-license and /pre-license/new
  '/payments',
  '/profile',
  '/change-password',
  '/notifications',
  '/registration-status',
];
```

That makes `isPreLicenseeAllowedRoute('/pre-license/new')` return true, the gate passes through, and the existing `PortalRoute` (`area="licensing"`, `capability="can_submit"`) continues to enforce the real permission check.

### Why this is the minimal, safe fix
- No changes to routing, guards, dashboards, or `NewApplication.tsx`.
- Access is still gated by `PortalRoute`'s `can_submit` capability check on `/pre-license/new`, which is unchanged.
- Matches the existing pattern used for `/applications` and `/post-license` (both prefixes are allow-listed the same way).

### Verification
1. Log in as a pre-licensee applicant whose registration is approved.
2. On `/dashboard`, click "New application" in the welcome banner.
3. URL changes to `/pre-license/new` and the new-application wizard renders.
4. Log in as an applicant lacking `can_submit` capability — confirm `PortalRoute` still shows Access Denied (not the wizard).
5. Regular (non-pre-licensee) applicant flow to `/applications/new` continues to work unchanged.
