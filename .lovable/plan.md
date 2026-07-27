## Goal

1. Complaints can no longer be lodged without logging in, and the anonymous submission option is removed.
2. Logged-in applicants/external users get a proper "Track complaint" experience, not just the submission form.

## 1. Close public / anonymous intake

- Delete `src/pages/public/PublicComplaintIntake.tsx`.
- In `src/routes/publicRoutes.tsx`: remove the `/complaints/submit` public route and point `/complaints/submit`, `/complaints/new`, `/submit-complaint` to the login page with `?redirect=/complaints` so an unauthenticated visitor is asked to sign in and lands on the complaints portal afterwards.
- `src/components/landing/FeaturesSection.tsx`: "Lodge Complaint" tile now links to the login/complaints flow instead of the public form. The "Track Complaint" tile stays.
- Backend: revoke anonymous execution on the complaint intake functions (`create_complaint`, `create_complaint_with_attachments`, `finalize_complaint_with_attachments`) so the anon path is closed server-side, not just in the UI, and drop the anonymous branch of the intake rules. Authenticated flows are unaffected.
- Internal staff intake (`/complaints/internal/new`) and the applicant "File Complaint" dialog are untouched.

Public complaint tracking at `/track/complaint` stays available so people holding an old reference number can still check status (read-only, no submission).

## 2. Track Complaint for applicants

In `src/pages/complaints/ComplaintsList.tsx`, external (non-internal) view only:

- Add a "Track Complaint" button next to "File Complaint" in the page header, opening a dialog where the user enters a complaint reference number and sees the status, submitted/last-updated dates, and progress timeline.
- Add a "Track" action on each row in the applicant table, next to "View", opening the same dialog pre-filled with that complaint's reference so progress is one click away.
- The tracking panel is extracted into a small reusable component (`src/components/complaints/ComplaintTrackingPanel.tsx`) used by both the dialog and the existing `/track/complaint` page, so the timeline renders identically in both places.
- Data comes from the existing tracking function already used by the public page; for a signed-in user the contact email is taken from their session rather than being typed in.

Internal staff views, filters, SLA badges and all other complaint functionality remain unchanged.

## Technical notes

- Route changes are redirects, so any bookmarked public intake URL degrades gracefully to login.
- Revoking the anon grants requires a database migration; existing anonymous complaints already recorded keep working for tracking.
