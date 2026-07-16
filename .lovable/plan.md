
# Dynamic Complaint Management Workflow

Goal: every complaint and complaint-linked enforcement action is executed through workflow configuration, not hardcoded React logic. Admins can add/reorder/disable steps, actions, assignees, and notification rules without a redeploy.

## 1. Data model (migrations)

Extend existing workflow tables rather than forking:

- `approval_workflows` — one canonical row for `entity_type = 'complaint'`, label **Complaint Management Workflow** (do not rename the module).
- `approval_steps` — one row per lifecycle stage: `filed → triage → assigned → investigation → escalation → notice_issued → response → decision → payment → appeal → resolution → closed / withdrawn`. Add columns if missing: `is_start bool`, `is_terminal bool`, `sla_hours int`, `complainant_visible bool`, `licensee_visible bool`, `assignment_rule jsonb` (kind + params).
- `approval_step_actions` — one row per action button. New/reused columns:
  - `action_key`, `label`, `enabled`
  - `source_step_id`, `target_step_id`
  - `allowed_roles text[]`, `allowed_teams uuid[]`
  - `requires_approval bool`, `required_fields jsonb`, `validation_schema jsonb`
  - `next_assignee_rule jsonb`
  - `complainant_visible bool`, `licensee_visible bool`
  - `sla_delta_hours int`
- `workflow_action_notifications` (new or reuse existing action-notifications table): `action_id`, `event_key`, `channel enum('in_app','email')`, `recipient_rule jsonb`, `template_id`.
- `notification_outbox` **(new, durable)**: `id, event_key, entity_type, entity_id, recipient_user_id, recipient_email, channel, template_id, payload jsonb, status enum('pending','sent','failed'), retry_count int, last_error text, created_at, sent_at`. Indexed on `(status, created_at)`.
- `workflow_instances` — reuse; store `current_step_id`, `assigned_user_id`, `assigned_role`, `assigned_team_id`, `due_at`, `sla_status`, `updated_at` (used for optimistic concurrency).
- `workflow_action_history` — reuse/extend with `before_json`, `after_json`, `correlation_id`.

Backfill migration: for every existing complaint without an instance, create one at the step matching its current status; link every enforcement case to its parent complaint's instance.

## 2. Canonical RPC

```
execute_complaint_workflow_action(
  _complaint_id uuid,
  _action_key text,
  _payload jsonb,
  _expected_updated_at timestamptz
) returns jsonb
```

Runs in a single transaction:

1. `auth.uid()` check.
2. Load complaint + linked enforcement + workflow instance + current step (FOR UPDATE).
3. Optimistic concurrency: `instance.updated_at = _expected_updated_at`.
4. Find `approval_step_actions` row for `(current_step, action_key)` with `enabled = true`.
5. Permission check: role/team/assignment/approval — via `has_role`, team membership, `assigned_user_id`.
6. Validate `_payload` against `validation_schema` + `required_fields`.
7. Apply mutation:
   - complaint fields (status, resolution note, etc.), or
   - `enforcement_actions` insert/update, or
   - `enforcement_case_events` insert
   - — chosen by `action_key` handler map inside the RPC (all mutations happen server-side).
8. Advance instance to `target_step_id`; resolve next assignee via `next_assignee_rule` and store on instance.
9. Insert `workflow_action_history` with before/after JSON.
10. Insert tracking event.
11. For each configured `workflow_action_notifications`, resolve recipients and insert one `notification_outbox` row per recipient×channel (idempotent on `(event_key, entity_id, recipient, channel, action_history_id)`).
12. Return `{ status, current_step, assigned_user, available_actions[], updated_at }`.

Errors raise → whole txn rolls back (including outbox rows).

Companion RPCs:

- `get_complaint_available_actions(_complaint_id)` — returns only actions the caller may execute at current step.
- `get_complaint_tracking(_complaint_id)` — permission-aware merged timeline (instance history + audit + enforcement events + resolved assignee names + SLA/due dates); redacts internal-only notes for complainant/licensee.

## 3. Notification worker

Small edge function `process-notification-outbox` (cron every 1 min):

