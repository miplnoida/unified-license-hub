# Prudential Returns — Final Completion Plan

Scope: close every remaining gap listed in the request. Existing tables, RPCs, edge functions, and UI stay intact; new work extends them and rewires the entity submission flow to make validation authoritative and blocking.

## 1. Submission flow becomes blocking (highest priority)

Rewrite `handleSubmit` in `src/pages/entity/returns/FillReturnPage.tsx`:

```text
save → invoke evaluate-return-prudential (await) →
  if response.passed === false && errors.length > 0:
     open ValidationResultPanel, toast, return (no status change)
  else if warnings.length > 0:
     require acknowledge in confirm dialog
  → mark returns_filed.status = SUB
  → dispatch return.submitted / return.resubmitted
  → refresh queries
```

Same wrapper used in `ReturnReviewPanel` submit button. The edge function already logs run + audit + notifications; the client simply awaits the result and blocks on `errors.length > 0`.

`resubmit-return` edge function (server-side path) already calls the evaluator; add a guard that returns `{ error: "VALIDATION_FAILED", errors }` with HTTP 200 body when blocking errors exist, so the client can render them without status change.

## 2. Validation engine completion

- Extend `src/lib/returnsValidation.ts` and the mirror in `evaluate-return-prudential`:
  - Boolean composition: `AND`, `OR`, parentheses, precedence. Extend the tokenizer to recognise `&&`/`||`/`AND`/`OR` between comparison sub-expressions and evaluate with short-circuit.
  - Numeric rule type (`numeric`) — validates the resolved value is a finite number and within optional min/max encoded in `field_refs.constraints`.
  - `regex` alias for `pattern`.
- Every result already carries `rule_id`, `severity`, `passed`, `message`, `rule_version`. Extend to include `value`, `expected`, `expression_snapshot`, `timestamp`. Persisted through `log_validation_run` — extend that RPC to accept the new fields.

## 3. Rule versioning lifecycle RPCs

New SECURITY DEFINER RPCs:

- `rollback_validation_rule(_rule_id uuid, _to_version int)` — copies the historical version's `definition` back into `return_validation_rules`, then calls the existing publish path to snapshot as a new current version.
- `clone_validation_rule(_rule_id uuid, _new_name text)` — inserts a new rule from the current version's snapshot; seeds v1 row.
- `archive_validation_rule(_rule_id uuid)` — sets `is_active=false`, snapshots archival event, emits audit `RULE_ARCHIVED`.

Admin UI: extend the version history sheet in `ManageValidations.tsx` with Rollback / Clone / Archive buttons on each row.

## 4. Ratio engine completion

- `src/lib/returnsRatios.ts` and edge mirror:
  - Detect division by zero → result `null`, `null_reason='division_by_zero'`.
  - Detect missing operand → `null`, `null_reason='missing_input'`.
  - Support ratio-of-ratio: allow tokens `ratio:key`. Resolve in dependency order (topological sort); circular dependency raises a computation error persisted to `return_calculated_ratios.error`.
  - Formatting resolvers: `percentage` (× 100 + %), `currency` (Intl w/ locale from site settings), `ratio` (2 dp), `basis_points`.
- Persist `formula_snapshot`, `ratio_version`, `null_reason`, `dependencies` array to `return_calculated_ratios` (additive migration).
- New RPCs already exist for `record_return_ratio`; extend signature to accept the additional fields.

Admin UI: `PrudentialRatios.tsx` gains publish/version/history/rollback controls (same sheet pattern as validations) and a live dependency preview.

## 5. Threshold engine completion

- Support comparators `<`, `>`, `<=`, `>=`, `=`, `between`, `outside`. Extend `evaluate-return-prudential` breach check accordingly.
- Add `severity` column to `prudential_thresholds` (`warning|critical|severe`) with default `warning`; use for classification alongside numeric levels.
- Populate `risk_level` (`green|amber|red`) per breach; also compute a `severity_level` string for notifications.
- Admin UI: `PrudentialThresholds.tsx` gains publish/version/history/rollback + sector/return-type/effective_from controls.

## 6. Consolidated analysis engine

New pieces:

- Table `return_consolidated_analysis` (append-only, one row per computation):
  `return_id, health_score numeric, capital_summary jsonb, liquidity_summary jsonb, asset_quality_summary jsonb, profitability_summary jsonb, concentration_risks jsonb, trend jsonb, peer jsonb, heatmap jsonb, early_warnings jsonb, recommendations jsonb, ai_summary text, computed_at, computed_by`. GRANT + RLS + append-only trigger.
