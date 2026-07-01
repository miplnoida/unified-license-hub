# Prudential Returns — Completion Plan (Gap Closure)

Foundational tables (`return_validation_rules`, `prudential_thresholds`, `prudential_ratios`, `return_calculated_ratios`, `return_threshold_breaches`) and the `evaluate-return-prudential` edge function already exist. This plan closes every remaining gap without altering unrelated modules.

## 1. Schema additions (single migration, additive only)

New tables (all with GRANT + RLS + immutability where noted):

- `return_validation_rule_versions` — snapshot of every published/edited rule (rule_id, version, definition jsonb, published_at, published_by, is_current). Append-only.
- `return_validation_run_log` — per-execution log (return_id, rule_id, rule_version, passed, severity, message, executed_at, executed_by, context `submit|save|supervisor|resubmit`). Append-only.
- `prudential_threshold_versions` — snapshot per threshold change (threshold_id, version, warn_value, breach_value, comparator, effective_from, effective_to, published_by). Append-only.
- `prudential_ratio_versions` — snapshot per formula change (ratio_id, version, formula, display_format, effective_from, published_by). Append-only.

Additive columns:

- `return_validation_rules`: `current_version int not null default 1`.
- `prudential_thresholds`: `effective_from date not null default current_date`, `effective_to date null`, `sector_id uuid null`, `return_type_id uuid null`, `current_version int default 1`.
- `prudential_ratios`: `current_version int default 1`.
- `return_calculated_ratios`: `ratio_version int`, `formula_snapshot text`.
- `return_threshold_breaches`: `risk_level text check in ('green','amber','red')`, `threshold_version int`.

New RPCs (SECURITY DEFINER, `search_path = public`):

- `publish_validation_rule(_rule_id uuid)` — snapshots into versions table, bumps `current_version`.
- `publish_prudential_threshold(_threshold_id uuid, _effective_from date)` — closes prior version (`effective_to`), inserts new.
- `publish_prudential_ratio(_ratio_id uuid)` — snapshots.
- `log_validation_run(_return_id, _results jsonb, _context text)` — inserts one row per result, plus a single `RETURN_VALIDATED` compliance audit event.
- `peer_ratio_snapshot(_period_end, _ratio_key, _sector_id)` — min/median/p90/max + caller value for peer chart.
- `resolve_effective_threshold(_return_config_id, _metric_key, _as_of date)` — returns active threshold row for a return's period.

Triggers: forbid UPDATE/DELETE on all `*_versions` and `return_validation_run_log` for non-service roles.

## 2. Validation Engine (server-authoritative)

Extend `evaluate-return-prudential`:

1. Load rules **at their `current_version`** via versions table (so historical returns replay against the version they were validated with, stored in `return_calculated_ratios.ratio_version` / run log).
2. Evaluate through existing `returnsValidation.ts` (already handles cross-field, formula, conditional, pattern, required_if, warning vs blocking).
3. Persist every result via `log_validation_run` (audit + per-rule log).
4. Compute ratios using **effective ratio version** as of the return's `period_end`; snapshot formula into `return_calculated_ratios.formula_snapshot`.
5. Resolve thresholds via `resolve_effective_threshold` (sector + return_type + effective window). Classify **Green** (within warn), **Amber** (>= warn, < breach), **Red** (>= breach) and persist to `return_threshold_breaches` with `risk_level` + `threshold_version`.
6. Emit compliance audit events: `RETURN_VALIDATED`, `RATIOS_COMPUTED`, `THRESHOLD_BREACH`, `VALIDATION_OVERRIDDEN`.
7. Dispatch notifications: `return.validation_failed`, `return.validation_passed`, `return.breach_warning`, `return.breach_critical`.

Integrate into workflow:

- `perform-return-workflow-action`: on submit/approve/reject transitions, invoke `evaluate-return-prudential` (blocking on errors for submit path only); dispatch `return.submitted|approved|rejected|resubmission_requested`.
- `resubmit-return`: same pre-flight validation + re-run engine; emit `RESUBMISSION`, `return.resubmission_requested`.
- Existing `FillReturnPage` client mirror already calls the function on submit — keep as UX preview only.

## 3. Admin Screens

Extend existing pages (no redesign, reuse `DataTableShell` + dialog patterns):

- `ManageValidations.tsx`: add columns for `current_version`, "Publish new version" button (calls `publish_validation_rule`), version history drawer listing prior versions with diff.
- `PrudentialThresholds.tsx`: add sector / return_type selectors, effective_from picker, version history drawer, audit trail tab.
- `PrudentialRatios.tsx`: add version history drawer, display formula snapshot.

## 4. Entity Submission Flow

`FillReturnPage.tsx` + `ReturnReviewPanel.tsx`:

- Mount `ValidationResultPanel` as collapsible side panel (already exists) — wire "Go to field" to switch tab + focus via existing `FormRenderer` field ids.
- Block submit when errors > 0; show warnings inline with acknowledge checkbox.
- On successful submit, persist link `returns_filed.validation_run_id` → latest `return_validation_run_log` batch (batch_id column added).
- Resubmission path: reuse same panel; prior run log preserved.

