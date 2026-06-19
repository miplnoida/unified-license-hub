## Plan: Show license number and license status on the licensee dashboard

### What we will build
- Display the active licensee's **license number** on the dashboard header.
- Add a new **License Status** card that lists every license for the active licensee with:
  - status badge (active = green, expired/suspended/revoked = red, expiring soon = amber)
  - "upcoming expiry in X days" countdown for active licenses nearing expiration
- Keep all existing metric cards, charts, and drill-downs unchanged.

### Files to change
1. `src/contexts/PpocContext.tsx`
   - Add optional `license_number` field to `MappedLicensee`.
   - Populate it from the existing license-number lookups already performed for the PPOC/licensee switcher.

2. `src/hooks/useLicenseeMetrics.ts`
   - Add `suspended` and `revoked` counts to `licenses`.
   - Add a new `licenses.list` array containing every scoped license: `id`, `license_number`, `status`, `valid_until`, and computed `days_until_expiry`.
   - Update `EMPTY_METRICS` to match the new shape; existing calculations remain unchanged.

3. `src/components/dashboard/LicenseeDashboard.tsx`
   - Show the active license number next to the existing licensee name line when available.
   - Insert a new License Status card (between the welcome header and the metrics grid) that renders the `licenses.list` with status badges and expiry countdowns.
   - Use the same badge variant mapping as `LicensesList.tsx` (active → approved/green, expired/suspended/revoked → destructive/red, expiring → warning/amber) so colors are consistent across the portal.

### Out of scope
- No changes to `LicenseStatusBadge`, `LicenseStatusBanner`, routing, or the dashboard grid layout.
- No backend schema changes; only additive queries.
- No changes to other dashboards (Supervisory, Applicant, PostLicensee).