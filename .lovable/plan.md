
# License Action Forms — Full Implementation & Verification

The base scaffolding (migration, edge function, dialog, admin page, viewer) already exists from the previous pass. This plan closes the remaining gaps so the feature is end-to-end complete, verified, and free of regressions.

## 1. Backend (edge function `perform-license-action`)

Audit and harden the existing function:
- Confirm JWT validation + internal-role check (`admin`, `reviewer`, `approver`, `supervisor`) via `has_role`.
- Reload license + taxonomy server-side; never trust client taxonomy.
- Call `resolve_license_action_form`; if required and no `form_response_id` → return `{ error:'FORM_REQUIRED', code:'FORM_REQUIRED', template_id }`.
- Verify supplied `form_response_id` matches resolved template, `status='submitted'`, `entity_type='license_action'`, and owner = caller.
- Insert `license_actions` row with `form_response_id`, `form_template_id`, `form_version_id`, performer, reason, old/new status.
- Update `licenses.status`; mirror to `licensees` only for revoked/cancelled (preserve current behavior).
- After action row exists: patch `form_responses.entity_id` to the new `action_id` so the response is linked to the action (not the license).
- Write `audit_logs` entry (`license.<action>`, old/new value, metadata includes form_response_id + template_id).
- Dispatch notification via `dispatch-notification-event` with payload tokens: `license_*`, `licensee_*`, `action_type`, `action_date`, `form_response_id`, `form_template_name`. Notification dispatch happens ONLY after the status update + audit log succeed.
- Renewal path untouched.

## 2. Database

Single follow-up migration (only if gaps remain after re-reading the prior one):
- Ensure `form_templates.form_type` CHECK allows `internal_license_action`.
- Confirm `resolve_license_action_form` priority order: category → sub_sector → sector → regulator → global; returns single best match with `is_active=true`.
- Ensure RLS on `license_action_form_configs` (admin write, authenticated read) and on `form_responses` (internal roles can read where `entity_type='license_action'`).
- Add index `(license_action_type, is_active)` if missing.

## 3. Frontend — License Detail

`src/pages/licenses/LicenseDetail.tsx`:
- Remove any remaining direct `supabase.from('license_actions').insert/update` and direct `licenses.status` updates for suspend/revoke/cancel/reinstate/status-change. All go through `LicenseActionDialog` → edge function.
- Keep renewal and certificate buttons untouched.
- Action History table: add "Internal Form" column. When `form_response_id` present, show **View Form** button that opens `LicenseActionFormViewer` in a read-only dialog.

`src/components/licenses/LicenseActionDialog.tsx`:
- Resolve form via RPC on open.
- If required + template published → render `FormRenderer`; on submit, insert `form_responses` (status=submitted, entity_type='license_action', entity_id=license.id placeholder), then call edge function with the new `form_response_id`. Edge function re-points entity_id to action id.
- If required + no published version or no config → block with clear admin guidance.
- If not required → allow reason-only submission via edge function.
- Disable close while submitting; toast on success/failure; surface `FORM_REQUIRED`.

## 4. Frontend — Form Builder

- Add `internal_license_action` as a selectable `form_type` in the template create/edit screen and in the template-list filter.
- Template listing shows the new type label.
- No second builder — reuse existing builder UI.

## 5. Admin — License Action Forms page

`src/pages/admin/LicenseActionFormsPage.tsx` at `/admin/license-action-forms`:
- Admin-only route guard.
- Table with filters: action type, scope level, active.
- Create/Edit dialog: action type, optional regulator/sector/sub-sector/category (cascading), template (filtered to `internal_license_action` + `post_license`), `is_required`, `is_active`.
- Activate/deactivate toggle inline.
- Delete with confirm.
- Sidebar nav entry under Admin.

## 6. Notifications

- Remove any client-side license-status notification dispatch — backend only.
- Reuse keys: `license.suspended`, `license.revoked`, `license.cancelled`, `license.reinstated`, `license.status_changed`.
- Extend payload with new tokens (additive; existing templates keep working).

## 7. Audit Logs

- Edge function writes `audit_logs` for every action with old/new status and form linkage.
- Form submission also logged (entity_type=`form_response`, action=`submit`) by the function after insert.

## 8. Types & cleanup

- Regenerate `src/integrations/supabase/types.ts` after migration approval.
- Remove `(supabase as any).rpc(...)` cast in `LicenseActionDialog` and any other `as any` introduced for this feature.

## 9. Verification (must all pass before declaring done)

Automated:
- Vitest: `resolve_license_action_form` priority order (mocked supabase); dialog gating (FORM_REQUIRED path; reason-only path; published-version-missing path); admin page CRUD reducer.
- Edge function deno test: role check rejects non-internal; FORM_REQUIRED returned when required; happy path inserts action, updates license, links response, writes audit, dispatches notification.

Manual end-to-end (documented in `docs/license-action-forms.md`):
1. Create internal form template (type `internal_license_action`), publish version.
2. Configure global mapping for `suspension` → that template, required=true.
3. As reviewer, open license → Suspend → modal forces form → submit → license status flips to suspended → action history shows row with View Form → notification log shows dispatched event.
4. Attempt to bypass by calling `supabase.from('licenses').update({status:'suspended'})` from console → blocked by RLS.
5. Configure category-level override → verify it wins over global.
6. Renewal flow unchanged; certificate generation unchanged; AI assessment unchanged; existing workflows unchanged.

Build: `tsgo` and vitest run clean. No `as any` regressions. No console errors in preview.

## 10. Out of scope (unchanged)

Renewal, certificates, AI assessments, workflow engine, returns, registration, applicant portal, notification dispatcher internals.

## Files touched

- `supabase/functions/perform-license-action/index.ts` (harden, link response, audit, notify)
- `supabase/migrations/<new>.sql` (only if gaps found)
- `src/components/licenses/LicenseActionDialog.tsx` (remove casts, polish)
- `src/components/licenses/LicenseActionFormViewer.tsx` (read-only viewer)
- `src/pages/licenses/LicenseDetail.tsx` (remove direct writes, add Internal Form column)
- `src/pages/admin/LicenseActionFormsPage.tsx` (CRUD complete)
- `src/components/form-builder/*` (expose `internal_license_action` type)
- `src/config/navigation.tsx`, `src/routes/adminRoutes.tsx` (nav + route)
- `src/integrations/supabase/types.ts` (regen)
- New tests under `src/test/` and `supabase/functions/perform-license-action/index_test.ts`
- `docs/license-action-forms.md` (verification steps)
