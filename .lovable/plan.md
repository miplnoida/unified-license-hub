# Fix Application Submission Notification Delivery

## What the evidence shows

- Submission runs through the `verify-and-submit` function, which after a successful submit fires two notification events: applicant confirmation (`application.submitted.applicant` / `application.resubmitted.applicant`) and reviewer alert (`application.submitted.reviewer` / `application.resubmitted.reviewer`).
- All four event configurations exist in the database and are active, with in-app + email channels and recipient rules (applicant; workflow step approvers + sector regulators). Configuration is not the problem.
- Delivery history proves the break is intermittent loss at the emission point:
  - Application APP-2026-000132 (submitted 31 Jul 2026) produced 24 applicant + 17 reviewer delivery-log rows, all `sent`.
  - Application APP-2026-000133 (submitted 07 Aug 2026) produced **zero** delivery-log rows for any submission event — the dispatcher was never reached.
- Cause: the two dispatch calls in `verify-and-submit` are fire-and-forget (`invoke(...).catch(...)`) with no `await` and no `EdgeRuntime.waitUntil`. When the function returns its response first, the runtime can tear the isolate down before the dispatch request is actually sent, so the notification is silently lost. The AI-assessment dispatch in the same function already guards against this with `waitUntil`; the notification dispatch does not.

## Fix

In `supabase/functions/verify-and-submit/index.ts`, replace the fire-and-forget dispatch block with a guaranteed path:

1. Build the applicant and reviewer dispatch bodies exactly as today (same event keys, entity, payload tokens, resubmission `reminder_window`).
2. `await` each `dispatch-notification-event` invocation so the request completes before the submission response returns.
3. If a direct dispatch errors, fall back to the durable queue via the `notification_enqueue_event` RPC (idempotency suffix `submit` or `resubmit:<timestamp>`), so the existing queue worker retries it instead of the event being lost.
4. Keep the whole block inside the existing try/catch so a notification problem can never fail or roll back the submission.

No change to templates, recipient rules, dedupe keys, or any other business logic. Duplicate sends stay impossible: the dispatcher's unique `dedupe_key` on the delivery log blocks a repeat of the same event/entity/recipient/channel.

## Verification

1. Submit a real application from the applicant portal.
2. Confirm the notification appears in the in-app bell/Notification Centre for the applicant and for the reviewer(s) of the current workflow step.
3. Confirm matching delivery-log rows exist for both event keys and both channels for that application, with no `skipped`/`failed` rows.
