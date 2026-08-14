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

1. **Make dispatch from `perform-registration-workflow-action` reliable.**
   - Send the dispatch through the durable queue (`notification_enqueue_event` RPC) instead of a bare cross-function HTTP invoke, with the per-step override payload preserved (template, recipient type/config, binding id, subject/body overrides). The existing queue worker then performs delivery, and its invocation path is the one proven to work.
   - Keep a direct invoke as a first attempt, but with an explicit worker credential header so the gate accepts it; on any non-2xx, fall back to the queue. This removes silent loss in both directions.
   - Pin the client import to the same version used by the working workers to eliminate the version drift.
2. **Stop silent failure.** When both the direct dispatch and the enqueue fail, record it (dispatch log/queue error) so a failed applicant notification is visible in the admin notification log instead of only in function logs.
3. **Re-verify the applicant path** for `registration.approved_step`: confirm the applicant is resolved from the registration (email `user4@yopmail.com` is already present in the event payload) and that the configured template renders subject/body for the applicant channel set (in-app + email).

No change to workflow transition logic, step configuration, templates' content, signature capture, or any other event.

## Verification before reporting done

- Re-run a step-1 approval on a test registration and confirm `notification_dispatch_log` contains an `email` row for `registration.approved_step` addressed to the applicant with status `sent`, plus the in-app row.
- Confirm no 401 lines remain in the `perform-registration-workflow-action` logs for that run.
- Confirm the previously affected registration can be re-notified (or that a fresh action produces the applicant email) without duplicate sends — dedupe keys stay intact.

## Technical notes

- Backend only: `supabase/functions/perform-registration-workflow-action/index.ts` (dispatch block, both the generic event and the `approval_action_notifications` loop), reusing `supabase/functions/_shared/notification-dispatch.ts` helpers (`enqueueNotificationEvent`, `dispatchNotificationEventNow`).
- Possible small adjustment in `dispatch-notification-event`'s auth gate to accept the worker token header explicitly for server-to-server calls.
- No frontend changes; no migration required unless step 3 shows the applicant rule needs to be added to the event config.
