# Withdrawn application blocks a new application for a different sector

## What the data shows

Application `83ffc118-…` (APP-2026-001929, applicant andria.johny@yopmail.com):

```text
05:26  created (draft)
07:06  submitted
07:10  withdrawn — reason: "I want to withdraw my application for this
       sector. I'll apply for new sector."
```

That applicant has **exactly one** application row — no new record was ever
created for the new sector. The wizard URL still carried
`?draft=83ffc118-…`, so every save went back into the withdrawn record, and the
server correctly refused it (`application_draft_save` only accepts
`draft / in_progress / returned / info_requested / query_raised /
resubmission_required / pending_payment`).

Confirmed separately: the duplicate-application guard
(`application_reapply_guard`) matches on sector + sub-sector + category +
service, so a genuinely **different** sector is already allowed. Nothing on the
server blocks the new application — the wizard is simply still bound to the old
withdrawn one.

## Fix (frontend wizard binding + messaging only)

1. `src/pages/NewApplication.tsx` — draft hydration effect: after loading the
   application, check `isApplicationEditable(status)`
   (`src/lib/applicationStatus.ts`).
   - Editable → behave exactly as today.
   - Not editable (withdrawn / rejected / approved / cancelled / submitted-like)
     → **do not adopt it**: leave `applicationId` null, drop the `draft` and
     `step` params from the URL, and start the clean classification step so the
     applicant can pick the new sector. A one-time inline notice explains:
     "Your earlier request APP-2026-001929 was withdrawn and can no longer be
     edited. Start a new request below." Read-only viewing of the old record
     stays available from My Applications.
2. Because no application id is bound, choosing the new sector/sub-sector/
   category runs the normal create path — `application_reapply_guard` then
   `insert` — producing a fresh application for the new sector. No change to the
   guard, the withdrawal flow, or the editable-status list.
3. Map server codes to plain language in the save/submit error handling so a raw
   `APPLICATION_NOT_EDITABLE` / `APPLICATION_EDIT_FORBIDDEN` never reaches the
   user again.
4. Test (`src/test/`): hydrating a withdrawn application id renders the
   start-new notice, binds no application id, and a subsequent sector selection
   creates a new record rather than saving into the withdrawn one.

Not touched: withdrawal workflow, RLS, `application_draft_save`, submission
gates, re-application policy settings, navigation.
