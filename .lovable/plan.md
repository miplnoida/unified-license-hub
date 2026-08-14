# Fix registration completion screen + approval email

## 1. Registration completion screen (applicant panel)

Today, after submitting a registration the applicant lands on a "Registration Completed" card that offers **Return to Dashboard**, **Track Application** and **Download**. Both navigation buttons lead into the portal, where the approval gate immediately bounces the user to a second screen (`/registration-status`) that shows **Sign Out** and a status card — confusing, since the person has only just registered.

Change to a single screen:

- Show one confirmation card: reference number, submitted date/time, status "Pending approval", and a short line explaining that the regulator will review the registration and that an email with a login link will arrive once it is approved.
- Single primary button: **Back to Home** (`/`). No dashboard link, no track link, no sign-out.
- Keep the optional "Download / print acknowledgement" action (useful record, no navigation risk).
- Because the registration flow currently signs the user in right after submitting, the session is ended when leaving this screen so the user is not silently parked inside a gated portal.
- The `/registration-status` page itself stays as-is for users who log in later (it is still the correct place for pending / returned-for-correction states) — it just stops being part of the immediately-after-submission flow.

Also removes the leftover "Simulate Verification" link on the verification-pending screen from being the path into the old two-screen flow.

## 2. Emails on approval

Verified in the backend:

- A database trigger on role assignments fires the internal event `user.role_changed` ("Role change: …", subject includes the user name) and its recipient rules include the affected user. When a registration is approved the applicant is granted their portal role, so the applicant receives this internal admin email. This is the wrong email the user is seeing.
- The registration approval path currently produces up to three emails to the applicant: `registration.approved` (trigger), `registration.final_approved` (workflow action function), and `registration.workflow_completed`.
- The approved email body is `Your registration ({{registration_reference}}) has been approved.` — no login link. `registration.final_approved` has a better body with `{{portal_url}}` but is not the one being delivered in the observed runs.

Fixes:

1. Restrict `user.role_changed` to internal staff only: drop the affected-user recipient rule (keep super admin) and keep it in-app for that audience, so external applicants/licensees never receive it.
2. Make the approval email the single applicant-facing email:
   - Keep one applicant email on final approval and stop the duplicate applicant delivery from the other two events (`registration.workflow_completed` becomes internal-only; the approved/final-approved pair is de-duplicated so only one applicant email is sent).
   - Update the approval email template (stored in the notification templates table, editable in Settings → Emails, not hardcoded) to greet the applicant, confirm the reference, and include a **login link** built from a `{{login_url}}` merge field.
   - Add `login_url` (and `portal_url`) to the payload emitted on approval so the template renders a working link.
3. Check the registration approval workflow steps: if the final approval step has no notification configured for the applicant, add the email notification on that step so the configured workflow — not only the table trigger — drives the message.

## Verification before reporting done

- Query the notification queue/dispatch log after a test approval to confirm exactly one applicant email (`registration approved`) with a rendered login URL, and zero `user.role_changed` rows addressed to the applicant.
- Confirm the rendered subject/body come from the template row (edit template → re-render) to prove the content is dynamic.
- Walk the registration submission flow in the browser to confirm only one completion screen appears, with a single **Back to Home** button and no dashboard/track/sign-out actions.

## Technical notes

- Frontend: `src/pages/registration/RegistrationSuccess.tsx`, `src/components/applications/SubmissionAcknowledgement.tsx` (new optional props so other callers keep their current buttons), `src/pages/registration/PreLicenseeRegistration.tsx` (post-submit navigation), `src/pages/registration/VerificationPending.tsx`.
- Backend: migration updating `notification_event_configs.recipient_rules` / `channels` for `user.role_changed` and `registration.workflow_completed`, updating the `registration.approved` / `registration.final_approved` templates in `notification_templates`, and extending `trg_registration_approved_notification` payload with `login_url`; plus workflow step notification rows for the final registration approval step.
- No change to other notification events, workflow transition logic, or the status page behaviour for existing pending users.
