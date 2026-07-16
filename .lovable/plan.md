# Complete Complaint Management Workflow Migration

Finish converting the Complaints + Enforcement lifecycle to a fully configuration-driven workflow. No lifecycle logic, recipient selection, or status transitions may remain in React or in hardcoded SQL branches.

## 1. Frontend cleanup (presentation-only)

**`src/pages/complaints/ComplaintDetail.tsx`**
- Delete remaining lifecycle state: `resolution*`, `escalation*`, `closeDialog*`, `closeReason`, `closeCategory`, any residual mutation handlers, and unused imports.
- Actions tab reduced to non-lifecycle data helpers only (severity mapping, licensee link) — or removed entirely if those become workflow actions.
- Single lifecycle entry point: `<WorkflowActionPanel />` inside the Tracking tab.

**`src/pages/enforcement/EnforcementDetail.tsx`**
- Confirm no direct writes to `enforcement_actions` / `enforcement_case_events`; render `<WorkflowActionPanel complaintId={linkedComplaintId} />` and `<ComplaintTrackingTimeline />` only.

**Portals**
- Mount `<ComplaintTrackingTimeline />` on the complainant portal detail page and the licensee complaint detail page (visibility handled by RPC).

## 2. Concurrency fix

- `get_complaint_tracking` and `get_complaint_available_actions` return `workflow_instance_updated_at`.
- `WorkflowActionPanel` passes that timestamp (not `complaints.updated_at`) as `_expected_updated_at` to `execute_complaint_workflow_action`.
- RPC compares against `workflow_instances.updated_at` under `FOR UPDATE`; returns `STALE_STATE` on mismatch.

## 3. Configuration-driven notifications

New table `approval_action_notification_rules` (per action):
```
action_id, recipient_rule, channel, template_key, cc_rules jsonb,
payload_user_key text, configured_email text, active bool
```

Recipient rules supported (resolved in a SQL helper `resolve_notification_recipients(_instance_id, _action_id, _actor_id, _payload)`):
- current_assignee, next_assignee, complainant, licensee_primary, licensee_secondary,
  assigned_role, assigned_team, regulator_users, previous_actor, payload_user, configured_email.

`execute_complaint_workflow_action` calls the resolver and inserts only into `notification_outbox` — no direct email/in-app dispatch. Admin UI edits the rules; no code changes needed to add recipients.

## 4. Assignment engine

Extend `approval_steps.assignment_rule jsonb` supported kinds:
- role, user, team, investigator, previous_actor, payload_user, regulator_scope, inherit, expression.

Helper `resolve_step_assignment(_instance_id, _step_id, _actor_id, _payload) returns (user_id, role, team, due_at)`; called on every transition and stored on `workflow_instances` + `approval_actions` (assigned_user_id, assigned_role, assigned_team, pending_action, due_at).

Only the resolved user/role/team may execute the pending action (enforced in RPC).

## 5. Permission engine

`execute_complaint_workflow_action` validates in this order and raises structured errors:
1. `auth.uid()` present.
2. Regulator scope matches complaint.
3. Actor is assigned user OR holds assigned role OR is in assigned team OR delegated (via `delegation_rules`) OR configured on the action's allowed roles.
4. Action is available at current step.
5. Approval requirement satisfied (min approvers / distinct approvers).
6. Required fields present.

`get_complaint_available_actions` uses the same predicate — UI is a mirror, not the source of truth.

## 6. Notification worker hardening

Rewrite `process-notification-outbox`:
- New RPC `claim_notification_outbox(_limit int)` runs `SELECT ... FOR UPDATE SKIP LOCKED` and flips rows to `processing` with a `claimed_at` + `claimed_by` (function invocation id).
- Worker processes claimed rows, marks `sent` or increments `retry_count` with exponential backoff (`2^n` minutes, capped).
- After `MAX_ATTEMPTS` → `dead`. Admin retry RPC `retry_dead_outbox(_ids uuid[])`.
- Idempotency via existing dedupe unique index; add `processing` status to enum; add stuck-claim reaper (rows in `processing` > 10 min → `pending`).

## 7. Tracking RPC completion

`get_complaint_tracking` returns:
- steps: completed / current / upcoming with labels.
- current: step, next action, assigned user/role/team, SLA status, due_at.
- history: workflow actions + enforcement events + audit entries, merged and time-ordered.
- `workflow_instance_updated_at`.
- Visibility: internal users see all; complainant/licensee see only events whose action row has `public_visible = true` (new column on `approval_step_actions`).

## 8. Portal integration

- Complainant complaint detail page: embed `<ComplaintTrackingTimeline />`.
- Licensee complaint detail page (if separate): same.
- Public events include: received, under review, investigation, enforcement, notice issued, response received, decision, payment, appeal, resolved, closed — driven by `public_visible` flag on configured actions (seeded in migration).

## 9. Legacy purge

Remove/verify absent:
- `src/lib/complaintNotifications.ts` (already deleted).
- Any remaining direct updates to `complaints.status`, `enforcement_actions.*`, `enforcement_case_events` from complaint/enforcement detail pages.
- Legacy dialogs / handlers listed in §1.
- Any hardcoded status arrays gating UI actions in complaint pages.

## 10. Tests (real, not grep-only)

Vitest + SQL fixtures (pgTAP-style via `supabase--read_query` scripts):
- Workflow transition matrix (each configured step → allowed actions).
- Authorization: assigned user allowed; unassigned denied; delegated allowed; wrong regulator denied.
- Assignment resolution per rule kind.
- Notification recipient resolution per rule kind.
- Outbox: claim under concurrency (two workers, no double-send), retry backoff, dead-letter, admin retry, idempotent re-insert.
- Concurrency: stale `workflow_instance_updated_at` → `STALE_STATE`.
- Tracking visibility: internal vs complainant vs licensee.
- Enforcement lifecycle driven only through workflow actions.
- Keep grep guardrail as smoke, not primary coverage.

## 11. Verification gates

Before finishing:
```
bunx tsc --noEmit
bun run lint
bun run build
bun run test
```
Plus: run `security--run_security_scan`, review outbox worker with two parallel invocations against a seeded complaint, and confirm portal tracking renders for a complainant test user.

## Technical details (schema)

```sql
-- approval_step_actions
ALTER TABLE approval_step_actions
  ADD COLUMN IF NOT EXISTS public_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assignment_rule jsonb,
  ADD COLUMN IF NOT EXISTS mutation_spec jsonb;

-- notification rules
CREATE TABLE approval_action_notification_rules (
  id uuid pk, action_id uuid fk approval_step_actions,
  recipient_rule text, channel text, template_key text,
  payload_user_key text, configured_email text,
  cc_rules jsonb default '[]', active boolean default true,
  created_at, updated_at
);

-- outbox
ALTER TABLE notification_outbox
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by text;
-- extend status check to include 'processing'
```

Grants + RLS for both new/altered tables; service_role for edge functions; authenticated read for config where appropriate.

## Deliverables in final report
Files changed, migrations, RPCs modified, workflow config changes, notification rule seeds, assignment rule seeds, test results (tsc / lint / build / test outputs), regression summary, remaining limitations, commit hash.
