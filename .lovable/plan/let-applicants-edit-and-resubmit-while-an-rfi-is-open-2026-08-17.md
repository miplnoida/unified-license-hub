# Let applicants edit and resubmit while an RFI is open

Today, raising an RFI creates the RFI record and pauses the review SLA, but the application stays in **Submitted**. Because applicant edit access is keyed to statuses like draft / in progress / to-be-resubmitted, the applicant can only type RFI answers — they cannot correct the underlying forms. This closes that gap.

## Behaviour after the change

1. When a reviewer raises an RFI, the application moves to **Information Requested** and the previous status is remembered.
2. The applicant sees the application as editable again:
   - "Edit" action appears in their applications list.
   - Form tabs, document upload and fee steps unlock in the application detail / continue flow.
   - A clear banner explains: information has been requested, update your forms and resubmit.
3. The applicant answers the RFI questions and resubmits the application (full submit flow, same validation and acknowledgement as a normal resubmission).
4. On resubmission the application returns to the reviewer's queue (its pre-RFI review status), the RFI is marked responded, and the paused SLA resumes.
5. If a reviewer closes/cancels the RFI without a resubmission, the application returns to its pre-RFI status and locks again.

## Technical outline

**Database (migration)**
- Trigger on `application_rfis` insert: if the application status is a live review status (`submitted`, `under_review`, `clarification_requested`), stash it in `applications.data->'pre_rfi_status'` and set `status = 'info_requested'`.
- Trigger on `application_rfis` update: when the last open RFI for the application becomes `responded`/`closed`/`cancelled` and the application is still `info_requested`, restore `pre_rfi_status` (default `submitted`) and clear the stash.
- Resume the paused `approval_step_actions` row (set `resumed_at`) when the RFI leaves the open state, mirroring the pause written at raise time.
- `can_mutate_application` already permits `info_requested` for the applicant, so no RLS change is needed; the migration will verify this and keep the existing policy untouched.
- Audit rows for both transitions so the timeline reads "Information requested" / "Applicant resubmitted".

**Backend function**
- `verify-and-submit` already treats `info_requested` as a resubmission, so no status-gate change. It will additionally mark still-open RFIs on that application as `responded` at submit time and record the resubmission event, so reviewers do not have to reconcile manually.

**Frontend**
- `src/pages/applications/ApplicationDetail.tsx`: add `info_requested` to the editable/`canPay` conditions and to the owner resubmit block; show an "Information requested" banner with the RFI summary and a link to the RFI tab.
- `src/pages/applications/ApplicationsList.tsx`: include `info_requested` in the applicant "Edit" visibility and map it to the returned/action-needed status group.
- `src/components/applications/ApplicationRfiTab.tsx`: alongside the response form, add a short prompt with a link to edit the forms.
- Applicant dashboard action lists already surface `info_requested`; verify no copy says "waiting on regulator" for this state.

## Verification

- Raise an RFI on a submitted application via the reviewer UI, confirm the status flips to Information Requested and the applicant can open, edit and save a form.
- Answer the RFI, resubmit, confirm the application returns to the reviewer queue, the RFI shows responded, and the SLA timer resumes.
- Close an RFI without resubmission and confirm the application reverts to Submitted and locks for the applicant.
