# Fix: registration step-1 approval email never reaches the applicant

## What actually happened (verified)

For registration REG-2026-000031 (Entity Four), the internal user approved step 1 at 11:43 UTC with a signature and an email preview.

- The step's action notification **is** configured: step 1 → action `approve` → event `registration.approved_step`, recipient `applicant`, with a template.
- The approval itself succeeded (workflow moved on: a `registration.step_entered` email was delivered to the super admin at 11:44).
- The applicant email was **never dispatched**. The dispatch log for this registration contains only `registration.step_entered` rows to `superadmin@yopmail.com` — zero `registration.approved_step` rows.
- Cause, from the function logs: both dispatch calls made by `perform-registration-workflow-action` (the generic event and the per-step configured notification) came back **401 Unauthorized** from `dispatch-notification-event`. The 401 is the dispatcher's worker/auth gate rejecting the call, so recipient resolution and email sending never ran.
- Why the gate rejects it: this function imports the backend client as floating `@supabase/supabase-js@2` (resolved 2.112.3 in the logs), and its service-role invocation is no longer accepted by the dispatcher's gate, while functions pinned to 2.45.0 (e.g. the notification queue worker) invoke the same dispatcher successfully in the same minute. The call is server-to-server, so there is no user session to fall back on either.

Second, smaller issue found while verifying: even when dispatch runs, `registration.approved_step` is configured with internal-only recipients (step approvers, sector regulators, admin, super admin) — the applicant reaches it only through the per-step `approval_action_notifications` override. So the applicant email depends entirely on the call that is currently 401-ing.

## Fix

1. **Unblock server-to-server dispatch (no more 401).**
   - `dispatch-notification-event` keeps its gate but explicitly accepts internal service-role / worker-token invocations from other edge functions, alongside signed-in user sessions. Anonymous browser calls stay rejected.
   - `perform-registration-workflow-action` sends the worker credential header on every dispatch call and pins its client library to the same version the working notification workers use, removing the drift that caused the rejection.
2. **Guarantee delivery even if a direct call fails.** Every dispatch (the generic workflow event and each configured step notification, with template / recipient / subject / body overrides preserved) falls back to the durable queue (`notification_enqueue_event`) when the direct call does not succeed, so the queue worker retries instead of the notification being lost.
3. **Audit every dispatch attempt.** Record each attempt — success, skip, and failure with its reason — in the notification dispatch log and the compliance audit trail, so an admin can see in the UI that an applicant email was attempted, sent, or failed, instead of the evidence living only in function logs.
4. **Apply the same treatment across the other workflow/action dispatchers** that call the dispatcher from server code (applications, complaints, returns, appeals sweeps), so the same 401 class of failure cannot silently drop notifications elsewhere.
5. **Confirm the applicant path** for `registration.approved_step`: applicant resolved from the registration (`user4@yopmail.com` is already in the event payload) and the configured template renders subject/body for in-app + email.

No change to workflow transition logic, step configuration, template content, signature capture, or business rules.

## Verification before reporting done

- Re-run a step-1 approval and confirm `notification_dispatch_log` has an `email` row for `registration.approved_step` addressed to the applicant with status `sent`, plus the in-app row.
- Confirm no 401 lines remain in the `perform-registration-workflow-action` logs for that run.
- Confirm the audit trail shows the dispatch attempt, and that repeat actions do not duplicate sends (dedupe keys unchanged).

## Technical notes

- `supabase/functions/perform-registration-workflow-action/index.ts` — dispatch block plus the `approval_action_notifications` loop, using `_shared/notification-dispatch.ts` (`dispatchNotificationEventNow`, `enqueueNotificationEvent`).
- `supabase/functions/dispatch-notification-event/index.ts` — auth gate accepts internal worker/service invocation explicitly.
- `supabase/functions/_shared/workerAuth.ts` — shared helper for attaching/validating the internal invocation credential.
- Audit writes go to the existing notification dispatch log and compliance audit log tables; no new tables. A migration is only needed if permissions/grants on those log tables block the write, or if step 5 shows an applicant recipient rule must be added to the event config.

