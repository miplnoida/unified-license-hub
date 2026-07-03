# Market Conduct Supervision — Production Hardening

Close the remaining verified gaps in the Market Conduct module. Extend existing files only; do not replace complaint pages, audit framework, or override framework.

## 1. Migration (single new file)

`supabase/migrations/<ts>_conduct_hardening.sql`:

- `complaints`: add `triage_evaluated_at timestamptz`, `triage_result_snapshot jsonb`, `triage_error text`, `triage_override_status text` (if not present). Also add originals block `triage_original_values jsonb` for override trail.
- `conduct_alerts`: add `triage_rule_id uuid`, `dedupe_key text`, `source text`, `window_start timestamptz`, `window_end timestamptz`, `acknowledged_by/at`, `closed_by/at` if missing. Partial unique index on `dedupe_key WHERE status='open'`.
- Extend `conduct_alerts.kind` allowed set to include `sla_at_risk`, `sla_breach`, `thematic_spike`, `high_risk_category`, `rule_triggered`, `critical_severity`, `vulnerable_customer`, `repeat_complaint` (drop old CHECK, recreate).
- New table `conduct_triage_audit_events` (fallback when compliance_audit_logs schema is too rigid): complaint_id, evaluated_at, actor_id, dry_run, matched_rule_id, matched_rule_name, rules_evaluated, evaluated_summary jsonb, input_snapshot jsonb, old_values jsonb, new_values jsonb, applied_outputs jsonb, alerts_generated jsonb, error text, function_version text. Grants + RLS (staff read, service_role all).
- Indexes: `complaints(product_id)`, `(channel_id)`, `(conduct_risk_category_id)`, `(licensee_id, created_at desc)`, `conduct_alerts(status, severity)`, `conduct_triage_rules(active, priority_order)`.

## 2. Edge function `evaluate-complaint-triage`

Full rewrite of evaluator (keep function name/route):

- **Operators**: `eq, neq, in, not_in, contains_any, contains_all, gte, lte, gt, lt, is_true, is_false, is_empty, is_not_empty`. Null-safe.
- **Fields**: complaint_type, product_id, channel_id, licensee_id, customer_type, vulnerability_indicator, keywords(subject+description), repeat_count, sla_days, sla_due_at, days_open, severity, priority, assigned_team, conduct_risk_category_id/code, status.
- **Outputs**: severity, priority, assigned_team, sla_days (→ recompute sla_due_at), conduct_risk_category_id/code, alert_kind, alert_severity, alert_title, alert_detail, recommended_action.
- **Snapshot & originals**: capture pre-values; on first auto-triage write `triage_original_values`; always write `triage_result_snapshot` + `triage_evaluated_at`.
- **Alerts** (duplicate-safe via `dedupe_key`):
  - `critical_severity` (complaint_id+kind)
  - `vulnerable_customer` (complaint_id+kind)
  - `repeat_complaint` (complaint_id+kind, when repeat_count ≥ threshold)
  - `sla_at_risk` (complaint_id+kind, within 20% of due)
  - `sla_breach` (complaint_id+kind, now > sla_due_at, not resolved/closed)
  - `high_risk_category` (complaint_id+category_id)
  - `rule_triggered` (complaint_id+kind+rule_id)
  - `thematic_spike` (kind + product/channel/category/licensee + 30d window, threshold from `conduct_alert_thresholds`)
- **Audit**: insert into `conduct_triage_audit_events` for match, no-match, dry-run, success, error. Include alerts_generated + rules_evaluated summary.
- **Dry run**: computes without writing complaint/alerts; still writes audit event with dry_run=true.
- **Error path**: catches, writes audit with error, updates `complaints.triage_error`, returns 200 with `{ ok:false, error }`.

## 3. Complaint intake auto-triage — `src/pages/complaints/ComplaintsList.tsx`

- Change insert to `.insert(insertData).select('id').single()`.
- On success, `supabase.functions.invoke('evaluate-complaint-triage', { body: { complaint_id, triggered_by:'complaint_intake' } })`.
- Success toast: "Complaint submitted and triaged"; failure: warning toast + `logAudit('complaint.triage_failed_after_submission', ...)`. Never fail submit on triage error.

## 4. Triage rules admin — `src/pages/admin/conduct/TriageRules.tsx`

- Condition builder: field dropdown (all fields §3), operator dropdown (all operators §3), value input adapting per type (dropdown for enums, tag input for `in/contains_*`).
- Output builder: structured fields for severity/priority/assigned_team/sla_days/category/alert_* (no raw JSON for common outputs; keep JSON fallback for advanced).
- Keep simulation, active toggle, priority_order, match_mode.

## 5. Override completeness — `ConductClassificationCard.tsx`

- Diff against `triage_result_snapshot` for: severity, priority, assigned_team, sla_days, conduct_risk_category, product_id, channel_id.
- Require OverrideReasonDialog for any change to auto-set field. Persist `triage_override_status='overridden'`, write override via existing framework with old (snapshot), new, rule_id, complaint_id, actor, timestamp.
- Show snapshot summary and "original auto values" panel.

## 6. Alerts inbox — `src/pages/conduct/ConductAlerts.tsx`

- Columns: kind, severity, title, complaint link, licensee, product, channel, category, status, created_at.
- Actions: acknowledge, close (close on rule-generated alerts requires override reason). Audit each status change.

## 7. Dashboard — `src/pages/conduct/ConductDashboard.tsx`

- Filters: date window, product, channel, category, licensee, severity, priority, customer_type, vulnerability, alert_status.
- KPIs: total, open, critical, vulnerable, SLA breached, SLA at-risk, open alerts, repeat complaints. All from live queries.

## 8. Navigation — `src/config/navigation.tsx`

Add group "Market Conduct" (internal/admin, permission `complaint_management` or `market_conduct` consistent with existing):
- Market Conduct Dashboard → `/conduct`
- Conduct Alerts → `/conduct/alerts`
- Risk Taxonomy → `/admin/conduct/risk-taxonomy`
- Products & Channels → `/admin/conduct/products-channels`
- Triage Rules → `/admin/conduct/triage-rules`

## 9. Supabase types

Regenerate `src/integrations/supabase/types.ts` post-migration to include new tables/columns; remove unnecessary `as any` where types now cover.

## 10. Verify

- `npm run build` (fix errors).
- Manual smoke via Playwright: submit complaint → confirm triage row + audit event + alerts.
- Report per acceptance checklist.

## Technical notes

- Use `logAudit` for UI-side events; edge function writes directly to `conduct_triage_audit_events` with service role.
- Dedupe: `INSERT ... ON CONFLICT (dedupe_key) WHERE status='open' DO NOTHING`.
- Thematic spike threshold source: `conduct_alert_thresholds` (existing table).
- Keep `verify_jwt=false` default for the edge function; validate `complaint_id` shape.
- No changes to existing complaint intake/investigation/correspondence/enforcement flows beyond the insert-select + post-invoke.

## Out of scope

- Cron-based thematic sweep (current per-complaint check is sufficient for acceptance).
- New portals or replacing existing complaint pages.
