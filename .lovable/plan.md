## Goal

Add a new `save_comment` option to the Action Type dropdown in the Workflow Step Action editor (screenshot). It records a comment against the current step **without changing workflow state, current approver, or step level** — a formalized, configurable version of today's "Add Remark". A matching notification event + default template is created so admins can bind recipients from the same UI as other actions.

No existing action's behavior is modified.

## Scope

### 1. Action type registration (frontend)
- `src/hooks/useWorkflowEngine.ts`
  - Extend `WorkflowActionType` union with `'save_comment'`.
  - Add `ACTION_LABELS.save_comment = 'Save Comment'`.
  - Add `ACTION_COLORS.save_comment` (neutral muted token, e.g. `bg-muted text-muted-foreground border-border`).
- `src/hooks/useStepActions.ts`
  - Append `'save_comment'` to `SUPPORTED_ACTION_TYPES` and `ALLOWED_UI_ACTION_TYPES`.
  - Leave `DEFAULT_STEP_ACTION_TYPES` unchanged (not seeded by default).
- `src/hooks/useActionNotifications.ts`
  - Add `save_comment: 'application.comment_saved'` to `DEFAULT_EVENT_FOR_ACTION`.
  - Add `save_comment: 'comment_saved'` to `ACTION_EVENT_SUFFIX` so registration/return workflows resolve to `registration.comment_saved` / `return.comment_saved`.

### 2. Runtime execution (edge functions)
`save_comment` must NOT be rejected by `perform-workflow-action`, `perform-registration-workflow-action`, or `perform-return-workflow-action`, and must NOT transition state.

- Add `'save_comment'` to each function's `ACCEPTED_ACTIONS` set.
- Short-circuit path per function:
  1. Enforce the same permission gate the existing "add remark" path uses (`can_add_remark` from `user_can_act_on_workflow_step`).
  2. Insert a row into the existing remark/comment table used by the current "Add Remark" button (identified in `WorkflowPanel.tsx` remark submit path — reuse verbatim; no new table).
  3. Skip the `perform_workflow_transition` RPC call entirely.
  4. Fan out `approval_action_notifications` rows for `(step_id, action_type='save_comment')` via the existing override dispatch loop, using event key `application.comment_saved` / `registration.comment_saved` / `return.comment_saved` per entity.

### 3. Notification event + default templates (migration)
New migration under `supabase/migrations/`:
- Insert into `notification_event_configs` three rows (idempotent upsert on `event_key`):
  - `application.comment_saved`
  - `registration.comment_saved`
  - `return.comment_saved`
  Each with the same shape as the sibling `*.more_info_requested` rows (channels: in_app + email, default recipient rules: `current_approver` + `applicant`).
- Insert one default `notification_templates` row per event key with subject/body tokens matching existing conventions:
  - Subject: `Comment added on {{entity_label}} {{entity_reference}}`
  - Body: branded email via `renderBrandedEmail` tokens — actor, comment text, entity link CTA.
- Do NOT modify or replace any existing template.

### 4. UI wiring
- The Workflow Step Action editor dropdown reads from `ALLOWED_UI_ACTION_TYPES` → "Save Comment" appears automatically after step 1.
- Action Notifications editor (`StepEntryNotificationsEditor` / action notifications tab) reads from the same list → binding UI appears automatically; `getDefaultEventForAction('save_comment', entityType)` supplies the correct event key.
- No changes to `WorkflowPanel.tsx`'s existing "Add Remark" button — it continues to work exactly as today. `save_comment` is the *configured* variant an admin can enable on a step so it participates in the notification framework; the always-available "Add Remark" quick action is untouched.

### 5. Tests
- `src/test/workflowPerActionPermissions.test.ts`: add case verifying `save_comment` label is emitted when a hypothetical `can_save_comment` (or reused `can_add_remark`) flag is true — matching the button-builder contract chosen in step 2.
- `src/test/actionNotificationsPersistence.test.ts`: add case ensuring `buildActionNotificationPayload` accepts `action_type: 'save_comment'` with the new default event key.
- `src/test/workflowRuntimeNotificationDispatch.test.ts`: extend to assert each perform-*-workflow-action function includes `'save_comment'` in its accepted set and dispatches the `*.comment_saved` event.
- pgTAP: add a small test under `supabase/tests/rbac/` (or extend `290_workflow_guard.sql`) confirming the new event_config + template rows exist and are enabled.

## Out of scope
- No changes to approve/reject/send_back/escalate/request_resubmission/return_for_correction/request_more_info logic.
- No change to the always-available "Add Remark" quick button in `WorkflowPanel.tsx`.
- No RLS or role catalog changes — `save_comment` reuses the existing remark permission.

## Technical notes
- Event key naming follows the existing `<entity>.<verb>` pattern already used by `application.more_info_requested`, keeping runtime template lookup by prefix consistent.
- Runtime override dispatch already loads all enabled `approval_action_notifications` rows for `(step_id, action_type)` — adding `save_comment` requires no dispatcher change beyond accepting the action in the perform-* functions.
