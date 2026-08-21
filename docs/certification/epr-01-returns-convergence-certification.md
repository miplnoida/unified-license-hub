# EPR-01 — P06 Regulatory Returns Canonical Convergence — Certification

Status: **PASS / CLOSED**. `ACTIVE_OPERATIONAL_LEGACY = 0`.

## 1. Canonical spine

Single internal spine: `/returns/queue` → `/returns/filings/:filingId`.
Single external spine: `/entity/returns` → canonical `EntityFilingWorkspace`.
Truth objects: `return_filings`, `return_filing_versions`, `return_metric_values`,
`return_filing_requests`, read through `v_return_filing_workflow_state`,
`v_return_metric_facts_current` and the `returns_*` / `prudential_*` read models.

## 2. Legacy spine retirement

| Retired path | Now resolves to |
| --- | --- |
| `/returns-management`, `/admin/returns/queue` | `/returns/queue` |
| `/returns-management/:id`, `/admin/returns/queue/:id(/analysis)` | `LegacyReturnFilingRedirect` → canonical filing |
| `/compliance/returns`, `/compliance/returns/submit` | `/entity/returns` |
| `/entity/returns/new` | `/entity/returns` |
| `/entity/returns/:id/fill`, `/entity/returns/:id/view` | `LegacyReturnFilingRedirect target="external"` |
| `/entity/returns/legacy` | HISTORY_ONLY register of pre-canonical filings |

All are COMPATIBILITY_ONLY: no navigation entry points at them and no
regulatory action can be taken there. All new links are emitted through
`objectRoute.returnFiling` (`src/lib/routes/objectRoutes.ts`), which now emits
the internal or the external workspace from the same canonical filing id.

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

## 4. Prudential Metric Analytics — final legacy read closed

`/admin/returns/prudential/analytics` no longer touches `return_calculated_ratios`
or `returns_filed`. New canonical read models (all `SECURITY INVOKER`, `anon`
and `PUBLIC` execute revoked):

| Read model | Purpose |
| --- | --- |
| `v_return_metric_facts_current` (view, `security_invoker`) | Eligible metric facts: the accepted version, else the filing's current version |
| `prudential_analytics_metrics()` | Metric catalogue with entity/period coverage; labels from `regulatory_metrics` |
| `prudential_analytics_metric_context(metric_code)` | Entities and reporting periods that actually hold a fact |
| `prudential_analytics_metric_trend(entity_id, metric_code, limit)` | One point per reporting period, no superseded duplicates |

`peer_ratio_snapshot(date, text, uuid, uuid, integer)` keeps its signature,
grants and confidentiality behaviour and now derives peers from
`v_return_metric_facts_current`, matching metric codes case-insensitively. The
regulator-configured minimum peer sample and the hard floor of 3 are unchanged;
an unmet sample still returns `state = INSUFFICIENT_PEER_DATA` rather than
zeroed statistics. No ratio is recomputed in the browser, and a missing metric
fact renders as absent rather than as zero.

Verified against the certification dataset: 269 eligible facts, 0 superseded
versions leaking, 0 duplicate entity/metric/period rows.

## 5. External Returns overview repointed

`/entity/returns/dashboard` (linked from external navigation) previously counted
`returns_filed` rows in the browser and, with that table empty, displayed zeros.
It now reads `returns_entity_summary` and `returns_entity_filing_history` for the
user's approved entity memberships and links through
`objectRoute.returnFiling(id, 'external')`. The legacy `StatusBadge` remains
exported for the HISTORY_ONLY register only.

## 6. Reporting and case-audit source map

- `report_sources` / `report_source_filters` expose `return_filings` mapped to
  `v_return_filing_workflow_state`; `compliance_returns` marked historical.
- `ret-*` report definitions, `reportService`, `reportMetadataService` and
  `supabase/functions/_shared/report-generator.ts` repointed.
- Case audit (`ConsolidatedCaseTab`, `caseAuditGraph`, `WorkflowActionPreviewDialog`)
  reads canonical filings and `v_prudential_current_breaches`.
- Dashboards/analytics (`widgets`, `useApiQueries`, `AnalyticsDashboard`,
  `useLicenseeMetrics`, `ExecutiveSupervisoryDashboard`, `AlertCenter`) read the
  canonical workflow state / `returns_*` aggregates.

## 7. Audit regression guard

The four-argument `create_audit_log(text, uuid, text, jsonb)` overload used by
the twelve governed `returns_*` functions is asserted to exist, to be
`SECURITY DEFINER` with a pinned `search_path`, and to be un-executable by
`anon` and `PUBLIC` — `supabase/tests/certification/03_audit_writer_contract.sql`.

## 8. Final legacy-read recount

Navigable surfaces reading `returns_filed` / `return_calculated_ratios` /
`return_consolidated_analysis`: **0**.

Remaining references, all non-navigable and enumerated:

| Reference | Classification |
| --- | --- |
| `MyReturnsPage` (`/entity/returns/legacy`), `useMyReturns`/`useReturnById` | HISTORY_ONLY register |
| `useWaveC` legacy-id bridge, `LegacyReturnFilingRedirect`, `returns_resolve_legacy_filing` | COMPATIBILITY_ONLY resolution |
| `returns-mgmt/ViewReturns`, `ReturnDetail`, `ReturnAnalysis`, `entity/returns/CreateReturnPage|FillReturnPage|ViewReturnPage` | Unrouted dead code, pending deletion in a cleanup tranche |
| `supabase/functions/*` legacy sweeps and analysis writers | Server-side, no supervisory screen reads their legacy output |
| `src/integrations/supabase/types.ts` | Generated types |

Guards: `src/test/returnsCanonicalTruth.test.ts` (client),
`supabase/tests/certification/04_prudential_analytics_canonical.sql` (database).

## Outstanding

None for EPR-01. Deletion of the unrouted legacy Returns screens and retirement
of the legacy edge-function sweeps are cleanup items outside this package.
