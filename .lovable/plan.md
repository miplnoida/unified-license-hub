## Goal
On `/admin/license-action-forms`:
1. Restrict the **Form Template** dropdown to internal forms only.
2. Prevent creating (or editing into) duplicate mappings.

## Scope
UI-only in `src/pages/admin/LicenseActionFormsPage.tsx`. No DB migration.

## Changes

**1. Form Template list — internal only**
- Drop the `post_license` templates. Keep only `internal_license_action` and legacy `internal` templates:
  ```
  const templates = [...tplInternalLA, ...tplInternal];
  ```
- Remove the `useFormTemplates('post_license')` call.
- The `(form_type)` hint next to each option stays so admins can still distinguish legacy `internal` from `internal_license_action`.

**2. Duplicate prevention**
- Define a duplicate as: same `license_action_type` **and** same taxonomy tuple (`sector_id`, `sub_sector_id`, `category_id`) **and** same `regulator_id` (the auto-assigned active regulator).
- Rationale: this matches the resolver's matching key — two rows with the same action + scope would be ambiguous.
- Implementation:
  - In `LicenseActionFormsPage`, before calling `saveMutation.mutate`, scan the existing `rows` for a match on those four fields, excluding the row currently being edited (`editing?.id`).
  - If a match exists, show `toast.error('A mapping for this action and scope already exists.')` and abort — do not open a network call.
- Note: `form_template_id` is intentionally NOT part of the duplicate key — changing only the template on the same scope is still a duplicate (admin should edit the existing row instead).

## Out of scope
- No DB unique constraint (kept as UI guard only to avoid a migration; safe because this is an admin-only screen).
- No change to resolver, edge function, or `LicenseActionDialog`.
- No change to the templates shown elsewhere in the app.

## Verification
- Template dropdown lists only internal / internal-license-action forms; no post-license entries.
- Attempting to save a second mapping with the same action + sector + sub-sector + category (under the current active regulator) shows a toast and does not create a row.
- Editing an existing row without changing its scope still saves normally.
