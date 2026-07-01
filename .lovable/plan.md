## Goal
Hide the "Regulator" concept from the License Action Form mapping UI (`/admin/license-action-forms`), while keeping regulator scoping intact under the hood so existing data and the backend resolver keep working.

## Scope
UI-only change in `src/pages/admin/LicenseActionFormsPage.tsx`. No DB, RPC, edge function, or `LicenseActionDialog` changes.

## Changes

**1. Edit/Create dialog — remove the Regulator field**
- Remove the `<Label>Regulator</Label>` + `<Select>` block (lines ~283–292).
- Remove `regulatorId` state, its `useEffect` reset, and the `regulators` prop from `EditDialog`.
- On save, auto-set `regulator_id` from the currently active regulator (`useRegulator().activeRegulatorId`) instead of the dropdown. Fallback to `null` if none is active. This preserves the multi-regulator scoping model transparently.

**2. Mapping list row — hide the "Reg: …" chip**
- Remove the `Reg: {lookupName(regulators, r.regulator_id)} ·` fragment (line ~163) from each row's meta line. Keep Action / Sector / Sub / Category / Required chips.

**3. Parent page cleanup**
- Keep the `regulators` query only if still needed elsewhere; otherwise drop it and stop passing `regulators` to `EditDialog`.
- Import and use `useRegulator` to source `activeRegulatorId` for the save payload.

## Out of scope
- No changes to `license_action_form_configs` schema.
- No changes to `resolve_license_action_form` RPC or `perform-license-action` edge function — they continue to accept and honor `regulator_id`.
- No changes to `LicenseActionDialog` — it already passes the license's `regulator_id` at resolution time.
- Existing mapping rows keep whatever `regulator_id` they already have; nothing is migrated.

## Verification
- `/admin/license-action-forms`: no "Regulator" dropdown in the create/edit dialog and no "Reg: …" text on rows.
- Creating a new mapping while a regulator is active stores that regulator's id (visible via DB read); the row displays and is respected at action time.
- Suspend/Revoke on a license still resolves the correct form for the license's regulator.