- Edge function `generate-return-analysis` (SECURITY DEFINER via service role): reads persisted ratios/breaches/history for the return, computes each summary from **actual persisted numbers** only (no hardcoded copy), calls Lovable AI Gateway (`google/gemini-2.5-flash`) to write the plain-language `ai_summary` from the JSON payload. Inserts one row.
- Invoked automatically at end of `evaluate-return-prudential` and from a "Regenerate Analysis" button.
- Peer + trend reuse existing `peer_ratio_snapshot` RPC and `return_calculated_ratios` history.
- Early-warning rules: derived from consecutive amber breaches, trend slope, and null-reason clusters — no hardcoded text; each warning is `{ metric_key, level, evidence }` and rendered by UI.

New page `src/pages/returns-mgmt/ReturnAnalysis.tsx` at `/admin/returns/:id/analysis` renders the last analysis row with cards + heatmap + trend charts + recommendations.

Supervisor `ReturnDetail.tsx` gains an "Analysis" tab that lists prior analyses and links to the full page.

## 7. Notification engine

Reuse existing dispatcher. Add missing keys (already seeded). Extend `evaluate-return-prudential` to emit `return.analysis_complete` after analysis row is written and `return.supervisor_escalation` when any `red` breach or overdue is detected. Existing `notification-retry` + `notification-failure-sweep` cover retry.

## 8. Audit

All new writes route through existing `log_compliance_audit_as_actor`. Add events: `RULE_ROLLBACK`, `RULE_CLONED`, `RULE_ARCHIVED`, `ANALYSIS_GENERATED`, `RATIO_NULLIFIED`, `THRESHOLD_EVALUATED`. Immutability enforced by existing triggers.

## 9. UI pages (new + extended)

New pages (all data-driven, no mocks):

- `src/pages/returns-mgmt/ValidationHistory.tsx` — filter by rule/return; renders `return_validation_run_log`.
- `src/pages/returns-mgmt/RatioHistory.tsx` — renders `return_calculated_ratios` with version + snapshot.
- `src/pages/returns-mgmt/ThresholdHistory.tsx` — renders `prudential_threshold_versions`.
- `src/pages/returns-mgmt/ExecutionLogs.tsx` — union of validation runs + ratio compute events + breach events with filters.
- `src/pages/returns-mgmt/AnalysisDashboard.tsx` — aggregated Green/Amber/Red counts, health-score distribution, top breaches, overdue.
- `src/pages/returns-mgmt/ReturnAnalysis.tsx` — single-return consolidated view.

Extend existing:

- `PrudentialThresholds.tsx`, `PrudentialRatios.tsx`: publish + history + rollback + clone + archive.
- `ReturnDetail.tsx`: add tabs Validation Summary, Ratios, Breaches, Analysis, Version History, Audit — each sourced from the tables above.
- Sidebar: add new routes under `/admin/returns/*`.

Route registration in `src/routes/adminRoutes.tsx` for every new page.

## 10. Runtime & code hygiene

- Type refresh via `src/integrations/supabase/types.ts` (auto after migration).
- Remove any prior mock arrays that survived in `ManageValidations`/`PrudentialThresholds`/`PrudentialRatios` (currently already db-driven; verify).
- Ensure every new file passes typecheck + lint. No dead exports.

## 11. Tests

New/extended (Vitest):

- `submissionBlocking.test.tsx` — mocks the evaluator to return errors → asserts status stays draft and panel opens.
- `booleanExpressions.test.ts` — `AND`/`OR`/parentheses/precedence combinations.
- `ratioDependencies.test.ts` — ratio-of-ratio + circular detection + null reasons.
- `thresholdOperators.test.ts` — `<`, `>`, `between`, `outside`, `=`.
- `ruleLifecycle.test.ts` — publish → rollback → clone → archive round-trip (mocked supabase).
- `consolidatedAnalysis.test.ts` — deterministic summaries from fixture ratios/breaches.
- `notificationEvents.test.ts` — evaluator dispatches expected event keys per branch.
- `historicalReplay.test.ts` — reruns evaluator against v1 rule snapshot and confirms result differs from current version.

All existing 437 tests must remain green. Deno edge tests updated where applicable.

## 12. Verification checklist (blocking exit criteria)

Agent MUST self-verify each before reporting complete:

1. Full `bunx vitest run` — green.
2. `supabase--linter` — no NEW criticals attributable to this change.
3. Playwright: submit a return with a breaching rule → blocked; correct value → passes; supervisor sees analysis with health-score + recommendations; version history shows rollback.
4. Manual DB inspection: `return_validation_run_log`, `return_calculated_ratios`, `return_threshold_breaches`, `return_consolidated_analysis` all populated with real batch/version IDs.

## Deliverable

Blocking pre-submit validation, full rule/threshold/ratio lifecycle with immutable version history, ratio-of-ratio + formatting + null handling, expanded threshold operators + severity, consolidated analysis with AI summary generated from real data, notifications + audit for every path, and six new UI pages plus extended admin surfaces — all backed by tests.