## 5. Supervisor Review (`ReturnDetail.tsx`)

Add tabs / cards (reuse existing tab shell):

- **Validation Summary** — pass/fail counts, per-rule table sourced from `return_validation_run_log` filtered to the return + latest batch.
- **Ratios** — `RatioSummaryCard` (exists) extended with formula snapshot + version.
- **Breaches** — table from `return_threshold_breaches` with Green/Amber/Red badges.
- **Comments** — reuse existing `return_comments`.
- **Version History** — `return_form_versions` diff viewer via `formDiff.ts`.
- **Audit History** — `audit_timeline` view filtered to this return.
- **Recompute** button → RPC `recompute_return_ratios` (supervisor role, logs `OVERRIDE` with justification via `OverrideJustificationDialog`).

## 6. Trends & Analytics

`PrudentialAnalytics.tsx` extend with:

- Historical return trend (line) per licensee.
- Ratio trend (line) per ratio_key.
- Threshold overlay bands (warn/breach) on ratio chart.
- Peer comparison (box plot / distribution) via `peer_ratio_snapshot`.

Dashboard widgets (reuse `report_dashboard_widgets` config pattern):

- Supervisor summary card: counts of Green/Amber/Red across current period, overdue returns, validation-failure rate.
- Licensee summary card: my last submission risk, upcoming due dates.

Mount widgets on existing supervisor + licensee dashboards.

## 7. Notifications

Seed `notification_event_configs` + `return_notification_templates` for any missing keys:
`return.validation_failed`, `return.validation_passed`, `return.submitted`, `return.approved`, `return.rejected`, `return.resubmission_requested`, `return.overdue`, `return.breach_warning`, `return.breach_critical`.

Dispatch exclusively server-side (edge functions + `overdue-returns-sweep` cron via `pg_cron`, scheduled through `supabase--insert` per project convention).

## 8. Audit Logging

Every path emits via existing `log_compliance_audit_as_actor` / `log_security_event_as_actor`:

- `RULE_PUBLISHED`, `THRESHOLD_PUBLISHED`, `RATIO_PUBLISHED` — from admin publish RPCs.
- `RETURN_VALIDATED`, `RATIOS_COMPUTED`, `THRESHOLD_BREACH`, `VALIDATION_OVERRIDDEN`, `VERSION_SNAPSHOT`, `RESUBMISSION`, `REVIEW_ACTION` — from edge functions.

Extend `docs/audit-log-coverage.md` and `auditSourceCoverage.test.ts` to include the new event keys.

## 9. Tests (Vitest + Deno)

Frontend:
- `returnsValidation.test.ts` — extend for versioned rule replay, warning-vs-error gating, conditional/required_if.
- `returnsRatios.test.ts` — formula snapshot persistence.
- `thresholdBreach.test.ts` — Green/Amber/Red classification, effective-window resolution.
- `validationResultPanel.test.tsx` — "Go to field" navigation.
- `prudentialAnalytics.test.tsx` — peer distribution rendering.
- `returnSubmissionFlow.test.tsx` — blocked-on-errors, warnings ack, resubmission path.
- `supervisorReviewTabs.test.tsx` — tabs render logs/ratios/breaches.
- `auditSourceCoverage.test.ts` — new event keys.

Edge (Deno):
- `evaluate-return-prudential/index_test.ts` — end-to-end: rules + ratios + thresholds + audit + notifications called.
- `perform-return-workflow-action/index_test.ts` — extend for validation gating.
- `resubmit-return/index_test.ts` — new.
- `overdue-returns-sweep/index_test.ts` — new.

Regression: full existing suite (currently 432 tests) must still pass.

## 10. Definition of Done (verification checklist)

Before reporting complete, the agent will:

1. Run frontend suite (`bunx vitest run`) and Deno edge tests — all green.
2. Run `supabase--linter` — no new criticals.
3. Playwright walkthrough: admin publishes a rule + threshold + ratio → entity user submits a failing return (blocked) → corrects and submits → supervisor sees validation summary, ratios, Green/Amber/Red breach, audit trail → notifications logged in `notification_dispatch_log`.
4. Confirm no changes to unrelated modules (licenses, registration, workflow engine internals, RBAC, form builder core).

## Technical notes

- All new tables carry GRANT (`authenticated` SELECT scoped by RLS; `service_role` full) + RLS in the same migration.
- All mutations flow through SECURITY DEFINER RPCs; direct INSERT/UPDATE on audit/log/version tables is revoked.
- Cron for `overdue-returns-sweep` scheduled via `supabase--insert` (contains project-specific URL/anon key, not in migration).
- No changes to `compliance_returns`, `returns_filed`, `return_form_data`, or `return_form_versions` beyond additive relations (`validation_run_id`, `latest_batch_id`).
- Client evaluator remains UX-only; the edge function is the sole authority.

## Deliverable

Fully server-enforced Prudential Returns layer with versioned rules/thresholds/ratios, Green/Amber/Red risk, per-run execution log, integrated submission + resubmission + supervisor review, dashboard widgets, complete notifications, audit coverage, and passing test suite.
