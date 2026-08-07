# Phase 12 — Full FRD revalidation

Date of revalidation: 2026-08-07
Baseline: `ABC_FRD_v1` — 100 screen IDs across 8 modules (tracker v5).
Method: every claim in tracker v5 was re-tested against the live repository. Cited
files, routes, database objects and RPCs were resolved; unresolved claims were
corrected or downgraded. The machine-readable result is `docs/frd/TRACEABILITY.csv`
and it is enforced in CI by `scripts/verify-traceability.mjs`.

## Result

| Status | v5 | v6 (revalidated) |
| --- | --- | --- |
| Done | 88 | **96** |
| Partial | 9 | **3** |
| Missing | 3 | **1** |

Eight items closed since v5 (Phases 6–11), one item moved up from Missing to
Partial, and one item was **downgraded** because v5 over-credited it.

## Status changes

| Item | Screen | v5 | v6 | Basis |
| --- | --- | --- | --- | --- |
| IT-002 | MCS-CMP-004 | Missing | Done | `/complaints/bulk-intake`, `src/pages/complaints/BulkIntake.tsx`, `complaint_import_batches` / `complaint_import_rows`, `supabase/tests/phase4/01_conduct_lifecycle.sql` |
| IT-003 | MCS-MON-002 | Missing | Done | `/conduct/supervision-loop`, `useSupervisionLoop.ts`, `conduct-supervision-loop-digest` |
| IT-004 | AUD-LIN-001 | Partial | Done | `public.record_lineage`, `LineageViewer.tsx`, `supabase/tests/phase10/01_record_lineage.sql` |
| IT-006 | DASH-AI-001 | Partial | Done | `/analytics/ai-insights`, `ai_insights`, `ai_insight_actions` |
| IT-009 | FP-CON-002 | Partial | Done | `FpConditionEvidencePanel.tsx` — accept/reject per evidence item with mandatory rejection note |
| IT-010 | MCS-ENF-002 | Partial | Done | `EnforcementObligationsPanel.tsx`, `enforcement_obligations`, `enforcement_compliance_evidence` |
| IT-011 | MCS-SUR-001 | Partial | Done | `/conduct/surveillance`, versioned `conduct_monitoring_rules`, `supabase/tests/phase8/*` |
| IT-012 | MCS-SUR-002 | Partial | Done | `/conduct/entities/:id` — `ConductEntityProfile.tsx` |
| IT-001 | MCS-ANA-003 | Missing | Partial (70%) | Backend now complete; no UI consumes it — see residual gaps |
| IT-007 | DASH-OPS-002 | Partial (50%) | **Missing (20%)** | v5 credited adjacent SLA configuration as partial delivery. No team performance route, page or aggregation exists, so the honest status is Missing |

## Evidence corrections

- IT-019 / IT-020 (`ADM-RUL-001` / `ADM-RUL-002`): v5 cited `/admin/rules` and `/admin/rules/:id`. The declared routes are `/admin/rule-engine`, `/admin/rule-engine/new` and `/admin/rule-engine/:id` (`src/routes/adminRoutes.tsx`). Corrected; delivery status unchanged.

## Residual gaps (4 of 100)

### IT-001 — MCS-ANA-003 Conduct Intelligence, published reports — Partial, 70%
Present: `conduct_intelligence_reports`, `_report_versions`, `_report_recipients`,
`_templates`; the full RPC lifecycle (`conduct_intel_create_report`, `_save_version`,
`_submit_for_approval`, `_approve_report`, `_reject_report`, `_publish_report`,
`_log_export`, `_aggregate`); `supabase/functions/conduct-intelligence-draft`;
`src/hooks/useConductIntelligence.ts`; `src/lib/conduct/intelligence.ts`.
Missing: no page or route imports those hooks — no supervisor builder, no approval
queue screen, no entity-facing published-report list. Effort: 4 days. Priority: Low.

### IT-005 — AUD-OVR-001 Consolidated override registry — Partial, 50%
`/admin/overrides` reads `rule_overrides` only. Missing a register that unions
workflow-step overrides, scoring/assessment overrides, sufficiency overrides and
SLA/due-date extensions with one filter set and one governed export.
Effort: 4 days. Priority: Medium.

### IT-007 — DASH-OPS-002 Team performance — Missing, 20%
Adjacent only: `src/pages/admin/SlaManager.tsx` (SLA configuration) and
`src/pages/entity/MySupervisoryActions.tsx` (personal queue). Missing per-officer
throughput, SLA attainment by officer and team, and workload rebalancing /
reassignment from a supervisory view. Effort: 4 days. Priority: Medium.

### IT-008 — FP-ASS-002 Adverse media / PEP screening — Partial, 80% (environmental)
Not a build gap. The adapter path, `supabase/functions/screening-sandbox`,
`FpScreeningProviderBanner.tsx` and the manual triage fallback are complete and
tested. Closure requires a live provider subscription and credentials; until then
production findings are manually entered and the banner states so. Track as a
procurement item, not engineering work.

## Governance

- `docs/frd/TRACEABILITY.csv` is the single machine-readable source of truth (100 rows, v5 and v6 status side by side).
- `scripts/verify-traceability.mjs` fails CI when any cited file is absent, any cited route is not declared in `src/routes/*.tsx`, a `Done` row cites no artefact or is below 100%, or an open row carries no gap description. Current run: 100 requirements, 96 Done, gate passing.
- Phase gates already enforced in CI: phases 8, 9, 10 and 11 pgTAP suites plus their manual-verification documents.

## Standing caveat

Phase 12 certifies **traceability**: every requirement marked Done has a resolvable
artefact behind it. It does not replace behavioural sign-off. Screens whose
manual-verification documents are not yet countersigned remain
**IMPLEMENTED — MANUAL VERIFICATION REQUIRED** for regulator reporting.
