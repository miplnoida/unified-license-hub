## Context

The Form Management screen (`/admin/forms`) currently shows two tabs that look almost identical:

- **Internal** → `form_type = 'internal'` (legacy generic internal form type)
- **Internal — License Action** → `form_type = 'internal_license_action'` (the new type used by the License Action Forms feature)

Both are surfaced to the License Action Forms configuration screen (it merges `internal`, `internal_license_action`, and `post_license` templates), which is why they feel redundant to admins.

You asked to keep only one tab, labeled **Internal — License Action**, and not to change other working functionality.

## Change

Frontend-only, presentation change. No DB migration, no edge function change.

1. `src/pages/admin/FormManagement.tsx`
   - Remove the `{ value: 'internal', label: 'Internal' }` entry from `FORM_TYPES`.
   - The remaining `internal_license_action` tab already renders with the label "Internal — License Action" — no rename needed.
   - Default tab logic stays as-is (falls back to first entry if the URL `?tab=internal` is used → we'll coerce a legacy `?tab=internal` query param to `internal_license_action` so old bookmarks don't land on a missing tab).

2. `src/pages/admin/FormBuilder.tsx`
   - Leave `formType === 'internal'` branches intact so any pre-existing legacy templates can still be opened/edited via direct URL — this preserves "other working functionality".
   - New forms created from the UI will only be creatable as `internal_license_action` (since the tab is gone), matching your intent.

3. No changes to:
   - `LicenseActionFormsPage.tsx` (still merges legacy `internal` + new `internal_license_action` + `post_license` templates, so any existing legacy internal templates remain selectable in action configs).
   - `perform-license-action` edge function.
   - Database (`form_templates.form_type` CHECK constraint keeps allowing both values; existing rows untouched).
   - License Action dialog, viewer, or notifications.

## Out of scope

- Migrating existing `form_type = 'internal'` rows to `internal_license_action` (not requested; would be a data change).
- Any change to Pre-License, Post-License, Returns, or Registration tabs.

## Verification

- Load `/admin/forms` → only one "Internal — License Action" tab visible alongside Pre-License / Post-License / Returns / Registration.
- Load `/admin/forms?tab=internal` → auto-redirects to the Internal — License Action tab.
- License Action Forms config page still lists any existing legacy internal templates.
- `tsgo --noEmit` clean.
