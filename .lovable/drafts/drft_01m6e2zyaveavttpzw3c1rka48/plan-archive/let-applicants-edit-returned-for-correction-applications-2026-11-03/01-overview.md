# Let applicants edit "Returned for Correction" applications

## What changes
When a regulator returns an application for correction (for example APP-2026-002019), the applicant can again:
- edit the submitted form sections,
- add or replace documents,
- see the Edit action in the Applications list,
- see the Resubmit button and resubmit.

Nothing changes for staff, payments, workflow routing or other statuses. The server already accepts resubmission from this status.

## Technical details
Replace the hardcoded status lists with the shared `isApplicationEditable` / `isApplicantEditable` helpers (which already include `returned_for_correction`):
- `src/pages/applications/ApplicationDetail.tsx` lines 737, 815 (resubmit banner/button), 1070 (forms editable), 1264 (documents editable), 1270 (pay — keep existing list plus the returned status only).
- `src/pages/applications/ApplicationsList.tsx` line 1063 (Edit action).
- Add a small test in the existing application status tests: `returned_for_correction` is applicant-editable and resubmittable.
- Verify in the browser as the APP-2026-002019 applicant that sections are editable and Resubmit shows.
