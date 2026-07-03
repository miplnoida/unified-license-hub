## Goal
Complete Phase 2 Market Conduct so it is production-ready. Extend — do not replace — existing complaint pages, and reuse the existing audit + universal override framework, RLS conventions, and navigation.

## Current state (verified)
- Tables already exist: `conduct_risk_categories`, `conduct_products`, `conduct_channels`, `conduct_triage_rules`, `conduct_alerts`, `conduct_alert_thresholds`.
- `complaints` already has: `conduct_risk_category_id`, `product_id`, `channel_id`, `licensee_id`, `customer_type`, `vulnerability_indicator`, `vulnerability_notes`, `repeat_complaint_count`, `priority`, `assigned_team`, `sla_days`, `sla_due_at`, `triage_source`, `triage_rule_id`.
- Edge function `evaluate-complaint-triage` exists but is limited (few operators, no persistent audit row, no snapshot, no failure logging, alerts can duplicate, no dry-run audit).
- Auto-triage only runs when the "Auto-triage" button is pressed; `ComplaintsList.tsx` intake dialog inserts without invoking it (and uses a broken `.n(` call).
- Admin pages `RiskTaxonomy`, `ProductsChannels`, `TriageRules`, `ConductDashboard`, `ConductAlerts` exist and are already routed + linked from `AdminHub` (added in the prior turn).

## Gaps to close
1. Triage engine coverage, auditability, duplicate-safe alerts, dry-run auditing, failure surfacing.
2. Automatic triage on complaint creation.
3. Full override support (severity, priority, team, SLA, category, product, channel, alert closure).
4. Missing complaint columns for snapshot/override tracking; missing alert dedupe/rule linkage.
5. Dashboard filter set + drilldowns + empty/loading states.

---

## Plan

### 1. Migration — `market_conduct_hardening`
- **complaints**: add `triage_evaluated_at timestamptz`, `triage_result_snapshot jsonb`, `triage_override_status text default 'none'` (`none|overridden`), `triage_last_error text`. Add indexes on `(product_id)`, `(channel_id)`, `(conduct_risk_category_id)`, `(licensee_id)`, `(severity, status)`, `(priority, status)`, `(sla_due_at)`.
- **conduct_triage_rules**: add `updated_by uuid`; index `(active, priority_order)`.
- **conduct_alerts**: add `triage_rule_id uuid` (FK → `conduct_triage_rules(id)` ON DELETE SET NULL) and `dedupe_key text`; partial unique index `unique(dedupe_key) where dedupe_key is not null and status <> 'closed'`. Indexes on `(status, severity)`, `(licensee_id)`, `(product_id)`, `(channel_id)`, `(conduct_risk_category_id)`.
- No new tables; existing RLS/grants remain valid (new columns inherit table policies).
- Types file auto-regenerates after approval.

### 2. Edge function `evaluate-complaint-triage` (rewrite in place)
- Body validation with Zod: `{ complaint_id: uuid, dry_run?: boolean, triggered_by?: string }`.
- Field access: `complaint_type`, `product`, `channel`, `entity`, `customer_type`, `customer_vulnerability`, `keywords`, `repeat_count`, `sla_days`, `severity`, `priority`, `assigned_team`, `age_days`.
- Operators: `eq`, `neq`, `in`, `not_in`, `contains_any`, `contains_all`, `gte`, `lte`, `is_true`, `is_false`, `is_empty`, `is_not_empty`.
- Recompute `repeat_complaint_count` from last-12-month complaints matching complainant/entity/product/category before evaluation.
- Iterate rules in `priority_order`; first-match wins.
- Outputs supported: `severity`, `priority`, `sla_days`, `assigned_team`, `conduct_risk_category_code`, `generate_alert_kind`, `recommended_action`.
- Compute `sla_due_at = created_at + sla_days` when `sla_days` is applied.
- Persist to complaint: outputs + `triage_source='auto'`, `triage_rule_id`, `triage_evaluated_at=now()`, `triage_result_snapshot={inputs, matched_rule, outputs, evaluated_at, rules_evaluated}`, clear `triage_last_error`.
- Alerts: kinds `critical_severity`, `vulnerable_customer`, `repeat_complaint`, `sla_at_risk`, `sla_breach`, `high_risk_category`, `rule_alert`. `dedupe_key = sha1(complaint_id + ':' + kind + ':' + (triage_rule_id||'none'))`. Insert with `onConflict:'dedupe_key', ignoreDuplicates:true`.
- **Auditability**: every invocation writes to `compliance_audit_logs` with `action='complaint.triage_evaluated'`, `entity_type='complaint'`, `entity_id=complaint_id`, `metadata={dry_run, triggered_by, matched_rule_id, matched_rule_name, rules_evaluated, input_snapshot, old_values, new_values, outputs_applied, alerts_created, function_version:'v2'}`. No-match still audited. On thrown error, write `action='complaint.triage_failed'` with `error_message` + short stack and set `complaint.triage_last_error`; return 200 with `{success:false, error}` so intake never blocks.
- Dry-run: no writes to complaints/alerts; audit row still written with `dry_run:true`.

