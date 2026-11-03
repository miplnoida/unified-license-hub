# Fix "Failed to send a request" on final approval (APP-2026-002019)

## What I found so far
- APP-2026-002019 is still **submitted** — the final approval did not go through, so nothing was half-done.
- The approval service's logs show it starting and stopping, but **no error and no record of this request**. "Failed to send a request" means the browser never got an answer at all (connection dropped or timed out), not that a rule refused it.
- The final approval does a lot in one go and makes the screen wait for all of it: record the approval, create the licence, create the primary web user, create the certificate, send notifications. Any slow part can make the browser give up. The system had similar slow-response episodes earlier.
- Exact cause is **not yet confirmed**. Step 1 confirms it before changing anything.

## Plan
1. **Confirm the cause** — retry the approval once as Super Admin in a controlled browser run, capture the exact request, its timing and the service log. Confirms whether it is a timeout, a crash or a connection refusal.
2. **Make final approval answer fast** — the screen waits only for the approval and licence record (one database step). Web-user creation, certificate and notifications move to the existing background retry queue, so a slow step can no longer break the approval.
3. **Safe retry** — clicking Approve twice never creates two licences; if the first attempt already succeeded, the second just reports "already approved".
4. **Clear message on the screen** — if the connection drops, the page re-checks the application and shows either "Approved" or "Not approved — please try again", instead of the raw error and blank screen.
5. **Finish APP-2026-002019** — approve it through the normal screen and confirm licence, primary user and certificate appear.

## What does not change
Workflow steps, prerequisites, permissions, fees and other modules stay as they are.

## Technical details
- `perform-workflow-action`: after `perform_final_workflow_approval` commits, enqueue provisioning (existing provisioning worker + dead-letter path) instead of awaiting `approve-pre-licensee` and `dispatch-notification-event` inline; return 200 immediately with `provisioning: "queued"`.
- Idempotency: if the application is already final-approved, return the existing result (guard inside the RPC / function, no schema change expected; if one is needed it will be staged as an additive migration and applies when the draft is accepted).
- `WorkflowPanel.tsx`: catch `FunctionsFetchError`, refetch application status, show a toast instead of a blank screen.
- Tests: duplicate approve yields one licence; fetch error path shows status re-check.
