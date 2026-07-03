
# Demo Scripts 1–5 – Completion Assessment

Read-only analysis of the five uploaded demo scripts against the current codebase. No files will be modified.

Legend: ✅ built · 🟡 partial · ❌ missing

---

## Script 1 — Unified Licensing Registration & Approval (DEMO-ULRA-001..010)

| ID | Scenario | Status | Evidence in code |
|----|----------|--------|------------------|
| 001 | Applicant draft creation, retrievable draft | ✅ | `NewApplication.tsx`, draft resumption memory |
| 002 | Dynamic forms by license type, validation, doc upload (metadata + versioning), batch upload | 🟡 | Form engine + `DocumentsStep`, but **batch/bulk applicant upload not exposed** (only admin `BulkIntake.tsx`) |
| 003 | Submission, reference ID, acknowledgement (portal + notification) | ✅ | `verify-and-submit`, registration success flow memory |
| 004 | Officer intake queue with status/owner/SLA/priority columns | ✅ | `ApplicationQueue.tsx`, SLA wiring test |
| 005 | Automated sufficiency, SLA timer, RFI, applicant response, near-due/missed-SLA alerts | ✅ | Phase 4 sufficiency + RFI, `sla-escalation-sweep`, `rfi-near-due-sweep` |
| 006 | Analyst auto review with rules + AI, pre-populated findings, risk flags, proposed routing, override with reasons | 🟡 | `generate-application-ai-assessment` produces advisory findings; **explicit "AI-proposed routing" + one-click accept-with-override UI needs verification** |
| 007 | Legal / compliance role review with restricted access + denied-access proof | 🟡 | `useApplicationLegalNotes` exists; **role-scoped denial audit path needs confirmation** |
| 008 | Consolidated decision-ready view (applicant, docs, analyst, legal, RFIs, SLA age) | ✅ | `ApplicationDetail.tsx` |
| 009 | Configurable decision options, digitally signed license, notifications, review/amend before dispatch | 🟡 | `ConfigurableDecisionActions` + `generate-license-certificate`; **"digital signature" and pre-dispatch amend/approve step not clearly separated** |
| 010 | Renewal, revocation w/ justification, bulk intake, dashboards, full audit | ✅ | License lifecycle memory, `BulkIntake.tsx`, audit system |
| — | Licensing → Supervision continuity: auto-create initial supervisory plan with time-bound corrective actions from licensing outcome | 🟡 | `SupervisoryPlanTemplates.tsx` exists; **auto-provisioning of an initial supervisory plan on license issuance is not wired** |
| — | Twin-Peaks divergent-view resolution & conditional clearance between Prudential/Conduct | 🟡 | Coordination module + Phase 3 twin-peaks flag; **explicit "conditional clearance recorded" artefact + disagreement resolution UI to confirm** |

---

## Script 2 — Fit & Proper Assessment (DEMO-FPA-001..015)

| ID | Scenario | Status | Notes |
|----|----------|--------|-------|
| 001 | 4 initiation paths (new license, monitoring trigger, ad-hoc, cycle-based) | 🟡 | New-license + ad-hoc present; **cycle-based scheduler trigger needs verification** |
| 002 | Single individual + unique identifier reused across roles/entities | ✅ | `FitAndProperIndividuals.tsx` |
| 003 | Subject profile + access control denial audit | 🟡 | Detail page present; **denied-access audit entry needs confirmation** |
| 004 | Declarations + assessor notifications | ✅ | PQ form + notifications system |
| 005 | Configurable screening; automated screening incl. adverse-media with confidence scoring & false-positive resolution | 🟡 | `FpScreeningConfigs.tsx` + `fp-screening-run`; **adverse-media match-confidence + FP resolution UI needs check** |
| 006 | Manual screening task + evidence linkage | ✅ | `FpAssessmentsPanel` |
| 007 | Adverse findings, severity classification, escalation | ✅ | `fpAudit`, `fp-monitoring-sweep` |
| 008 | Historic comparison + individual & population trend dashboards, configurable logic | 🟡 | History exists; **population-level trend dashboard needs confirmation** |
| 009 | AI-assisted analysis of structured + unstructured data with citations, confidence, human override | 🟡 | AI assessment infra exists for applications; **F&P-specific AI ingest of media/court records not confirmed** |
| 010 | Sector-specific decision logic (DTI vs microcredit) | ✅ | Sector-scoped forms/rules |
| 011 | Multi-regulator determinations on same individual | ✅ | Multi-regulator scoping memory |
| 012 | Committee weighted voting | 🟡 | `FpCommittees.tsx` present; **weighted-vote calculation to confirm** |
| 013 | Conditional determination + reminders + SLA breach | ✅ | Workflow SLA + conditions |
| 014 | Appeal (standalone + linked to license) | ❌ | **No dedicated F&P appeals module found** |
| 015 | Monitoring scheduler + event-triggered reassessment + audit | ✅ | `fp-monitoring-sweep` |

---

## Script 3 — Prudential Supervision (DEMO-PRUD-001..011)

