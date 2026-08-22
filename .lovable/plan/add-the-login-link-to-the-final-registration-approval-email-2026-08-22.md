# Add the login link to the final registration approval email

## What is happening now

Verified against the live backend for the latest final approval (REG-2026-000046):

- The applicant email that is actually delivered on final approval is the `registration.approved` event.
- Its payload already carries the correct values: `login_url` and `cta_url` = `https://boj.skntreasury.com/login`, `cta_label` = `Login`.
- The email content, however, comes from the event configuration's inline templates, whose body is only:
  `Your registration ({{registration_reference}}) has been approved.` — no link, no greeting.
- A richer template row (with `{{login_url}}`) exists in the templates table for the same event key, but it is not the content being rendered, so the applicant never sees the link.
- `registration.final_approved` is configured for in-app only, so it does not send an applicant email at all.

## The fix

Update the delivered applicant approval email so it contains the login link, using the merge fields already present in the payload.

1. Set the `registration.approved` event configuration's email subject/body (and in-app message) to the full applicant-facing content:
   - Greeting with `{{applicant_name}}`
   - Confirmation with `{{registration_reference}}`
   - "Sign in to the portal" line containing `{{login_url}}`
   - Note to sign in with the email used during registration
2. Remove the duplicate/stale short template row for `registration.approved` so the templates table has a single source of truth matching the configuration (content stays editable in Settings → Emails).
3. Leave `registration.final_approved` as in-app only, so the applicant still receives exactly one approval email (no duplicate delivery).
4. No change to the trigger, workflow function, recipient rules, or any other notification event — the payload already provides `login_url` / `cta_url` / `cta_label`.

## Verification before reporting done

- Re-run a final approval (or re-dispatch the approved event) and read the dispatch log for the resulting email row: the rendered content must contain the absolute login URL `https://boj.skntreasury.com/login`, and there must be exactly one applicant email for the approval.

## Technical notes

- Single migration updating `notification_event_configs.email_subject_template`, `email_body_template`, `message_template`, `title_template` for `event_key = 'registration.approved'`, plus a cleanup delete of the duplicate `notification_templates` row for that event key.
- No frontend changes; no changes to `dispatch-notification-event`, `perform-registration-workflow-action`, or `trg_registration_approved_notification`.
