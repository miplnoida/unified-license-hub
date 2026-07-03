# Phase 8 — Market Conduct Supervision

Extends existing complaint handling (`ComplaintsList`, `ComplaintDetail`, investigation, correspondence, enforcement escalation) without replacing any page. All new admin pages follow the existing `/admin/*` + AdminHub pattern and reuse `HistoryButton` + `OverrideReasonDialog` from the universal audit framework.

## 8.1 — Conduct Risk Taxonomy

New table `conduct_risk_categories` (code, name, parent_id nullable for 2-level hierarchy, description, severity_hint, active, regulator_id).

- Admin page `/admin/conduct/risk-taxonomy` — tree view, CRUD, activate/deactivate.
- Seeded with standard categories: Mis-selling, Unfair Terms, Disclosure Failure, Complaint Handling, Data Privacy, Vulnerable Customer Treatment, Fees & Charges, Advertising, Sales Conduct.
- `HistoryButton` on each row (entity_type=`conduct_risk_category`).

## 8.2 — Product & Channel Registry

Two tables:
- `conduct_products` (code, name, sector_id, sub_sector_id, description, active).
- `conduct_channels` (code, name, kind: `digital|branch|agent|call_center|broker|other`, description, active).

Admin page `/admin/conduct/products-channels` with two tabs. Reuses `DataTableShell`.

## 8.3 — Complaint enrichment

Add columns to `complaints`:
- `conduct_risk_category_id uuid` FK
- `product_id uuid` FK
- `channel_id uuid` FK
- `customer_type text` (`retail|sme|corporate|vulnerable|other`)
- `vulnerability_indicator boolean` + `vulnerability_notes text`
- `repeat_complaint_count int default 0` (auto-computed from same complainant+licensee in prior 12 months via trigger on INSERT)
- `priority text` (`p1|p2|p3|p4`), `assigned_team text`, `sla_days int`, `sla_due_at timestamptz`
- `triage_source text` (`manual|auto|override`), `triage_rule_id uuid` FK to conduct_triage_rules

UI:
- Extend `ComplaintDetail.tsx` header/side panel with a new **Conduct Classification** card (product, channel, risk category, customer type, vulnerability, priority, team, SLA countdown).
- Extend intake form (existing complaint create screen) with the same fields — pre-filled from triage rule if one matched.
- Any manual change to fields auto-populated by triage triggers `OverrideReasonDialog` with rule key `complaints.triage.<field>_override` (reuses the pattern already used for severity).

## 8.4 — Triage Rules admin

New table `conduct_triage_rules`:
- name, description, active, priority_order (lower = evaluated first)
- conditions JSONB — list of predicates over: complaint_type_id, product_id, channel_id, licensee_id, customer_type, vulnerability_indicator, repeat_complaint_count (op: >=), keywords (array, matched against subject+description).
- outputs: severity, priority, sla_days, assigned_team, conduct_risk_category_id.
- match_mode: `all|any`.
- regulator_id, created_by.

Admin page `/admin/conduct/triage-rules`:
- List with drag-to-reorder priority.
- Rule editor with conditions builder (rows of field/op/value) and outputs section.
- "Simulate" panel: paste sample complaint text + choose product/channel, see which rule matches.
- `HistoryButton` per rule.

## 8.5 — Triage Engine Edge Function

`supabase/functions/complaint-triage/index.ts`:
- Input: `{ complaint_id }` OR `{ preview: {...fields} }`.
- Loads active rules for the complaint's regulator ordered by priority_order.
- Evaluates conditions (keywords via case-insensitive contains on subject+description).
- On match: updates complaint with outputs, sets `triage_source='auto'`, `triage_rule_id`, `sla_due_at = now() + sla_days`.
- Emits `conduct_alerts` when outputs cross thresholds (see 8.6).
- Uses `log_compliance_audit_as_actor` for the auto-triage action; every change is captured in change history.
- Invoked from:
  - DB trigger on `complaints` INSERT (via `pg_net` async call) so intake auto-triages.
  - Manual "Re-run triage" button on `ComplaintDetail.tsx` (admin only).

