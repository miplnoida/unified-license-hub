# Applicant RFI — hide the response form once a query is answered

## What is wrong

On the applicant panel, after submitting an answer to an RFI question the "Submit response" form stays on screen, so the same query looks unanswered and can be answered repeatedly.

The UI already tries to hide the form when a question is marked answered, but the question never actually gets marked answered for applicants. Confirmed in the database: 6 RFI questions carry submitted responses while their status is still `pending`. The reason is that write access to the RFI question table is restricted to internal staff permissions, so the applicant's answer is saved but the follow-up "mark as answered" update is silently rejected — the applicant's own answer never flips the state, and the linked review SLA is never resumed either.

## The fix

1. Move the whole applicant answer action server-side into one trusted operation that:
   - saves the response and its attachments,
   - marks that question answered,
   - when every question in the request is answered, flips the request to `responded` and resumes the paused review clock,
   - writes the audit entry.
   Authorisation is checked inside the operation (only someone allowed to act on that application can answer).
2. Applicant view: the response form is hidden as soon as an answer exists for the question, showing the submitted answer plus attachments and an "Answered" state instead. Closed/cancelled requests keep their existing read-only notice.
3. Backfill the 6 existing questions that already have answers but are still marked pending, so they immediately display correctly.

## Technical detail

- Migration: `public.application_rfi_submit_response(p_rfi_item_id uuid, p_response_text text, p_file_upload_ids uuid[])` — `SECURITY DEFINER`, `set search_path = public`, authorises with `can_mutate_application` (or internal `application_management.edit` / `workflow_action`), inserts into `application_rfi_responses` with `submitted_by = auth.uid()`, sets `application_rfi_items.response_status = 'responded'`, and when all sibling items are responded updates `application_rfis.status = 'responded'` and stamps `approval_step_actions.resumed_at`. Rejects a second submission on an already-answered item.
- Same migration: one-off `UPDATE` marking items `responded` where a response row exists and status is `pending`, plus the corresponding parent RFI status where all items are now answered.
- `src/components/applications/ApplicationRfiTab.tsx`: `RfiItemRow.submit` calls the RPC instead of the three direct table writes; `canRespond` additionally requires `(item.responses?.length ?? 0) === 0`; answered questions render the response history only. No change to the internal reviewer flow, closure flow, or notifications.
- Verification: re-query the item/response mismatch (must return zero rows), typecheck, and drive the applicant RFI tab in the browser to confirm the form disappears after one submission and the request status/SLA update.
