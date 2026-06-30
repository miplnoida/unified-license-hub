## Root cause

The error is coming from the **"Review Actions" (manual approve) panel** on the Application Detail page (`src/pages/applications/ApplicationDetail.tsx`, `handleStageTransition`, line ~299), not from the Workflow panel.

Edge logs confirm it: the only failing recent edge calls are two `POST /functions/v1/approve-pre-licensee → 409` requests. There were no calls to `perform-workflow-action`, so the click went straight to `approve-pre-licensee`.

What's broken: `supabase/functions/approve-pre-licensee/index.ts` was refactored to be **provisioning-only**. It now requires the application to already be `status = 'approved'` and to already have an associated `licenses` + `licensees` row (created atomically by the `perform_final_workflow_approval` RPC). When called directly from the manual UI:

1. The app is still `submitted` / `under_review` (workflow never ran, or wasn't configured).
2. The function returns `409 NOT_APPROVED` (or `NO_LICENSE` / `NO_LICENSEE`).
3. `supabase-js` surfaces the non-2xx as the generic toast **"Edge Function returned a non-2xx status code"**.

The manual UI shows up because `showManualActions = workflowChecked && workflowOn === false && …` — i.e. no workflow is configured/active for that application's request type, so the user sees the "Workflow is not active/configured" Approve / Reject / Resubmit buttons. They click Approve, and the call fails.

Why "step 1" wording: the failing application is the first in your queue / first action you tried; there is no actual workflow step. The manual panel says "Approval workflow is not active for this request type".

The same broken assumption exists in two more places that still call `approve-pre-licensee` expecting it to do the approval itself:
- `src/components/applications/PaymentVerificationDialog.tsx` (line ~111)
- `src/pages/admin/ApprovedLicensees.tsx` (line ~100) — this one already partly works because it first runs `reset_application_for_provisioning` to put the app back into `approved`, but only for already-approved apps.

## Fix

Two parts: a new trusted RPC for the manual / no-workflow approval, and tightening the UI + error toasts.

### 1. New SQL RPC `perform_manual_application_approval(_application_id, _comments, _actor_id)`

A `SECURITY DEFINER` function that mirrors what `perform_final_workflow_approval` does, minus the workflow-instance/step bookkeeping. In one transaction:

- Validate the caller is internal staff (super_admin / admin / supervisor / licensing_officer) via `has_role` / `get_user_role`.
- Validate the app exists and is in an approvable status (`submitted`, `under_review`, `review`, `pending_review`); reject otherwise with a structured `{error, code, http}` payload.
- Bypass the workflow-mutation lock trigger (set `app.workflow_mutation_context`, same pattern `reject_application_action` uses).
- `UPDATE applications SET status='approved', approved_at=now(), approved_by=_actor_id WHERE id=_application_id`.
- Insert the `licenses` row (license_number via the existing sequence/helper used by `perform_final_workflow_approval`) and the `licensees` row linked to it.
- Insert an `approval_actions` row (action_type='approve', comments).
- Insert an `audit_logs` row and an in-app `notifications` row to the applicant.
- Return `{ success: true, application_number, license_id, license_number, licensee_id }`.

GRANT EXECUTE to `authenticated` (the function itself enforces the role check).

### 2. Wire the manual UI to the new RPC

In `src/pages/applications/ApplicationDetail.tsx → handleStageTransition`:

- For `newStatus === 'approved'`, replace the direct `approve-pre-licensee` invoke with:
  1. `supabase.rpc('perform_manual_application_approval', { _application_id, _comments })`.
  2. If that returns success, then call `supabase.functions.invoke('approve-pre-licensee', { body: { application_id } })` for auth-user provisioning. Provisioning failure must **not** fail the action — surface it as a warning toast ("Application approved. User provisioning will be retried — please reset password from Employee Management if needed"), exactly like `perform-workflow-action` does.
- Improve the error toast: parse `error.context.json()` to show the real server error instead of the generic "non-2xx" message (same pattern already used in `WorkflowPanel.executeAction` and the recently-fixed `UserManagement.handleCreate`).

### 3. Same error-surfacing fix in the other two callers

`PaymentVerificationDialog.tsx` and `ApprovedLicensees.tsx`: read `res.error.context.json()` and show the real `error` field, so we never see the generic non-2xx string again.

## Out of scope

- `approve-pre-licensee` itself is **not** changed — its provisioning-only contract is correct.
- No change to the workflow path (`perform-workflow-action` + `perform_final_workflow_approval`).
- No change to RLS / GRANTs on existing tables (the new RPC handles its own auth).
- No UI re-layout or copy changes beyond the error toast and the warning-on-provisioning-failure case.

## Acceptance

- Internal user clicks **Approve** in the Manual "Review Actions" panel → application moves to `approved`, license + licensee are created, web user is provisioned, success toast shows the license number.
- If provisioning fails, the user still sees a success message with a warning, not a red "non-2xx" error.
- Any real server-side rejection (insufficient permission, app in wrong state, missing applicant email) is shown as a clear message, not the generic non-2xx string.
- WorkflowPanel approval flow is unchanged.
- Existing `ApprovedLicensees` "Generate License" flow still works for already-approved apps.
