## Goal

Make every existing `form_type = 'internal'` template a first-class member of the **Internal — License Action** tab, so admins see one unified list and can pick any of them when configuring a license action form.

The previous change already merges both types in the tab's *display*. This plan goes one step further and converts the legacy rows in the database so they truly belong to the new type — no more split storage.

## Change

### 1. DB migration (data-only, no schema change)

New migration file `supabase/migrations/<ts>_relabel_internal_form_templates.sql`:

```sql
-- Fold legacy 'internal' form templates into 'internal_license_action'
-- so they appear in and are managed by the single Internal — License Action tab.
UPDATE public.form_templates
SET form_type = 'internal_license_action',
    updated_at = now()
WHERE form_type = 'internal';
```

The `form_templates.form_type` CHECK constraint already allows `internal_license_action` (added in the earlier migration), so no constraint change is needed. `license_action_form_configs` references templates by `form_template_id`, so existing configs keep working — nothing to update there.

### 2. Frontend cleanup (safe once migration runs)

- `src/hooks/useFormTemplates.ts` — keep the `.in('form_type', ['internal_license_action', 'internal'])` fallback for one release so any un-migrated row still appears; no change needed now.
- `src/pages/admin/LicenseActionFormsPage.tsx` — same reasoning, keep the current merge of `internal` + `internal_license_action` + `post_license`.
- `src/pages/admin/FormBuilder.tsx` — no change; legacy `formType === 'internal'` branches stay so any direct-URL edit of a not-yet-migrated draft still works.

No other files change. No edge function, notification, dialog, or viewer change.

## Verification

- After migration runs: `/admin/forms?tab=internal_license_action` shows every previously-internal template alongside any `internal_license_action` templates.
- License Action Forms config screen still lists them (identical set).
- Existing `license_actions` rows and submitted `form_responses` continue to open via "View Submitted Form" (they reference `form_template_id` / `form_version_id`, not `form_type`).
- `tsgo --noEmit` clean (no code changes needed).

## Out of scope

- Removing the legacy `'internal'` value from any code path — deferred so mid-flight drafts don't break.
- Any change to Pre-License, Post-License, Returns, Registration, workflow engine, notifications, or applicant portal.
