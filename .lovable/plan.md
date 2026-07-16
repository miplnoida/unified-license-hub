
# Complaint Management Workflow — Completion Plan

Goal: make the complaint + enforcement lifecycle 100% driven by workflow configuration. React becomes a thin presentation layer that only calls `execute_complaint_workflow_action` and `get_complaint_tracking`. All notifications go through the durable outbox.

---

## 1. Frontend cleanup (presentation-only)

**`src/pages/enforcement/EnforcementDetail.tsx`**
- Remove: direct `enforcement_actions` updates, `enforcement_case_events` inserts, `notifyComplaintLifecycle` calls, hardcoded status arrays, all `canIssueNotice / canRecordResponse / canDecide / canAppeal / canCloseOrWithdraw` gates, any `status === '…'` action visibility.
- Replace lifecycle buttons with `<WorkflowActionPanel complaintId={linkedComplaintId} />` driven by `get_complaint_available_actions`.
- Keep only: header, read-only details, tabs, tracking timeline, evidence/correspondence panels.

**`src/pages/complaints/ComplaintDetail.tsx`**
- Delete legacy Assign / Resolve / Close / Escalate cards.
- Sole action entry point: `WorkflowActionPanel`.
- Sole timeline source: `get_complaint_tracking` via `ComplaintTrackingTimeline`.

**`src/lib/complaintNotifications.ts`**
- Delete file. Purge all `notifyComplaintLifecycle` imports.

**Grep gates in CI test** (`src/test/complaintWorkflowGuardrails.test.ts`, new):
- Assert `rg` finds zero matches for: `notifyComplaintLifecycle`, direct `enforcement_actions`/`enforcement_case_events` mutations in `src/`, `canIssueNotice|canRecordResponse|canDecide|canAppeal|canCloseOrWithdraw`, `status === 'notice_issued'|'decided'` under `src/pages/enforcement`.

---

## 2. Workflow schema — configuration surface

Migration `complaint_workflow_config_v2`:

- `approval_step_actions`: ensure columns `assignment_rule jsonb`, `mutation_spec jsonb`, `required_fields jsonb`, `target_step_key text`, `sort_order int`, `require_approval bool`, `visibility jsonb` (who can see the action button), `sla_minutes int`.
- New `approval_action_notification_rules` (per step_action) — replaces hardcoded recipient SQL:
  ```
  id, step_action_id, event_key, channel ('in_app'|'email'|'sms'),
  recipient_rule text,        -- see §3
  recipient_config jsonb,     -- role_key / team_id / payload_field / email / regulator_scope
  template_key text,          -- FK to notification_templates
  is_enabled bool, sort_order int
  ```
  GRANT + RLS (admin-only write; read to authenticated).
- New `approval_step_assignment_rules` (optional overrides) — same shape idea: `rule_kind`, `config jsonb`.

## 3. Assignment engine (SQL)

`resolve_workflow_assignee(_complaint_id, _step_id, _payload jsonb)` returns `(user_id, role_key, team_id)`.

Supported `rule_kind`:
- `role` — first active user with role in regulator scope
- `user` — fixed user_id
- `team` — team_id, no specific user
- `investigator` — current investigator on complaint
- `previous_actor` — last actor in `approval_actions`
- `payload_user` — `_payload->>'assignee_id'`
- `regulator_scope` — regulator admins for complaint's regulator
- `inherit_current` — keep current assignee
- `expression` — safe jsonlogic evaluator against complaint + payload

Persist on `workflow_instances`: `assigned_user_id`, `assigned_role`, `assigned_team_id`, `pending_action`, `due_at`.

## 4. Permission engine (SQL)

`can_execute_complaint_action(_user_id, _complaint_id, _action_id)`:
- authenticated
- regulator scope match
- one of: assigned_user / assigned_team member / configured role / delegated
- step is current
- required approvals satisfied
- action visibility allows role

Called at top of `execute_complaint_workflow_action`; raises `ROLE_NOT_PERMITTED` on fail.

## 5. Rewrite `execute_complaint_workflow_action`

Order:
1. Lock complaint + workflow_instance row (`FOR UPDATE`), check `_expected_updated_at`.
2. Permission check.
3. Validate `required_fields` against `_payload`.
4. Apply `mutation_spec` (declarative jsonb: `set_complaint_status`, `set_enforcement_status`, `insert_enforcement_event`, `set_field`, `create_enforcement_case`, `record_payment`, `record_appeal`, …). No hardcoded per-action branches.
5. Insert `approval_actions` row (audit).
6. Advance to `target_step_key`; call `resolve_workflow_assignee`; update instance.
7. **Notifications**: loop `approval_action_notification_rules` for the action, resolve recipients via `resolve_notification_recipients(rule, complaint, action_ctx)`, insert `notification_outbox` rows only. No direct sends, no `notifications` inserts.
8. Return new state + available_actions for the next step.

`resolve_notification_recipients(rule_kind, config, ctx)` supports:
`current_assignee, next_assignee, workflow_assigned_user, assigned_team, assigned_role, complainant, licensee_primary, licensee_secondary, regulator_users, previous_actor, payload_user, configured_email`.

## 6. Notification outbox worker

