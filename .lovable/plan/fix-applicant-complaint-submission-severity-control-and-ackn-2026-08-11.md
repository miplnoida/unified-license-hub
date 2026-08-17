# Fix applicant complaint submission: severity control and acknowledgement data

## Acknowledgement shows "Invalid Date" and blank Title — cause confirmed

`public.create_complaint` returns only:

```text
{ id, complaint_number, workflow_instance_id, complaint: { ...full row... } }
```

The Complaints page reads `inserted.subject`, `inserted.created_at`, `inserted.description`,
`inserted.email` and `inserted.sla_days` from the **top level** of that response. All of them are
undefined, so the acknowledgement renders:

- Submitted on: `Invalid Date` (from `new Date(undefined)`)
- Title: blank
- Description / target response: missing
- Target response falls back to a hardcoded 20 days even though the record's real value can differ
  (the newest complaint has 30).

### Fix

- Read the created record from `inserted.complaint` (fall back to the top-level keys so nothing
  breaks if the RPC shape changes), and map: subject, description, `created_at`, email,
  `sla_days`.
- Drop the hardcoded 20-day fallback: show the "Target response" line only when the record actually
  carries `sla_days`.
- Show the channel/intake as a readable label ("Consumer portal") instead of the raw
  `consumer_portal` code.
- Same mapping check applied to the "Reprint acknowledgement" path so a reprint matches the
  original.

## Severity in the "File Complaint" dialog

The current source of the applicant dialog contains no severity field — the picker was removed
earlier — so before changing anything the dialog will be opened in the running app as an
external/licensee user and inspected. Whatever severity control actually renders there is removed
in the same pass; if nothing renders, that will be reported back with the screenshot instead of
inventing a change.

Applicant-facing surfaces already checked and clean: the external complaints table, the applicant
detail dialog, the tracking view, and both acknowledgement variants carry no severity.

## Technical notes

Files: `src/pages/complaints/ComplaintsList.tsx` (post-submit and reprint acknowledgement payload
mapping), `src/components/complaints/ComplaintAcknowledgement.tsx` (channel label, conditional
target-response line). No database, RPC or permission changes — severity stays owned by
`complaint_intake_decide`.

## Verification

File a complaint as an applicant and confirm the acknowledgement shows the real reference, date and
time, title, description and attachments, then reprint it from the list and confirm identical
values.
