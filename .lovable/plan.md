## Why OTP/forgot-password work but workflow emails don't

- OTP and password-reset are sent via the auth flow / `send-registration-otp`, which call SMTP directly. SMTP is healthy.
- Applicant-triggered events also work: `notification_dispatch_log` shows `registration.submitted` and `registration.received` as `sent` on 16-Jun 05:14.
- Approver-triggered events are NOT reaching the dispatcher at all:
  - `approval_actions` has `request_resubmission` rows at 16-Jun 05:54 and 15-Jun 14:20 (entity_type=registration), so approvers did act.
  - `notification_dispatch_log` has **zero rows** for `registration.resubmission_requested` / `registration.returned_for_correction` / `registration.approved_step` / `registration.final_*`. Not even `failed` rows — meaning `dispatch-notification-event` was never invoked for those actions.
- The `notification_event_configs` rows are all `is_active=true` with correct `recipient_rules` and `channels=[in_app,email]`, so config is fine.

Root cause: the dispatch call lives inside `supabase/functions/perform-registration-workflow-action/index.ts`. The file was edited in the previous turn but **never deployed**, so the live function still runs the old version that performs the RPC transition without dispatching any notification event. That is why workflow approvals never produce emails, while OTP and applicant-side submits (which run through already-deployed code) do.

## Fix plan

1. **Deploy the updated registration workflow edge function** so the dispatch block actually runs in production:
   - `supabase--deploy_edge_functions` with `function_names: ["perform-registration-workflow-action"]`.

2. **Make the dispatch resilient and observable** in `supabase/functions/perform-registration-workflow-action/index.ts`:
   - Wrap the main `dispatch-notification-event` invoke in a try/catch that `console.error`s the full error (currently a `try { ... } catch` only `console.warn`s a generic message — we won't know if dispatch fails again).
   - Log the resolved `eventForAction`, recipient count and any returned `data.error` so future failures show in edge logs.
   - Continue to swallow dispatch errors so the workflow transition still returns 200 to the UI.

3. **Add a safety net for any prior or future undeployed-dispatch case** by triggering the same dispatch from a DB trigger on `approval_actions` (entity_type='registration'). The trigger calls `dispatch-notification-event` via `pg_net` / `supabase_functions.http_request` using the same `event_key` mapping. This guarantees emails even if the edge function path is bypassed.
   - New migration: function `public.on_registration_approval_action_dispatch()` + AFTER INSERT trigger on `approval_actions`.
   - Trigger uses a SECURITY DEFINER function that posts to the dispatch edge function with the service role auth header (read from `vault` / `app_settings`).
   - Trigger is idempotent: dispatch already dedupes via `dedupe_window_seconds`, so this won't duplicate emails that the edge function also sends.

4. **Verify end-to-end**:
   - Re-run a `request_resubmission` action from the approver UI.
   - Confirm a new `notification_dispatch_log` row appears with `event_key='registration.resubmission_requested'`, `channel='email'`, `status='sent'`.
   - Confirm the applicant inbox receives the email with the `/registration/update/:id` CTA link.
   - Check `supabase--edge_function_logs` for `perform-registration-workflow-action` to confirm the new logging.

5. **Document the discovery** by appending a one-liner note in `docs/notifications.md` so the next engineer knows: SMTP + configs working ≠ dispatch working; always check `notification_dispatch_log` for the event_key first.

## What I will NOT change

- SMTP config, `send-notification`, `dispatch-notification-event` core logic, or any applicant-side dispatch — those are already verified working.
- `notification_event_configs` data — already populated correctly last turn.
- Frontend (`WorkflowPanel`, `useWorkflowEngine`) — they already invoke the right edge function.
