
## Problem

Workflow action emails arrive with literal `{{step_name}}` in the body (e.g. *"Registration ACB12345678 approved at step {{step_name}}"*). The same applies to other step-derived tokens.

## Root cause

Two paths feed `dispatch-notification-event`, and both fail to provide `step_name`:

1. **Email Preview dialog override path** — `WorkflowActionPreviewDialog.tsx` builds a `vars` object that intentionally omits step info. Its local `render()` keeps unresolved tokens as literal `{{step_name}}` (line 85). The reviewer-edited body is then sent as `body_override`, and `dispatch-notification-event` writes `body_override` to the email **verbatim, without running render/strip** (lines 668–670). So `{{step_name}}` ships as plain text.
2. **Direct dispatch path** — `perform-registration-workflow-action` / `perform-workflow-action` / `perform-return-workflow-action` build a `sharedPayload` that has `step_id` but no `step_name`. `dispatch-notification-event` never looks the step up by id, so `render()` produces an empty value and `stripUnresolvedTemplateTokens` removes the placeholder — leaving "approved at step " with a trailing blank.

Templates use `{{step_name}}` (and related tokens like `{{previous_step_name}}`, `{{next_step_name}}`), so the fix is to make those resolvable everywhere.

## Fix (frontend + edge function only, no DB changes)

### 1. `supabase/functions/dispatch-notification-event/index.ts`

- After loading entity context but before rendering, look up the current step from `approval_steps` whenever any of these are present in `vars`/payload: `step_id`, `current_step_id`, `new_step_id`, `previous_step_id`. Inject:
  - `step_name`, `step_key`, `step_level` from the resolved current step (`step_id` → fallback `current_step_id` → fallback `new_step_id`).
  - `previous_step_name`, `previous_step_key` when `previous_step_id` is present.
  - `next_step_name`, `next_step_key` when `new_step_id` differs from `step_id`.
  - `workflow_name` from `approval_workflows` via the step's `workflow_id` (cheap join, single round trip).
- Only set each var when not already provided by the caller so explicit values still win.
- Apply `render(...)` + `stripUnresolvedTemplateTokens(...)` to `subject_override` / `body_override` too (currently used raw). This guarantees no literal `{{token}}` ever ships, even when the preview dialog leaves one in.

### 2. `supabase/functions/perform-registration-workflow-action/index.ts`, `perform-workflow-action/index.ts`, `perform-return-workflow-action/index.ts`

- Before dispatching, fetch the current step name/level for `result.new_step_id` (and the previous step for context) once, and add `step_name`, `step_level`, `previous_step_name`, `next_step_name`, `workflow_name` to `sharedPayload`. Keeps the in-app notification copy clean even when the override path isn't taken.

### 3. `src/components/applications/WorkflowActionPreviewDialog.tsx`

- Extend `useEntityPreviewData` (or add a sibling query) to fetch the step's `name`, `step_key`, `step_level`, and parent workflow name for `stepId`.
- Add `step_name`, `step_level`, `workflow_name`, `previous_step_name`, `next_step_name` to the `vars` memo so the rendered preview shows the real values and the edited body the reviewer confirms no longer contains `{{step_name}}`.

### 4. Verification

- Trigger a registration approval on a step named *"Reviewer"*. Confirm:
  - In-app message and email subject/body show *"approved at step Reviewer"* (not blank, not literal token).
  - The Email Preview dialog renders *"Reviewer"* before sending.
  - A template that uses `{{workflow_name}}` / `{{previous_step_name}}` resolves correctly.
- Run the same on an application workflow and a return workflow to confirm both perform-*-workflow-action functions inject the new vars.

No schema changes, no UI styling changes, no template content changes — purely making the existing tokens resolvable.
