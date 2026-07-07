## Problem
The default registration form has a **Same as Mailing Address** checkbox (`same_as_mailing`) followed by physical address fields (`physical_street`, `physical_city`, `physical_state`, `physical_country`). Today the checkbox toggles but has no behavior — physical address fields stay visible and required, so applicants must still fill them separately. The `same_as_mailing` flag only gets read at submission time.

## Fix

Wire the checkbox in the dynamic renderer so, when checked:
1. Mailing address values are copied into the matching physical address fields (`mailing_street` → `physical_street`, `mailing_city` → `physical_city`, `mailing_state` → `physical_state`, `mailing_country` → `physical_country`).
2. Physical address fields are hidden (no visible input, no required validation blocking submit).
3. On uncheck, physical fields become visible again with the previously-copied values retained so the applicant can edit them.

### Convention
Recognition is by field name (matches the builder defaults and the existing submission-side logic):
- Controller field: `fieldName === 'same_as_mailing'`
- Suppressed fields: any field whose `fieldName` starts with `physical_`
- Source fields for the copy: the `mailing_<suffix>` counterpart of each `physical_<suffix>`

### Where the change goes

**File:** `src/components/registration/RegistrationStepRenderer.tsx`

- Detect whether the current step contains a `same_as_mailing` field.
- Read its current value from `allData`/step data (`true` / `'true'`).
- When true:
  - Before rendering each row/column, skip fields whose `fieldName` starts with `physical_` (return `null` for the cell so the row collapses cleanly, or filter them out of the row entirely if the whole row becomes empty).
  - Force-treat those fields as non-required in the validation payload the renderer emits (via the existing `onFieldError` / value-write path — set their value to the mirrored mailing value so downstream required checks pass).
- When the checkbox toggles from `false` → `true`, dispatch value updates for each `physical_*` field using the current `mailing_*` value (through the same `handleChange` mechanism the renderer already uses to update parent state).
- When toggling `true` → `false`, leave the mirrored values in place (do not blank them) so the user can edit.

**File:** `src/pages/registration/PreLicenseeRegistration.tsx`

- In the step validation (`validateStep`) that flags required-but-empty fields, treat `physical_*` fields as not-required when `same_as_mailing === true` for that step's data. This prevents the "Please complete required fields" toast when the checkbox is used.

### Out of scope
- Admin form builder changes (checkbox stays where it is; no new field-dependency UI).
- The legacy static `AddressSection` component (already works via its own state).
- Renaming the fields or adding a formal dependency system — this is a targeted convention-based fix keyed off the well-known `same_as_mailing` / `physical_*` / `mailing_*` names already used across the codebase (`PreLicenseeRegistration`, `BackgroundInfoTab`, `registrationUpdateFlow`).
