# Certificate Download – Go Live and Verify

## Where things stand
- The certificate service is fixed in this draft. It now accepts the background job that creates certificates when a licence is issued. Holders can still only download their own certificate.
- This draft cannot put the service live. The live service is shared with the main app, so drafts are blocked from updating it. Until the fix is live, Download Certificate keeps showing the "not yet issued" message.

## Steps
1. **Run a local check.** Test the updated service code before it goes live.
2. **Put the fix live.** Accept this draft into the main app. That tries to update the certificate service. If the update does not go through, update the service from the main app.
3. **Retry the failed jobs.** Move the 17 abandoned certificate jobs back to pending so the background worker creates the missing certificates. This includes Rodney Bay's LIC-2026-000166. It only changes job status; no licence records change.
4. **Verify as Rodney Bay.** Use your signed-in session for rodneybay.registration@yopmail.com. Open My Licences, then LIC-2026-000166, then Download Certificate, and confirm a PDF downloads. Also confirm the certificate count goes from 0 for that licence.

## Out of scope
- The 17 failed portal-access jobs are reported only, not retried.
- No changes to roles, access rules, payments or the workflow. The on-hold items stay on hold. Nothing is published.
