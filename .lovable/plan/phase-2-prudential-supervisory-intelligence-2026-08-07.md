# Phase 2 — Prudential Supervisory Intelligence

## Current-state gap map (evidence-based)

Verified by reading the database and source files in this turn.

**PRU-ANA-001 — Prudential Analytics — PARTIALLY IMPLEMENTED**
- Exists: `prudential_ratios` (+ `prudential_ratio_versions`, publish/rollback/archive functions), `prudential_thresholds` (+ `prudential_threshold_versions`), `return_calculated_ratios` (persisted results with `ratio_version`, `formula_snapshot`, `null_reason`, `computed_at/by`), `return_threshold_breaches`, `classify_ratio_risk`, `peer_ratio_snapshot` RPC, view `v_prudential_early_warnings`, safe evaluator in `src/lib/returnsRatios.ts` (no eval), Entity Profile UI with Trends + Peer Comparison tabs.
- Gaps: no explicit result-state vocabulary (`CALCULATED / INSUFFICIENT_DATA / NOT_CONFIGURED / CALCULATION_ERROR`) — only a free-text `null_reason`; `peer_ratio_snapshot` returns stats at any peer count with no minimum-sample gate (no `INSUFFICIENT_PEER_DATA`); EWIs are a derived view only — no persisted rule config, no execution timestamp, no acknowledgement/review trail; no ratio→source-field drilldown surface.

**PRU-ASS-001 — CAMELS Assessment — SCAFFOLD ONLY (largest gap)**
- Exists: `prudential_assessments` (jsonb `ratings`, status draft/submitted/reviewed/approved/closed, override_reason, auto_suggested_rating, signal_snapshot, evidence_refs), `AssessmentsList.tsx`, `AssessmentDetail.tsx`, transition hooks, notification triggers.
- Gaps: component set is hardcoded in the page as 7 non-CAMELS categories (no Capital/Asset Quality/Management/Earnings/Liquidity/Sensitivity model, not configurable per sector); no per-component narrative/evidence/weight rows; no `returned_for_revision` state; approved assessments are still editable (no append-only/version guard); overrides are not written to the Phase 1 override registry; no structured evidence links to breaches/EWIs/documents.

**PRU-GRP-001 — Group Consolidated Risk — MOSTLY IMPLEMENTED**
- Exists: `financial_groups`, `financial_group_members`, `group_consolidation_methods`, `group_consolidated_snapshots` (with `eliminations`, `member_count`, `methodology_version`), `group_risk_scores`, `group_ewi_rules`/`group_ewi_alerts`, `intragroup_exposures`, RPCs `group_consolidated_recompute`, `group_member_ratios`, `group_ewi_evaluate`, `prudential_group_consolidated`; UI: `FinancialGroupProfile`, `GroupStructureTree`, `ConsolidatedRatiosPanel`, `GroupContagionPanel`, `SubsidiaryRiskHeatmap`, `IntragroupExposureMatrix`.
- Gaps: no explicit `PARTIAL_GROUP_DATA` state surfaced when a member lacks current return data; missing-member impact not itemised on the snapshot; no automated group tests.

## What will be built

### 1. Explicit calculation result states (PRU-ANA-001)
- Add `result_state` to `return_calculated_ratios` with a checked vocabulary and backfill it deterministically from existing `value`/`null_reason` (value present → `CALCULATED`; missing inputs → `INSUFFICIENT_DATA`; no ratio config → `NOT_CONFIGURED`; evaluator failure/zero denominator → `CALCULATION_ERROR`).
- Update the client evaluator and persistence path to set the state; UI renders the state badge instead of a 0 value. No existing return values are recomputed or overwritten.

### 2. Peer comparison minimum sample gate (PRU-ANA-001)
- Extend `peer_ratio_snapshot` to return `state` (`OK` | `INSUFFICIENT_PEER_DATA`), `peer_count`, `percentile`, and the peer-group definition (sector/category/licence) used. Minimum peer count configurable, default 5; below that, statistics are suppressed rather than shown.
- Peer tab shows the peer definition, count, entity percentile, and the insufficient-data state.

