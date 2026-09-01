# Why "APPLICATION_NOT_EDITABLE" appears on that draft URL

## Confirmed cause (from the actual record)

Application `83ffc118-f7d9-4644-be26-d7db2b0b689e` (APP-2026-001929, applicant
andria.johny@yopmail.com) has status **`withdrawn`**.

Audit trail for that record:

```text
05:26  created (draft)
07:06  application.submitted        in_progress -> submitted
07:10  application_withdrawn        submitted   -> withdrawn
       reason: "I want to withdraw my application for this sector.
                I'll apply for new sector."
```

The save path (`application_draft_save`) only accepts editable statuses
(`draft`, `in_progress`, `returned`, `info_requested`, `query_raised`,
`resubmission_required`, `pending_payment`). `withdrawn` is a final status, so
the server correctly refuses the write and raises
`APPLICATION_NOT_EDITABLE`.

So this is not a regression in saving: the application was deliberately
withdrawn by the applicant, and the old wizard URL (`/pre-license/new?draft=...`)
was reopened afterwards. A new application must be started instead — the
withdrawn one cannot be edited by design.

## The real defect: the wizard lets you reach a dead form

`/pre-license/new?draft=<id>` hydrates any application the user can read and
does not check whether the loaded status is editable. The user fills fields and
only discovers the record is closed when the save fails with a raw server code.

## Proposed fix (UX guard only, no change to authorization or lifecycle)

1. In the draft-hydration effect of `src/pages/NewApplication.tsx`, after the
   application row loads, evaluate `isApplicationEditable(status)` from
   `src/lib/applicationStatus.ts`.
2. When it is not editable, do not render the editable wizard. Show a clear
   read-only notice naming the status ("This application was withdrawn on
   1 Sep 2026 and can no longer be edited"), with actions:
   - "Start a new application" → `/pre-license/new` (fresh)
   - "View application" → the application detail page
3. Map the server codes to human messages in the save/submit error handler so
   any future `APPLICATION_NOT_EDITABLE` / `APPLICATION_EDIT_FORBIDDEN` shows
   plain language instead of the raw code.
4. Add a focused test asserting a withdrawn application renders the
   non-editable notice and never the form.

Not changed: `application_draft_save`, editable-status list, withdrawal
workflow, RLS, submission gates, navigation.