| Scenario | Status | Notes |
|----------|--------|-------|
| Supervisory universe + configurable risk taxonomy | 🟡 | Entities registry exists; **configurable prudential risk taxonomy admin screen not confirmed** |
| Baseline data & historical context per entity | ✅ | `LicenseeDetail.tsx` tabbed view |
| Regulatory return submission with validation (entity view) | ✅ | `ReturnSubmission.tsx`, `returnsValidation` |
| Intake queue, validation results, version history (supervisor) | ✅ | `ViewReturns.tsx`, versioning |
| Ratio calc + configurable thresholds + breach flag | ✅ | `PrudentialRatios.tsx`, `PrudentialThresholds.tsx`, `evaluate-return-prudential` |
| Peer comparison + trend charts | 🟡 | `PrudentialAnalytics.tsx`; **peer-comparison view to confirm** |
| Supervisory assessment + risk scoring + rationale | ✅ | `risk-score-recompute`, `ReturnAnalysis.tsx` |
| Supervisory actions + escalation routing | ✅ | Workflow engine, `BreachInbox.tsx` |
| Notifications + acknowledgement | ✅ | Notification system v3 |
| Ongoing monitoring + early warning | ✅ | `overdue-returns-sweep`, monitoring sweeps |
| Dashboards + integration readiness + audit trail | 🟡 | Dashboards + `IntegrationLogs.tsx`; **outbound data-feed/reporting-export integrations to confirm** |

---

## Script 4 — Market Conduct Supervision (DEMO-MCS-001..010)

| Scenario | Status | Notes |
|----------|--------|-------|
| Configurable conduct risk taxonomy | 🟡 | `ComplaintTypes.tsx`; **broader conduct-risk taxonomy admin screen not confirmed** |
| Supervisory universe with product/channel history | 🟡 | Entity conduct history via complaints; **product/channel dimension not clearly modelled** |
| Complaint intake (external + internal) with acknowledgements | ✅ | `ComplaintsList.tsx`, complaint autofill memory |
| Classification, triage, prioritization, SLA routing | ✅ | `evaluate-complaint-triage` |
| Conduct analytics + alerts | ✅ | `ConductAlerts.tsx`, `evaluate-conduct-monitoring` |
| Thematic review initiation with scope & assignment | ✅ | `NewThematicReview.tsx`, `ThematicReviewDetail.tsx` |
| Investigation & evidence management with restricted access | 🟡 | `EnforcementDetail.tsx`; **restricted-access denial audit to confirm** |
| Supervisory actions + outcomes + notifications | ✅ | `ConductActions.tsx`, correspondence templates |
| Ongoing monitoring rules (repeat complaints, relapse thresholds) | 🟡 | `evaluate-conduct-monitoring` scaffold; **relapse/repeat-complaint threshold rules UI to confirm** |
| Oversight dashboard with drill-down to cases & actions | ✅ | `ConductDashboard.tsx`, dashboard drilldowns |

---

## Script 5 — Cross-module Dashboards, Reporting, Auditability (DEMO-DPA-001..009)

| Scenario | Status | Notes |
|----------|--------|-------|
| Cross-module supervisory dashboard with AI-driven insights + drill-down | 🟡 | `ExecutiveDashboard.tsx` + `dashboardInsights.ts`; **"AI-generated insights" narrative layer to confirm** |
| Role-specific dashboards (exec vs operational; regulator vs licensee) | ✅ | Multi-portal dashboards |
| Operational reports (throughput, SLAs, prudential compliance, complaint volumes) with filters | ✅ | `ReportsDashboard.tsx`, reporting system v2 |
| Ad-hoc + exportable reporting with export audit log | 🟡 | CSV/JSON exports; **export-audit entry needs confirmation** |
| Case-centric audit trail (Licensing → F&P) filter by case ID | ✅ | `AuditLogs.tsx`, audit system |
| Supervisory & enforcement audit within same framework | ✅ | Same audit backbone |
| Version history / data lineage for applications, declarations, returns, complaints | 🟡 | Form versioning + doc versioning present; **unified "before/after value" viewer per entity to confirm** |
| Overrides & mandatory justifications | ✅ | `RuleOverrides.tsx`, override framework |
| Integration logs + security events (failed access, denied permissions) | 🟡 | `IntegrationLogs.tsx`; **security-event log (failed-access viewer) to confirm as distinct surface** |

---

## Consolidated Gap List (candidate next-phase backlog)

Nothing here is being changed now — this is the shortlist of items that must be verified/built before every script passes:

1. Applicant-facing batch document upload (Script 1 / 002).
2. AI-proposed routing acceptance UI with override reasons (1 / 006).
3. Legal reviewer role-scoped denied-access audit proof (1 / 007, 4 / investigations).
4. Digital signature on issued license + pre-dispatch review/amend gate (1 / 009).
5. Auto-provisioning of initial supervisory plan on license issuance (1 / continuity).
6. Twin-Peaks conditional-clearance artefact + divergence resolution UI (1 / twin-peaks).
7. Cycle-based F&P re-assessment scheduler (2 / 001).
8. Adverse-media match-confidence scoring + false-positive resolution UI (2 / 005).
9. F&P population-level trend dashboard (2 / 008).
10. F&P AI ingest of unstructured sources (media, court records) with citations (2 / 009).
11. Committee weighted-voting calculation + finalisation (2 / 012).
12. F&P appeals module — standalone + linked to license (2 / 014).
13. Configurable prudential + conduct risk taxonomy admin screens (3 / 001, 4 / 001).
14. Peer-comparison view for prudential ratios (3 / analytics).
15. Product/channel dimension for conduct supervisory universe (4 / 002).
16. Conduct relapse/repeat-complaint monitoring rule admin (4 / 010).
17. AI-insights narrative layer on cross-module dashboard (5 / 001).
18. Export-audit log entries surfaced to admin (5 / 004).
19. Unified before/after value viewer per entity for full data lineage (5 / 007).
20. Dedicated security-event viewer for failed access / denied permissions (5 / 009).

---

## Next step

Confirm this assessment. On approval, the follow-up plan would group the 20 gaps into phased build tickets (starting with items that touch decision integrity: 3, 4, 6, 12, 14) — no code changes will be made until you agree on scope.
