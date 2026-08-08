# Edit panel: pick internal users instead of a regulator

## What changes

On the **Edit panel / New panel** dialog, the "Panel jurisdiction / Regulator" dropdown is replaced by a **Panel members** picker that lists internal staff as `Full Name — email`.

- Multi-select: choose several people at once; each selected person appears as a removable chip with their name and email.
- Searchable by name and email.
- Lists **all active internal staff** only — external portal users (applicants, licensees, pre-licensees) and deactivated accounts are excluded.
- Saving the panel applies the selection to the panel's composition: newly ticked people are added as members, unticked people are stood down (not deleted, so already-referred appeals keep their recorded composition).
- Everyone added from this dialog joins as a voting **Member**. Chair, legal adviser, observer, vote weight and effective dates stay in the existing **Composition** dialog (the people icon on the row), which remains the place for fine-grained governance.
- The panel list's "Panel jurisdiction / Regulator" column becomes a **Members** column showing the member count and the chair, if one is set.

## Behaviour kept as-is

- Quorum, decision rule, scope, effective dates, default hearing format, notes, active toggle.
- One-active-chair rule and the "that person already sits on this panel" guard.
- Appeal referral, panel snapshots, hearings and decisions are untouched.
- The panel's stored regulator value is left alone in the database (no migration); it simply stops being edited from this form.

## Technical notes

- `src/pages/admin/LicenseAppealPanels.tsx`: drop `useAllRegulators` and the regulator `Select` from the form; add a multi-select internal-user field backed by `useInternalUsers(undefined, { activeOnly: true })`. Pre-fill it from `useLicenseAppealPanelMembers` when editing. After `savePanel` succeeds, diff the selection against current active members and call `savePanelMember` for additions and `standDownPanelMember` for removals; `regulator_id` is no longer sent in the payload. Update the column definition to render membership.
- New small component `src/components/appeals/InternalUserMultiSelect.tsx` (Command + Popover, same pattern as `EmployeeCombobox`) rendering `Name — email` rows with checkmarks and chips.
- For a brand-new panel, members are applied after the panel row is created (`savePanel` already returns the new id).
- No database or RLS changes.

## Verification

Checked in the running app on `/admin/appeal-panels`: open Edit panel, confirm the members dropdown lists internal staff with emails, search by name and by email, add and remove people, save, reopen and confirm the selection persisted and matches the Composition dialog.
