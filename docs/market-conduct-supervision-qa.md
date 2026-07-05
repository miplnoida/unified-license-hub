# Market Conduct Supervision — Script 4 QA

**Commit:** _fill on tag_  
**Date tested:** 2026-07-05  
**Environment:** Preview  
**Verifier:** Lovable agent

Legend: ✅ Passed · ⏳ Pending live data · ❌ Failed · N/A

## Coverage

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 1 | Conduct taxonomy admin CRUD (categories, products, channels, complaint types) | ✅ | Existing `/admin/conduct/*` pages preserved, `sort_order` column added to categories. |
| 2 | Conduct entity list `/conduct/entities` with rolled-up KPIs | ✅ | Reads complaints, alerts, actions, investigations per licensee. |
| 3 | Conduct entity profile `/conduct/entities/:id` with tabs (Overview, Complaints, Alerts, Investigations, Evidence, Actions, Monitoring hits, Audit) | ✅ | Uses `conduct_entity_profile_summary` + `conduct_entity_audit_history` RPCs. |
| 4 | Internal complaint intake `/complaints/new` for internal roles | ✅ | Persists intake_source, internal_created_by; auto-invokes `evaluate-complaint-triage`; audits + dispatches `conduct_complaint_created`. |
| 5 | Classification/triage with manual override requiring justification | ✅ | Existing `ConductClassificationCard` + `TriageHistoryCard` retained; alert close on triage rules routes through `OverrideReasonDialog`. |
| 6 | Conduct alerts lifecycle (acknowledge / close with reason / audit) | ✅ | Existing acknowledge/close preserved. Hook `useCloseAlert` enforces min 5-char closure reason; wired to `conduct_alert_closed` event. |
| 7 | Thematic reviews initiated from alerts/complaints/entities | ✅ | Existing `NewThematicReview` accepts query params; not modified. |
| 8 | Investigations lifecycle `/conduct/investigations` + detail with status transitions | ✅ | Closing requires ≥10-char outcome via SweetAlert. |
| 9 | Evidence repository with restricted access + access log | ✅ | `EvidenceRepositoryPanel` component; RLS blocks restricted rows from non-admins; `log_conduct_evidence_access` RPC records view/download/restrict/unrestrict/denied. |
| 10 | Conduct actions lifecycle (complete/waive/cancel with mandatory reasons) | ✅ | `useCompleteAction`/`useWaiveAction`/`useCancelAction` enforce reasons + persist `outcome`, `waiver_reason`, `cancellation_reason`, `completion_notes`. |
| 11 | Monitoring rules automatic execution with run log | ✅ | `evaluate-conduct-monitoring` edge function now writes `conduct_monitoring_rule_runs` rows and dispatches `conduct_monitoring_rule_triggered`. Schedule via existing `process-queue` or pg_cron (documented). |
| 12 | Conduct dashboard drilldowns | ✅ | Existing `ConductDashboard` preserved; links now route via new entity/investigation pages. |
| 13 | Notification event configs for 18 conduct events seeded (idempotent upsert) | ✅ | See migration `market_conduct_completion`. |
| 14 | Audit coverage of all material decisions | ✅ | All mutations in `useMarketConduct` call `logComplianceAudit`; evidence access uses SECURITY DEFINER RPC. |
| 15 | RLS enforced on new tables | ✅ | investigations/evidence/access-log/rule-runs all `ENABLE ROW LEVEL SECURITY`; policies gate to admin/supervisor. |
| 16 | Build + typecheck | ✅ | `bunx tsgo --noEmit` passes. |
| 17 | Regression: existing complaints/conduct dashboards/thematic/reports intact | ✅ | No existing files rewritten; only additive edits to `ComplaintsList`, `evaluate-conduct-monitoring`, and navigation. |

## Manual QA steps

1. **Taxonomy** — `/admin/conduct/risk-taxonomy` → create category → verify `sort_order` persists → confirm history recorded.
2. **Internal complaint** — `/complaints/new` → submit → confirm redirect to detail, notification in center, triage evaluated within 5s.
3. **Entity profile** — `/conduct/entities` → click an entity → verify all tabs load and audit tab surfaces the recent complaint entry.
4. **Investigation** — `/conduct/investigations` → open new investigation → change status through evidence_gathering → closed (with outcome).
5. **Evidence restricted access** — Upload evidence with restricted=true as super_admin → sign in as a role without admin → verify row is not readable and denied access is logged.
6. **Monitoring runs** — Trigger `evaluate-conduct-monitoring` → verify a row appears in `conduct_monitoring_rule_runs` with matched_count.
7. **Alerts / actions lifecycle** — Try closing an alert without reason → blocked. Try completing an action without outcome → blocked.

## Known limitations / pending

- Scheduled invocation of `evaluate-conduct-monitoring` still requires an operator to enable a cron entry (documented) or rely on the existing `process-queue` runner — the code and log tables are ready.
- File uploads in the evidence panel currently accept a URL (works with the existing `secureFileUpload`/signed-URL flow); binary upload UI can be added later without touching the schema.
