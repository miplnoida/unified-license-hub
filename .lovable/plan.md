
# Complaints Module — Production Hardening (Phase 2)

Backward-compatible completion of the refactor. No UI redesign, no feature removal.

## 1. Backend (single migration + edge functions)

### 1a. Schema
- `complaints`: add `closed_at timestamptz`, `closed_by uuid`, `closure_reason text`, `closure_category text`, `severity_override_reason text`, `severity_overridden_by uuid`, `severity_overridden_at timestamptz`.
- New `complaint_escalation_rules` (name, criterion enum: harm|age|risk_rating|volume|recurrence, threshold jsonb, target_tier, enabled, priority, timestamps).
- New `complaint_escalation_cases` (complaint_id, rule_id, severity, status: pending|escalated|dismissed|resolved, triggered_at, decided_at, decided_by, notes).
- New `complaint_escalation_log` (rule_id, complaint_id, matched_at, snapshot jsonb).
- New `complaint_duplicate_rules`, `complaint_duplicate_pairs` (a_id,b_id,score,dimension,status pending|linked|merged|dismissed,decided_by,decided_at), `complaint_duplicate_clusters` (dimension, key, member_ids[]).
- All tables: GRANT to authenticated + service_role, RLS by regulator/permission via `has_complaint_perm`, `updated_at` trigger.

### 1b. RPCs (SECURITY DEFINER, permission-checked, audited)
- `update_complaint_severity(id, severity, reason)` — replaces direct updates; logs override.
- `create_complaint(payload jsonb)` — server-side intake (dedupe validation, SLA fill, notifications).
- `close_complaint(id, reason, category)` — enforces reason; sets closed_at/closed_by.
- `list_complaints(filters jsonb, sort, page, page_size, search)` — server-side paginate/filter/sort/search (regulator + assigned + severity + status + type + date + SLA + free-text ILIKE on ref/title/consumer). Returns `{rows, total, facets}`.
- `complaints_analytics(filters jsonb)` — totals, by_status, by_severity, by_type, by_sla_bucket (using shared SLA), avg_resolve_hours, breached_count, trend (daily buckets). Late-resolved counted as breached.
- `complaint_sla_status(created_at, sla_due_at, sla_days, resolved_at)` — canonical SQL SLA (breached | at_risk | on_track | resolved_late | resolved_on_time). Used by list, analytics, dashboard.
- `list_escalation_cases`, `decide_escalation_case(id, decision, notes)`, `upsert_escalation_rule`, `toggle_escalation_rule`, `run_escalation_sweep()` — evaluates enabled rules against open complaints and inserts cases/logs.
- `detect_complaint_duplicates(complaint_id?)`, `list_duplicate_pairs(filters)`, `decide_duplicate_pair(id, action: link|merge|dismiss)`, `list_duplicate_clusters(dimension)`, `upsert_duplicate_rule`, `toggle_duplicate_rule`.
- All RPCs raise on missing permission and write to `audit_logs`; each lifecycle RPC enqueues notification via existing dispatch table.

### 1c. Edge function
- `evaluate-complaint-triage` already hardened — extend to call `run_escalation_sweep` post-triage.
- Add scheduled sweep (daily) invoking `run_escalation_sweep` and `detect_complaint_duplicates`.

## 2. Shared SLA service (frontend)
- Replace `src/lib/complaintsSla.ts` with a thin wrapper that (a) mirrors the SQL logic exactly, (b) treats `resolved_at > sla_due_at` as `breached` (was `resolved`), returning a new `resolved_late` state that maps to destructive variant.
- All consumers — `ComplaintsList`, `ComplaintDetail`, `ComplaintEvidenceRow`, `ConductDashboard`, `ComplaintsAnalytics`, reports — import from this one module. No component recomputes SLA from raw fields elsewhere.
- Dashboards/analytics prefer the server-computed bucket from RPCs; the JS helper is only for optimistic UI on a single already-fetched row.

## 3. Frontend rewiring

