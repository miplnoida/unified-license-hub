# Phase 1 Audit Logging: Pre-deployment Readiness Report (2026-10-12)

**Status: PRE-DEPLOYMENT, NOT FULLY VERIFIED.** The `audit-export` function has not been deployed, and the app has not been published. This verification made no code or database changes. Phase 2 has not started.

**Scope:**
- RISK-024 (fixed in source, not live)
- RISK-025 (fixed in source, not live)
- RISK-049 (Blocked: needs a database change)
- RISK-027 (investigation only; see `phase1-risk-027-document-access.md`)

Labels used in this report:
- **CODE** = tested against source code or a local simulation.
- **LIVE-RO** = read-only query against the live backend.
- **PREVIEW** = browser check in the preview.
- **NEEDS DEPLOY** = cannot be tested until the function is deployed.

## 1. Results

| # | Check | Type | Result |
|---|---|---|---|
| 1 | Full unit suite: 191 files, 1,816 tests | CODE | PASS |
| 2 | App typecheck | CODE | PASS |
| 3 | Phase 1 export tests (9) and existing audit tests (9) | CODE | PASS |
| 4 | Simulated 100,000-row paged export: 100,000 unique rows, no gaps | CODE | PASS |
| 5 | Edge cases: 0, 1,000, 1,001, and 100,001 rows capped at 100,000 | CODE | PASS |
| 6 | Formula guard: `= + - @`, tab and CR get an apostrophe; leading space, JSON and unicode are unchanged | CODE | PASS |
| 7 | CSV quoting for commas, quotes and `\n` | CODE | PASS |
| 8 | CR in the middle of a cell (`a\rb`) is not quoted. This was already the case before Phase 1; the risk is low. | CODE | NOTE |
| 9 | Filter columns exist on the live tables: `entity_type`, `object_type`, `created_at`, `id`, `entry_id` | LIVE-RO | PASS |
| 10 | The UI handles old job rows that have no `filters` field (optional chaining), and shows the truncation badge and toast | CODE | PASS |
| 11 | Signed-out visitors are sent to login from `/admin/audit-export`, `/admin/audit-logs`, `/admin/compliance-audit-logs`, `/admin/security-events` and `/admin/case-audit` | PREVIEW | PASS |
| 12 | Peak memory for a 100,000-row export | CODE | **FAIL RISK**: see section 3 |
| 13 | Admin browser run of the export screens | NEEDS DEPLOY / admin | NOT PERFORMED |
| 14 | Real export, signed download and truncation on real data | NEEDS DEPLOY | NOT PERFORMED |
| 15 | Saving an application draft and uploading a document (these write to the live backend) | PREVIEW | NOT PERFORMED: awaiting your approval |
| 16 | Persona Playwright suites. No signed-in session is available in this preview, and passwords were not requested. | PREVIEW | NOT PERFORMED |

**Live baseline (LIVE-RO):**
- `audit_logs`: 25,516 rows, average about 404 bytes per row.
- `compliance_audit_logs`: 74,370 rows, average about 2,263 bytes per row.
- `audit_export_jobs`: 1 job (completed, 15 rows).

The largest single-module result sets are:
- Compliance log `notification_dispatch_log`: 57,829 rows.
- Audit log `notification`: 22,404 rows.

Both exceed the old 20,000-row cap.

## 2. Routes and permissions (from code)

All five audit screens use the `ModuleRoute` guard with module `settings` and action `view`:

| Screen | Route | Defined in |
|---|---|---|
| Audit Logs | `/admin/audit-logs` | `adminRoutes.tsx` L190 |
| Compliance Audit Logs | `/admin/compliance-audit-logs` | `adminRoutes.tsx` L191 |
| Case Audit Trail | `/admin/case-audit` and `/admin/case-audit/:entityType/:entityId` | `adminRoutes.tsx` L224–225 |
| Audit Export | `/admin/audit-export` | `dashboardRoutes.tsx` L361 |
| Security Events | `/admin/security-events` | `dashboardRoutes.tsx` L362 |

The export function separately requires `audit_management.export`, checked on the server through `requireUserPermission`. A user with `settings.view` but without that permission can open the screen, but the export is refused.

The earlier "Not Found" result came from testing the wrong path. The correct path is `/admin/case-audit`.

The export function supports only `audit_logs` and `compliance_audit_logs`. Security events are not exportable through it, which is unchanged.

## 3. Production deployment risks

1. **Memory (HIGH).**
   - The simulation used about 400–700-byte rows. A 100,000-row export reached about 690 MB peak RSS and produced about 72 MB of CSV.
   - Compliance rows average about 2.3 KB, so a full compliance export (about 74,000 rows, about 170 MB of raw data) is likely to exceed the Edge Function memory limit, which is in the low hundreds of MB.
   - Today the 20,000-row cap hides this risk. Raising the limit to 100,000 exposes it.
   - **Recommendation before deployment:** lower `EXPORT_MAX_ROWS` (for example to 25,000) or stream the CSV per page. Either is a small code change that needs your approval.
2. **Timeouts (MEDIUM).**
   - Offset paging re-scans earlier rows for each page. EXPLAIN on page 58 of `notification_dispatch_log` shows an index scan with an incremental sort, cost about 17.8k.
   - About 58–75 sequential round-trips per export could approach the wall-clock limit.
3. **Stuck jobs (MEDIUM).** If the function is stopped for exceeding memory or time, the job stays `running`, because the catch block cannot run. Jobs left in `running` need to be checked.
4. **Load on the shared live backend (LOW–MEDIUM).** Large exports read tens of MB from the production database.
5. **Behaviour changes (LOW):**
   - A leading `-5` exports as `'-5`.
   - Exports are now ordered oldest-first. Previously there was no explicit order.

## 4. Deployment checklist (requires approval)

1. **Backup:**
   - Record the deployed `audit-export` version and metadata.
   - The pre-Phase-1 source in git is the restore point.
   - No database change is involved, so no database backup is needed.
   - Record the baseline job counts: 1 completed job.
2. **Decide on risk 1:** either approve a lower limit or streaming, or accept the risk.
3. **Deploy the function:** `supabase/functions/audit-export/index.ts` and the new `exportCore.ts`.
4. **Publish the app:** `src/pages/admin/AuditExport.tsx`. Order does not matter for compatibility: the screen tolerates both response shapes, and the old screen ignores the new fields.
5. **Smoke tests, run by an admin you designate who holds `audit_management.export`:**
   - A small dated export from each log.
   - A module filter on the compliance log (`applications`). This failed before the fix.
   - A large export (`notification`, about 22k rows) that completes with the correct row count.
   - The download link works within 5 minutes.
   - A formula cell shows the apostrophe.
   - A user without the permission is refused.
6. **Monitor for 24 hours:**
   - Function logs for memory, time limits and errors.
   - `audit_export_jobs` rows that stay `running` or `failed`.
   - Durations.
7. **Rollback:**
   - Redeploy the previous `index.ts` from git (the old function did not use `exportCore.ts`).
   - Re-publish the previous app version.
   - Mark any stuck `running` jobs as failed. This is a data write and needs approval.
   - No schema rollback is needed.

## 5. Actions awaiting your explicit approval
- A code change for memory risk 1 (recommended before deployment).
- Deploying the `audit-export` function.
- Publishing the app.
- An admin to run the smoke tests.
- Preview write tests (draft save, document upload).

Phase 1 must not be called fully verified until the production smoke tests in step 5 pass.
