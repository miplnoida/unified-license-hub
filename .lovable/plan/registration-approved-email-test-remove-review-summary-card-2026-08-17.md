# Registration Approved Email Test + Remove Review Summary Card

## 1. Send the registration approved email to entity5@yopmail.com

This user's registration is already approved, so nothing in the approval flow needs to change. I will trigger the existing `registration.approved` notification for that user from the backend only (no code changes), so you can click the button in the received email and confirm where it redirects.

Steps:
- Look up the user record for `entity5@yopmail.com`.
- Queue/dispatch one `registration.approved` notification for that user using the existing template and CTA values (label `Login`, CTA URL built from site settings), through the current notification dispatch path.
- Report back the exact CTA URL that was rendered in the email so you can verify the redirect target matches the login page.

No template, trigger, or app code will be modified.

## 2. Remove the Summary card from the applicant panel review step

On the applicant application wizard (`/applications/:id/continue?...&step=review`), the review step currently shows a "Summary" card (Sector, Sub-Sector, Category, Forms Completed, Payment) directly under the review acknowledgement block. This duplicates information already shown in the review content above.

Change: delete that Summary card from the review step in `src/pages/NewApplication.tsx`. The review acknowledgement component, Back to Documents button, and Continue to Payment button stay exactly as they are. No other steps or cards are touched.

## Technical notes
- Email: backend-only dispatch (SQL + existing notification worker/edge function). No migration.
- UI: single JSX block removal in `src/pages/NewApplication.tsx` review step; no state or logic changes (`completedCount`, `feeAmount`, etc. remain used elsewhere).
