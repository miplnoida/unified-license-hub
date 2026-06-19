# Reopen APP-2026-000079 to allow action on Step 2

The Commercial Bank workflow has 2 steps, but this application was finalized on Step 1 (anomaly previously diagnosed). To let the reviewer act on Step 2, we need a one-off data fix — not a frontend change.

## Current state (verified)

- `applications.status = 'approved'`
- `workflow_instances` `5b75e854…`: status `completed`, `current_step_id = Step 1`, `completed_at = 2026-06-19 09:03`
- `approval_actions`: one row `action = 'approve_final'` on Step 1 by actor `35da4b65…`
- `licenses`: `LIC-2026-000013` issued to holder `817c85c1…`
- Steps: Step 1 (`e1b3eb3a…`), Step 2 (`203778cb…`)

## Plan — targeted data fix (this application only)

1. Delete the issued license tied to this application
   - `DELETE FROM licenses WHERE application_id = '018a72cc-…';`
   - (No `licensees` row created by this flow — holder mapping lives on the license; verify and clean up any downstream artifacts if present: `license_certificates`, `license_actions` for `LIC-2026-000013`.)
2. Delete the premature final-approval action
   - `DELETE FROM approval_actions WHERE id = '550284de-…';`
3. Reopen the workflow instance to Step 2
   - `UPDATE workflow_instances SET status='active', current_step_id='203778cb-…', current_step_key=<step2 key if used>, completed_at=NULL, updated_at=now() WHERE id='5b75e854-…';`
4. Revert application status so the WorkflowPanel shows live actions
   - `UPDATE applications SET status='in_progress', updated_at=now() WHERE id='018a72cc-…';`
5. (Optional) Log the manual fix in `audit_logs` with a clear remark.

## Out of scope

- No frontend changes (the read-only "Not reached" timeline added previously stays).
- No changes to `perform_final_workflow_approval`, workflow templates, or any other application.
- No edits to the Commercial Bank workflow definition.

## Verification

- Open `/applications/018a72cc-d46b-41ea-ba9a-6d0ac262ffa7`:
  - WorkflowPanel renders Step 1 as Completed, Step 2 as Current.
  - Action buttons appear for the Step 2 approver.
  - No license listed for the app; licensee portal access for the previously provisioned holder is gone.
- Other applications unaffected.

## Confirmations needed

- OK to permanently delete `LIC-2026-000013` and the `approve_final` action row?
- Any licensee/user access already created from this license should be revoked too — confirm.
