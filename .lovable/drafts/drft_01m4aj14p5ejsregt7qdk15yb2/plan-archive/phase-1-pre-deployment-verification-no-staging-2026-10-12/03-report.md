## 5. Readiness report contents
- **Results table:** each test is marked Passed, Failed, Not performed, or Needs deployment. Each one is also labelled **code-tested** or **live-server-tested**.
- **Needs deployment:**
  - Real export end-to-end.
  - Real server timing and memory.
  - Signed download.
  - Truncation on real data.
  - Admin browser run.
- **Risks:**
  - Timeout or memory limits on large exports.
  - Load on the shared live backend.
  - A negative number exported as text (the stated trade-off).
  - Old job rows without the new fields.
  - Permissions drift.
- **Deployment checklist:**
  1. **Backup:** record the current function version and metadata, and keep the current source in git as the restore point. There is no data or database change, so no database backup is needed. Record the baseline export job counts.
  2. **Exact items, in this order:**
     - First, deploy the `audit-export` function (`index.ts` and `exportCore.ts`).
     - Then publish the app (`AuditExport.tsx`).
     - The function goes first because the screen tolerates both response shapes.
  3. **Smoke tests by an admin you choose:** a small filtered export for each log, one export over 20,000 rows, a download link that works, and an apostrophe on formula cells.
  4. **Monitoring:** function logs, plus export job status and duration for 24 hours.
  5. **Rollback:** redeploy the previous function source from git, then re-publish the previous app version. No data clean-up is needed beyond noting any failed jobs.
- **Actions requiring your approval:** deploying the function, publishing the app, preview writes (draft save, upload), and the admin smoke test.
- **Status:**
  - Phase 1 stays "pre-deployment, not fully verified" until the production smoke tests pass.
  - RISK-049 stays Blocked (database).
  - RISK-027 stays an investigation only.
