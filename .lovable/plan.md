# Phase 4 (Market Conduct Case Lifecycle) + Phase 5 (Executive Dashboards + AI Insights)

Phases 1–3 stay frozen. Work is additive: existing complaint, conduct, investigation and enforcement surfaces are extended, not replaced.

## Revalidation — gap matrix (from code and database reads)

| FRD | Existing evidence | Missing behaviour | Planned minimal change |
|---|---|---|---|
| MCS-CMP-001 intake | `create_complaint` / `create_complaint_with_attachments` RPCs, `NewInternalComplaint`, public intake, `complaint_intake_rules` | — | none |
| MCS-CMP-002 supervisory queue | `ComplaintsList.tsx` (1083 lines) with SLA, filters | confirm every required column/filter is persisted-field backed (assignee, open-RFI flag, escalation flag, SLA state, date range) | extend list query + filter bar only |
| MCS-CMP-003 case workbench | `ComplaintDetail.tsx` + RFI/Investigation/Evidence/History tabs | consolidation gaps: findings/actions/communications in one timeline | add missing tab sections to existing detail |
| MCS-CMP-004 RFI | `complaint_rfis`, `complaint_rfi_items/responses/settings`, approval queue, entity workbench | verify SLA pause/resume + clarification loop wiring; Entity-A/B isolation proof | small RPC/pgTAP additions |
| MCS-CMP-005 bulk intake | **none** (no batch table) | whole capability | new `complaint_import_batches` + `complaint_import_rows`, validation RPC, admin bulk-intake page |
| MCS-CMP-006 closure + QA | `closure_reason/category/closed_by/findings` on `complaints` | QA review stage, evidence-completeness gate, non-overwritable closure history | new `complaint_closure_reviews` (append-only) + closure RPC gate |
| MCS-ANA-001/002 analytics | `ConductDashboard`, `components/conduct/analytics`, `useConductDashboardMetrics`, saved views | recurrence, closure-outcome and channel trends with drill-through on every KPI | extend analytics panels + drill links |
| MCS-ANA-003 intelligence report | `conduct_intelligence_reports` + versions/recipients | reconciliation of report numbers to source rows | add source-reconciliation section to report builder |
| Pattern alerts | `conduct_monitoring_rules`, `conduct_alerts` (window_start/end, dedupe_key, assigned_to, closure_reason) | explanation payload + source-record links + "signal not finding" wording | add `explanation`/`source_record_ids` to alert writes, reviewer UI wording |
| MCS-INV-001..004 | `conduct_investigations`, `conduct_evidence` (+access log), `conduct_interviews`/participants/attachments, closures, post-closure monitoring | investigation-level authorization strictly separate from complaint access; scope/legal basis/plan/milestones fields | add plan/milestone fields + dedicated investigation permission checks and storage authorization |
| MCS-ENF-001..003 | `enforcement_actions`, `enforcement_case_events` | proposed-action → review → approval chain, obligations with deadlines, compliance evidence, monitoring, non-compliance escalation | new `enforcement_obligations`, `enforcement_compliance_evidence`, approval columns + RPCs; keep events append-only |
| DASH-EXE-001 | `ExecutiveSupervisoryDashboard.tsx` (438 lines) | conduct + Phase 2/3 KPI areas, drill-through per KPI | extend existing component, no replacement |
| DASH-EXE-002 heatmap / Twin Peaks | `fp_regulator_positions`, `consolidatedAnalysis` heatmap helper | executive heatmap by sector/entity/module/severity, Twin Peaks executive panel with separate regulator positions | new panels on the executive page |
| DASH-AI-001 | **none** (`receive_ils` permission only) | whole AI insights hub | new `ai_insights` + `ai_insight_actions`, edge function on Lovable AI, hub UI with provider states |

## Phase 4 build