- Claim up to N `pending` rows with `SELECT ... FOR UPDATE SKIP LOCKED`.
- Render template with payload.
- Deliver via existing email transport for `email`, insert into `notifications` for `in_app`.
- On success set `sent`; on error increment `retry_count`, store `last_error`, exponential backoff via `next_attempt_at`; move to `failed` after N retries. Admin surface lists failed rows with retry button.

Client `notifyComplaintLifecycle` is removed — the RPC owns dispatch.

## 4. Frontend changes (presentation only)

- `ComplaintDetail.tsx` and `EnforcementDetail.tsx`:
  - Remove hardcoded status checks (`canIssueNotice`, allowed-status arrays, `status === 'notice_issued'`, etc.).
  - Remove direct writes to `enforcement_actions`, `enforcement_case_events`, and `notifyComplaintLifecycle` calls.
  - Fetch `available_actions` from RPC; render buttons from that list; on click call `execute_complaint_workflow_action` with the action's `required_fields` collected via a generic dialog driven by `validation_schema`.
  - Show tracking via `get_complaint_tracking` (new `ComplaintTrackingTimeline` becomes a thin renderer over that RPC result; existing audit-based fallback removed).
- Licensee and complainant portals mount the same tracking component (RPC enforces field visibility).
- Workflow admin builder (`WorkflowConfig` / step + action editors) gains fields for `action_key`, `target_step`, `allowed_roles/teams`, `next_assignee_rule`, `complainant_visible`, `licensee_visible`, notification recipients, channels, template picker. Save-time validation runs `validate_complaint_workflow(workflow_id)` (new RPC) enforcing: unique action keys, reachable steps, exactly one start, ≥1 terminal, every action has target step + permissions, notifications have template + recipients, assignment rules resolvable.

## 5. Tests (vitest + SQL smoke)

- `execute_complaint_workflow_action`: happy path per action, wrong role denied, wrong assignee denied, stale `updated_at` denied, invalid payload denied, rollback on failure.
- Assignment resolution for every rule kind.
- Outbox: one row per configured recipient×channel; retry increments; no duplicates on re-run; failed email retryable.
- Tracking RPC redaction for complainant vs licensee vs internal.
- Backfill: existing complaints get instances mapped from status.
- Verification greps (must return empty in production code):
  ```
  rg "from\(['\"]enforcement_actions['\"]\)\.update" src/pages src/components
  rg "from\(['\"]enforcement_case_events['\"]\)\.insert" src/pages src/components
  rg "notifyComplaintLifecycle|dispatchNotificationEvent" src/pages/enforcement src/pages/complaints src/components/complaints
  rg "canIssueNotice|canRecordResponse|canDecide|canAppeal|canCloseOrWithdraw" src/pages/enforcement
  ```

## 6. Migration / rollout order

1. Schema additions + `notification_outbox` + indexes + GRANTs + RLS.
2. Seed/refresh Complaint Management Workflow (steps, actions, notifications, templates).
3. Backfill workflow instances + link enforcement.
4. Deploy RPCs (`execute_complaint_workflow_action`, `get_complaint_available_actions`, `get_complaint_tracking`, `validate_complaint_workflow`).
5. Deploy outbox worker edge function + cron.
6. Refactor `ComplaintDetail.tsx`, `EnforcementDetail.tsx`, licensee/complainant portal detail, admin workflow builder.
7. Remove legacy client dispatchers and hardcoded gating.
8. Run tests, tsgo, lint, build; manual matrix (regulator, investigator, enforcement officer, complainant, licensee primary/secondary, unauthorized).

## Technical notes

- Optimistic concurrency uses `workflow_instances.updated_at`; UI passes the value it last read.
- Recipient rule kinds supported by resolver: `current_assignee`, `next_assignee`, `complainant`, `licensee_primary`, `licensee_secondary`, `role`, `team`, `regulator_users`, `previous_actor`, `payload_user`.
- Outbox `(event_key, entity_id, recipient, channel, action_history_id)` unique constraint guarantees exactly-once per action.
- `get_complaint_tracking` returns two visibility variants selected server-side from `has_role` + complaint linkage; never trusts client claims.
- No changes to global Approval Workflow module name, existing URLs, or unrelated workflows (application, return, license).

## Out of scope

- Bulk admin re-assignment UI beyond what already exists.
- SLA re-engineering beyond storing `due_at` and `sla_status` per instance.
- Rewriting non-complaint workflows.