Overrides: when a user edits a triage-populated field, front-end intercepts and calls `OverrideReasonDialog` before persisting.

## 8.6 — Conduct Alerts

New table `conduct_alerts`:
- complaint_id (nullable), licensee_id, product_id, channel_id, conduct_risk_category_id
- kind (`repeat_complaint|vulnerable_customer|critical_severity|thematic_spike|sla_breach`)
- severity, status (`open|acknowledged|closed`), title, detail JSONB
- generated_by (`triage_engine|thematic_sweep|manual`), acknowledged_by/at, closed_by/at.

Generation:
- Triage engine emits per-complaint alerts (repeat, vulnerable, critical).
- New Edge Function `conduct-thematic-sweep` (cron daily 04:00 UTC): counts complaints per (licensee, product, category) in trailing 30/90 days; opens `thematic_spike` alert when count exceeds configurable threshold in `conduct_alert_thresholds`.
- SLA-breach alerts opened by existing SLA cron path when complaint `sla_due_at` passes.

UI: `/conduct/alerts` inbox reusing `BreachInbox` layout patterns (list + severity filter + acknowledge/close actions with `OverrideReasonDialog` for `conduct.alert.no_action` when closing critical without resolution).

## 8.7 — Conduct Dashboard

Page `/conduct/dashboard` (visible to conduct/supervisor roles):
- KPI cards: Open complaints, Open alerts, Vulnerable-customer complaints, Avg triage time, SLA breach rate.
- Charts (Recharts): complaints by risk category, by product, by channel, trend last 12 weeks, top-10 licensees by conduct volume.
- Filters (sticky bar): date range, regulator, sector, product, channel, risk category, customer type, vulnerability, severity, priority.
- Drilldowns: clicking a chart segment routes to `ComplaintsList` pre-filtered via query params (`ComplaintsList` extended to read the new filter params).
- Link to alerts inbox and thematic sweep last-run status.

## Cross-cutting

- **Reuse**: `HistoryButton` on every new detail sheet; `OverrideReasonDialog` on every auto-triage field edit and alert closure without action; `ChangeHistoryDrawer` on rules, alerts, taxonomy entries.
- **RLS**: all new tables scoped by `regulator_id` via existing `has_role`/regulator context helpers; admin CRUD gated by `admin`/`super_admin`.
- **Grants**: full grant block for each new public table (authenticated + service_role).
- **Permissions module**: register `conduct_management` module with tabs `dashboard`, `alerts`, `triage_rules`, `taxonomy`, `products_channels`; wire into `permission_modules` seed and AdminHub.
- **Navigation**: sidebar group "Market Conduct" with Dashboard, Alerts, Complaints (existing link), Analytics (existing). Admin entries live under AdminHub → Conduct.
- **Audit coverage**: every insert/update in new tables goes through `log_compliance_audit_as_actor` (server) or `logAudit` (client) so `ChangeHistoryDrawer` shows a full trail.

## Rollout order

1. Slice A — tables + grants + RLS (taxonomy, products, channels, triage_rules, alerts, alert_thresholds, complaint enrichment columns + trigger) via one migration.
2. Slice B — admin pages: taxonomy, products/channels, triage rules (with simulator).
3. Slice C — triage edge function + INSERT trigger + ComplaintDetail integration (Conduct Classification card, re-run, override interception).
4. Slice D — alerts table wiring, thematic sweep function + cron, `/conduct/alerts` inbox.
5. Slice E — `/conduct/dashboard` + `ComplaintsList` filter param support + sidebar/AdminHub entries.

Each slice ends with `tsgo` typecheck and targeted Playwright smoke on the new routes.

## Non-goals

- No changes to existing complaint intake or investigation flows beyond additive fields.
- No new enforcement escalation path — reuse existing `enforcement_action_id` link.
- No new correspondence pipeline — reuse `SendCorrespondenceDialog`.
