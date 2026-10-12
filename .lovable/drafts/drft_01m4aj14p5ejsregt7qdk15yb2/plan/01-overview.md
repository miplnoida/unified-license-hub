# Phase 1 — Pre-deployment verification (no staging)

Scope is still only RISK-024, RISK-025, RISK-049 (partial) and RISK-027 (investigation). This work makes no code changes, no database changes, no deployment and no publish. Phase 2 is not started.

The only file written is the report: `docs/audit/phase1-predeployment-readiness.md`.

## 1. Code-level verification of the export (RISK-024 / RISK-025)
- **Re-run the unit suites** for the export helpers. Add harness runs under `/tmp` only, so no project files change:
  - **Large export simulation:** run the real `exportCore` paging and CSV code against simulated pages of 100,000 rows with realistic audit row shapes. Measure elapsed time, peak memory (heap and RSS) and CSV size.
  - **Limits:** compare the results with Edge Function limits (memory, wall-clock, CPU time). Estimate the time per page round-trip from the read-only checks in step 2.
  - **Paging:** test stable ordering with tied `created_at` values, an empty result, exactly 1,000 rows, 1,001 rows, the limit, and limit+1.
  - **CSV security:** test cells starting with `=`, `+`, `-`, `@`, tab or CR. Also test cells with leading spaces, nested JSON, unicode and newlines, and check Excel-safe output.
- **Static check of `index.ts`:**
  - Every log type maps to an existing column.
  - Unknown types are refused.
  - Justification, permission checks, storage path and the 5-minute signed URL are unchanged.
  - Error paths set the job to failed.
- **UI compatibility:**
  - Unit-render `AuditExport.tsx` with old job rows that have no truncation fields, and with new truncated rows.
  - Confirm that the old response shape still renders.

## 2. Read-only checks against the live backend (SELECT only)
- Confirm the filter columns and the `created_at` and id columns on all three logs, plus the existing indexes on the order columns.
- Run exact filtered counts per log and per common module. This finds which real exports would exceed 20,000 rows or 100,000 rows.
- Run `EXPLAIN` (not `ANALYZE`) on the paged query to judge timeout risk.
- Read the recent `audit_export_jobs` rows (status and row_count only) as the baseline of today's behaviour.
- Read the deployed function's metadata and logs. Do not fetch its source.

## 3. Admin route and permission mapping (from code)
- List every audit screen route from the route files: Audit Logs, Compliance Audit Logs, Security Events, Audit Export and Case Audit Trail, including the correct path for the earlier "Not Found" case.
- For each screen, record its guard and the module and action it needs. Cross-check against the server function's own permission check.
- Do not bypass access controls, mint admin sessions or ask for passwords. Admin screens are checked only by code and unit tests, and are marked "not browser-tested as admin".

## 4. Regression runs
- Full Vitest suite, app typecheck, function typecheck and build.
- Existing Playwright specs for authentication and audience boundaries, run read-only as the existing test personas.
- In the preview, as the self-scoped account:
  - Sign-in.
  - Dashboard.
  - An application draft opens.
  - A document upload screen opens.
  - The audit screens deny access correctly.
- Saving a draft or uploading a document writes to the live backend. These steps are listed as pending your approval and are not performed.
