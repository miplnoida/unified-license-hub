## Root Cause

The `/admin/forms` page (`FormManagement.tsx`) reads from the `form_templates` table via `useFormTemplates(formType, activeRegulatorId)`, which filters with `.eq('regulator_id', activeRegulatorId)`.

A seeded row exists in `form_templates` for "Commercial Bank License Application", but its `regulator_id` is `NULL`, so the active-regulator filter excludes it. (A second, unused row was also seeded into the legacy `forms` table — not read by this page.)

## Fix

1. Update the existing `form_templates` row for "Commercial Bank License Application" to set `regulator_id = '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3'` (the same regulator used in the prior `forms` seed and the project's default).
2. Delete the duplicate row from the legacy `forms` table to prevent confusion (that table is not what /admin/forms renders).

No code changes — purely a data fix via the insert/update tool.

## Verification

- Reload `/admin/forms` with the Commercial Bank/default regulator active; the form should appear under the Pre-License tab with status Published.
- If it still doesn't appear, confirm the active regulator in the header matches the assigned `regulator_id`.
