## Problem
When applicants select **Jamaica** as their country in the registration form (mailing/physical address), the State/Parish dropdown does not appear. The `states` table has zero rows for Jamaica, so `AddressSection` falls back to a plain text input — which is inconsistent with other countries that show a dropdown.

## Fix
Seed Jamaica's 14 official parishes into the `states` table via a migration. The existing `AddressSection` component already renders a dropdown automatically once states exist for the selected country — no frontend changes needed.

## Migration
Insert the 14 parishes of Jamaica (country_id = `ae098618-34d5-4372-9a34-480957b8f150`) with `status = 'active'`:

- Kingston
- St. Andrew
- St. Catherine
- Clarendon
- Manchester
- St. Elizabeth
- Westmoreland
- Hanover
- St. James
- Trelawny
- St. Ann
- St. Mary
- Portland
- St. Thomas

Guarded with `ON CONFLICT DO NOTHING` (or a `NOT EXISTS` check) so re-runs are safe.

## Verification
After the migration runs, reload the registration form → select Jamaica → the Parish dropdown appears with all 14 entries for both mailing and physical addresses.
