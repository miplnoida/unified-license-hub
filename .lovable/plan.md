
## Phase 9 — Thematic Reviews, Conduct Action Ledger & Ongoing Monitoring

Extends the existing Market Conduct module (`ConductDashboard`, `ConductAlerts`, `conduct_triage_rules`, `entity_risk_scores`) without touching complaint triage. All new work is additive.

### Slice 9.1 — Schema (single migration)

Nine new tables, all with grants (`authenticated` + `service_role`), RLS via `has_role()`, `updated_at` triggers, and audit-friendly columns.

- **`thematic_reviews`** — `id, code (auto, TR-YYYY-####), title, description, regulator_id, lead_officer_id, risk_category_id, status` (enum below), `scope_start, scope_end, methodology jsonb, hypothesis, closure_summary, created_by, opened_at, closed_at`.
- **`thematic_review_status_history`** — immutable log: `review_id, from_status, to_status, changed_by, changed_at, reason, override_id (nullable → rule_overrides)`.
- **`thematic_review_entities`** — `review_id, licensee_id, inclusion_reason, sample_weight, added_by`.
- **`thematic_review_products`** — `review_id, product_id, channel_id (nullable), notes`.
- **`thematic_review_findings`** — `id, review_id, licensee_id (nullable = thematic-wide), severity (low/medium/high/critical), title, detail, root_cause, evidence_summary, status (draft/issued/accepted/disputed/closed), issued_at, issued_by`.
- **`thematic_review_evidence`** — `review_id, finding_id (nullable), file_upload_id (→ file_uploads), source_type (complaint/return/inspection/document/external), source_ref, notes, collected_by, collected_at`.
- **`thematic_review_actions`** — `id, review_id, finding_id (nullable), licensee_id (nullable), action_type (remediation/mis/enforcement_referral/policy_change/monitoring), title, description, due_date, status (open/in_progress/completed/overdue/waived), assigned_to, assigned_team, completed_at, evidence_of_completion, waiver_override_id`.
- **`conduct_actions`** — cross-module ledger. `id, source_module` (complaint/thematic_review/inspection/breach/manual), `source_id, entity_id, product_id, action_type, title, description, due_date, status, assigned_to, enforcement_action_id (nullable), created_by, closed_by, closed_at`. Central "one place to see every conduct commitment".
- **`conduct_monitoring_rules`** — `id, name, description, scope (entity/product/thematic), rule_type (metric_threshold/complaint_volume/action_overdue/repeat_finding), definition jsonb (fields+ops mirroring triage rules), frequency (daily/weekly/monthly), risk_delta numeric, active, created_by`.
- **`conduct_monitoring_results`** — `id, rule_id, entity_id, product_id (nullable), thematic_review_id (nullable), evaluated_at, matched bool, metrics jsonb, alert_id (nullable → conduct_alerts), risk_delta_applied numeric, notes`.

Triggers:
- `trg_thematic_status_history` — INSERT into `thematic_review_status_history` on any `thematic_reviews.status` change, validating allowed transitions per the lifecycle (Draft→Scoped→Evidence Collection→Analysis→Findings Issued→Actions Required→Monitoring→Closed; backward moves require `override_id`).
- `trg_action_overdue_alert` — on `thematic_review_actions` / `conduct_actions` UPDATE, when `due_date < now()` and status not terminal, insert a `conduct_alerts` row (`kind='action_overdue'`, race-safe dedupe by SHA-1 of `action_id`).
- `trg_thematic_action_ledger_sync` — INSERT/UPDATE on `thematic_review_actions` mirrors to `conduct_actions` (`source_module='thematic_review'`).
- `trg_monitoring_risk_feedback` — on `conduct_monitoring_results` INSERT where `matched=true`, upsert into `entity_risk_scores` for current period: adds `risk_delta` into a new `components.monitoring` bucket, recomputes `score` and `band`, sets `is_current=true`, previous period rolled to `is_current=false`.

### Slice 9.2 — Edge Functions

