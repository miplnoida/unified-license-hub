# Merge sections for "Commercial Bank License Application"

The form template `Commercial Bank License Application` (pre_license) currently has 8 sections across both its published v1 and draft v2:

1. Corporate Structure & Ownership (2 fields)
2. Business Plan & 5-Year Financial Projections (4 fields)
3. Minimum Paid-Up Capital Evidence (2 fields)
4. Proposed Directors and Officers List (1 field)
5. AML/CFT Programme Framework (2 fields)
6. IT Systems Assessment (2 fields)
7. Premises & Infrastructure Plan (2 fields)
8. Fee Payment Confirmation (4 fields)

Goal: collapse all of these into one section, keeping every field, every row layout, every validation rule, and every existing response/draft unchanged. No workflow, fee, notification, or routing change.

## What the migration will do

For both versions of this template (published v1 `74e43733…` and draft v2 `1c7d5d4d…`):

1. In the normalized `form_fields` table:
   - Reassign every row of this version to the first section's `section_id`.
   - Set `section_title = 'Commercial Bank License Application'`, `section_description = NULL`, `section_order = 0` on every row.
   - Renumber `sort_order` to a continuous sequence (0..N) following the existing section order then existing sort order, so the visual field order stays identical.

2. In `form_versions.schema_snapshot` (JSONB array of sections):
   - Concatenate the `rows` arrays of all 8 sections into the first section.
   - Set the first section's `title` to `Commercial Bank License Application`, clear its `description`, keep `sortOrder = 0`, `isRepeatable = false`.
   - Drop the other 7 section entries from the array.

3. Scope is strictly limited to `template_id = 921888f5-2b53-4f83-b34e-853afa32f889`. Nothing else is touched.

## Why this is safe

- Existing draft and submitted responses key off `field_name` / field `id`, not `section_id`, so already-filled drafts and historical submissions keep rendering the same answers.
- Row layouts (`rows[].columns` and `rows[].fields`) are preserved verbatim, just relocated under one section.
- No field is added, removed, renamed, retyped, or re-required.
- Workflow, approval steps, fees, notifications, payments, and routing live in separate tables and are not referenced by this change.

## Note on section title

The merged section will be titled `Commercial Bank License Application` (the form name) with no description, since the 8 original section headings/descriptions no longer apply once merged. If you'd prefer a different title (e.g. "Application Details" or keep "Corporate Structure & Ownership"), tell me before approving and I'll adjust.