1. **Queue + workbench** — extend `ComplaintsList` query/filters; add missing consolidation sections to `ComplaintDetail` (communications, findings, actions, audit timeline in one place).
2. **RFI** — verify and complete clarification loop and SLA pause/resume; add pgTAP proving Entity A cannot read Entity B's RFI by direct ID or storage path.
3. **Bulk intake** — batch header (source, file, counts, status) + row table (row number, raw payload, validation errors, duplicate match, created complaint id). Server-side RPC validates each row, detects duplicates via existing duplicate scoring, imports only valid rows, and reports per-row outcomes. Invalid rows are never imported as complaints.
4. **Closure + QA** — closure RPC requires resolution, rationale, outcome, final-communication reference and evidence completeness; optional QA reviewer stage; every closure decision recorded as a new immutable review row so history stays reconstructable.
5. **Analytics + pattern alerts** — real-data trend/recurrence/SLA/closure panels, each KPI drilling to the complaint rows behind it; alerts persist rule, window, source records, explanation, severity, status, reviewer, action, closure; all wording uses "signal / pattern / elevated concern".
6. **Investigations** — add scope, legal basis, plan, milestones, restricted notes to the investigation case file; enforce investigation-level authorization for evidence, interviews and signed URLs so complaint access alone never grants it.
7. **Enforcement** — proposed action → rationale → review → approval → issuance with effective date; obligations with deadlines and compliance evidence; monitoring, non-compliance flag, escalation, outcome, closure; notifications through the existing event system; `enforcement_case_events` remains append-only.

## Phase 5 build

8. **Executive dashboard** — extend `ExecutiveSupervisoryDashboard` with Licensing, F&P, Prudential, Conduct and Cross-module areas, every KPI drilling to source rows and honouring source-level RLS.
9. **Heatmap** — explainable matrix by sector / entity / module / severity, labelled "elevated signal", "cross-module concern", "concentrated exposure".
10. **Twin Peaks executive panel** — prudential, conduct and F&P positions shown separately with aligned / disagreement / coordination pending / conditional states; never collapsed into one field.
11. **AI Insights Hub** — insights generated by a server-side edge function on the Lovable AI gateway, persisted with title, module, entity, source records, citations, generated time, provider/model, provider state (`SUCCESS`, `NOT_CONFIGURED`, `SANDBOX`, `PROVIDER_FAILURE`, `TRANSPORT_FAILURE`, `RATE_LIMITED`, `INSUFFICIENT_DATA`), confidence, explanation, recommendation, review status. Failure states are rendered as unavailable, never as "no risk". Cross-module insights show evidence-backed associations without causal claims. Review actions (accept / dismiss / escalate / follow-up / override) preserve the original output; consequential overrides route through the Phase 1 override registry with mandatory justification.

## Technical notes

- Migrations: `complaint_import_batches`, `complaint_import_rows`, `complaint_closure_reviews`, `enforcement_obligations`, `enforcement_compliance_evidence`, `ai_insights`, `ai_insight_actions`; additive columns on `conduct_investigations`, `conduct_alerts`, `enforcement_actions`. Each new public table gets GRANTs, RLS and policies mirroring its parent module, plus `updated_at` triggers.
- Authorization stays in SECURITY DEFINER helpers; investigation/evidence access uses a dedicated check independent of complaint permissions.
- New edge function `generate-ai-insights` (Lovable AI gateway, key server-side) returns explicit provider state; no client-side model calls.
- Frontend additions live under `src/components/complaints/bulk/`, `src/components/conduct/analytics/`, `src/components/enforcement/`, `src/components/dashboard/executive/`, `src/components/ai-insights/`, with hooks alongside existing ones.

## Verification

- pgTAP suites `supabase/tests/phase4/` (complaints lifecycle, bulk import partial success, analytics reconciliation, pattern trigger/non-trigger/dedupe, investigation restricted access, enforcement lifecycle, 8-persona security matrix) and `supabase/tests/phase5/` (KPI + drilldown reconciliation, empty/partial data, cross-module aggregation, Twin Peaks separation, provider states, provenance, override, restricted-source denial).
- Vitest suites for client-side classification, reconciliation and provider-state helpers.
- Manual verification documents with click-by-click scenarios: `docs/verification/market-conduct/phase4-manual-verification.md` and `docs/verification/executive/phase5-manual-verification.md`.
- Cross-phase regression smoke pass over login, licensing, workflows, SLA, notifications, returns, prudential, F&P, complaints, reports, dashboards, audit, RBAC.
- Reporting after each phase: FRD × Code / DB / RLS / Tests / Manual / State table, files changed, exact DB objects, test counts, honest limitations. Phase 5 starts only when no Phase 4 item is MISSING; state claimed as IMPLEMENTED — MANUAL VERIFICATION REQUIRED unless runtime-verified here.