`supabase/functions/process-notification-outbox/index.ts` already exists — harden it:
- Batch 50, `FOR UPDATE SKIP LOCKED` via RPC `claim_outbox_batch`.
- Per row: render template (`notification_templates` by `template_key`), then:
  - `in_app` → insert `notifications`
  - `email` → invoke `dispatch-notification-event` with pre-rendered subject/body
  - `sms` → stub (log skipped)
- Retry with exponential backoff (2ⁿ min, cap 60); after 6 attempts → `dead`.
- Idempotency via existing unique `(event_key, entity_id, recipient, channel, action_history_id)`.
- Admin retry RPC `retry_dead_outbox(_id)`.
- pg_cron: keep every-minute schedule.

## 7. Tracking unification

Rewrite `get_complaint_tracking(_complaint_id, _viewer_role)`:
- Returns `{ steps[], current_step, next_action, assigned_user, assigned_role, assigned_team, sla, due_at, history[] }`.
- `history[]` merges: `approval_actions`, `enforcement_case_events`, `audit_logs` (where entity matches), `notification_outbox` (sent items only).
- Filter by viewer:
  - internal → all
  - licensee / complainant → only rows where `approval_step_actions.visibility.public = true` OR event is in configured public list.
- No frontend direct reads of `audit_logs` / `enforcement_case_events` for complaints.

Wire timeline into:
- `ComplaintDetail` (Tracking tab)
- `EnforcementDetail` (Tracking tab)
- Licensee portal complaint page
- Complainant portal complaint page

## 8. Workflow configuration seed

Update the seeded 12-step "Complaint Management Workflow":
- Add per-action `assignment_rule`, `required_fields`, `mutation_spec`, `target_step_key`, `visibility`.
- Insert `approval_action_notification_rules` for every action covering: filed, assigned, reassigned, investigation_started, escalated, notice_issued, response_received, decision_recorded, payment_recorded, appeal_filed, resolved, closed, withdrawn, approval_requested, approval_completed, overdue, sla_breach.
- Two channels each (`in_app` + `email`) with existing templates; create missing `notification_templates` for enforcement events.
- SLA per step.

## 9. Tests (`vitest`)

New files under `src/test/`:
- `complaintWorkflowGuardrails.test.ts` — grep checks per §1.
- `complaintWorkflowTransitions.test.ts` — mocked RPC transitions.
- `complaintPermissionEngine.test.ts` — allowed/denied matrix.
- `complaintAssignmentResolver.test.ts` — each `rule_kind`.
- `complaintNotificationRecipients.test.ts` — each recipient rule.
- `complaintOutboxWorker.test.ts` — retry/backoff/dead-letter/idempotency.
- `complaintTrackingVisibility.test.ts` — internal vs licensee vs complainant views.
- `enforcementLifecycleThroughWorkflow.test.ts` — notice → response → decision → close all via RPC.
- `complaintAdminConfigChange.test.ts` — changing a step's notification rule reflects at runtime.

SQL smoke: `scripts/complaint-workflow-smoke.sql`.

## 10. Verification gates

Run before final commit:
- `bunx tsgo --noEmit`
- `bun run lint`
- `bun run build`
- `bun run test`
- Grep set from the task (all must return zero).

## Technical details

**Files changed (new/modified)**
- `src/pages/enforcement/EnforcementDetail.tsx` (major rewrite → presentation only)
- `src/pages/complaints/ComplaintDetail.tsx` (remove legacy cards)
- `src/components/complaints/WorkflowActionPanel.tsx` (already dynamic — extend for enforcement complaint linkage)
- `src/components/complaints/ComplaintTrackingTimeline.tsx` (viewer-role prop, merged history)
- `src/pages/portal/LicenseeComplaintDetail.tsx`, `src/pages/portal/ComplainantComplaintDetail.tsx` — mount tracking
- Delete: `src/lib/complaintNotifications.ts`
- `supabase/functions/process-notification-outbox/index.ts` — harden
- `supabase/functions/dispatch-notification-event/index.ts` — accept pre-rendered payload
- Tests as above

**Migrations**
1. `complaint_workflow_config_v2` — schema for rules tables + columns.
2. `complaint_workflow_rpcs_v2` — rewrite `execute_complaint_workflow_action`, add `resolve_workflow_assignee`, `resolve_notification_recipients`, `can_execute_complaint_action`, `claim_outbox_batch`, `retry_dead_outbox`, rewrite `get_complaint_tracking`.
3. `complaint_workflow_seed_v2` — seed 12-step config + notification rules + templates (as `insert` tool, since it contains data).

**Rollback**: previous RPC versions kept as `*_legacy` for one release; feature flag `complaint_workflow_v2_enabled` in `site_settings` gates the RPC selection in the frontend during rollout (optional, off by default only if you want a safety net).

---

## Out of scope
- Renaming the Approval Workflow module.
- Non-complaint entities (applications, returns) — untouched.
- SMS delivery (stubbed; outbox row created but marked skipped).

## Known limitations after ship
- `expression` assignment rule uses a minimal jsonlogic subset — full DSL later.
- Historical complaints predating v2 keep their prior audit trail; new events append via the workflow.
