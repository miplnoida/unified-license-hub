# EPR-01 — P06 Regulatory Returns Canonical Convergence — Certification

Status: **PASS (one outstanding legacy read)** — see Outstanding.

## 1. Canonical spine

Single internal spine: `/returns/queue` → `/returns/filings/:filingId`.
Single external spine: `/entity/returns` → canonical `EntityFilingWorkspace`.
Truth objects: `return_filings`, `return_filing_versions`, `return_metric_values`,
`return_filing_requests`, read through `v_return_filing_workflow_state` and the
`returns_*` / `prudential_*` read models.

## 2. Legacy spine retirement

| Retired path | Now resolves to |
| --- | --- |
| `/returns-management`, `/admin/returns/queue` | `/returns/queue` |
| `/returns-management/:id`, `/admin/returns/queue/:id(/analysis)` | `LegacyReturnFilingRedirect` → canonical filing |
| `/compliance/returns`, `/compliance/returns/submit` | `/entity/returns` |
| `/entity/returns/new` | `/entity/returns` |
| `/entity/returns/:id/fill`, `/entity/returns/:id/view` | `LegacyReturnFilingRedirect target="external"` |

All are COMPATIBILITY_ONLY: no navigation entry points at them and no
regulatory action can be taken there. All new links are emitted through
`objectRoute.returnFiling` (`src/lib/routes/objectRoutes.ts`).

## 3. Certified lifecycle run (governed RPCs only)

Filing `3dc435f0…` (entity `1d8857c0…`) exercised end to end through the API as
an authorised user — no direct table writes:

| Step | RPC | Result |
| --- | --- | --- |
| v1 validate | `returns_validate_filing` | 0 errors, `can_submit: true` |
| v1 submit | `returns_submit_filing` | `submitted: true`; v1 `is_immutable` |
| review start | `returns_review_filing START_REVIEW` | ok |
| correction | `returns_review_filing REQUEST_CORRECTION` | v1 `SUPERSEDED`, v2 `DRAFT` created, filing `CORRECTION_REQUESTED`, CORRECTION request opened |
| v2 resubmit | `returns_submit_filing` | `submitted: true` |
| accept | `returns_review_filing ACCEPT` | filing `ACCEPTED`, `accepted_version_id` = v2 |

Read model after acceptance: `v_return_filing_workflow_state` →
`status = ACCEPTED`, `status_label = Accepted`, `stage_label = Closed`.
Audit trail written: `SUBMIT` ×2, `RETURN_REVIEW_START_REVIEW` ×2,
`RETURN_REVIEW_REQUEST_CORRECTION`, `RETURN_REVIEW_ACCEPT` on
`audit_logs.entity_type = 'return_filing'`.

Regression file: `supabase/tests/certification/02_returns_filing_lifecycle.sql`
(15 assertions; runs under the CI migration role which can `SET ROLE authenticated`).

## 4. Defect found and fixed

**BLOCKER — governed Returns mutations failed at runtime.** Twelve `returns_*`
governed functions call `create_audit_log(entity_type, entity_id, action, metadata)`,
an overload that no longer existed. Every open/submit/review/definition-save call
aborted with `42883 function public.create_audit_log(unknown, uuid, unknown, jsonb)
does not exist`. Fixed by restoring the four-argument overload, which delegates to
the canonical seven-argument writer with `auth.uid()` as the actor
(`SECURITY DEFINER`, `search_path = public`, `anon`/`PUBLIC` execute revoked).
Re-verified by the full lifecycle run above.

## 5. Reporting and case-audit source map

- `report_sources` / `report_source_filters` now expose `return_filings` mapped to
  `v_return_filing_workflow_state`; `compliance_returns` marked historical.
- `ret-*` report definitions, `reportService`, `reportMetadataService` and
  `supabase/functions/_shared/report-generator.ts` repointed.
- Case audit (`ConsolidatedCaseTab`, `caseAuditGraph`, `WorkflowActionPreviewDialog`)
  reads canonical filings and `v_prudential_current_breaches`.
- Dashboards/analytics (`widgets`, `useApiQueries`, `AnalyticsDashboard`,
  `useLicenseeMetrics`, `ExecutiveSupervisoryDashboard`, `AlertCenter`) read the
  canonical workflow state / `returns_*` aggregates.

## 6. Legacy-read recount

Active client/edge reads of `returns_filed` / `return_calculated_ratios` /
`compliance_returns` outside retired (unrouted) screens, migration adapters and
generated types: **1 screen**.

## Outstanding

- `src/pages/returns-mgmt/PrudentialAnalytics.tsx` (`/admin/returns/prudential/analytics`)
  still assembles its ratio universe, period list and trend in the browser from
  `return_calculated_ratios` + `returns_filed`. It must be repointed to canonical
  metric facts (`return_metric_values` + `regulatory_metrics`, filtered through
  `v_return_filing_workflow_state`) before EPR-01 can be recorded as fully closed.
  No other routed surface reads legacy Returns truth.
- The unrouted legacy screens (`returns-mgmt/ViewReturns`, `returns-mgmt/ReturnDetail`,
  `entity/returns/FillReturnPage|ViewReturnPage|CreateReturnPage`) remain in the tree
  as dead code pending deletion in a cleanup tranche.
