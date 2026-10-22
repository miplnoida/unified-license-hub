# Re-pin APP-2026-002011 to the new form (v2.0)

## What will happen
The Rodney Bay draft application APP-2026-002011 will switch from the old form (v1.0) to the newly published form (v2.0). After that, when `rodneybay.registration@yopmail.com` opens the draft, they will see the new form.

## Safety conditions (all must be true, or nothing changes)
- The application is still a draft and can still be edited
- It has no saved form answers, no workflow and no submission
- v2.0 belongs to the same form and the same sector/regulator, and is published and in effect today

## Steps
1. Read-only check right before the change: confirm the conditions above and record the application's current form version and timestamps.
2. Make one guarded, audited update that changes only this application's pinned form version (internal version 2 to 4). No other applications, payments, fees, F&P records or settings change.
3. Read back: the application shows internal version 4 (v2.0) and is still a draft, with the same payment and fee status.
4. Browser check signed in as the applicant: open the draft and confirm v2.0 fields appear. If no applicant session can be restored, I will report this as not checked in the browser.
5. Update `/mnt/documents/demo/readiness-matrix.md` and `blockers-and-dependencies.md` to mark the re-pin blocker resolved.

## Not included (still waiting on you)
- Confirming the Credit Union approval workflow and naming the second approver
- Uploading documents, the missing payment receipt number, returns setup, AML (frozen), appeal and AI readiness

## Technical details
- The update is a single row change on `applications`, guarded with `WHERE id = '89603d2b-...' AND status = 'draft'` and no rows in the responses or workflow tables. It is logged in the audit log with a reason ("Demo readiness: re-pin to v2.0, owner approved 2026-10-22").
- No schema, RLS, function or code changes.
