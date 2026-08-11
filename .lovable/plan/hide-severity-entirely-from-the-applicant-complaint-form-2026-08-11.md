# Hide severity entirely from the applicant complaint form

The applicant "File Complaint" dialog currently shows a "Severity" label with the note "Severity is assigned automatically after triage." Applicants shouldn't see any severity concept at all.

## What changes for users

- The Severity label and the explanatory note are removed from the "Submit a Complaint" dialog. Applicants see only complaint type, subject, description and attachments.
- Internal staff intake keeps its existing read-only note (staff need to know severity comes from triage).
- Backend behaviour unchanged: severity is still assigned by triage configuration.

## Technical notes

File: `src/pages/complaints/ComplaintsList.tsx` — delete the severity `<div>` block (label + dashed note) inside the non-internal "Submit a Complaint" dialog. No other logic touched; the create payload already omits severity.
