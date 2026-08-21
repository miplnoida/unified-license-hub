# Screen Data-Source Audit

**Mode:** discovery only.

Classification: `CANONICAL_SERVER_READ_MODEL` · `CANONICAL_RPC` ·
`CANONICAL_TABLE_WITH_RLS` · `CLIENT_COMPOSED` · `LEGACY_TABLE` · `MIXED`.

Per-route classification is in `screen-process-inventory.md`. This document records the
*defects*.

## 1. Active legacy reads (`returns_filed` / legacy `return_id`)

**EPR-01 status update.** `returns_filed` now holds **0 rows** — the canonical spine
(`return_filings` 124, `return_filing_versions` 140, `return_metric_values` 264,
`reporting_periods` 245, `entity_reporting_obligations` 56) is the only populated truth.
Every remaining legacy read therefore returned *empty* results, i.e. supervisory KPIs were
silently rendering zero. `return_calculated_ratios`, `return_consolidated_analysis` and
`prudential_stress_events` are also empty; `return_threshold_breaches` is fully canonical
(16/16 rows carry `return_filing_id`).

### Migrated to canonical truth (this package)

| File | Surface | New source |
|---|---|---|
| `src/hooks/useSupervisoryMetrics.ts` | Supervisory dashboards | `returns_supervisory_summary()` |
| `src/hooks/useSupervisoryTrends.ts` | `/analytics`, trends | `returns_filing_trend()` |
| `src/components/dashboard/ExecutiveSupervisoryDashboard.tsx` | `/executive` | `returns_supervisory_summary()` |
| `src/pages/analytics/AlertCenter.tsx` | `/alerts` | `v_return_filing_workflow_state` (server `is_overdue`) |
| `src/components/prudential/PrudentialEntityHistoryDrawer.tsx` | Prudential entity profile | `returns_entity_filing_history()` |
| `src/components/entity-detail/ReturnsTab.tsx` | Entity 360 → Returns | `returns_entity_filing_history()` |

All of these read through `src/lib/returns/canonicalReturnsSummary.ts`, which is the single
client accessor for canonical Return aggregates. No KPI in these files is derived from
`rows.length` any more — the counts are computed server-side under RLS.

### P07 Prudential — migrated (EPR-01 P07 tranche)

`usePrudentialSupervision` (entity universe, entity history, assessment prefill,
stress evaluation), `usePrudentialConfig` (persisted ratios/breaches) and
`useFinancialGroups` (group periods, member facts) now read canonical server read
models only — see `docs/certification/epr-01-p07-canonical-returns-truth.md`.

### Still on legacy truth (next tranche)

`useLicenseeMetrics`, `useReturnsManagement`, `ViewReturns`, `ReturnAnalysis`,
`PrudentialAnalytics`, `AnalyticsDashboard`, `ComplianceReturns`,
`ReturnSubmission`, `CreateReturnPage`, `FillReturnPage`, `ConsolidatedCaseTab`,
`WorkflowActionPreviewDialog`, `caseAuditGraph`, `dashboard/widgets`,
`useApiQueries`, `reportService` (P13 + external spine; `useWaveC` keeps its
intentional legacy-id bridge).



## 2. Canonical read-model consumers (correct pattern)

`src/hooks/useSupervisoryReadModels.ts`, `src/pages/supervision/BreachInbox.tsx`,
`src/components/entity-detail/EntitySupervisoryStatePanel.tsx`,
`src/pages/returns-canonical/*` (`ReturnsFilingQueue`, `EntityObligationsWorkbench`,
`EntityReportingCalendar`, `FilingDetail`).

These are the templates every other screen should converge on.

## 3. Client-composed KPI risk

- 64 page files call `.limit(...)`; 236 page files derive numbers from `.length` of a
  fetched array. Wherever both occur on the same screen, a KPI can be computed from a
  capped browser page and displayed as a global total.
- Confirmed pattern-risk surfaces: `/complaints/analytics`, `/analytics`, `/executive`,
  `/conduct`, `/prudential/dashboard`, `/admin/returns/prudential/analytics`.
- Requirement (not implemented): every KPI must come from the same server-side filtered
  source as the list it summarises — a `count` RPC/read model, never `rows.length`.

## 4. Client-side business-rule sites (should be server/config authority)

| Semantic | Where it is computed in React | Belongs to |
|---|---|---|
| SLA state / days remaining | complaint detail + list helpers, coordination, inspections (7 files) | SERVER (SLA config + read model) |
| Priority | complaint/conduct list helpers (2 files) | SERVER (triage rules already exist in DB) |
| Next action | ad-hoc per screen (2 files, mostly Examination) | SERVER (workflow guidance RPC) |
| Eligibility (submit / close / approve / renew) | 12 files across applications, returns, conduct, F&P | SERVER (already partly enforced by governed RPCs; the UI duplicates the rule) |
| Threshold / breach interpretation | 79 files reference thresholds; prudential ratio labelling in `src/lib/prudentialLabels.ts` | SERVER (`prudential_thresholds` + detection engine) |
| Form / fee applicability | registration + application form visibility libs | CONFIGURATION AUTHORITY (already in DB; client re-derives) |

`PRESENTATION_ONLY` is acceptable for: formatting, colour/badge mapping, sort order,
column visibility, and *display* of a server-supplied SLA state.

## 5. Verdict

- Screens on canonical truth: the Wave-C returns set, breach inbox, Entity 360,
  supervisory read-model panels.
- Screens on legacy or mixed truth while being operationally live: **17 source files
  spanning P06, P07 and P13** — this is the single largest coherence defect.
