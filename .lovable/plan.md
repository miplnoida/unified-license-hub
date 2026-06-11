# Approval Workflow Module — Extension Plan

Building on the **existing** schema (`approval_workflows`, `approval_steps`, `workflow_instances`, `notification_templates`, `dispatch-notification-event`). No greenfield rebuild — additive only, so submissions/approvals/returns/registrations keep working.

## 1. Database (one migration)

**New table — `approval_action_notifications`** (per-action template binding)
- `id`, `step_id` (FK → approval_steps), `action_type` (text: approve/reject/return_for_correction/request_more_info/send_back/escalate/request_resubmission), `event_key` (text — matches notification_event_configs), `template_id` (FK → notification_templates, nullable), `recipient_type` (enum: applicant / current_approver / previous_actor / role / admin / custom_email), `recipient_config` (jsonb), `is_enabled` (bool), `created_at`, `updated_at`
- Unique (step_id, action_type, event_key, recipient_type)
- RLS: admins read/write; service_role full. Standard GRANTs.

**Extend `approval_steps`**
- Already has `allowed_actions text[]`. Add two new allowed values to the application app type: `'return_for_correction'`, `'request_more_info'`. No column change — just expand the action filter in `workflowActionFilter.ts` and server validator.

**Extend `workflow_instances` already supports paused/resumed.** No schema change needed for applicant resubmission — `verify-and-submit` already resumes paused instances.

## 2. Edge Function changes

**`perform-workflow-action`**
- Accept new action types `return_for_correction`, `request_more_info`.
- Behavior: pause instance, mark current step actor as `previous_step_actor_id` on the instance metadata, set application status to `returned_for_correction` / `info_requested`.
- After action: query `approval_action_notifications` for the (step_id, action_type) and call `dispatch-notification-event` for each enabled row, resolving recipients server-side.
- Require remarks for both new actions.

**`verify-and-submit`** (resubmission path)
- When resuming a paused instance, route back to step whose actor was `previous_step_actor_id` (already mostly in place via `current_step_id` — verify and add fallback).

## 3. Frontend

**Redesigned `src/pages/workflows/WorkflowList.tsx` Edit page**
Split into a new route `/admin/workflows/:id/edit` rendering `WorkflowEditor.tsx` with three card sections:
1. **Workflow Details** — name, description, process type (from `approval_workflow_types`), regulator/sector, default SLA, active toggle.
2. **Workflow Steps** — vertical list of `StepCard`s (existing draft-state pattern preserved), reorder via up/down, add/delete, per-step: name, SLA, allowed_actions checkboxes (now including the two new actions), role picker.
3. **Per-step Actions panel** — for each allowed action on a step, an accordion with:
   - Action label (derived from action type)
   - Mandatory comments toggle (read-only — server already enforces for approve/reject/RFI/return)
   - **Notifications sub-section** — list of `approval_action_notifications` rows. Each row: event key dropdown, recipient type dropdown, template dropdown (filtered to active `notification_templates`), enabled toggle. Add/remove rows.

The existing inline `WorkflowList.tsx` builder stays as a list view; edit deep-links to the new editor route. Keep all current tests passing.

**Action filter helper** (`src/lib/workflowActionFilter.ts`)
- Extend `WorkflowActionType` union with `'return_for_correction' | 'request_more_info'`.
- Add to `REMARKS_REQUIRED_ACTIONS`.
- Candidate list: include both new actions on any non-final step.

**Application detail (`WorkflowPanel.tsx`)**
- No structural change — `resolveAvailableActions` already drives buttons from `allowed_actions`. The two new buttons appear automatically once admins enable them.

## 4. Tests

- `workflowActionFilter.test.ts` — add cases for the new action types + remarks requirement.
- New: `approvalActionNotifications.test.ts` — pure helper for resolving which notifications fire for an (action_type, event) pair.
- Update `workflowStepCardViewMode.test.tsx` snapshot if needed (only if checkbox list changes).

## 5. What I am NOT doing (and why)

- No new `approval_workflow_*` parallel tables — existing schema covers it.
- No new `email_templates` table — `notification_templates` already exists and is in active use.
- No "Specific User" / "Previous Step Actor" / "Applicant" approver types in step config — you didn't pick that option. Approver stays role-based. Applicant routing is handled via the new RFI/Return actions, not as an approver type.
- No maker-checker, reporting manager, secured-table, parallel approval — explicitly excluded by your brief.

## File changes (estimated)

- New migration: `approval_action_notifications` table + GRANTs + RLS.
- New: `src/pages/workflows/WorkflowEditor.tsx` (redesigned editor).
- New: `src/components/workflows/ActionNotificationsEditor.tsx`.
- New: `src/hooks/useActionNotifications.ts`.
- Edit: `src/lib/workflowActionFilter.ts` (+ test).
- Edit: `supabase/functions/perform-workflow-action/index.ts` (handle new action types + dispatch notifications).
- Edit: `src/pages/workflows/WorkflowList.tsx` (link Edit button to new editor; keep list logic).
- Edit: `src/routes/adminRoutes.tsx` (register new route).
- New test: `src/test/approvalActionNotifications.test.ts`.

Approve and I'll ship it in this order: migration → action filter + tests → editor UI → edge function → routing.