# Script 4 — Market Conduct Supervision: Completion Plan

Additive-only completion of remaining Script 4 gaps. Existing conduct/complaint/thematic/monitoring/audit/notification/workflow modules stay intact.

## 1. Supabase migration (safe, additive)

Single migration `market_conduct_completion.sql` using `IF NOT EXISTS` / `ON CONFLICT` / `CREATE OR REPLACE`.

**New tables**
- `conduct_investigations` — source_type, source_id, licensee_id, product_id, allegation, assigned_investigator, status (`opened|evidence_gathering|analysis|proposed_outcome|closed`), priority, severity, due_date, outcome, closure_reason, opened_by, closed_by, timestamps.
- `conduct_evidence` — title, evidence_type, file_url/file_id, description, source, uploaded_by, uploaded_at, restricted (bool), confidentiality_level, plus nullable links: complaint_id, investigation_id, thematic_review_id, alert_id, action_id, entity_id.
- `conduct_evidence_access_log` — evidence_id, actor_id, action (`view|download|update|restrict|unrestrict|delete|denied`), reason, ip, ua, created_at.
- `conduct_monitoring_rule_runs` — rule_id, started_at, completed_at, executed_by (nullable = system), status, matched_count, alerts_created, error, summary jsonb.

**Additive columns (IF NOT EXISTS)**
- `complaints`: `intake_source` (`external|internal|whistleblower|supervisory|referral|industry|other`), `vulnerable_customer` bool, `repeat_indicator` bool, `internal_created_by` uuid.
- `conduct_alerts`: `acknowledged_by`, `acknowledged_at`, `closed_by`, `closed_at`, `closure_reason`, `assigned_to` (if missing).
- `conduct_actions`: `waiver_reason`, `cancellation_reason`, `completion_notes`, `outcome`, `closed_by` (backfill-safe).
- `conduct_risk_categories`: `sort_order` int.

**RLS**
- Enable RLS on all new tables.
- Internal-role policies via existing `has_role` / `user_dynamic_roles` pattern (module `market_conduct`).
- `conduct_evidence` restricted rows: only internal roles with `market_conduct.view_restricted_evidence`; denial logged into `conduct_evidence_access_log` from RPC.
- `conduct_evidence_access_log`: insert allowed to authenticated; select only to supervisors/admin.
- GRANTs to `authenticated` and `service_role` per project rule.

**RPCs (SECURITY DEFINER, search_path=public)**
- `log_conduct_evidence_access(_evidence_id, _action, _reason)` — writes to access log + compliance audit.
- `conduct_entity_profile_summary(_entity_id)` — returns counts (complaints open/high/repeat, alerts, actions, investigations, thematic reviews, latest risk rating).
- `conduct_entity_audit_history(_entity_id)` — unioned audit rows across complaint/alert/action/investigation/evidence/thematic for entity.

**Notification event configs (upsert via `ON CONFLICT (event_key)`)** — seed 17 keys listed in Script 4 §11 with title/message templates and in-app + email channels, active=true.

**Permission actions** — insert into `permission_actions` for `market_conduct` module: `manage_taxonomy`, `manage_monitoring_rules`, `view_restricted_evidence`, `create_investigation`, `close_investigation`, `override_triage`.

## 2. Edge functions

- **`evaluate-conduct-monitoring`** (existing): wrap each run with a `conduct_monitoring_rule_runs` insert (started → success/failed with matched_count, alerts_created, error). Dispatch `conduct_monitoring_rule_triggered` notification per matched rule. Idempotent dedupe already present.
- **`process-queue` / scheduled**: add `pg_cron` schedule row (via `supabase--insert`, not migration) invoking `evaluate-conduct-monitoring` every 15 min. Documented, not hardcoded to a demo interval.
- **New `create-internal-complaint`** edge function: server-side validation + audit + auto-trigger `evaluate-complaint-triage` + dispatch `conduct_complaint_created`. Used by internal intake page.

## 3. Frontend (additive pages/components)

**Taxonomy admin**
- Extend existing `admin/conduct/RiskTaxonomy.tsx` with `sort_order` field + drag order; add missing CRUD for severity definitions and complaint source/channel to existing `ProductsChannels.tsx` (new tabs, no rewrite).