### 3. Persisted, explainable EWIs (PRU-ANA-001)
- New `prudential_ewi_rules` (code, name, sector scope, rule type, params, severity, active, versioned) and `prudential_ewi_alerts` (entity, period, rule, evidence jsonb, severity, status, executed_at, acknowledged_by/at, notes) with RLS mirroring `prudential_assessments` policies and GRANTs.
- `prudential_ewi_evaluate(entity_id, period_end)` RPC implementing repeated breach, sharp deterioration, multi-ratio warning, adverse trend, and late/missing return rules; dedup on (entity, period, rule) so re-runs do not multiply alerts. Keep `v_prudential_early_warnings` intact for existing consumers.
- Entity Analytics Hub gets an EWI panel with trigger rule, evidence, severity, timestamp and acknowledge action.

### 4. Ratio → source drilldown (PRU-ANA-001)
- Provenance drawer on each ratio row showing formula snapshot, ratio version, threshold version, source return + version, and the source field values, linking to the existing return detail view.

### 5. CAMELS assessment model (PRU-ASS-001)
- New `prudential_assessment_components` config table seeded with the six CAMELS components (sector-scoped, orderable, weight, active) plus `prudential_assessment_component_ratings` (assessment, component, rating, narrative, evidence jsonb, auto_suggested_rating, override_justification, actor, timestamps).
- Extend `prudential_assessments` status vocabulary with `returned_for_revision`; add an append-only trigger so `approved`/`closed` assessments cannot be mutated or deleted (service_role included), following the Phase 1 `decision_artifacts` pattern.
- Overrides of an advisory suggested rating require justification and are written to the Phase 1 override registry.
- Rebuild `AssessmentDetail.tsx` around configurable components: per-component rating + narrative + evidence picker (return periods, ratios, breaches, EWI alerts, documents, examination findings), advisory suggestion shown with its source and rationale, overall rating + rationale, and the draft → submitted → reviewed → approved / returned_for_revision workflow using existing transition hooks.

### 6. Group partial-data state (PRU-GRP-001)
- Add `data_state` + `excluded_members` to `group_consolidated_snapshots`, set by `group_consolidated_recompute` when a member has no current-period approved return; consolidated panels show `PARTIAL_GROUP_DATA`, the excluded members, and the methodology used. Contagion wording stays signal/indicator-based.

### 7. Audit + notifications
- Audit ratio/threshold/EWI config changes, breach detection, EWI creation and acknowledgement, assessment create/submit/rating change/override/finalise, and group config change, with before/after where meaningful, via the existing audit primitives.
- Wire severe breach, repeated breach, EWI trigger, overdue assessment, assessment returned, and high-risk group signal into the existing notification event config — no new dispatch layer, failures stay explicit.

### 8. Tests and verification
- pgTAP: `supabase/tests/phase2/01_ratio_engine.sql`, `02_peer_groups.sql`, `03_ewi.sql`, `04_camels.sql`, `05_group_consolidation.sql`, `06_rls_persona_matrix.sql` — deterministic fixtures with hand-computed expected values, including zero denominator, missing config, historical threshold version, insufficient peers, no cross-sector leakage, EWI dedup/acknowledgement, completed-assessment immutability, group double-counting and missing subsidiary, and a 7-persona RLS matrix (external user, entity user, prudential supervisor, team lead, reviewer, admin, unauthorised internal) over analytics select, assessment select/insert/update/finalise, group view, cross-entity and direct-ID access.
- Vitest for the evaluator state machine, peer percentile, EWI rule predicates and consolidation math.
- Browser runtime verification of the Analytics Hub, CAMELS lifecycle with reload persistence, and group hierarchy/missing-data state; regression smoke over returns submission/review/versioning, entity profiles, workflows, dashboards, Phase 1 SLA and decision screens.

## Status reporting
Each FRD ID reported only as NOT VERIFIED / PARTIALLY VERIFIED / VERIFIED / IMPLEMENTED — EXTERNAL VERIFICATION STILL REQUIRED, with the full evidence matrix, files changed, DB changes, formula/threshold definitions, test results and remaining external gates. pgTAP lanes need the CI `db-tests` job (Docker + Supabase CLI are unavailable here), so those gates will be reported as requiring external verification until you run CI.

## Not in scope
No rebuild of returns capture, review, or versioning; no changes to Phase 1 behaviour beyond read-only dependencies (override registry, SLA primitives); no duplicate group hierarchy or parallel ratio model.
