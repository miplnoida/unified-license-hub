# Slice: Consolidated Analysis Engine

Delivers the append-only analysis table, the `generate-return-analysis` edge function driven off real persisted ratios/breaches, an AI-authored plain-language summary via the Lovable AI Gateway, automatic invocation from the evaluator, and a supervisor-facing `ReturnAnalysis` page.

## 1. Migration (new)

`supabase/migrations/<ts>_return_consolidated_analysis.sql`

- `public.return_consolidated_analysis` — append-only, one row per computation:
  - `id uuid pk`, `return_id uuid not null`, `return_config_id uuid`, `sector_id uuid`
  - `health_score numeric(5,2)` (0–100)
  - `capital_summary jsonb`, `liquidity_summary jsonb`, `asset_quality_summary jsonb`, `profitability_summary jsonb`
  - `concentration_risks jsonb`, `trend jsonb`, `peer jsonb`, `heatmap jsonb`
  - `early_warnings jsonb`, `recommendations jsonb`, `ai_summary text`
  - `inputs jsonb` (snapshot of ratios/breaches used, for full auditability)
  - `computed_by uuid`, `computed_at timestamptz default now()`
- `GRANT SELECT` → authenticated (reads gated by admin/supervisor via RLS below); `GRANT ALL` → service_role.
- RLS: enable; SELECT policy allows the return owner (`entity_user_access` OR licensee's users) and internal roles via `has_role`; no client INSERT/UPDATE/DELETE — only service_role writes.
- Append-only trigger reusing `public.prudential_appendonly_guard`.
- Index `(return_id, computed_at DESC)` and `(sector_id, computed_at DESC)`.
- RPC `latest_return_analysis(_return_id uuid)` → returns the most recent row (SECURITY DEFINER, reads only, RLS-scoped).

## 2. Edge function (new)

`supabase/functions/generate-return-analysis/index.ts`

Inputs: `{ return_id: string; compute_ai_summary?: boolean }`.

Deterministic computation from persisted data only:

1. Load return + config + sector + peer group.
2. Load latest `return_calculated_ratios` for this return (post-evaluator) plus the last N=6 historical returns for the same licensee/config to build `trend`.
3. Load open `return_threshold_breaches` for this return; classify counts by `risk_level` (green/amber/red) and by category via `prudential_ratios.category` (`capital` | `liquidity` | `asset_quality` | `profitability` | `concentration`).
4. Compute per-category summary object `{ score: 0-100, metrics: [{key,label,value,unit,risk_level,threshold}], commentary_facts: [...] }`. Category score = weighted average where amber = 60, red = 20, green = 100, null_reason ratio = 50. `health_score` = mean of the four core category scores (rounded to 2 dp).
5. `concentration_risks` = breaches whose ratio metadata `category='concentration'`.
6. `peer` uses existing RPC `peer_ratio_snapshot(_sector_id, _return_config_id, _period_end)` when present; per-ratio percentile placement (25/50/75) computed in code.
7. `heatmap` = `[{ category, risk_level }]` tuples aggregated from step 3.
8. `early_warnings` derived from: (a) two consecutive amber breaches on same metric across trend, (b) trend slope > 20% deterioration, (c) any `null_reason='division_by_zero'` cluster. Each entry `{ metric_key, level, evidence: [...] }` — no hardcoded prose.
9. `recommendations` = deterministic mapping keyed on `(category, worst_risk_level)` pulled from `prudential_ratios.recommendation_template` (already a text column on that table) with token substitution. If no template exists for a bucket, the recommendation is omitted — never fabricated.
10. `ai_summary` (only when `compute_ai_summary !== false`): call Lovable AI Gateway with model `google/gemini-3-flash-preview`, passing ONLY the computed JSON as context and asking for a 3-sentence supervisor-facing plain-English summary. Falls back to `null` on 402/429/5xx — the row is still written; `ai_summary_error` captured in `inputs.ai_error`.
11. Insert row via service role; return the inserted row.
12. Emit two events via existing dispatcher: `return.analysis_complete` (always) and `return.supervisor_escalation` (only when any red breach OR health_score < 50).
13. Write compliance audit `ANALYSIS_GENERATED` via `log_compliance_audit_as_actor`.

CORS + JWT validation follow the pattern already used by `evaluate-return-prudential`.

## 3. Evaluator hook (edit)

`supabase/functions/evaluate-return-prudential/index.ts` — after breach persistence and notifications, invoke `generate-return-analysis` (fire-and-forget with awaited best-effort) so every prudential run produces a fresh analysis row. Failure to generate analysis must NOT fail the evaluator response.

## 4. UI (new)

`src/pages/returns-mgmt/ReturnAnalysis.tsx` — supervisor page mounted at `/admin/returns/queue/:id/analysis` and `/returns-management/:id/analysis`.

Structure (all data-driven from `return_consolidated_analysis`):
- Header: return unique_id, period, computed_at, health-score gauge.
- 4 category cards (Capital / Liquidity / Asset Quality / Profitability) each showing sub-score, top metrics, and risk badges.
- Concentration risks list.
- Trend chart (last 6 periods per key ratio) using existing Recharts wrappers.
- Peer comparison chart (percentile band).
- Heatmap grid.
- Early warnings list.
- Recommendations list.
- AI summary card (labeled "AI-generated").
- "Regenerate analysis" button → invokes `generate-return-analysis`; requires the same admin/supervisor guard already used in `ReturnDetail`.

Empty state ("No analysis yet") renders a Generate button that calls the edge function. History dropdown lists prior analysis rows for comparison.

Routes registered in `src/routes/adminRoutes.tsx` and `src/routes/dashboardRoutes.tsx`. A "View Analysis" button appears in `ReturnDetail.tsx` when the return has at least one analysis row.

## 5. Types

`src/integrations/supabase/types.ts` regenerates automatically after the migration; a small `src/types/returnAnalysis.ts` provides typed helpers for the jsonb payload shape (`CategorySummary`, `EarlyWarning`, `Recommendation`, `AnalysisRow`).

## 6. Tests (new)

- `src/test/consolidatedAnalysisScoring.test.ts` — pure function unit tests for `computeCategoryScore`, `computeHealthScore`, `deriveEarlyWarnings`, and `pickRecommendations` using fixture ratios/breaches. Deterministic, no network.
- `src/test/returnAnalysisPage.test.tsx` — renders `ReturnAnalysis` with a mocked supabase client returning a canned row and asserts every section renders the persisted data (no "N/A" placeholder text where data is present).
- `supabase/functions/generate-return-analysis/index_test.ts` — Deno test that mocks the AI gateway (returns fixed summary), asserts the inserted row contains all category summaries, health_score in 0..100, and that a red breach fixture produces the escalation event dispatch.

Full existing 437 suite must remain green.

## 7. Verification

- `bunx vitest run` → all green.
- `tsgo --noEmit` → clean.
- `supabase--linter` → no NEW criticals attributable to this slice (pre-existing warnings ignored).
- Playwright walkthrough: submit a passing return → open `/admin/returns/queue/<id>/analysis` → confirm health score, category cards, and AI summary render from the row just inserted; click Regenerate → row count increases; history dropdown shows both entries.

## Deliverable report (posted after implementation)

- Files created / edited (grouped by area).
- DB objects added (table, RPC, trigger, indexes, policies).
- Edge functions deployed.
- Tests added and pass counts.
- Confirmed remaining gaps against the full Prudential Returns brief so you know what the next slice should tackle.