- **`evaluate-conduct-monitoring`** — invoked by cron and on-demand. Loads active rules, evaluates per scope, writes `conduct_monitoring_results`, creates alerts (race-safe SELECT-then-INSERT against `conduct_alerts` partial index), and lets the feedback trigger update risk scores.
- **`thematic-review-transition`** — server-side status transition endpoint that validates prerequisites (e.g. Analysis → Findings Issued requires ≥1 issued finding; Actions Required → Monitoring requires ≥1 monitoring rule linked; Closed requires all actions terminal). Backward moves require an `override_id` created via the existing override framework.
- **`overdue-action-sweep`** — nightly cron: marks `thematic_review_actions` / `conduct_actions` as `overdue` when past `due_date`, ensures alerts exist. Uses `pg_cron` + `pg_net` (registered via `supabase--insert`, not migration).

### Slice 9.3 — Front-end

Routes registered in `src/routes/dashboardRoutes.tsx` under `supervision` module:
- `/supervision/thematic-reviews` — list with filters (status, regulator, lead officer, risk category, date range), KPI strip (open, overdue actions, findings this quarter), "New Review" CTA.
- `/supervision/thematic-reviews/new` — 4-step wizard: (1) Basics + regulator + lead officer, (2) Scope (period, hypothesis, methodology JSON editor with template), (3) Entities & Products pickers (reuse existing licensee/product selectors), (4) Review & Create (creates as Draft).
- `/supervision/thematic-reviews/:id` — detail with tabs:
  - **Overview** — meta, lifecycle stepper, status transition button (calls edge fn), history timeline.
  - **Scope** — entities & products (add/remove; audit logged).
  - **Evidence** — upload/link evidence, reuse `file_uploads` and `secure-download-file`.
  - **Findings** — CRUD, issue/accept/dispute/close.
  - **Actions** — CRUD, mark complete with evidence, waive via `OverrideReasonDialog` (`rule_key='thematic.action.waive'`).
  - **Monitoring** — link `conduct_monitoring_rules`, view `conduct_monitoring_results`, "Run now" button.
  - **Audit** — `HistoryButton` + inline status history + related `audit_logs`.
- `/conduct/actions` — unified conduct action ledger (all sources), filters by source module, entity, status, assignee, overdue.
- `/admin/conduct/monitoring-rules` — CRUD for `conduct_monitoring_rules`, mirroring existing `TriageRules.tsx` UX (fields, operators, dropdowns, JSON output, simulator).

Sidebar (under Supervision): "Thematic Reviews", "Conduct Actions". Admin Hub gains "Conduct Monitoring Rules".

### Slice 9.4 — Audit, Override & Alert wiring

- Every mutation on reviews / findings / actions / evidence / monitoring rules calls `logAudit` with `old_status`, `new_status`, actor, related IDs.
- Backward status moves, action waivers, and closing a review with open findings all go through `OverrideReasonDialog` and record an `override_id` on the resulting row (`thematic_reviews.status_history`, `thematic_review_actions.waiver_override_id`).
- Overdue alerts feed `conduct_alerts` (kind `action_overdue`) and appear in existing `/conduct/alerts` and Executive Dashboard/Alert Center.
- `conduct_monitoring_results` matches raise `conduct_alerts` (kind `monitoring_match`) and adjust `entity_risk_scores.components.monitoring`, so the existing risk heatmap immediately reflects the feedback loop.

### Slice 9.5 — Verification (before commit)

- `tsgo --noEmit` clean.
- `supabase--linter` clean on new tables.
- Playwright smoke: create review → advance through each status → attempt invalid transition (expect blocked) → waive an action (override captured) → run monitoring rule → confirm `entity_risk_scores` delta and new alert.

### Technical notes

- All new tables carry `regulator_id` where applicable and scope RLS through `has_role()` (`admin`, `super_admin`, `supervisor`, `analyst`, `legal_compliance`) — no `anon` grants.
- Enum for review status implemented as a `text` column + CHECK-free trigger (per project convention) to avoid brittle enum migrations.
- Monitoring rule engine reuses the FIELDS/OPS pattern from `TriageRules` so operators feel identical.
- No changes to complaint triage, existing conduct alerts schema, or risk-scoring weights table — additive only.

### Rollout order

9.1 schema → 9.3 UI list/detail/wizard → 9.2 edge functions → 9.3 monitoring rule admin & ledger page → 9.4 alerts/overrides → cron registration → 9.5 verification.
