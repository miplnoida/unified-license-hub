# Fix "Save Comment" Behavior & Email

Two issues to fix:

1. **Email shows raw HTML tags.** The three `*.comment_saved` email templates (`application.comment_saved`, `registration.comment_saved`, `return.comment_saved`) were seeded with HTML markup (`<p>`, `<strong>`, `<blockquote>`), but every other email template in `notification_templates` is stored as plain text and the send-notification pipeline delivers bodies as plain text. Result: users see literal `<p>...</p>` markup in their inbox.

2. **Save Comment must complete the step and advance.** Current behavior short-circuits inside the three `perform-*-workflow-action` edge functions and records only an `approval_actions` row without transitioning state. The user now wants Save Comment to behave like an "Approve" for the current step — mark it completed and move to the next step in the workflow.

## Changes

### 1. Rewrite the three comment-saved email templates as plain text
Migration updates `notification_templates.body` (and keeps subject) for the 3 rows above:

```
{{reviewer_name}} added a comment on application {{application_number}}:

{{comments}}

No action is required — this notification is informational.
```

Analogous copy for `registration.comment_saved` (uses `{{registration_reference}}`) and `return.comment_saved` (uses `{{return_reference}}`). Matches the plain-text style used by every other email template in the system.

### 2. Make Save Comment advance the workflow like Approve
In each of the three edge functions, remove the `save_comment` short-circuit branch and let the action flow through the existing `perform_*_workflow_transition` RPC. Two options for the RPC contract:

- **Option A (preferred, no DB changes):** In the edge function, when `action_type === 'save_comment'`, first insert the `approval_actions` row with `action_type='save_comment'` (so audit history preserves the true action name), then invoke the transition RPC with `_action_type = 'approve'` to move the step forward. The dispatched notification still uses `*.comment_saved` event keys so the new plain-text template fires. The response still reports the correct `saved_comment: true` flag alongside `new_step_id`/`new_status` from the transition.
- Option B would be to teach the SQL RPC to recognize `save_comment` as an advance-equivalent action, but that touches shared workflow logic used by other flows — avoiding it keeps the change surgical.

The digital-signature and comment-required checks stay as they are for save_comment (comment mandatory; signature per step config).

### 3. No frontend changes required
`useWorkflowEngine`, `useStepActions`, `useActionNotifications`, and both WorkflowPanels already register `save_comment`; they will simply see a real `new_step_id` in the response and refresh.

## Verification

- Deploy edge functions and run migration.
- Trigger Save Comment on an application in a multi-step workflow; confirm:
  - `approval_actions` row has `action_type='save_comment'`.
  - Workflow instance advances to next step (or completes if last step).
  - Email body renders as plain text with the reviewer/comment values (no `<p>` tags visible).
- Repeat for a registration and a return.

## Files touched

- `supabase/migrations/<new>_plain_text_comment_saved_templates.sql`
- `supabase/functions/perform-workflow-action/index.ts`
- `supabase/functions/perform-registration-workflow-action/index.ts`
- `supabase/functions/perform-return-workflow-action/index.ts`
