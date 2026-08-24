# Fix: "No Registration workflow attached" shown to authorized reviewers

## What is actually wrong

Confirmed by inspecting the database:

- Reading a workflow instance requires `workflow_management.view` (via `can_read_workflow_instance`), and reading the workflow/steps requires the same (via `can_read_approval_config`).
- Only 7 roles hold `workflow_management.view` today: Analyst, Legacy Admin, Licensing Officer, Rule Engine Administrator, Super Admin, System Administrator, Workflow Administrator.
- Every supervisor/reviewer role — Licensing Supervisor, Returns Supervisor, Complaints Supervisor, Prudential Supervisor, etc. — holds none of them.
- Result: the row exists (there is one active instance for the registration in question) but is filtered out by row-level security, and the screen renders the "no workflow attached" empty state.

So this is a read-authorization gap, not a missing workflow, plus a UI that treats "zero rows" as "not configured".

## Fix

### 1. Backend read visibility (database migration)

- New helper `is_workflow_step_participant(user)` — true when the user is configured as an approver on any approval step (dynamic role id, `approver_config.role_ids`, `approver_config.user_ids`, or legacy `approver_role` matching a system role).
- New helper `can_view_any_workflow_entity(user)` — true when the user holds `view` on any workflow-consuming module (registration, application, returns, complaints, inspection, licensing, license, enforcement, fit & proper, correspondence).
- `can_read_workflow_instance` gains: the two helpers above, plus registration owners (`registrations.user_id`).
- `can_read_approval_config` gains: the two helpers above.
- Write/act/configure authorization is untouched — `can_act_on_approval` and `can_mutate_approval_config` stay exactly as they are, so read access never grants the ability to approve, reject, or edit a workflow.

### 2. UI states (frontend)

In `src/pages/admin/RegistrationReviewDetail.tsx` and `src/components/applications/WorkflowPanel.tsx`:

- Distinguish four states instead of one empty state:
  - **Loading** — spinner, never the empty state.
  - **State A — no workflow** ("No Registration workflow attached") only when the query succeeded and returned zero rows.
  - **State B — instance exists + authorized** — full action panel (already works).
  - **State C — instance exists + not authorized** — read-only timeline plus the pending sentence.
- Surface query errors as an explicit "Unable to load workflow" message with retry, instead of silently degrading to "no workflow".
- Replace `.maybeSingle()` with an ordered `limit(1)` read so multiple historical instances cannot throw.

### 3. Pending-with label

`src/lib/workflowPendingLabel.ts` already resolves specific users → dynamic roles → legacy role into real names ("This step is pending at Licensing Supervisor level." / "This step is pending with John Smith."). The read-only State C branch will use it, which starts working correctly as soon as the reviewer can read the step configuration.

## Verification

- Re-query the affected registration's instance as a Licensing Supervisor persona and confirm the row is visible.
- Confirm a licensee/external persona still cannot read other entities' instances.
- Run the RBAC pgTAP suite and the frontend tests, then check the workflow panel in the preview.

Switch to build mode to apply the migration and the UI changes.
