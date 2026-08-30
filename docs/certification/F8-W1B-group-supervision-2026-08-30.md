# F8-W1B — Prudential Group Supervision (GAP-F8-04)

Date: 2026-08-30
Scope: consolidated group supervision only. F8-W1A (canonical calculated-ratio
store) remains CLOSED and untouched: `return_metric_values`
(`source_kind='CALCULATED'`) stays the single calculated-metric truth, written by
`returns_calculate_metrics`; `return_calculated_ratios` remains retired
read-only; `record_return_ratio` remains dropped. No second ratio store was
created and group supervision performs no independent ratio calculation.

## What changed

1. `group_member_ratios` now resolves member values from the canonical lineage
   `return_filings -> return_filing_versions -> return_metric_values` joined to
   `regulatory_metrics`, restricted to `source_kind='CALCULATED'` and available
   numeric values, preferring the accepted version (then the latest). Signature,
   output shape, security model and grants are unchanged.
2. `group_data_coverage` derives coverage from `group_member_ratios` instead of
   reading the retired ratio store directly.
3. `group_consolidated_recompute` is unchanged: it consumes `group_member_ratios`
   and aggregates strictly per configured methodology (`ratio_rules`),
   ownership treatment (full / proportional / equity / excluded) and configured
   intragroup eliminations. No accounting or prudential rule was invented.
4. `generate-return-analysis` no longer reads the retired ratio store. Current
   ratio values are supplied by its only server caller
   (`evaluate-return-prudential`) from the values it already computes in memory
   from `prudential_ratios` configuration. Historical trend is deliberately not
   reconstructed and is reported with
   `trend_unavailable_reason = legacy_ratio_keys_not_mapped_to_canonical_metrics`.
5. Access repair found while proving the persona matrix:
   `prudential_assessment_component_ratings` had INSERT/UPDATE/DELETE policies
   but no matching Data API grants, so authorised prudential actors could not
   record CAMELS component ratings at all. Grants added. Dead anonymous write
   grants on `prudential_ewi_rules` and `prudential_assessment_components` were
   revoked (no policy ever admitted `anon`).

## Legacy classification

| Reference | Classification |
|---|---|
| `supabase/baseline/*`, `scripts/system-runtime/*`, `docs/**` | Historical/archival evidence — no runtime dependency, left as recorded history |
| `src/integrations/supabase/types.ts` | Generated schema surface for a still-existing retired table — no reader |
| `src/hooks/usePrudentialSupervision.ts`, `usePrudentialConfig.ts`, `src/lib/returnsRatios.ts`, `PrudentialAnalytics.tsx` | Canonical readers; remaining mentions are explanatory comments only |
| `supabase/functions/evaluate-return-prudential` | Canonical (W1A); mentions are comments |
| `supabase/functions/generate-return-analysis` | LEGACY-KEYED, NOT-CANONICAL. Keyed on legacy `returns_filed` / `prudential_ratios.ratio_key`, which has no governed mapping to `regulatory_metrics.code`. Retired-store dependency removed; a canonical redesign requires a client-approved metric mapping (open item, not invented here) |

## Verification

- `npm run verify:f8-w1b-group-supervision` — 15/15 gates pass (group structure,
  canonical metric resolution, filing/version/period lineage, coverage,
  consolidation input, configured methodology, ownership treatment, snapshot
  keys, group EWI surface, zero retired-store dependency, RBAC helpers, RLS on
  all group surfaces, Data API grants, snapshot traceability, audit log).
- `supabase/tests/phase2/05_group_consolidation.sql` — 25/25 on canonical
  fixtures (restatement selection, exclusions, cross-group isolation, partial vs
  complete coverage, configured sum methodology, persona access).
- `supabase/tests/phase2/06_rls_persona_matrix.sql` — 39/39 using real
  certification personas; no `auth.users` seeding and no privilege was granted to
  the test role.
- Regressions green: `verify:f8-w1a-ratio-store`, `phase2/01_ratio_engine.sql`,
  `certification/04_prudential_analytics_canonical.sql`,
  `src/test/returnsCanonicalTruth.test.ts`, typecheck, build.

## Persona findings recorded during proof

- The certified `prudential_supervisor` persona legitimately holds
  `prudential_supervision.manage_config`, so it is a configuration manager; the
  "no config authority" negatives are proved with `prudential_analyst`.
- RLS makes unauthorised UPDATEs on prudential EWI alerts silent no-ops (zero
  rows matched) rather than errors; tests assert unchanged state.
- Anonymous callers are denied `return_metric_values` at grant level.

## Open, not closed here

- GAP-F8-04 consolidation *methodology* correctness beyond configured
  aggregation (accounting/prudential consolidation rules, group EWI calibration)
  remains a client-policy input.
- Canonical redesign of `generate-return-analysis` (legacy ratio-key to canonical
  metric-code mapping, and historical trend on canonical truth).
