## Goal
Close the remaining gaps so the License Action Forms feature is verifiably complete end-to-end.

## Changes

### 1. Database migration — `form_type = 'internal_license_action'`
- New migration that:
  - Drops and re-adds the `form_templates.form_type` CHECK constraint to include `internal_license_action` alongside the existing values (`pre_license`, `post_license`, `internal`, ...).
  - Adds a partial index on `form_templates(form_type)` filtered to `internal_license_action` for the admin list query.
  - Backfills nothing (no existing rows use the new value).

### 2. Centralized backend authorization (no hardcoded roles)
- Replace the `INTERNAL_ROLES` Set + direct `user_roles` query in `perform-license-action` with a permission check that mirrors what the frontend/RouteGuards use.
- Use the existing `has_role`-style helper. Specifically: call the `user_has_permission(_user_id, _module, _action)` RPC (same one `useUserDynamicPermissions` resolves against) for `module = 'licensing'`, `action = 'manage_license_actions'`. If that action key doesn't exist in `permission_actions`, add it in the same migration as step 1 and seed it into the relevant roles via `role_permissions`.
- Remove all role-name string literals from the edge function.

### 3. Remove `as any` casts and refresh types
- After migration applies, Lovable regenerates `src/integrations/supabase/types.ts`. Then:
  - Remove `(supabase as any).rpc('resolve_license_action_form', ...)` in `LicenseActionDialog.tsx`.
  - Remove `supabase.from('license_actions' as any)` / `('licenses' as any)` casts in `LicenseDetail.tsx` and `LicenseActionFormViewer.tsx`.
  - Remove `(supabase as any)` in `LicenseActionFormsPage.tsx` and `useFormTemplates` calls for the new form type.
  - Remove `as any` casts inside `perform-license-action/index.ts` where typed clients now suffice.

### 4. Single backend path for license actions
- Audit `src/pages/licenses/*` and any related hooks for direct writes to `licenses.status` or inserts into `license_actions` for suspend/revoke/cancel/reinstate/status_change. Replace any remaining direct writes with `LicenseActionDialog` → `perform-license-action`.
- Renewal (`license_renewals`) and certificate generation paths stay untouched.
- Add a vitest that greps the `src/` tree and fails if a forbidden direct write pattern reappears (regression guard).

### 5. Action-to-form mapping, validation, linking, audit, notifications
- Verify `resolve_license_action_form` priority order (category → sub_sector → sector → regulator → global) with a SQL-level vitest using `supabase--read_query`.
- Edge function already: validates `form_response_id` belongs to caller, matches template, is `submitted`, has `entity_type='license_action'`; writes `license_actions` with `form_response_id`/`form_template_id`/`form_version_id`; updates `licenses.status`; mirrors `licensees.status` for revoke/cancel; repoints `form_responses.entity_id` to the action id; writes `audit_logs`; dispatches `license.{suspended|revoked|reinstated|cancelled|status_changed}`. Confirm each path with a deno test that stubs the admin client.

### 6. Form Management + Form Builder support
- `FormManagement.tsx`: `internal_license_action` already in `FORM_TYPES`. Verify filter dropdown and listing query include it.
- `FormBuilder.tsx`: confirm label rendered, scope/taxonomy selectors enabled, publish flow works (no special-case blockers).
- `useFormTemplates` hook: ensure it accepts `internal_license_action` and the published-version resolver works.
- `LicenseActionFormsPage.tsx`: template picker shows `internal_license_action` templates (already merged in last turn) — verify ordering and that activate/deactivate/delete work.

### 7. Build + lint
- Run `npm run build` and `tsgo --noEmit`; fix every error introduced by removing `as any` casts.

### 8. End-to-end verification (Playwright via shell, using the injected Supabase session)
Scripts under `/tmp/browser/license-actions/`:
1. Configure a required `internal_license_action` form for `suspension` at category scope. Attempt to suspend a license without submitting → expect `FORM_REQUIRED` toast, status unchanged.
2. Submit the form → expect status → `suspended`, `license_actions` row links `form_response_id`, audit log row exists, `notification_dispatch_log` row exists for `license.suspended`.
3. Open action history → "View Form" opens the submitted response read-only.
4. Repeat for revoke, cancel, reinstate, status_change.
5. Smoke: open a renewal flow, generate a certificate, open the applicant portal — confirm unchanged.

Screenshots saved at every step; final report includes pass/fail per item.

## Files

**Created**
- `supabase/migrations/<ts>_form_type_internal_license_action.sql` (constraint + permission seed)
- `src/test/licenseActionDirectWriteGuard.test.ts`
- `supabase/functions/perform-license-action/index_test.ts` (deno test)
- `docs/license-action-forms.md` (verification checklist)

**Edited**
- `supabase/functions/perform-license-action/index.ts` (permission-based auth, type cleanups)
- `src/components/licenses/LicenseActionDialog.tsx` (remove `as any`)
- `src/components/licenses/LicenseActionFormViewer.tsx` (remove `as any`)
- `src/pages/licenses/LicenseDetail.tsx` (remove `as any`, confirm no direct writes)
- `src/pages/admin/LicenseActionFormsPage.tsx` (remove `as any`)
- `src/hooks/useFormTemplates.ts` (accept new form_type if not already)
- `src/integrations/supabase/types.ts` (auto-regenerated)

## Out of scope
Renewals, certificates, AI assessments, returns, applicant portal, notification dispatcher internals, workflow engine.

## Technical notes
- The `user_has_permission` RPC is the same one `useUserDynamicPermissions.hasPermission` resolves against; using it from the edge function keeps a single source of truth for "who can act on a license".
- If `permission_actions` lacks `manage_license_actions`, the migration inserts it and grants it to the same dynamic roles that previously appeared in `INTERNAL_ROLES` (super_admin, admin, supervisor, analyst, licensing_officer, legal_compliance) via `role_permissions` — this is a one-time seed, not a hardcoded runtime check.
- Removing `as any` depends on `types.ts` regenerating after the migration runs, so the type cleanups land in the turn after migration approval.
