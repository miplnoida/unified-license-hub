# Fix: applicant-filed complaints don't appear in the applicant panel

## Confirmed cause

External (applicant/licensee) complaints are being stored as *staff-filed* complaints, so the applicant list finds nothing that belongs to them.

- The list uses `list_complaints`, which for non-internal users returns only rows where `complainant_id = auth.uid()`.
- The single-argument `create_complaint(_payload)` wrapper the Complaints page calls resolves the variant to `'internal'` in **both** branches of its CASE expression — the applicant/licensee variant is never reachable.
- With variant `internal`, the insert sets `complainant_id = NULL` and puts the applicant's user id in `internal_created_by`.
- The two newest portal complaints (CMP-2026-000079, CMP-2026-000078, `intake_source = consumer_portal`, `entity1@yopmail.com`) both have `complainant_id = NULL` and `internal_created_by = 2b42d504-…` — exactly this pattern. Older applicant complaints (CMP-2026-000071/72/73) do carry `complainant_id`, which is why those still show.

## Fix

1. Backend — repair the wrapper so the variant is derived from the payload instead of always `internal`:
   - use `_payload->>'variant'` when present;
   - otherwise map `intake_source`: `internal`/`staff_intake` -> `internal`, everything else (`consumer_portal`, `licensee_portal`, …) -> `licensee`;
   - leaves the two-argument `create_complaint(_variant, _payload)` untouched, so severity/priority/triage behaviour is unchanged.
2. Frontend — the Complaints page sends the variant explicitly (`internal` for staff, `licensee` for applicant/licensee) so intent no longer depends on inference.
3. Data repair — one-off update: for complaints whose `intake_source` is a portal source (not internal/staff) and `complainant_id IS NULL` but `internal_created_by IS NOT NULL`, move `internal_created_by` into `complainant_id` and clear `internal_created_by`. This recovers CMP-2026-000078/79 for the applicant. Rows with no `internal_created_by` (genuinely anonymous public intake) are left alone.

## Technical notes

- Migration: `CREATE OR REPLACE FUNCTION public.create_complaint(_payload jsonb)` plus the scoped backfill UPDATE.
- Frontend: `src/pages/complaints/ComplaintsList.tsx` — add `variant` to the create payload in `handleCreate`.
- No RLS, grant, or schema changes; `list_complaints` stays as-is.

## Verification

Query the newest complaint after filing one from the applicant portal and confirm `complainant_id` equals the filer's user id, then confirm the row appears in the applicant Complaints list along with the two repaired records.
