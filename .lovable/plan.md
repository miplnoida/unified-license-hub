## Complaints Module Refactor — Production Hardening

Refactor the Complaints module for consistency, security, and backend-authoritative business logic. UI is preserved; only wiring, services, and RPCs change.

### 1. Canonical status model
- Enum: `submitted` → `under_investigation` → `resolved` → `closed` (plus `rejected`, `duplicate` for triage outcomes — kept if already used).
- Remove all "open" writes. Keep read-only "open bucket" filter (submitted + under_investigation) in list/dashboard filters — documented as a UI grouping, not a DB status.
- Single source: `src/lib/complaintStatus.ts` (labels, variants, bucket predicates, transitions map). All pages import from it.

### 2. Backend-authoritative lifecycle (new/updated RPCs)
Add SQL RPCs (SECURITY DEFINER, permission-checked):
- `create_complaint(payload jsonb)` — validates, generates `complaint_number` via sequence, inserts, triggers workflow, enqueues triage. Used by external submission edge + internal intake.
- `assign_complaint(id, assignee, team, reason)`
- `start_investigation(id)` — sets `under_investigation`, stamps investigator.
- `resolve_complaint(id, resolution, resolution_category)`
- `close_complaint(id, reason)`
- `retry_triage(id)` — invokes triage function server-side.
- `escalate_complaint_to_enforcement(id, note)` — transactional: inserts `enforcement_actions` row, links, updates complaint, writes audit + notification in one tx (BEGIN/EXCEPTION ROLLBACK inside the function).
Each RPC: checks `has_permission(auth.uid(), 'complaint_management', <action>)`, writes `audit_logs`, dispatches notifications via existing trigger/queue. Frontend replaces every `supabase.from('complaints').update(...)` with an RPC call.

Complaint number generation moves to DB (`nextval` + formatted `CMP-YYYY-######`). Remove any client-side number formatting.

### 3. Secure `evaluate-complaint-triage` edge function
- Require `Authorization` bearer; call `supabase.auth.getClaims(token)`; reject 401 on failure.
- Check user has `complaint_management.triage` (or `create` for auto-triage on new submissions from public endpoint — handled by a separate service-role internal call, not the same route).
- Split into two paths: authenticated internal `retry_triage` vs. server-invoked auto-triage (called from `create_complaint` RPC via `pg_net` or from a private wrapper edge fn using service role).
- Validate input with zod; return CORS-safe JSON; never leak internals.

### 4. Shared SLA service
- `src/lib/complaintsSla.ts` already exists — extend to a single module used everywhere. Mirror in SQL: `public.complaint_sla_status(created_at, sla_due_at, sla_days, resolved_at) returns text` for server-side aggregation parity.
- Replace all inline SLA math in `ComplaintsList`, `ComplaintDetail`, `ConductDashboard`, analytics, reports.

### 5. Server-side list/analytics
- New RPC `list_complaints(filters jsonb, page int, page_size int, sort text)` returning rows + total. Filters: status, licensee, sector, severity, sla bucket, date range, search. Enforces regulator scoping + permission.
- New RPC `complaints_analytics(filters jsonb)` returning aggregated counts, SLA buckets, by-category, by-institution, resolution times. Replaces client-side reducers in `ComplaintsAnalytics.tsx` and dashboard.
- `ComplaintsList` switches to paged fetch via TanStack Query with keepPreviousData; sorting/filtering triggers refetch, not client filter.

### 6. Validation & error handling
- Zod schemas for every create/update payload (frontend + edge).
- Replace `catch { return [] }` patterns with typed error surfacing via `AppError`/`invokeFn`; empty state only when query returns success with 0 rows.
- All RPCs raise `sqlstate` codes mapped in `platform/errors/messages.ts`.