### 3. Auto-triage on intake
- Fix `ComplaintsList.tsx` new-complaint dialog: replace `.n(` with `.insert(nData).select('id').single()`; after success invoke `supabase.functions.invoke('evaluate-complaint-triage', { body: { complaint_id, triggered_by: 'intake' } })`; toast a warning on failure but keep the complaint (function already persisted `triage_last_error`).
- Keep the manual "Auto-triage" button on `ConductClassificationCard`.
- Search for other intake entry points (external/portal). If any exists, wire the same invocation; otherwise document that intake is centralized here.

### 4. `ConductClassificationCard` — full override coverage
- Diff auto-set outputs from `triage_result_snapshot.outputs` (severity, priority, assigned_team, sla_days/sla_due_at, conduct_risk_category_id, product_id, channel_id) against the edited form.
- If `triage_source in ('auto','override')` and any auto-set output changed, open `OverrideReasonDialog` (`ruleKey='complaints.triage.rule_output_override'`, `originalValue=snapshot.outputs`, `overriddenValue=new`, `metadata={triage_rule_id, changed_fields}`).
- On confirm: persist + set `triage_source='override'`, `triage_override_status='overridden'`, recompute `sla_due_at` if `sla_days` changed. Universal framework already writes `rule_overrides` + audit.
- Add read-only "Triage snapshot" panel showing matched rule, evaluated at, and last error (with a Retry button that re-invokes the function).

### 5. Alerts — actions + rule-close override
- `ConductAlerts.tsx`: add Acknowledge and Close actions (write `acknowledged_by/at`, `closed_by/at`) with audit rows.
- When closing an alert generated from a rule (`triage_rule_id is not null`), require `OverrideReasonDialog` (`ruleKey='conduct.alert.rule_close_override'`).
- Filters: status, severity, kind, entity, product, channel, category. Drilldown link to complaint.

### 6. Triage rules admin polish (`/admin/conduct/triage-rules`)
- Condition builder exposes every field/operator listed in §2.
- Output builder for severity/priority/sla_days/assigned_team/category_code/generate_alert_kind/recommended_action.
- "Simulate" invokes function with `dry_run:true`; shows matched_rule + diff.
- Add `HistoryButton` per rule (`entityType='conduct_triage_rule'`).
- Audit create/update/delete/toggle via existing `logAudit`.

### 7. Dashboard (`/conduct`)
- Filters: date window, product, channel, category, entity, severity, priority, customer type, vulnerability, alert status.
- KPIs: total, open, critical, vulnerable, sla_breached, sla_at_risk (<24h), open alerts, repeat complaints (>=2).
- Recharts: complaints by product/channel/category/severity/entity; alerts by kind/status.
- Recent complaints + recent alerts tables with drilldown links.
- Loading skeletons + explicit empty states; no seeded data.

### 8. Navigation & permissions
- Verify `AdminHub` tiles for the five routes (already added). Gate on `complaint_management` module.
- Verify operational sidebar exposes `/conduct` and `/conduct/alerts` for staff; if missing, add entries in the sidebar registry.

### 9. Regression + acceptance verification
- `tsgo --noEmit` clean.
- Playwright smoke: create complaint via `ComplaintsList` → confirm `compliance_audit_logs` row `complaint.triage_evaluated`, complaint updated, alerts inserted; re-run manual auto-triage → no duplicate alerts.
- Override auto output → `rule_overrides` row, `triage_source='override'`.
- Simulate rule → dry-run audit row, no complaint change.
- Force failure (invalid rule condition) → `triage_failed` audit row, `triage_last_error` populated, complaint still created.
- Existing complaint intake/detail/investigation/correspondence/enforcement escalation/analytics/public paths still work.

## Technical notes
- No new tables; reuse `compliance_audit_logs` for triage auditing and `rule_overrides` for overrides.
- Deterministic `dedupe_key` makes alert generation idempotent.
- All new complaint columns are nullable/have defaults so existing rows and inserts keep working.
- Edge function returns HTTP 200 with `{success:false,error}` on failure to keep intake resilient.

## Deliverables
- One migration (schema + indexes).
- Rewritten `supabase/functions/evaluate-complaint-triage/index.ts`.
- Edits: `ComplaintsList.tsx`, `ConductClassificationCard.tsx`, `ConductAlerts.tsx`, `TriageRules.tsx`, `ConductDashboard.tsx`, and sidebar registry if needed.
- Final report: files changed, migration name, audit/override behaviour confirmation, unresolved gaps (if any).