**Conduct entities**
- `src/pages/conduct/ConductEntitiesList.tsx` — `/conduct/entities`. Table of licensees with conduct KPIs from summary RPC.
- `src/pages/conduct/ConductEntityProfile.tsx` — `/conduct/entities/:id`. Tabs: Overview, Complaints, Classification/Triage, Alerts, Investigations, Evidence, Actions, Thematic Reviews, Monitoring Hits, Notifications, Audit. Reuses existing list components filtered by `licensee_id`.

**Internal complaint intake**
- `src/pages/complaints/NewInternalComplaint.tsx` — `/complaints/new` (internal roles only via `PermissionGate`). Uses `create-internal-complaint` edge function.
- Add "New Internal Complaint" button on `ComplaintsList` visible only to internal `market_conduct.create` role.

**Investigations & evidence**
- `src/pages/conduct/Investigations.tsx` + `InvestigationDetail.tsx` — lifecycle + assignment + audit.
- `src/components/conduct/EvidenceRepositoryPanel.tsx` — upload (existing `secureFileUpload`), list, restrict toggle, view/download button that first calls `log_conduct_evidence_access` RPC; denied access shows toast + writes `denied` audit.
- Embed panel in ComplaintDetail, InvestigationDetail, ThematicReviewDetail, ConductEntityProfile.

**Alerts lifecycle**
- Extend `ConductAlerts.tsx` with Acknowledge / Close (with mandatory reason via SweetAlert2) / Escalate to Investigation / Create Action / Initiate Thematic Review buttons behind `PermissionGate`. All actions call existing dispatch + audit helpers.

**Actions lifecycle**
- Extend `ConductActions.tsx`: enforce completion_notes+outcome on Complete, waiver_reason on Waive, cancellation_reason on Cancel via dialogs. High-severity → offer "Refer to Enforcement" using existing enforcement action creator.

**Thematic reviews**
- Add "Create thematic review" button on alert row, entity profile, and dashboard trend cards — prefills `NewThematicReview` via query params (no page rewrite).

**Dashboard drilldowns**
- Add navigation handlers on `ConductDashboard.tsx` chart segments → filtered lists (query params on complaints/alerts/actions). No visual rewrite.

## 4. Hooks

New `src/hooks/useMarketConduct.ts` exposing:
- `useConductEntitySummary(id)`, `useConductEntityAuditHistory(id)`
- `useInvestigations`, `useCreateInvestigation`, `useUpdateInvestigation`
- `useEvidence(entityId?, sourceId?)`, `useUploadEvidence`, `useAccessEvidence` (calls RPC first)
- `useCreateInternalComplaint`
- `useAcknowledgeAlert`, `useCloseAlert`, `useEscalateAlert`
- `useCompleteAction`, `useWaiveAction`, `useCancelAction`
- `useMonitoringRuleRuns(ruleId?)`

All mutations wrap `logComplianceAudit` + `dispatchNotificationEvent` per project pattern (mirroring `usePrudentialSupervision`).

## 5. Navigation & permissions

- `src/config/navigation.tsx`: add "Entities" and "Investigations" under existing Conduct section (internal only).
- `src/lib/permissionModules.ts` / `permissionRegistry.ts`: register new actions.
- Route guards: all new `/conduct/*` routes wrapped in `<M module="market_conduct">`; `NewInternalComplaint` additionally gated by `create` action.

## 6. Audit coverage

Reuse `logComplianceAudit` (client + edge `_shared/audit.ts`) for every listed decision. Evidence access uses new RPC → compliance audit + access log. Denied access uses `logSecurityEvent`.

## 7. QA & CI

- `docs/market-conduct-supervision-qa.md` — checklist with Passed / Pending / Failed columns, commit SHA placeholder, manual test steps for each acceptance criterion.
- No CI change needed (existing `.github/workflows/ci.yml` already runs build + typecheck).
- Add vitest `src/test/marketConduct.test.ts` covering: internal complaint payload validation, evidence restricted access denial path, monitoring run log shape, alert lifecycle reason enforcement.

## Explicitly NOT changed
Returns, prudential, fit & proper, licensing, workflow engine, notification infra, auth, existing complaint schema/flows, existing conduct dashboard visuals, existing thematic review base pages.

## Deliverables
1. One safe additive migration.
2. One new edge function + updates to `evaluate-conduct-monitoring`.
3. New pages: ConductEntitiesList, ConductEntityProfile, Investigations, InvestigationDetail, NewInternalComplaint.
4. New components: EvidenceRepositoryPanel, alert/action lifecycle dialogs.
5. New hook `useMarketConduct.ts`.
6. Navigation + permission registry updates.
7. QA doc + minimal vitest coverage.
