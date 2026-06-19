# License Expiry & Renewal Configuration

Add an admin-configurable License Expiry & Renewal policy, surface near-expiry alerts on the licensee dashboard, and show a "Renew" action when a license is expired or close to it. No other workflows change.

## 1. Admin Settings Page — `/settings/license-expiry`

New card on `SettingsHub` ("License Expiry & Renewal") routing to a new page.

Fields stored in `site_settings` under key `license_expiry`:

- `cycle_type`: `annual` | `periodic`
- `period_days`: integer (used when `cycle_type = periodic`; ignored for annual = 365)
- `reminder_days`: integer array, e.g. `[10, 5, 1]` — days before expiry to notify the licensee
- `renewal_fee_mode`: `free` | `paid`
- `renewal_fee_amount`: number (only when `paid`)
- `renewal_fee_currency`: string (default from general settings)
- `grace_period_days`: integer — how long after expiry renewal is still allowed
- `auto_notify_officer`: boolean — also send officer alerts

Defaults seeded: annual, reminders `[10, 5, 1]`, free renewal, 30-day grace.

## 2. Reminder dispatcher

Extend existing `license-expiry-reminders` edge function:

- Read `license_expiry` config at run start.
- Replace hardcoded `REMINDER_WINDOWS` with windows derived from `reminder_days` (plus 0-day expired event).
- Officer event only fires if `auto_notify_officer = true`.
- No DB schema change; existing `license.expiring_soon` / `license.expired` templates reused.

## 3. Licensee dashboard banner

In `PostLicenseeDashboard.tsx`:

- New `useLicenseExpiryStatus(licenseeId)` hook — fetches the licensee's active license(s) + the expiry config, computes `daysUntilExpiry` and `isExpired`.
- If `daysUntilExpiry <= max(reminder_days)` or expired, render an alert card at the top:
  - Days remaining / "Expired N days ago"
  - "Renew License" button → opens the existing Renew dialog on `LicenseDetail`, or navigates to `/licenses/:id?action=renew`.
- Banner only appears within the configured window.

## 4. Renew action on Licensee panel

In `src/pages/licenses/LicenseDetail.tsx`:

- Existing Renew dialog stays. Add logic:
  - If `renewal_fee_mode = paid`, show fee amount in dialog and create a `payments` row on submit (status `pending`) — payment flow uses existing payment infra. Renewal only proceeds on payment confirmation.
  - If `free`, current flow unchanged.
- Show "Renew License" button when license `status = expired` OR within reminder window OR within `grace_period_days` after expiry. Hidden otherwise (preserves current behaviour for non-expiring licenses).
- Honor `?action=renew` query param to auto-open dialog.

## 5. Files

New:
- `src/pages/settings/LicenseExpirySettings.tsx`
- `src/hooks/useLicenseExpiryConfig.ts`
- `src/hooks/useLicenseExpiryStatus.ts`
- `src/components/dashboard/LicenseExpiryBanner.tsx`

Edited:
- `src/pages/settings/SettingsHub.tsx` (add card)
- `src/routes/settingsRoutes.tsx` (add route)
- `src/pages/PostLicenseeDashboard.tsx` (mount banner)
- `src/pages/licenses/LicenseDetail.tsx` (paid renewal + auto-open + show-when-expired)
- `supabase/functions/license-expiry-reminders/index.ts` (config-driven windows)

Data:
- Seed `site_settings` row `license_expiry` with defaults (insert tool, not migration).

## Out of scope

No changes to: certificate generation, revocation flow, supervisory plans, workflow engine, fee management module, other notifications, or schema.

## Questions

1. For **paid renewal**, should the new validity start only after payment is confirmed (recommended), or immediately on dialog submit?
2. Should the **reminder_days** config be a free-form list (admin types `10,5,1`) or fixed checkboxes (`30 / 15 / 10 / 5 / 1`)?
3. Should the dashboard banner appear on **all portals** the licensee uses, or only the Post-Licensee dashboard?
