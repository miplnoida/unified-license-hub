# Approval Workflow Builder — Upgrade Plan

## Current state (verified in repo)

- `approval_steps` columns: `step_order`, `name`, `description`, `approver_role` (enum, required), `approver_role_id`, `sla_hours`, `allowed_actions` (jsonb string[]), `escalation_role`, `escalation_after_hours`, `is_required`, `condition`. **No** `approver_type`, `approver_config`, `auto_approve_on_timeout`.
- `approval_action_notifications` exists and is keyed by `(step_id, action_type, event_key)`. UI editor `ActionNotificationsEditor.tsx` already supports full multi-row CRUD. Runtime `perform-workflow-action/index.ts` already fans out enabled rows per `(step_id, action_type)`.
- Routing today is implicit: "next step = next `step_order`" inside `perform_workflow_transition` (SQL RPC). No per-action `next_step_id`, `end_state`, or `result_status_override`.
- Per-action metadata (name, mandatory comments, result status override, next step) does **not** exist — actions are just strings in `allowed_actions`.
- No step-entry notification table — only event-based dispatch via `dispatch-notification-event`.
- WorkflowList editor (`src/pages/workflows/WorkflowList.tsx`, 1566 lines) shows "Due within" label, single role-only approver, allowed-actions checkboxes, and embeds `ActionNotificationsEditor`.
- Action type whitelist (runtime + UI): `approve`, `reject`, `send_back`, `escalate`, `request_resubmission`, `return_for_correction`, `request_more_info`. The screenshots mention `query_to_applicant`, `review`, `review_for_previous_reviewer`, `schedule_meeting` — **none** are supported by `perform_workflow_transition` today.

## Scope decisions (honest about runtime)

Per the brief ("Do not show action types that cannot be executed by runtime"), the build is split into:

**In scope — UI + DB + runtime end-to-end**
1. Specific-users approver type (resolver + step-permission check)
2. SLA hours relabel + auto_approve_on_timeout **config** (saved, surfaced; runtime executor flagged as "planned" — no fake processor)
3. Per-action config: name, mandatory comments (runtime enforced), result_status_override, next_step routing (`end_workflow`+end_state, `next`, `specific_step`, `previous`, `return_to_applicant`)
4. Step-entry notifications (new table + dispatcher hook on transition into step)
5. Full Workflow Builder UI redesign with cards/accordions
6. Validation gates before publish

**Out of scope (will not be added as fake options)**
- `schedule_meeting`, `review`, `review_for_previous_reviewer`, `query_to_applicant` as distinct action types — `query_to_applicant` is functionally `return_for_correction` / `request_more_info`; we will expose those with friendlier labels rather than fabricate new runtime types. A code comment + UI hint will note this.
- Auto-approve-on-timeout background processor (config will save; UI clearly labels "requires scheduled job — not yet running").

## Schema changes (additive only)

Migration 1 — `approval_steps`:
- `approver_type text not null default 'role_based_user'` — `'role_based_user' | 'specific_users'`
- `approver_config jsonb not null default '{}'::jsonb` — `{ role_ids?: uuid[], user_ids?: uuid[] }`
- `auto_approve_on_timeout boolean not null default false`
- `step_entry_notifications_enabled boolean not null default true` (kept for back-compat toggle)
- Backfill: existing rows → `approver_type='role_based_user'`, `approver_config={role_ids:[approver_role_id]}`.

Migration 2 — new `approval_step_actions` table (per-action config, keyed by id):
```
id uuid pk, step_id uuid fk, action_type text, label text,
require_comments boolean default false,
result_status_override text null,
next_step_mode text, -- 'next' | 'specific_step' | 'previous' | 'return_to_applicant' | 'end_workflow'
next_step_id uuid null fk approval_steps,
end_state text null, -- 'approved' | 'rejected' | 'cancelled'
sort_order int default 0,
is_enabled boolean default true,
created_at/updated_at
unique(step_id, action_type)
```
+ GRANTs for `authenticated` + `service_role`, RLS mirroring `approval_steps`.
Backfill: for each existing step, insert one row per entry in `allowed_actions` with sensible defaults (`next` for non-terminal, `end_workflow`+`approved/rejected` only when `approve`/`reject` on last step). `allowed_actions` is preserved for back-compat — runtime keeps reading it as fallback.

Migration 3 — new `approval_step_entry_notifications` table:
```
id, step_id fk, event_key text, recipient_type text,
recipient_config jsonb, template_id uuid fk notification_templates,
is_enabled boolean
```
+ GRANTs + RLS.

Migration 4 — RPC update (`perform_workflow_transition`):
- Resolve action config from `approval_step_actions` when present, fall back to current behavior.
- Enforce `require_comments` server-side.
- Apply `result_status_override` to `applications.status` when set.
- Apply `next_step_mode`: `end_workflow` (use `end_state`), `specific_step` (set current_step_id), `previous`, `next` (current behavior), `return_to_applicant` (map to existing pause behavior used by `return_for_correction`).
- Resolver check: for `specific_users` approver, validate `caller.id ∈ approver_config.user_ids`; for `role_based_user` with multiple roles, allow any.

