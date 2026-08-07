# Phase 4 & Phase 5 — Verification Record

Date: 2026-08-07 · Environment: Preview · Verifier: Lovable agent

Legend: ✅ verified · ⏳ needs live data

## Phase 4 — Market Conduct case lifecycle

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Bulk complaint intake with row-level outcomes | ✅ | `complaint_import_batches` / `complaint_import_rows` + `complaint_bulk_import` (SECURITY DEFINER, `search_path=public`). UI: `/complaints/bulk-intake`. |
| 2 | Invalid rows never become complaints | ✅ | Row outcome `invalid` stores `validation_errors`; no complaint id attached. |
| 3 | Duplicate rows identified, not silently imported | ✅ | Row outcome `duplicate` with `duplicate_of_complaint_id` link. |
| 4 | Closure requires resolution, rationale and outcome | ✅ | `complaint_record_closure_review` validates; UI `ClosureQaPanel`. |
| 5 | QA review with return-to-officer | ✅ | Decisions `qa_approved` / `qa_returned` recorded with note. |
| 6 | Closure history cannot be rewritten | ✅ | `UPDATE`/`DELETE` revoked from `authenticated`/`anon` on `complaint_closure_reviews` plus `tg_closure_reviews_append_only` trigger. |
| 7 | Pattern alerts explain themselves | ✅ | `conduct_alerts.explanation` + `source_record_ids`. |
| 8 | Investigation case file (scope, legal basis, plan) | ✅ | Columns on `conduct_investigations`; UI tab "Case file", read-only once concluded. |
| 9 | Enforcement sequencing propose → review → approve → issue | ✅ | `enforcement_lifecycle_action` RPC; UI `EnforcementLifecyclePanel`; events appended to `enforcement_case_events`. |
| 10 | Obligations & non-compliance monitoring | ✅ | `enforcement_obligations` with deadlines, breach notes, overdue surfacing. |
| 11 | RLS on all new tables | ✅ | `relrowsecurity = true` with policies on every new table (checked via catalog query). |

## Phase 5 — Executive dashboards + AI insights

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Cross-module executive conduct view with drill-through | ✅ | `executive_conduct_summary` (INVOKER, so RLS applies) + `ConductExecutivePanel`. |
| 2 | Systemic risk heatmap | ✅ | `SystemicRiskHeatmap`; sector resolved via licensee; empty cells render "no data", never "low risk". |
| 3 | Twin Peaks executive summary | ✅ | `TwinPeaksExecutivePanel` over coordination cases/escalations/flags. |
| 4 | AI insights are advisory, never decisions | ✅ | `/analytics/ai-insights`; every insight shows provider state, confidence, explanation and source records. |
| 5 | Provider-state honesty | ✅ | `isLiveInsight` treats only `live`/`success` as live; sandbox/mock/not_configured are labelled and banner-disclosed. Unit tested. |
| 6 | Human decision with justification | ✅ | `ai_insight_review` RPC; UI blocks decisions under 10 characters of justification. |
| 7 | AI decision log immutable | ✅ | `UPDATE`/`DELETE` revoked on `ai_insight_actions` plus append-only trigger. |
| 8 | Aggregation cannot bypass RLS | ✅ | Executive aggregation runs as INVOKER; heatmap/Twin Peaks panels read normal client-scoped tables. |

## Automated tests

- `src/test/phase4Phase5.test.ts` — 8 vitest assertions (CSV parsing edge cases, provider-state honesty, justification guard). Passing.
- `supabase/tests/phase4/01_conduct_lifecycle.sql` — 28 pgTAP assertions (model, RLS, grants, definer/search_path, append-only).
- `supabase/tests/phase5/01_executive_ai_insights.sql` — 16 pgTAP assertions (AI insight model, RLS, append-only log, INVOKER aggregation).

## Manual steps

1. `/complaints` → **Bulk intake** → paste `subject,description` rows including one blank subject → confirm the blank row is reported `invalid` with a field error and no complaint is created.
2. Re-run the same batch → confirm rows come back as `duplicate` pointing at the first import.
3. Open a complaint → **Closure & QA** → propose closure without rationale (blocked), then with rationale; QA-return it; confirm both decisions appear in Closure history and cannot be edited.
4. Open an investigation → **Case file** → save scope/legal basis/plan; close the investigation and confirm the fields become read-only.
5. Open an enforcement case → propose without rationale (blocked), then propose → review → approve → issue; add an obligation with a past deadline and confirm it shows `overdue`.
6. `/executive` → confirm the conduct tiles, heatmap and Twin Peaks cards render and tiles drill through to filtered lists.
7. `/analytics/ai-insights` → confirm the provider-state banner appears for non-live insights and that accept/reject requires a justification.

## Known limitations

- Heatmap prudential column currently reflects open conduct alerts per sector; a dedicated prudential breach-by-sector feed can be added when `return_threshold_breaches` carries sector linkage.
- AI insights are populated by supervisory jobs; with no rows the hub renders an explicit empty state rather than fabricated signals.
