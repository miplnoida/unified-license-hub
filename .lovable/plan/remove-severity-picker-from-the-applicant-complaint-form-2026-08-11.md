# Remove severity picker from the applicant complaint form

The applicant/licensee "File Complaint" dialog on the Complaints list still shows a Severity dropdown and sends the chosen value to the backend. Severity must be system-assigned only.

## What changes for users

- In the "Submit a Complaint" dialog (applicant/licensee portal), the Severity dropdown is removed and replaced with a short read-only note: "Severity is assigned automatically after triage."
- Everything else in the dialog (complaint type, subject, description, attachments) stays as-is.
- Internal staff intake, classification card and the logged supervisor override are unchanged (already system-assigned).

## Technical notes

File: `src/pages/complaints/ComplaintsList.tsx`
- Remove the `newSeverity` state, its reset in the post-submit cleanup, and the Severity `Select` block (lines ~619-629).
- In `handleCreate`, drop `severity` from both payload branches (internal `severity: 'medium'` and external `severity: newSeverity`) so `create_complaint` / `complaint_intake_decide` remains the sole author of severity.
- Replace the dropdown with a muted read-only note matching the wording used on the internal intake page.

No backend or schema changes needed — `complaint_intake_decide` already ignores caller-supplied severity and applies the matched triage rule or the configured `default_severity`.
