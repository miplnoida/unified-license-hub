# Market Conduct — Supervisory Action Notifications Fix

## Root cause

Notifications never reach anyone because the conduct notification pipeline is only half-built:

1. **Event configs are empty.** Every row in `notification_event_configs` for `conduct_action_*` (assigned, completed, overdue, waived, cancelled) has `recipient_rules = []` and no `email_subject_template` / `email_body_template`. `dispatch-notification-event` therefore resolves zero recipients and logs nothing meaningful (existing dispatch log entries are under a stale legacy key `conduct.action.issued`, all with `recipient_email = NULL`).
2. **Two of the three code paths never dispatch.** `useCompleteAction` calls `notify('conduct_action_completed', …)`, but `useWaiveAction` and `useCancelAction` in `src/hooks/useMarketConduct.ts` only audit — they never call `notify(...)`.
3. **No “Issue Supervisory Action” UI.** `ConductActions.tsx` and `ConductEntityProfile.tsx` list actions and let staff mark them Complete, but there is no way to create a new action (remediation request / warning / sanction) with rationale — so the "action issued" notification cannot fire from the UI at all.
4. **No `conduct_action_created / waived / cancelled` event keys** exist in `notification_event_configs`.

## Fix

### 1. New UI: "Issue Supervisory Action" dialog
- Add `src/components/conduct/IssueActionDialog.tsx` — reusable dialog with fields: `action_type` (remediation_request | warning | sanction | direction | undertaking), `title`, `description`, `rationale` (required, stored in `metadata.rationale`), `due_date`, `assigned_to` (internal user picker), `assigned_team`, source module + id (defaulted by caller).
- Wire an "Issue action" button into:
  - `ConductActions.tsx` toolbar (source_module defaults to `other` / `enforcement` selectable)
  - `ConductEntityProfile.tsx` Actions section (source_module = `entity`, `entity_id` prefilled)
- On submit, insert into `conduct_actions`, then `notify('conduct_action_created', ...)` with `{ title, action_type, rationale, due_date, assigned_to, entity_id, source_module }`.

### 2. Hook dispatch parity
In `src/hooks/useMarketConduct.ts`:
- Add `notify('conduct_action_waived', ...)` inside `useWaiveAction` with `{ title, waiver_reason }`.
- Add `notify('conduct_action_cancelled', ...)` inside `useCancelAction` with `{ title, cancellation_reason }`.
- Extend the `useCompleteAction` payload with `completion_notes` so the email body can render the outcome + notes.
- Add a new `useCreateAction()` mutation used by the dialog (insert + audit + notify `conduct_action_created`).

### 3. Migration: seed event configs + templates

Populate five conduct action events with real recipient rules and email content:

| event_key | recipient_rules | channels |
|---|---|---|
| `conduct_action_created` | `payload_user(assigned_to)`, `role(supervisor)`, `role(legal_compliance)` | in_app + email |
| `conduct_action_completed` | `payload_user(created_by)`, `role(supervisor)` | in_app + email |
| `conduct_action_waived` | `payload_user(assigned_to)`, `role(supervisor)`, `role(super_admin)` | in_app + email |
| `conduct_action_cancelled` | `payload_user(assigned_to)`, `role(supervisor)` | in_app + email |
| `conduct_action_assigned` (existing, empty) | `payload_user(assigned_to)` | in_app + email |

Each row gets `title_template`, `message_template`, `email_subject_template`, `email_body_template` rendering `{{title}}`, `{{action_type}}`, `{{rationale}}`, `{{outcome}}`, `{{completion_notes}}`, `{{waiver_reason}}`, `{{cancellation_reason}}`, `{{due_date}}`, and `{{app_url}}` (link back to `/conduct/actions`).

Payload always includes `assigned_to` and `created_by` so `payload_user` rules resolve.

### 4. Verification
- Manually trigger create/complete/waive/cancel from the UI, then query `notification_dispatch_log` filtered by the new `event_key`s — expect `status = sent`, non-null `recipient_email`, matching `subject`.
- Confirm the in-app bell shows the new notification for the assigned officer.

## Technical details

- Files edited:
  - `src/hooks/useMarketConduct.ts` — add `useCreateAction`, add notify calls in waive/cancel, extend complete payload.
  - `src/components/conduct/IssueActionDialog.tsx` — new.
  - `src/pages/conduct/ConductActions.tsx` — toolbar button + dialog wiring.
  - `src/pages/conduct/ConductEntityProfile.tsx` — Actions section button + dialog.
- One SQL migration under `supabase/migrations/` upserting the five `notification_event_configs` rows (uses `ON CONFLICT (event_key) DO UPDATE`). No schema changes.
- Rationale is stored in `conduct_actions.metadata->>'rationale'` — no new column needed. `outcome` and `completion_notes` already exist and are set by `useCompleteAction`.
- Recipient rules use existing resolver types already supported by `dispatch-notification-event` (`payload_user`, `role`).

## Out of scope
- Overdue sweep for `conduct_action_overdue` (already scheduled elsewhere).
- Enforcement/thematic action linkage flows — unchanged.
