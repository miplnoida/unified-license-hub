## Changes to `src/pages/admin/RegistrationReviewDetail.tsx`

### 1. Full-width workflow
- Remove the `grid grid-cols-1 lg:grid-cols-3` layout wrapping details vs. workflow.
- Render all detail cards stacked full-width, then the `Approval Workflow` card full-width below them.

### 2. Fix address rendering
The top-level `mailing_address` / `physical_address` JSONB columns are empty on real submissions; addresses actually live inside `entity_specific_data` as flat keys (`mailing_street`, `mailing_city`, `mailing_state`, `mailing_country`, `mailing_postcode`, and the same with `physical_` prefix), and `same_as_mailing` is stored there too.

- Build `resolvedMailing` and `resolvedPhysical` by:
  - Start from `reg.mailing_address` / `reg.physical_address` (existing behavior).
  - Merge in any `mailing_*` / `physical_*` keys found in `entity_specific_data`, stripping the prefix (`mailing_street` → `street`).
- Resolve each address field's value through the schema resolver so country/state UUIDs render as names (reuse `resolveReviewValue` and the field lookup already built in the file).
- Use `entity_specific_data.same_as_mailing` as a fallback for the badge when the column value is false.
- In the "Application Details" section, skip keys that start with `mailing_` / `physical_` and the `same_as_mailing` / `password` / `confirm_password` keys (already shown or sensitive), so they aren't duplicated.

### Out of scope
- No workflow logic changes.
- No schema, DB, or list-page changes.
