# Internal Form Integration for License Actions

Gate Suspend / Revoke / Cancel / Reinstate on License Detail behind a configurable internal form, persist the response, and let admins manage the action→form mapping. Renewal, certificates, AI, workflow engine, applicant portal, and the existing notification dispatcher stay untouched.

## 1. Database changes (single migration)

**a. Extend `form_templates.form_type`** — drop the existing CHECK and re-add allowing the new value `internal_license_action` alongside existing types (`pre_license`, `post_license`, and anything else already used). Existing rows unaffected.

**b. New table `public.license_action_form_configs`** (with full GRANT + RLS):

```text
id, regulator_id?, sector_id?, sub_sector_id?, category_id?,
license_action_type text CHECK in (suspension, revocation, cancellation,
                                   reinstatement, status_change),
form_template_id -> form_templates(id),
is_required bool default true,
is_active bool default true,
created_at, updated_at
```
- RLS: authenticated read; only admins (`has_role(auth.uid(),'admin')`) write.
- Index on `(license_action_type, is_active)`.

**c. Add nullable columns to `license_actions`**: `form_response_id uuid`, `form_template_id uuid`, `form_version_id uuid`. Backfill stays NULL.

**d. RPC `public.resolve_license_action_form(_action_type text, _regulator_id uuid, _sector_id uuid, _sub_sector_id uuid, _category_id uuid)`** — SECURITY DEFINER, returns the best-match active config row using the priority: category → sub_sector → sector → regulator → global. Lets the client know if a form is required and which template to load before opening the modal.

## 2. Edge Function `perform-license-action`

New function in `supabase/functions/perform-license-action/index.ts`. Owns the entire state transition so the client cannot bypass it.

Body: `{ license_id, action_type, new_status, reason?, form_response_id? }`.

Flow:
1. Auth: validate JWT; load profile; assert internal role (admin/reviewer/approver/supervisor) via `has_role`.
2. Load license + taxonomy (sector/sub_sector/category/regulator).
3. Call `resolve_license_action_form`. If `is_required` and no `form_response_id` → 200 with `{ error: 'FORM_REQUIRED', template_id }`.
4. If a `form_response_id` is supplied, verify it belongs to the caller, matches the resolved template, has `status='submitted'`, and `entity_type='license_action'`.
5. Enforce existing reason rule for mandatory-reason actions.
6. Insert `license_actions` row (including `form_response_id`, `form_template_id`, `form_version_id`).
7. Update `licenses.status`; mirror to `licensees` for revoked/cancelled (preserve current behavior).
8. Append to `audit_logs` via existing pattern.
9. Dispatch the matching `license.*` notification event with the existing payload plus `form_response_id`, `form_template_name`, `licensee_id`, `licensee_name`, `action_type`, `action_date`.
10. Return `{ ok: true, action_id }`.

Renewal stays on its current path — this function only handles suspension/revocation/cancellation/reinstatement/status_change.

## 3. Frontend — License Detail modal flow

Edit `src/pages/licenses/LicenseDetail.tsx`:
- Replace inline reason textarea + direct action buttons with a single `LicenseActionDialog` opened per action type. Existing renewal button + certificate buttons are untouched.
- New component `src/components/licenses/LicenseActionDialog.tsx`:
  - On open: call `resolve_license_action_form` RPC.
  - If a template is required: render the existing `FormRenderer` for that template/version inside the dialog (reusing `src/components/form-renderer/FormRenderer.tsx`); also show reason field when the action requires one.
  - Submit handler: write a `form_responses` row (`entity_type='license_action'`, `entity_id=<uuid placeholder>` — we use a generated UUID we’ll also pass as the action’s own id, OR submit response first, then call function and update entity_id post-hoc; chosen approach: insert response first with a temp `entity_id` equal to `license.id`, then patch `entity_id` to the created `action_id` after the function returns).
  - Call `supabase.functions.invoke('perform-license-action', ...)` with the `form_response_id`.
  - Handle `FORM_REQUIRED` / validation errors with toasts.
- On success: refresh license + actions list, close modal, toast.
- Action history table gets a new column “Internal Form” showing **View Submitted Form** when `form_response_id` is present, opening a read-only `FormRenderer` dialog.

Remove the direct `supabase.from('license_actions').insert/update` path from this page — it now only calls the edge function.

## 4. Admin configuration UI

New page `src/pages/admin/LicenseActionFormsPage.tsx` (route `/admin/license-action-forms`, added to admin routes + Settings/admin nav under existing License or Settings group):
- Table of `license_action_form_configs` rows with filters by action type and scope.
- Create/Edit dialog with: action type, regulator/sector/sub-sector/category (optional, cascading), form template (filtered to `form_type in ('internal_license_action', 'post_license')` so existing internal-style templates remain usable), required toggle, active toggle.
- Admin-only route guard.

Form Builder gets `internal_license_action` exposed as a new selectable `form_type` in the existing template create/edit screen — no second builder.

## 5. Notifications

Backend dispatch only (removed from client). Event keys reused unchanged:
`license.suspended`, `license.revoked`, `license.cancelled`, `license.reinstated`, `license.status_changed`. Existing templates and recipient rules continue to work; new optional tokens (`form_response_id`, `form_template_name`, `licensee_id`, `licensee_name`, `action_date`) are additive.

## 6. Security / RLS

- `license_action_form_configs`: admin write, authenticated read.
- `form_responses` for `entity_type='license_action'`: rely on existing policies (owner + admin). Add an extra policy permitting internal-role users to read responses where `entity_type='license_action'` so reviewers/approvers can view history.
- Edge function is the only write path that touches `licenses.status` for these actions — frontend RLS for `licenses` remains as is; we don't loosen it.

## 7. Out of scope (explicitly unchanged)

Renewal flow, `generate-license-certificate`, AI assessments, workflow approval engine, return/application/registration flows, applicant portal, notification dispatcher internals.

## 8. Acceptance verification

Manual + targeted tests:
- Vitest for `resolve_license_action_form` priority (via mocked supabase) and for the dialog gating logic.
- Smoke: configure a required form for `suspension`, attempt suspend without form → blocked; with form → action recorded, status changes, action history shows form link, licensee gets notification.
- Confirm renewal and certificate buttons still work; existing post_license forms still load.

## Technical notes

- File touches: 1 new migration; 1 new edge function; new `LicenseActionDialog.tsx`; edits to `LicenseDetail.tsx`; new `LicenseActionFormsPage.tsx` + route entry; small edit to Form Builder template-type selector; minor type regen after migration approval.
- Reuse: `FormRenderer`, `form_templates` / `form_versions` / `form_fields`, `form_responses`, `dispatch-notification-event`, `logAudit`, existing `has_role`.
- No changes to `supabase/config.toml` required (edge function defaults).
