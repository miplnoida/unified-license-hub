# EPR-01 — P07 Prudential: canonical Returns truth migration

Scope: remove legacy Returns truth from P07. **No P07 UX redesign** — dashboard,
entity profile, financial groups, CAMELS workflow and navigation keep their
existing structure; only the truth sources behind them changed.

## 1. P07 CANONICAL TRUTH — status

| Legacy source (before) | Canonical source (now) | Consumer |
|---|---|---|
| `returns_filed` (0 rows) | `v_return_filing_workflow_state` via `prudential_entity_universe()` | `usePrudentialEntities` → entities list, dashboard, action/escalation dialogs |
| `returns_filed` + `return_calculated_ratios` + `return_threshold_breaches.return_id` + `return_consolidated_analysis` | `prudential_entity_returns_profile()` | `useEntityHistoricalProfile` → Prudential Entity Profile (returns, ratios, breaches, trends, CSV exports) |
| `return_calculated_ratios` / legacy breach id | `prudential_filing_metric_facts()` | `useReturnComputedRatios`, `useReturnBreaches`, `useAssessmentPrefill` |
| `returns_filed` period scan | `prudential_group_periods()` | `useGroupPeriods` |
| empty `return_consolidated_analysis` member analysis | `prudential_group_consolidated().member_metrics` (canonical `return_metric_values`) | Financial Group Profile → *Member reported facts* |
| `evaluate_stress_indicators_for_return(returns_filed.id)` | `evaluate_stress_indicators_for_filing(return_filings.id)` | "Evaluate stress" on the entity profile |

Legacy reads remaining in P07 source files: **0** (only explanatory comments
naming the retired tables remain).

## 2. PRUDENTIAL ENTITY UNIVERSE / HISTORY

- `prudential_entity_universe(_sector_id, _status, _search)` — `SECURITY INVOKER`,
  RLS-scoped. Server-side: latest filing (id, reference, period, status), latest
  accepted filing, current breach count + worst severity
  (`v_prudential_current_breaches`), open EWI, open/overdue actions, open
  escalations, open stress events, latest rated assessment. The browser no longer
  assembles the universe from multiple tables and no counter is `rows.length`.
- `prudential_entity_returns_profile(_entity_id)` — one JSON payload with
  `filings`, `metrics`, `current_breaches`, `breach_history`. Every row carries
  canonical provenance: `filing_id`, `return_filing_version_id`,
  `reporting_period_id`, `period_label`.
- Filing status vocabulary is now canonical (`DRAFT`, `SUBMITTED`,
  `UNDER_REVIEW`, `CORRECTION_REQUESTED`, `ACCEPTED`, `REJECTED`, `WITHDRAWN`)
  in `src/lib/prudentialLabels.ts`; the retired `WIP/SUB/VAL/TBR/REJ` codes are
  retained for historical audit rows only. The "latest return" filter on the
  entities list uses the canonical codes.

## 3. CANONICAL METRICS ("Ratios")

- Ratios shown in P07 are canonical reported facts: `return_metric_values`
  joined to `regulatory_metrics` on the **accepted** version, falling back to the
  current version only when nothing is accepted yet.
- `%`-unit metrics are treated as percentage points (18.40 = 18.40%); `x`/ratio
  units render as multiples. Missing metrics are absent, never zero-filled.
- There is no second ratio engine: nothing is recomputed in the browser.

## 4. CURRENT BREACHES

- Operational breach truth is `v_prudential_current_breaches` throughout P07
  (entity profile, groups, assessment prefill). Presentation keys that used to
  hold a legacy `return_id` now hold the canonical `return_filing_id`.
- Historical breaches are exposed separately as `breach_history` so a closed or
  superseded breach can never be presented as current.

## 5. Drill-downs

All P07 links to a return now go through
`objectRoute.returnFiling(return_filings.id)` — the entity profile returns table,
the ratio drill-down drawer, and the group member-facts panel. No
`/returns-management/:legacyId` link remains in P07.

## 6. Security posture

`prudential_entity_universe`, `prudential_entity_returns_profile`,
`prudential_filing_metric_facts` and `prudential_group_periods` are
`SECURITY INVOKER` (RLS applies to the caller) and are not executable by `anon`.
`evaluate_stress_indicators_for_filing` is `SECURITY DEFINER` because it writes
stress events; it requires `prudential_supervision.edit` (or super admin) and is
revoked from `anon`.
