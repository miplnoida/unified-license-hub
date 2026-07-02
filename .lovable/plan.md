# Phase 5 Plan — Returns, Prudential Analytics & Cross-Module Intelligence

Phases 1–4 covered licensing, fit & proper, supervision, inspections, complaints and enforcement. Phase 5 closes the regulatory feedback loop by turning filed returns into supervisory signal, and by giving executives a consolidated cross-module view.

## Scope

### 5.1 RET-001 — Returns validation & recalculation engine
- Wire `return_validation_rules` + `return_calculated_ratios` into the filing flow.
- On submit of `returns_filed`, run rule set → write results to `return_validation_run_log`, recompute ratios, and populate `return_threshold_breaches` when thresholds cross.
- UI: validation results panel on the return detail page (pass/fail per rule, recalculated ratios table, breach chips).

### 5.2 RET-002 — Returns review workspace
- New `/returns/review` queue for supervisors: filed returns grouped by status (Pending Review / Query Raised / Accepted / Rejected).
- Detail view: side-by-side current vs prior period ratios, comment thread using `return_comments`, accept/reject with reasons, raise query (creates `return_requests` entry).
- Auto-link breaches to the existing Breach Inbox (Phase 4.2) so escalation to enforcement stays one-click.

### 5.3 PRU-001 — Prudential analytics dashboard
- Entity-level dashboard showing time series of `prudential_ratios` vs `prudential_thresholds` bands (green/amber/red).
- Sector rollups: median/quartile ratios, count of entities in breach, trending indicators.
- Drill-through from a data point to the underlying return.

### 5.4 RSK-001 — Composite risk scoring
- Add `entity_risk_scores` table (entity_id, period, score, band, components jsonb, computed_at).
- Nightly edge function `risk-score-recompute` aggregates weighted inputs: prudential breach count, open complaints, overdue returns, open enforcement, inspection findings severity, fit & proper alerts.
- Surface on Licensee Detail (risk band badge) and a `/supervision/risk` heatmap grid.

### 5.5 EXE-001 — Executive cross-module dashboard
- `/dashboard/executive` restricted to executive role: KPIs across licensing throughput, active enforcement value, overdue returns, high-risk entities, open coordination cases, SLA breaches.
- Filter by sector / period. Export snapshot to PDF via existing report pipeline.

### 5.6 NOT-001 — Unified alert center
- Consolidate scattered notification surfaces (breaches, findings, FP alerts, SLA escalations, coordination flags) into a single `/alerts` inbox backed by `notifications` with typed sources.
- Bulk acknowledge, assign, snooze; deep-link back to the originating record.

## Technical Notes

- Recalculation runs as a Postgres function invoked by an `AFTER INSERT` trigger on `returns_filed` so results are consistent whether filed via UI or edge function.
- Risk scoring uses `pg_cron` (already enabled in Phase 3.7) scheduled at 03:00 UTC after the FP sweep.
- Executive dashboard reuses existing `report_definitions` runtime for KPI tiles — no new charting stack.
- All new tables get GRANTs + RLS; write access limited to internal roles via `has_role`.

## Out of Scope for Phase 5
- Public/licensee-facing analytics (kept internal only).
- ML-based anomaly detection (rule + weighted scoring only; ML deferred).
- Mobile app surfaces.

## Suggested Build Order
5.1 → 5.2 → 5.3 → 5.4 → 5.5 → 5.6 (each sub-phase ships independently and is user-reviewable).
