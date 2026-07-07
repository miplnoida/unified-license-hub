## Adjust "Same as Mailing Address" behavior

Change the previous implementation so physical address fields remain visible at all times. The checkbox should only copy mailing values into physical fields.

### Changes

1. **`src/components/registration/RegistrationStepRenderer.tsx`**
   - Remove the `shouldSkipField()` logic and the `visibleColumns` filtering that hides `physical_*` fields.
   - Keep the `useEffect` that copies `mailing_<suffix>` → `physical_<suffix>` on the false→true edge of `same_as_mailing`.
   - Physical fields render normally regardless of checkbox state; user can still edit them after copy.

2. **`src/pages/registration/PreLicenseeRegistration.tsx`**
   - Revert the validation bypass: `physical_*` fields are validated normally as required (since they are visible and populated by the copy).
   - Remove the `sameAsMailing`-based skip in `validateOneEntry`.

### Out of scope
No changes to schema, admin form builder, or the checkbox field itself.
