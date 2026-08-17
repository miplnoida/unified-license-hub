# Why the updated form data is still the old data

## What the check found (application d1b67783…)

- The application's stored form data has **not changed since 09:18 UTC** — I compared the current `forms_data` against the last recorded change and they are byte-identical.
- Timeline: submitted 09:18 → RFI raised 09:35 → status moved to Information Requested 10:01 → resubmitted 10:07 → RFI marked responded 10:08.
- So between the RFI and the resubmission, **no edited form values ever reached the database**. The admin view is faithfully showing what is stored; nothing is stale on the reading side.
- Why the write was lost: in the application detail screen the form save runs a plain update with **no row-count check**. When the row is not writable (for example the ~26-minute window between the RFI at 09:35 and the status flip at 10:01, while the application was still "Submitted"), the database returns *zero rows updated and no error*. The screen treats that as success, reloads, and quietly shows the old values again. The separate "Continue application" screen already guards against this; the detail screen does not.
- Secondary gap: form-data changes are only written to history while an application is `draft`/`in_progress`. Edits made in the Information Requested state leave **no audit entry**, so there is no trail of what the applicant changed after an RFI.

## Fix

1. **Never lose a save silently** — the detail-screen form save will confirm the write actually affected the row. If it did not, show a clear blocking error ("This application is not currently open for editing — your changes were not saved") instead of a silent reload. Same guard for the document and fee steps on that screen.
2. **Show save state honestly** — a success confirmation only after a verified write, and a visible "unsaved changes" marker on a form with edits, so an applicant cannot resubmit believing their edits were stored.
3. **Audit post-RFI edits** — extend the application audit trigger so form-data changes are also logged when the status is `info_requested`, `resubmission_requested`, `query_raised` or `returned_for_correction`, as `application.form_data_updated`. This makes reviewer-visible history show what changed after an RFI.
4. **Resubmission sanity signal** — on resubmit, if no form data changed since the RFI was raised, record that on the RFI response/audit trail so a reviewer sees "resubmitted with no form changes" rather than silently receiving identical data.

No change to who may edit: `info_requested` is already permitted for the applicant, and the unlock triggers are in place.

## Technical notes

- `src/pages/applications/ApplicationDetail.tsx` — the `SubmittedForms` `onSave` handler: add `.select('id')` to the update and throw/toast when `data.length === 0`; propagate the failure so `SubmittedForms` does not mark the form completed or auto-advance.
- `src/components/applications/SubmittedForms.tsx` — treat a rejected `onSave` as failure (no completion badge, keep the accordion open, no `onAllFormsCompleted`).
- Migration: update `tg_applications_audit` to include the post-RFI statuses in the data-change branch with the new action name, keeping the existing draft behaviour intact.
- `supabase/functions/verify-and-submit/index.ts` — compare the submitted `forms_data` fingerprint with the value captured when the RFI was raised and attach the result to the resubmission audit row.

## Verification

- As the applicant, open this application while an RFI is open, change a field, save, and confirm the value persists after reload and appears in the reviewer's Submitted Forms tab.
- Force the locked case (RFI closed / status back to Submitted) and confirm the save now raises a visible error instead of silently discarding the edit.
- Confirm the change history shows an entry for the post-RFI edit.
