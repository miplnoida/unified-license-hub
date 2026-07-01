
# Prudential Returns — Completion Plan

Extend the existing Returns module without redesigning. All changes are additive: new tables, new components mounted inside existing pages, and new notification event keys wired into the existing dispatcher.

## 1. Configurable Validation Rules (business + cross-field)

Replace the current mock `ManageValidations.tsx` with a real CRUD backed by a new table.

**New table** `return_validation_rules`
- return_config_id, form_id (nullable = cross-form), scope (`field` | `cross_field` | `cross_form`)
- rule_type (`range` | `comparison` | `pattern` | `expression` | `required_if`)
- expression (safe-eval string reusing `src/lib/safeEval.ts`)
- severity (`error` | `warning`), error_message, field_refs jsonb, is_active
- Grants + RLS: admins manage, entity users evaluate via RPC only.

**Evaluator** `src/lib/returnsValidation.ts`
- `evaluateReturn(returnId, formData): { errors, warnings }[]` using existing `safeEval` for expressions and referencing fields via `formId.fieldKey` tokens.
- Called from `FillReturnPage` on Save/Next and from `verify-and-submit` edge function server-side (authoritative).

## 2. Validation Result Panel

New `src/components/returns/ValidationResultPanel.tsx`
- Grouped errors/warnings; each row has a "Go to field" button that switches the FillReturn tab and scrolls/focuses the field via existing `FormRenderer` field ids.
- Mounted inside `FillReturnPage` (side panel, collapsible) and `ReturnReviewPanel` (blocks submission when errors > 0).

## 3. Supervisor Validation Summary

Add a `ValidationSummaryCard` to `pages/returns-mgmt/ReturnDetail.tsx` showing:
- Last validation run, error/warning counts, rule breakdown, override history.
- Uses same evaluator over stored `return_form_data`.

## 4. Configurable Prudential Thresholds

**New table** `prudential_thresholds`
- return_config_id, metric_key, label, comparator (`>=` | `<=` | `between`), warn_value, breach_value, unit, is_active.
- Admin UI: new tab `PrudentialThresholds.tsx` under `returns-mgmt` reusing `DataTableShell` + dialog patterns from `ManageValidations`.

## 5. Automatic Ratio Calculations

**New table** `prudential_ratios`
- return_config_id, ratio_key, label, formula (safe-eval expression over field tokens), display_format.
- Evaluated by `src/lib/returnsRatios.ts` at submit-time and on-demand in ReturnDetail.
- Results persisted to new `return_calculated_ratios` (return_id, ratio_key, value, computed_at) — write via SECURITY DEFINER RPC `recompute_return_ratios(return_id)` invoked by `verify-and-submit` and by supervisor "Recompute" button.

## 6. Threshold Breach Detection & Alerts

- After ratio computation, compare each ratio to matching threshold; insert rows into new `return_threshold_breaches` (return_id, metric_key, level `warn`|`breach`, value, threshold, detected_at).
- Reuse existing `log_compliance_audit_as_actor` to record `THRESHOLD_BREACH` events.
- Fire notification events `return.breach_warning` / `return.breach_critical`.

## 7. Trend & Peer Comparison Analytics

- New page `pages/returns-mgmt/PrudentialAnalytics.tsx` with two Recharts panels (reusing existing chart patterns):
  - **Trend**: ratio value over historical returns for a licensee.
  - **Peer**: same ratio across licensees in the same sector/sub-sector for the current period (aggregated via a SECURITY DEFINER RPC `peer_ratio_snapshot(period_end, ratio_key, sector_id)` returning min/median/p90/max + caller value).
- Linked from ReturnDetail and Regulator dashboard.

## 8. Enhanced Version History & Audit Trail

- Extend `return_form_versions` usage: on every submit/resubmit snapshot `return_form_data` + computed ratios; add diff view in ReturnDetail reusing `src/lib/formDiff.ts`.
- All state changes already write to `compliance_audit_logs`; add explicit events: `RETURN_VALIDATED`, `RATIOS_COMPUTED`, `THRESHOLD_BREACH`, `VERSION_SNAPSHOT`, `VALIDATION_OVERRIDDEN` (justification ≥10 chars via existing `OverrideJustificationDialog`).
- Timeline tab in ReturnDetail queries `audit_timeline` view filtered to the return.

## 9. Notifications

Register new event keys in `notification_event_configs` and templates in `return_notification_templates`:
- `return.validation_failed`, `return.validation_passed`
- `return.submitted`, `return.approved`, `return.rejected` (wire missing ones)
- `return.overdue` (daily job in existing `run-scheduled-reports` / new cron on `compliance_returns` where `due_date < now() AND status IN ('pending','draft')`)
- `return.breach_warning`, `return.breach_critical`

All dispatched via existing `dispatch-notification-event` from server-side (edge functions and cron), never client-only.

## Technical details

**Migrations (single batch)**
1. `return_validation_rules`, `prudential_thresholds`, `prudential_ratios`, `return_calculated_ratios`, `return_threshold_breaches` — each with GRANT + RLS (admins full; authenticated SELECT scoped through existing licensee visibility helpers).
2. RPCs (SECURITY DEFINER, `search_path = public`):
   - `evaluate_return_validations(_return_id uuid)`
   - `recompute_return_ratios(_return_id uuid)`
   - `peer_ratio_snapshot(_period_end date, _ratio_key text, _sector_id uuid)`
3. Immutability trigger reused from existing audit pattern for `return_calculated_ratios` and `return_threshold_breaches` (no UPDATE/DELETE by non-service roles).

**Edge functions**
- `verify-and-submit`: after workflow transition, call `evaluate_return_validations` (block on errors), then `recompute_return_ratios`, then dispatch notifications for pass/fail + any breaches.
- New cron caller (`overdue-returns-sweep`) scheduled via pg_cron using existing notification pattern.

**Frontend**
- `ManageValidations.tsx`: replace mock data with real hooks (`useReturnValidationRules`).
- New pages: `PrudentialThresholds.tsx`, `PrudentialRatios.tsx`, `PrudentialAnalytics.tsx` under `returns-mgmt`.
- New components: `ValidationResultPanel`, `ValidationSummaryCard`, `RatioBreachBadges`, `RatioTrendChart`, `PeerComparisonChart`.
- Wire into: `FillReturnPage`, `ReturnReviewPanel`, `ReturnDetail`, admin sidebar (existing `navigation.tsx`).

**Tests (Vitest)**
- `returnsValidation.test.ts` — expression evaluator + severity gating.
- `returnsRatios.test.ts` — formula parsing + persistence.
- `thresholdBreach.test.ts` — comparator logic + notification dispatch call.
- `overdueReturnsSweep.test.ts` — SQL selection window.
- `validationResultPanel.test.tsx` — navigation-to-field behavior.
- Extend `auditSourceCoverage.test.ts` with new event types.

**Non-goals / preserved**
- No changes to existing workflow engine, RBAC, or form builder internals.
- No schema changes to `compliance_returns`, `returns_filed`, `return_form_data`, `return_form_versions` beyond additive relations.
- Existing tests continue to pass; new features are gated behind admin-configured rows so unconfigured returns behave exactly as today.

## Deliverable

Working, migration-backed, server-enforced prudential returns layer with UI parity to existing admin patterns and full notification + audit coverage. All new tables carry GRANT + RLS in the same migration; all evaluators run server-side authoritatively with client mirrors for UX only.
