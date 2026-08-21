# Screen Data-Source Audit

**Mode:** discovery only.

Classification: `CANONICAL_SERVER_READ_MODEL` · `CANONICAL_RPC` ·
`CANONICAL_TABLE_WITH_RLS` · `CLIENT_COMPOSED` · `LEGACY_TABLE` · `MIXED`.

Per-route classification is in `screen-process-inventory.md`. This document records the
*defects*.

## 1. Active legacy reads (`returns_filed` / legacy `return_id`)

17 non-test source files still read the legacy returns table:

| File | Surface it powers | Class |
|---|---|---|
| `src/hooks/useReturnsManagement.ts` | `/returns-management`, `/returns-management/:id`, `/admin/returns/queue` | LEGACY_TABLE |
| `src/pages/returns-mgmt/ViewReturns.tsx` | Admin return queue | LEGACY_TABLE |
| `src/pages/returns-mgmt/PrudentialAnalytics.tsx` | `/admin/returns/prudential/analytics` | LEGACY_TABLE |
| `src/hooks/usePrudentialSupervision.ts` | `/prudential/*` | MIXED |
| `src/hooks/useSupervisoryMetrics.ts` | Supervisory dashboards | MIXED |
| `src/hooks/useSupervisoryTrends.ts` | `/analytics`, trends | MIXED |
| `src/hooks/useLicenseeMetrics.ts` | Licensee dashboards | MIXED |
| `src/hooks/useFinancialGroups.ts` | `/prudential/groups*` | MIXED |
| `src/hooks/useWaveC.ts` | canonical queue + legacy bridge | MIXED (intentional bridge) |
| `src/pages/analytics/AlertCenter.tsx` | `/alerts` | LEGACY_TABLE |
| `src/pages/entity/returns/CreateReturnPage.tsx` | `/entity/returns/new` | LEGACY_TABLE |
| `src/pages/entity/returns/FillReturnPage.tsx` | `/entity/returns/:id/fill` | LEGACY_TABLE |
| `src/components/dashboard/ExecutiveSupervisoryDashboard.tsx` | `/executive` | MIXED |
| `src/components/prudential/PrudentialEntityHistoryDrawer.tsx` | Prudential entity profile | LEGACY_TABLE |
| `src/components/applications/ConsolidatedCaseTab.tsx` | `/applications/:id` | MIXED |
| `src/components/applications/WorkflowActionPreviewDialog.tsx` | `/applications/:id` | MIXED |
| `src/lib/caseAuditGraph.ts` | `/admin/case-audit/*` | MIXED |

**Most serious:** prudential supervision and the executive dashboard derive supervisory
truth from legacy filings while `v_prudential_current_breaches`,
`sup_entity_supervisory_state()` and `return_metric_values` are the certified sources.

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
