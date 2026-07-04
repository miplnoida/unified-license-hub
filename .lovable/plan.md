## Problem

On the Application Detail page (edit/resume flow), submitting an application shows a plain "Application submitted" toast without the reference number. The one-shot new-application flow shows the reference number because it renders the `SubmissionAcknowledgement` panel with `app.application_number`. Users editing a draft don't get that acknowledgement, so they never see the reference.

## Fix (frontend only)

In `src/pages/applications/ApplicationDetail.tsx`, inside `handleSubmit` (around line 452), enrich the success toast with the application reference number.

- Prefer the reference returned by the edge function if present (`data.application_number` / `data.reference`), otherwise fall back to `app.application_number` already loaded in state.
- Use sonner's `toast.success(title, { description })` so the number is displayed prominently and stays copy-friendly:
  - Title: `data?.message || 'Application submitted'`
  - Description: `` `Reference: ${referenceNumber}` `` (only when a reference is available)
- Same treatment for `handleResubmit`'s success toast (line ~656) so resubmitted applications also surface the reference — matches the user's expectation that reference should always appear post-submit.

No other logic, no schema, no backend changes. The existing `loadData()` refresh after submit remains unchanged.

## Verification

1. Open `/applications/670791b1-...` (an in-progress draft), complete forms + payment, click Review & Submit → success toast shows `Reference: APP-…`.
2. Trigger a resubmission from the applicant side → toast shows the reference.
3. New one-shot submission flow (unchanged) still shows the acknowledgement panel with the reference.