### 7. Investigation, correspondence, attachments, notifications, audit
- Investigation tasks: move status changes to RPC `set_investigation_task_status`; enforce assignee/permission; audit each change.
- Correspondence: ensure `complaint_correspondence` insert goes through existing `send-correspondence` edge with recipient validation.
- Attachments: enforce 20MB + MIME allowlist server-side via `file_uploads` RLS + storage policy check (already partially in place — audit and close gaps).
- Notifications: consolidate into `notification_events` config rows for `complaint_submitted`, `complaint_assigned`, `investigation_started`, `complaint_resolved`, `complaint_closed`, `complaint_escalated`, `sla_at_risk`, `sla_breached`. Remove ad-hoc `notify(...)` calls from components; use DB triggers on `complaints` state changes.
- Audit: every RPC writes a single `audit_logs` row with before/after JSONB; drop redundant client-side `logAudit` calls that duplicate the trigger.

### 8. De-duplication of logic
Remove and replace:
- Client status updates in `ComplaintsList.tsx` (line 351-355), `ComplaintDetail.tsx` (126, 183, 199, 217) → RPC calls.
- Duplicate complaint-creation paths (`ComplaintsList` inline insert + `NewInternalComplaint` + public submission) → single `create_complaint` RPC / edge wrapper.
- Duplicate SLA math → shared module.
- Duplicate notify calls → DB-trigger driven.

### 9. Remove mock/demo data
- `src/pages/complaints/escalations/mockData.ts` and `duplicates/seed.ts`: replace with live queries.
  - Escalations: read from existing `coordination_escalations` + a new `complaint_escalation_rules` table (persisted rule config) and computed candidates via `list_complaint_escalation_candidates` RPC.
  - Duplicates: use `detect_complaint_duplicates(id)` RPC (pg_trgm similarity on subject/description scoped by licensee + complainant email/phone) instead of `seed.ts`.
- Keep the same UI components; swap data sources.

### 10. Permissions matrix (enforced server-side in every RPC + edge)
| Action | Permission key |
|---|---|
| view | complaint_management.view |
| create | complaint_management.create |
| edit | complaint_management.edit |
| assign | complaint_management.assign |
| investigate | complaint_management.investigate |
| resolve | complaint_management.resolve |
| close | complaint_management.close |
| escalate | complaint_management.escalate |
| retry_triage | complaint_management.triage |
| analytics | complaint_management.analytics |

Seed missing permission rows via migration; map to existing dynamic roles. Frontend keeps `PermissionGate` for button visibility (already used).

### Migration plan (backward compatible)
1. Migration A: add RPCs, sequence, triggers, permission rows, `complaint_sla_status` fn, escalation-rules table, `detect_complaint_duplicates`. Keep existing columns/behavior intact.
2. Migration B: normalize any stray `status='open'` rows to `submitted` (with audit note). Add CHECK constraint on `complaints.status`.
3. Frontend: switch writes to RPCs; switch list/analytics to server RPCs; delete mockData files after wiring.
4. Edge function hardening in same PR as migrations A/B.

### Non-goals
- No UI redesign.
- No changes to public complaint submission form fields.
- No removal of existing features (triage history, evidence, correspondence tabs all retained).

### Technical details
- All new RPCs `SECURITY DEFINER`, `SET search_path = public`, use `has_permission` helper.
- Transactional escalation uses a single PL/pgSQL block; on exception, `RAISE` propagates rollback.
- Server-side pagination uses keyset (`(created_at, id) < (:cursor)`) for stability; offset variant for the current UI compatibility until list adopts cursor.
- `complaint_number` sequence: `create sequence complaint_number_seq;` + `format('CMP-%s-%06s', to_char(now(),'YYYY'), nextval(...))` inside `create_complaint`.
- Zod schemas colocated in `src/lib/complaintSchemas.ts` and mirrored in edge `_shared/complaintSchemas.ts`.

### Acceptance verification
- Existing complaint flows (submit → triage → assign → investigate → resolve → close → escalate) work end-to-end with no regressions.
- No `.update({ status: ... })` on `complaints` from client code (grep clean).
- No `mockData`/`seed.ts` imports in production bundle.
- All RPCs reject unauthorized users with clear error codes.
- `evaluate-complaint-triage` returns 401 without a valid token.
- Analytics/list numbers match between dashboard, list, and reports (single SLA/aggregation source).