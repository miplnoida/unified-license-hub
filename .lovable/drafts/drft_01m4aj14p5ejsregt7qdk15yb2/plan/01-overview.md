# Phase 1 — Audit Logging only (approved scope)

Scope is RISK-024, RISK-025, RISK-049 (partial) and RISK-027 (investigation only). Phase 2 (Notifications) and the cancelled security plan are not touched.

There are no database changes: no tables, migrations, triggers, access rules, grants, database functions or data. Authentication, workflows, payments, licensing, registration and returns are not touched.

The changes stay in this draft and are **not deployed**. The audit-export server function is deployed only if you separately authorise it. Until then, export changes are verified with unit tests against the function's code, and the live export keeps today's behaviour.

## Step 0 — Baseline (read-only, before any edit)
- **Live log sizes:** audit log 25,516 rows, compliance log 74,366, security log 792. The export has a hard cap of 20,000 rows, so today's exports of the first two logs are silently incomplete.
- **Root cause of RISK-024**, confirmed against the table structure:
  - The export filters the compliance and security logs on `table_name`, which neither log has. Any module filter on those logs fails.
  - Correct columns: audit log `entity_type`, compliance log `object_type`, security log `module`. All three have `created_at`.
- **Current CSV writer:** quotes commas, quotes and newlines, but does nothing about cells starting with `=`, `+`, `-`, `@`, tab or carriage return.
- **Baseline unit tests** pin today's output for normal data: header order, column set, quoting, and the JSON-in-cell format. The approved fixes must leave these unchanged.

## Step 1 — RISK-024 and RISK-025 (export)
**Files:**
- `supabase/functions/audit-export/index.ts`
- `src/pages/admin/AuditExport.tsx`

Planned changes:
- **Filter column:** a small fixed map from each log to its correct filter column. Unknown log types are refused, as today.
- **Counting and paging:**
  - Count the filtered rows exactly before fetching.
  - Fetch in pages of 1,000, ordered by `created_at` then id, so paging is stable and rows cannot repeat or be skipped.
- **Safety limit:** a documented constant, `EXPORT_MAX_ROWS = 100000`, recorded in the function header.
  - When the filtered count is over the limit, the job is still created with the first 100,000 rows.
  - The job's existing `filters` field records `truncated: true`, `total_matching` and `exported`.
  - The response includes the same values, and the job's `row_count` is the exported count.
  - Nothing is cut off silently.
- **Formula protection:** only cells whose text starts with `= + - @`, tab or carriage return get a leading apostrophe. This is the same rule as the existing reports export. All other values are written byte-for-byte as before.
- **Unchanged:** permissions, justification requirement, file name and location, five-minute signed download link, job statuses and CSV format.
- **Audit Export screen:** the job row shows "Truncated: X of Y rows" only when the job says so. The success message reports the exported count, and the total when truncated. Nothing else on the screen changes.

## Step 2 — RISK-049 (partial)
**Finding:**
- Browser audit rows already record the browser identifier and route through the existing trusted metadata path.
- The only IP value available in the browser comes from a client-side lookup, which the approval says must not be trusted.
- A trusted IP needs server-side capture inside database functions.

**Result:** no code change. Marked **Blocked (database)**, with the requirement documented.

## Step 3 — RISK-027 (read-only investigation; no code change)
- Trace every place a document access link is created: versioned documents, attachments, payments, correspondence, F&P evidence and registration files.
- For each place, record whether anything is logged.
- Separate **link issued** from **actually viewed or downloaded**. Only storage access logs or a server proxy can show the second.
- Explain why `document_action_logs` holds 0 download rows when the versioned-document path attempts to write one. Check the access rules, read-only.
- Deliverable: an evidence report in `docs/audit/phase1-risk-027-document-access.md`.

## Step 4 — Tests and regression
- **New unit tests:**
  - `src/test/auditExportPhase1.test.ts`, covering:
    - The filter column used for each log type.
    - Stable ordering across pages, with no duplicates or gaps on simulated multi-page data.
    - Exact count, plus the truncated flag and totals when over the limit.
    - Formula neutralisation, including negative numbers, dates and email addresses (expected outcomes stated in the test).
    - Baseline output unchanged for normal values.
  - The tested export logic moves to a pure helper inside the function folder, so it can be tested without deployment. The function behaves the same.
- **Existing suites:** audit RPC, Compliance Audit Logs, audit source coverage, then the full unit suite, typecheck and build.
- **Browser checks in the preview:** Audit Logs, Compliance Audit Logs, Security Events, Case Audit Trail, Audit Export screen, sign-in, saving an application draft and a document upload, each compared with the baseline.
  - Because the export function is not deployed, the live export run is listed as **Not tested** until deployment is authorised.

## Completion report
For each finding: Fixed, Partially Fixed, Blocked or Unverified. The report also lists:
- Exact files changed, with the reason for each.
- Before and after evidence.
- Pass/fail for every test run, and anything that could not be tested.
- Outstanding database dependencies: trusted IP capture, the 0 download rows, real view/download evidence.
- Confirmation that no database changes were made and that Phase 2 was not touched.

Work stops there and waits for your approval before Phase 2.
