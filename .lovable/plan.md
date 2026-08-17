# Hide "Renew" button from License Actions (admin entity detail)

## Goal
Remove the "Renew" action button from the **License Actions** card shown when an admin navigates to a license via **License Entities > Entity Detail > Licenses Tab > View**.

## Current state
`src/pages/licenses/LicenseDetail.tsx` renders an internal-only **License Actions** card that includes a "Renew" button for `active` and `expired` licenses. The card is reached from the entity-detail Licenses tab (`src/components/entity-detail/LicensesTab.tsx`) via the "View" button.

## Changes
1. In `src/pages/licenses/LicenseDetail.tsx`, inside the internal **License Actions** card:
   - Remove the "Renew" start-renewal button for `active` licenses.
   - Remove the "Renew" start-renewal button for `expired` licenses.
   - Keep the status-only buttons "Renewal in progress" / "Continue Renewal" so admins can still open an existing in-flight renewal application.
   - Keep Suspend, Revoke, Reinstate, and Cancel actions unchanged.

## Out of scope
- External/licensee renewal panel (separate "Renewal" card below) is not changed.
- Renewal fee resolution logic and `startRenewal` helper remain in the file for any future non-admin entry points.

## Verification
- TypeScript build passes.
- Admin license detail page loads without the "Renew" button in License Actions for active/expired licenses.
