# Script 4 — Market Conduct Supervision: Completion Plan

Additive-only work to close remaining gaps after commit `08189e3`. No rewrites, no removal of working functionality.

## 1. Internal Complaint Intake (ComplaintsList fix)

- `src/pages/complaints/ComplaintsList.tsx`: show a **File Internal Complaint** button for internal users (in addition to existing external "File Complaint" for non-internal users). Route to existing `NewInternalComplaint` page.
- `src/pages/complaints/NewInternalComplaint.tsx`: extend form to include remaining fields — product, channel, conduct risk category, customer type, vulnerable customer flag+notes, manual severity, `source_channel` (internal / supervisory_observation / whistleblower / consumer / industry_referral / other), incident date, attachments/evidence link.
- On submit: persist → invoke `evaluate-complaint-triage` → audit `conduct_complaint_created_internal` → dispatch `conduct_complaint_created` (+ `conduct_high_severity_complaint` when severity ∈ high/critical) → invalidate list/dashboard/alerts queries.
- Validation: subject, description, entity (unless anonymous), source channel required.

## 2. Entity Universe + Profile Enhancements

- Routes already exist (`/conduct/entities`, `/conduct/entities/:id`). Extend rather than replace:
  - Extend `conduct_entity_profile_summary` RPC to return: repeat complaint count, vulnerable customer count, open investigations, active thematic reviews, monitoring rule hits, latest complaint date, latest action outcome, derived risk level.
  - Add new RPC `conduct_entity_universe` returning aggregate row per licensee for the list page (avoids client N+1).
  - `ConductEntitiesList`: add filters (search, sector/subsector, product, channel, category, severity, risk level, alert status, open-only, vulnerable flag) and new columns.
  - `ConductEntityProfile`: add missing tabs — **Classification/Triage History**, **Thematic Reviews**, **Notifications**. Wire buttons on Alerts tab: create action, initiate thematic review, escalate → investigation.

## 3. Formal Investigations (complete lifecycle)

- Table `conduct_investigations` already exists. Add missing columns via safe migration if absent: `priority`, `closure_reason`, `outcome`, `opened_by`, `closed_by`, `closed_at`.
- Entry points: add "Open Investigation" button on complaint detail, conduct alert row, thematic review detail, entity profile.
- `InvestigationDetail`: add status transitions (opened → evidence_gathering → analysis → proposed_outcome → closed), assign investigator, notes, task linkage (reuse `complaint_investigation_tasks` via `investigation_id` if column exists, else add nullable FK), evidence panel, create-conduct-action button, close-with-outcome enforcement.
- Audit + notifications: `conduct_investigation_opened/assigned/closed`.

## 4. Secure Evidence Repository

- `conduct_evidence` exists. Add columns if missing: `evidence_type` enum-like text (document/screenshot/correspondence/call_record/transcript/internal_note/external_file/other), `confidentiality_level` (internal/restricted/confidential/public_summary), `status` (active/archived), `external_reference`.
- `EvidenceRepositoryPanel`: add upload (reuse existing Supabase storage bucket used by documents), download via signed URL (5-min per project standard), edit metadata, restrict/unrestrict, archive.
- Access: reuse `log_conduct_evidence_access` RPC; on denied access call `logSecurityEvent` + dispatch `conduct_evidence_access_denied`.
- Mount panel on: complaint detail, investigation detail, entity profile, thematic review detail.

## 5. Conduct Actions Lifecycle

- `conduct_actions` exists with waiver/outcome fields. Add if missing: `assigned_team`, `started_at`, sweep-friendly `overdue` derivation (via view or scheduled fn).
- `useMarketConduct` already has close/waive guards. Add: `useStartAction`, `useCancelAction` (reason required), `useReferToEnforcement`.
- `ConductActions.tsx`: add Start / Complete / Waive / Cancel / Refer buttons, dialogs enforcing required reason fields.
- Reusable `CreateConductActionDialog` mountable from: complaint, alert, investigation, entity profile, thematic review, monitoring rule hit, dashboard trend.
- Scheduled edge function `sweep-conduct-actions` (pg_cron nightly) marks overdue + dispatches `conduct_action_overdue`.
- Notifications: assigned/overdue/completed.

## 6. Thematic Review Lifecycle

- Reuse existing `thematic_reviews`, `thematic_review_entities`, `thematic_review_products`, `thematic_review_findings`, `thematic_review_actions`, `thematic_review_evidence`, `thematic_review_status_history` tables.
- Add `useThematicReviews` hook (create/update scope/add-entity/add-finding/link-evidence/close-with-conclusion, with audit + notifications).
- New pages: `ThematicReviewsList` (`/conduct/thematic-reviews`) and `ThematicReviewDetail` (`/conduct/thematic-reviews/:id`).
- "Initiate Thematic Review" entry points: conduct alert, entity profile, complaint detail (pattern), dashboard trend, monitoring rule hit.
- Notifications: `conduct_thematic_review_created/assigned/closed`.

## 7. Monitoring Rules Execution

