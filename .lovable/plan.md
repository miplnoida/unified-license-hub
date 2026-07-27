## Problem (verified)

`public.get_public_complaint_tracking` only checks identity if the complaint has a contact email:

- It matches the complaint by reference, then sets ownership as `complainant_id = auth.uid()`.
- If not the owner, it compares the supplied email to `complaints.email` — but **only when that email is non-empty**. When the complaint has no email on file, the check is skipped entirely and the full redacted record is returned to anyone holding the reference.
- Database check: of 31 complaints, **18 have no contact email and no complainant_id**, so any signed-in (or anonymous) user who enters those references sees the complaint. Signed-in users don't even type an email — the page sends their own session email — so those 18 open up automatically.

## Fix

Rewrite the identity gate at the top of `get_public_complaint_tracking` (migration, no signature change):

1. Resolve the caller's identity: `auth.uid()` and their email from `auth.users`/`profiles`.
2. Allow when **any** of these hold:
   - caller is the complainant (`complainant_id = auth.uid()`),
   - caller's session email matches `complaints.email` (case/space-insensitive),
   - the supplied `p_email` matches `complaints.email` (anonymous/public path, unchanged behaviour),
   - caller is internal staff already permitted to read complaints (reuse the existing `has_complaint_perm`-style check) so officers tracking a case aren't blocked.
3. **Deny by default otherwise** — including the "complaint has no email on file" case, which currently falls through. Return the existing `{found:false, error:'CONTACT_MISMATCH'}` shape so the UI message is unchanged, and never distinguish "wrong email" from "no such reference" to avoid reference enumeration.

## Frontend

No behaviour change needed. Optionally the signed-in page (`src/pages/complaints/ComplaintTracking.tsx` / `ComplaintTrackingView.tsx`) keeps showing the same "No complaint found for the details provided" message on denial — verify it reads correctly for the new deny case.

## Verification

- Query the 18 email-less complaints and confirm the RPC returns `found:false` for a non-owner session, and still returns the record for the complainant.
- Confirm a complaint with an email still resolves for the matching email (public `/track/complaint`) and for its owner while signed in.
- Confirm an internal officer with complaint view permission can still open any reference.
- Existing pgTAP suite (`supabase/tests/complaints/09_public_tracking.sql`, `16_rpc_permissions.sql`) must still pass; add an assertion that an unrelated authenticated persona gets `found:false`.
