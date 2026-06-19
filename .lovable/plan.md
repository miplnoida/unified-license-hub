## Goal
On the Licensee Dashboard, clean up the header line and surface a "Renew" action when a license is expired (or in the configured reminder/grace window), using the existing dynamic renewal config (period + fee) from the backend.

## Changes

### 1. `src/components/dashboard/LicenseeDashboard.tsx`
- Header line: drop the `· Licence no. {license_number}` suffix. Keep `Showing metrics for <Entity Name>.`
- Keep the existing "License status" card as-is (per-license rows with status badge, valid-until, days remaining).
- In each license row inside that card, when the license is `expired` (or `active` but past valid_until), add a small **Renew** button on the right next to the badge.
  - Suspended / revoked / cancelled → no Renew button.
  - Active and not expiring soon → no button (current UI unchanged).
  - Active but within the configured reminder window (`useLicenseExpiryConfig().reminder_days` max) → also show Renew (optional, matches LicenseDetail behavior).
- Clicking **Renew** navigates to `/licenses/{id}?action=renew`, which `LicenseDetail` already handles: it auto-opens the existing Renew dialog, prefills the new validity using the dynamic `period_days` from `useLicenseExpiryConfig`, displays the dynamic renewal fee (`renewal_fee_mode`, `renewal_fee_amount`, `renewal_fee_currency`), and submits to `license_renewals` with `pending_payment` or `submitted` accordingly.
- No business-logic changes — purely a navigation entry point reusing the existing renewal flow so it stays in sync with backend config.

## Out of scope / unchanged
- `useLicenseeMetrics`, `PpocContext`, renewal edge logic, fee config, and all other dashboard cards/metrics remain untouched.
- No DB or backend changes.

## Technical notes
- Reuse `useLicenseExpiryConfig` only if needed to decide the "expiring soon" Renew button; for the minimal change, gating by `effectiveStatus === 'expired'` (already computed in `useLicenseeMetrics` via `days_until_expiry < 0`) is sufficient and avoids new hooks on the dashboard.
- Use `react-router-dom`'s `Link` (or `useNavigate`) — already used elsewhere — to route to `/licenses/{id}?action=renew`.
