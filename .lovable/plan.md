## Goal

Add notification templates for case/assignment events so they show up under Admin → Notification Templates list, without changing any workflow logic, dispatcher code, or existing templates.

## New templates to seed

Insert rows into `public.notification_templates` (channel = `email`, `is_active = true`, `regulator_id = NULL` so they are global defaults). Event keys follow the existing `entity.action` convention used across the table.

| event_type | Name | When it fires (conceptual) |
|---|---|---|
| `application.assigned_pre_submission` | Application Assigned (Pre-Submission) | An application/draft is assigned to a reviewer/approver before the applicant submits (e.g. delegated draft, pre-screening). |
| `application.assigned_post_submission` | Application Assigned (Post-Submission) | A submitted application is routed/assigned to an approver or queue. |
| `return.submission_assigned` | Return Submission Assigned | A submitted return is assigned to a reviewer in the return workflow. |

Each template will include:
- A clear subject like `Action required: {{entity_name}} assigned to you`
- A short branded body using the same merge tokens already used elsewhere (`{{recipient_name}}`, `{{entity_name}}`, `{{unique_id}}`, `{{assigned_by}}`, `{{portal_link}}`)
- `variables` jsonb listing the tokens used

No edits to:
- `dispatch-notification-event`, `perform-workflow-action`, `perform-registration-workflow-action`, `perform-return-workflow-action`
- `notification_event_configs`
- Existing templates, hooks, or UI

## Implementation steps

1. Use the data-insert tool to add the 3 rows into `notification_templates` (idempotent via `WHERE NOT EXISTS` on `event_type` + `name`).
2. Verify they appear in the Notification Templates admin list (the list reads from `notification_templates` filtered by `is_active`).

## Out of scope (explicit)

- No new event wiring — templates are stored only; nothing triggers them automatically yet. The Action Notifications editor (`approval_action_notifications`) can pick these up by `event_type` if/when an admin binds them, but no bindings are created in this change.
- No schema changes, no RLS changes, no edge function changes.

## Confirm before proceeding

Should the three event keys be exactly `application.assigned_pre_submission`, `application.assigned_post_submission`, `return.submission_assigned`? If you prefer different naming (e.g. `application.pre_assignment` / `application.post_assignment`), tell me and I'll use those instead.