Migration 5 — step-entry dispatch: trigger function fired after the RPC sets `current_step_id`/creates `workflow_instances` row; reads `approval_step_entry_notifications` and enqueues via `dispatch-notification-event` (called from edge function after RPC returns, mirroring the existing post-action notification block — keeps SQL pure).

## Frontend changes

### Files refactored
- `src/pages/workflows/WorkflowList.tsx` — split the monolithic `StepCard` into:
  - `src/components/workflows/StepCard.tsx`
  - `src/components/workflows/ApproverConfigEditor.tsx` (role multiselect + specific-users searchable checkbox list, fetched from `profiles` filtered to internal users via `user_roles`)
  - `src/components/workflows/StepActionsEditor.tsx` (add/edit/delete/reorder action cards)
  - `src/components/workflows/ActionCard.tsx` (name, type, mandatory comments, result status, next-step routing, embedded `ActionNotificationsEditor` per action)
  - `src/components/workflows/StepEntryNotificationsEditor.tsx` (mirrors `ActionNotificationsEditor` shape)
- `src/hooks/useWorkflowEngine.ts` — add types + CRUD hooks for `approval_step_actions`, `approval_step_entry_notifications`, extended step fields.
- `src/hooks/useStepActions.ts` (new) and `src/hooks/useStepEntryNotifications.ts` (new).
- `src/lib/workflowValidation.ts` (new) — pure validators (≥1 step, unique order, ≥1 action, end step needs end action, routing valid, etc.) consumed by the editor + a "Publish" gate.
- Relabel "Due within" → "SLA hours" everywhere user-visible.
- `ActionNotificationsEditor` keeps `(step_id, action_type)` key for back-compat (matches runtime + existing tests).

### UI structure
Workflow Details card → Workflow Steps section (sorted by `step_order`, reorder buttons, dup-order guard) → per Step card with collapsible sections:
1. Identity (name, order, description)
2. Approver Configuration (type radio → role multiselect OR user checkbox list with search)
3. SLA Controls (SLA hours, Auto-approve toggle with "planned" hint)
4. Step Entry Notifications (multi-row CRUD)
5. Step Actions → Action cards, each with its own Action Notifications block

Inline validation, confirm-before-delete via SweetAlert2 (matches project convention), loading/saving spinners on each row.

## Tests

New test files (Vitest, behavioral — not regex-only):
- `src/test/workflowBuilder.specificUsers.test.tsx` — render approver editor, switch type, select users, assert payload.
- `src/test/workflowBuilder.stepActions.test.tsx` — add/edit/delete action, next-step routing variants, end-state required when `end_workflow`.
- `src/test/workflowBuilder.stepEntryNotifications.test.tsx` — CRUD + reload after save.
- `src/test/workflowBuilder.validation.test.ts` — pure validators.
- `src/test/workflowApproverResolver.specificUsers.test.ts` — resolver allows only listed users; role mode unchanged.
- `src/test/workflowRuntimeRouting.test.ts` — RPC contract (string assertions against new SQL plus existing pattern in `workflowRuntimeNotificationDispatch.test.ts`).
- Update `workflowActionFilter.test.ts` to cover per-action `is_enabled` filtering.

## Compatibility / non-regression

- `allowed_actions` jsonb is preserved and remains the fallback when no `approval_step_actions` rows exist.
- Existing role-based steps continue working; backfill writes `approver_config.role_ids`.
- `ActionNotificationsEditor` API unchanged → existing tests (`actionNotificationsEditor.test.tsx`, `actionNotificationsEditorCrud.test.tsx`, `workflowRuntimeNotificationDispatch.test.ts`) stay green.
- Registration workflow + return workflow runtimes are untouched.
- Edge function `perform-workflow-action` only gains config-driven branches behind feature-detect on new tables.

## Open questions before I start

1. **Approve action label**: in screenshots the same step often has both an "Approve" action that moves to next step and a separate end-state action. OK to model "final approval" as: an `approve` action on the last step whose `next_step_mode='end_workflow'` + `end_state='approved'`? (matches current runtime behavior).
2. **Specific-users source list**: filter `profiles` to users with any `user_roles` row (i.e. internal staff, exclude `pre_licensee`/`licensee` system roles)? Confirm this is the right "employee" definition.
3. **Auto-approve on timeout**: save-only (clearly labeled "scheduled processor not yet implemented") for this PR, with the processor tracked as a follow-up — confirm acceptable, since the brief explicitly says "do not claim timeout automation works unless there is actual runtime support".
4. **Schedule Meeting / Review / Review-for-Previous-Reviewer**: confirm we **omit** these from the action-type dropdown rather than add disabled placeholders.