### `ComplaintsList.tsx`
- Data via `list_complaints` RPC with URL-synced `page`, `pageSize`, `sort`, `search`, filters. Pagination controls added; no client-side slicing of full result set.
- Remove all `computeSlaStatus` inline usages except through shared service.
- `handleCreate` → `create_complaint` RPC.
- No `.update()` on complaints anywhere — status via lifecycle RPCs, severity via `update_complaint_severity`.

### `ComplaintDetail.tsx`
- Severity change + inline override → `update_complaint_severity(id, sev, reason)`; prompt user for reason (required).
- Close action requires reason + category select before submit; calls `close_complaint`.
- Remove remaining `.from('complaints').update(...)`.

### `ConductClassificationCard.tsx`
- Classification save → new `classify_complaint(id, payload)` RPC (permission `complaint_management.triage`).

### `ComplaintsAnalytics.tsx`
- Replace client aggregation with `complaints_analytics` RPC. Add date range + regulator/sector/type/severity filters. Proper `isError` state; failed query renders error card, not empty zeros.

### Escalation hub (`src/pages/complaints/escalations/*`)
- Delete `mockData.ts`. `EscalationHub`, `EscalationQueueTable`, `TriggeredRulesLog`, `EscalationRulesAdmin` all use RPCs above via TanStack Query.
- KPI stats derived from `list_escalation_cases({status_counts:true})`.
- Rules editor writes through `upsert_escalation_rule` / `toggle_escalation_rule`.
- Restore `EscalationBanner` — query `list_escalation_cases({status:'pending', limit:1})` and render live count, not null.

### Duplicate hub (`src/pages/complaints/duplicates/*` + banner)
- Delete `seed.ts`. `SuspectedDuplicatesTable`, `ClusterGroupsPanel`, `DetectionRulesPanel`, `DuplicateDetectionHub` all use RPCs.
- Restore `DuplicateAlertBanner` with live pending pair count.
- Actions (link/merge/dismiss, rule toggle) call RPCs; success invalidates queries.

### Error handling standard
- Every query passes `throwOnError`; components render explicit error card with retry — never a silent empty table.
- Mutation errors go through `toast` + AppError typing from `src/platform`.

## 4. Cleanup / dedup
- Remove duplicate SLA math in `ComplaintsList` (3 sites), `ComplaintEvidenceRow`, and dashboard hooks — import shared helper.
- Remove duplicate notification dispatch in `ComplaintsList.handleCreate` (now server-side inside `create_complaint`).
- Remove any client-side status-transition tables; rely on `canTransitionComplaint` from `complaintStatus.ts` for UI gating only.
- Delete unused imports and legacy handlers left behind by prior refactor.

## 5. Verification (post-implementation grep gates)
Run these and require zero matches (except in tests) before closing:
```
rg "from\(['\"]complaints['\"]\)\.update" src/
rg "seedPairs|seedClusters|seedRules|MOCK_CASES|MOCK_RULES|MOCK_COMPLAINTS" src/pages/complaints src/components/complaints
rg "computeSlaStatus\(" src/pages src/components  # only allowed inside src/lib/complaintsSla
rg "from\(['\"]complaints['\"]\)\.select\(\*\)" src/pages/complaints/ComplaintsAnalytics.tsx
```
Plus: manual smoke — list pagination, severity override with reason, close with reason, analytics with date filter, escalation rule toggle+sweep, duplicate decide, unauthenticated triage retry rejected (401), late-resolved complaint shows `breached` across list/detail/analytics/dashboard.

## Technical details
- All new tables use `gen_random_uuid()` PKs, `created_at`/`updated_at` with trigger.
- RPCs use `SET search_path = public` + `SECURITY DEFINER`; each begins with `perform assert_complaint_perm(auth.uid(), '<action>')`.
- `list_complaints` uses keyset-friendly `ORDER BY` on indexed columns; adds indexes on `(regulator_id, status, created_at)` and `(assigned_to, status)`.
- Analytics RPC returns typed JSON; frontend uses `z.infer` schema for parsing.
- Notifications reuse existing `notification_dispatch_log` insert pattern via helper function `notify_complaint_event(complaint_id, event)`.
- No changes to `client.ts`, `types.ts`, or `.env`. `types.ts` regenerates automatically after migration approval.
