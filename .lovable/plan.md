## Root cause (confirmed)

Tracking never fails on the "complaint not found" check — the complaint is found, then the RPC crashes while building the timeline.

`public.get_public_complaint_tracking` joins the status catalogue on `approval_actions.new_status`, but that column does not exist on `approval_actions` (columns are `action`, `action_type`, `comments`, ...). Calling it errors with:

```text
ERROR: column aa.new_status does not exist
```

Verified directly against the database with a real reference (`CMP-2026-000073`).

The UI then shows the generic "No complaint found for the details provided" because `ComplaintTrackingPanel` maps *any* RPC error (other than `CONTACT_MISMATCH`) to that message.

## Fix

1. **Migration — repair the tracking RPC**
   - Rebuild the timeline subquery against real columns: use `approval_actions.action` / `action_type` and `comments`, keeping output redacted (public label + description only, no actor names, no internal notes).
   - Derive public labels from the current complaint status catalogue where a mapping exists; otherwise fall back to a neutral "Progress update".
   - Keep the current status block and contact-verification behaviour unchanged.
   - Make contact matching resilient: trim + lowercase **both** sides of the email comparison.
   - Allow a signed-in complainant to bypass the email check when `auth.uid() = complaints.complainant_id`, so applicants tracking their own complaint from the portal never hit a false `CONTACT_MISMATCH` when their login email differs from the contact email on the complaint.

2. **`src/components/complaints/ComplaintTrackingPanel.tsx` — honest error states**
   - Distinguish three outcomes instead of one: RPC/network error ("Unable to load tracking right now" + retry), `CONTACT_MISMATCH` (verification failed), and genuinely not found.
   - Show the underlying error detail for the failure case so a broken backend never masquerades as "no such complaint".

## Verification

- Call the fixed RPC via SQL for an existing reference with the matching email, a wrong email, and a nonexistent reference; confirm found/timeline, `CONTACT_MISMATCH`, and not-found respectively.
- Load the applicant complaints list, use both the "Track complaint" button and a row-level "Track" action, and confirm status + timeline render.