- Tables `conduct_monitoring_rules`, `conduct_monitoring_rule_runs`, `conduct_monitoring_results` exist. Add missing columns if absent: `dedupe_key`, `dedupe_window_minutes`, `execution_frequency`, `active` (default true).
- Extend `evaluate-conduct-monitoring` edge function: dedupe alerts by `(rule_id, entity_id, dedupe_key)` within window; persist matched vs alert-created counts; dispatch `conduct_monitoring_rule_triggered`.
- pg_cron scheduled run (15-minute cadence) via existing `pg_cron`/`pg_net` pattern — NOTE per project rules use `supabase--insert` (not migration) for the cron insert since it embeds function URL / anon key.
- New pages: `/conduct/monitoring-rules` (list + Run Now + toggle active), `MonitoringRuleDetail` with execution history and hit drilldown.
- Wire monitoring-hit tab in entity profile + dashboard KPI.

## 8. Conduct Alerts Hardening

- `ConductAlerts.tsx`: add Assign, Escalate, Create Action, Initiate Thematic Review, Open Investigation, View Source buttons. Enforce override justification when closing high/critical without linked action.
- Alert detail drawer/page showing source + related actions/reviews/investigations.
- Audit + notifications on create/ack/close/escalate.

## 9. Notification Event Configs

Safe migration (`ON CONFLICT (event_type) DO NOTHING`) seeding all events in the list (18 configs). Reuse `notification_event_configs` schema + `dispatch-notification-event` infra. Recipients per project convention (assigned user, supervisor/admin roles, sector regulators; never entity users for restricted internal events).

## 10. Audit Coverage

Wire `logComplianceAudit` / `logAudit` / `logSecurityEvent` at every material transition listed in the request (complaint lifecycle, alert lifecycle, investigation, evidence, action, thematic review, monitoring rule). Reuse existing helpers — no parallel audit system. Capture before/after where practical.

## 11. Dashboard Enhancements

Extend `ConductDashboard.tsx` (do not replace):
- Add KPIs: vulnerable customer complaints, repeat complaints, overdue actions, active investigations, active thematic reviews, monitoring hits, recent evidence uploads.
- Drilldowns from every KPI/chart to filtered list.
- Trend cards expose "Create Alert / Initiate Thematic Review / Create Action / Open Entity Profile" quick actions.
- Add aggregate RPC `conduct_dashboard_summary` for heavy metrics.

## 12. Permissions & RLS

- Verify `market_conduct`/`conduct_management` permission gates all new routes (`/conduct/entities*`, `/conduct/thematic-reviews*`, `/conduct/monitoring-rules*`) in `dashboardRoutes.tsx`.
- Confirm RLS on new/updated tables: internal-only for investigations/evidence/monitoring; restricted evidence limited to elevated roles.
- Denied access → `logSecurityEvent` + notification.

## 13. Migration Safety

Single additive migration file using:
- `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`
- `CREATE OR REPLACE FUNCTION`
- `CREATE POLICY` guarded via `pg_policies` existence check DO-block
- `ON CONFLICT` seeds for notification configs
- Standard grants (`authenticated`, `service_role`) per project convention
- Enable RLS on any new table
- Cron insert done via `supabase--insert` (not migration)

## 14. Build / Typecheck / CI

- Run `bun run build` and `bunx tsgo --noEmit`; fix breakages.
- `.github/workflows/ci.yml` already exists — verify unchanged and green.

## 15. QA Doc

Update `docs/market-conduct-supervision-qa.md` with commit SHA, date, environment, verifier, and the full checklist marked with real statuses (Passed / Pending live-data / Failed / N/A). Include regression notes for prudential/returns/F&P/licensing/complaints.

## Technical Details

- New/modified files (indicative):
  - **Migration**: `supabase/migrations/<ts>_market_conduct_completion_v2.sql`
  - **Edge functions**: extend `evaluate-conduct-monitoring/index.ts`; new `sweep-conduct-actions/index.ts`
  - **Hooks**: extend `src/hooks/useMarketConduct.ts`; new `src/hooks/useThematicReviews.ts`, `src/hooks/useConductMonitoring.ts`
  - **Pages**: extend `ConductEntitiesList`, `ConductEntityProfile`, `ConductAlerts`, `ConductActions`, `ConductDashboard`, `InvestigationDetail`, `Investigations`, `ComplaintsList`, `NewInternalComplaint`; new `ThematicReviewsList`, `ThematicReviewDetail`, `MonitoringRulesList`, `MonitoringRuleDetail`
  - **Components**: `CreateConductActionDialog`, `CreateThematicReviewDialog`, `OpenInvestigationDialog`, `AlertDetailDrawer`, extended `EvidenceRepositoryPanel`
  - **Config**: extend `src/config/navigation.tsx`, `src/routes/dashboardRoutes.tsx`
  - **Docs**: refresh `docs/market-conduct-supervision-qa.md`
- Cron scheduling uses `supabase--insert` (embeds project URL + anon key — not for migration).
- Notification dispatch always via existing `dispatch-notification-event` edge; never toast-only.
- All new tables get `GRANT` + RLS + policies in the same migration block.

## Explicitly NOT Changing

Returns submission/validation/ratios/breaches, prudential module, fit & proper, licensing, registration, workflow engine core, notifications infra, auth, existing complaint schema, existing conduct dashboard base visuals, existing risk taxonomy/product/channel/triage admin CRUD, existing `evaluate-complaint-triage` function.
