# Fix: External Portal Access — sidebar + back button to Roles

## Problem
`/admin/external-portal-access` renders bare JSX (no `DashboardLayout` wrapper), so the sidebar is missing. The `PageHeader` back link also points to `/admin` instead of `/admin/roles`.

## Changes (single file: `src/pages/admin/ExternalPortalAccess.tsx`)
1. **Import** `DashboardLayout` from `@/components/layout/DashboardLayout`.
2. **Wrap** the returned JSX with `<DashboardLayout>` (replace the outer `<div className="space-y-6 p-6">`).
3. **Update `PageHeader`**:
   - `backHref="/admin/roles"`
   - `backLabel="Back"`

No route, RLS, navigation, or functional changes.

## Acceptance
- `/admin/external-portal-access` shows the standard sidebar.
- The `PageHeader` displays a "Back" button that navigates to `/admin/roles`.
- No regressions elsewhere.