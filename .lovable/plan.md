## Complaints Module — End-to-End Hardening (Phases 1–8)

Baseline: `docs/verification/complaints/01_inventory.md` at commit `7a72985f`.
All work lands on the current branch as a series of small commits, one per phase, continuing without pause. No production data touched — all SQL runs against the disposable Lovable Cloud dev database via the migration tool.

### Phase 1 — Canonical intake
- Migration: `complaint_intake_rules` (regulator-scoped required-field config, seed defaults), `complaint_numbers` sequence per regulator/year.
- Rewrite RPC `public.create_complaint(variant, payload jsonb)` (SECURITY DEFINER, safe search_path, PUBLIC revoked, granted to `anon` for public variant only, `authenticated` for others) to:
  - Validate variant ∈ {public, internal, licensee, staff}; strip `severity`/`priority` for public/licensee.
  - Enforce `complaint_intake_rules` required fields → structured `{code, field, message}[]` errors via `RAISE EXCEPTION USING DETAIL=json`.
  - Generate `complaint_number` (`<REG>-<YYYY>-<seq>`).
  - Insert `complaints` row; create `workflow_instances` row bound to the "Complaint Management Workflow" active version; write `audit_logs`; enqueue `notification_outbox` for `complaint.created` — all in one transaction.
  - Return `{id, complaint_number, workflow_instance_id}`.
- Frontend: `src/hooks/useCreateComplaint.ts` (canonical hook); refactor `NewInternalComplaint`, licensee submit page, and public submission Edge Function to call it. Keep field-level errors, duplicate-submit guard, Cancel + unsaved-changes prompt.
- Tests: `supabase/tests/complaints/01_create.sql` — happy path per variant, missing-required, external-severity rejection, workflow instance existence, audit + outbox rows. Vitest for hook validation.

### Phase 2 — Vulnerability + entity lookup
- Trigger `trg_complaints_vulnerability_consistency` BEFORE INSERT/UPDATE: if `vulnerability_indicator=false` → nullify category/notes; if true → require at least one of category/notes else raise.
- RPC `public.search_licensees(q text, regulator uuid, cursor uuid, limit int)` — keyset paginated, regulator-scoped, index on `(regulator_id, lower(name))`.
- Frontend `LicenseeSearchCombobox` with 250ms debounce, explicit empty/permission-denied/network/db error UI. Replace the 500-row `.limit(500)` fetch in `NewInternalComplaint`.
- Tests: SQL trigger matrix (true/false × notes/category present/absent), pagination beyond 500 rows via generated fixtures, RLS scope check.

### Phase 3 — Attachments + canonical status
- RPC `finalize_complaint_with_attachments(complaint_id, pending_upload_ids uuid[])`: validates ownership of each `file_uploads` row, links into `complaint_evidence`, marks uploads finalized — single transaction, returns per-file result.
- Cron/Edge Function `reap-orphan-uploads` (daily) deletes unfinalized uploads > 24h.
- Migration: `complaint_status_catalog` seed table (code, label, category, is_terminal, is_duplicate, is_rejected); FK from `complaints.status`.
- Frontend: `src/lib/complaintStatus.ts` re-exports catalog; list/detail/dashboard/report/tracking all read from it.
- Tests: attachment success, partial failure rollback (force one upload to bad id → assert 0 evidence rows inserted), orphan reaper, status catalog completeness.

### Phase 4 — Workflow enforcement
- Audit every existing RPC/edge that mutates `complaints.status` outside `execute_complaint_workflow_action`; drop or restrict (`REVOKE EXECUTE`) any bypass. Add DB trigger on `complaints` blocking direct status changes unless `current_setting('app.workflow_ctx', true) = 'engine'`.
- Extend `execute_complaint_workflow_action` checks: instance exists, action available on current step, actor authorized, assignee authorized, regulator scope, required fields present, `updated_at` optimistic lock, step order enforced. Notifications + audit written in same tx.
- Tests: SQL scripts covering each guard (unavailable action, wrong actor, stale updated_at, cross-regulator, skipped step), plus positive path across a 4-step workflow.

### Phase 5 — Duplicate + escalation live
- Replace mock data in `DuplicateAlertBanner` / duplicate module with real RPCs: `generate_duplicate_candidates(complaint_id)` (trigram/simhash on subject+description scoped to regulator), `confirm_duplicate`, `dismiss_duplicate`, `link_parent`. Paginate.
- Replace mock escalation with `evaluate_complaint_escalation` (age, severity, harm, repeat-volume rules from `complaint_escalation_rules`) + manual escalate RPC → creates `enforcement_case` link, enqueues notifications, writes audit.
- Remove `return null` swallow patterns in banners — surface retryable error state (already begun).
- Tests: SQL for each rule; cross-regulator isolation; banner tests render error state.

### Phase 6 — Public tracking + outbox worker
- RPC `get_public_complaint_tracking(complaint_number, verification_token)` — token stored hashed on `complaints`; returns stage/label/timestamp only, redacts assignee/internal notes/internal events. Separate authenticated variants for licensee/complainant/regulator with server-side redaction rules.
- Notification worker (`process-notification-outbox` edge function): `claim_notification_outbox` (FOR UPDATE SKIP LOCKED), states pending/processing/sent/failed/dead, exp backoff, `reap_stuck_notification_outbox`, `retry_dead_notification_outbox`, idempotency key `(event_id, recipient)`.
- Tests: concurrent claim (2 workers × 100 rows → no double delivery), stuck reaper, dead-letter retry, redaction matrix per persona.

### Phase 7 — RLS + security
- pgTAP-style SQL suite `supabase/tests/complaints/07_rls_matrix.sql` covering 11 personas × operations across `complaints`, `complaint_evidence`, `complaint_duplicate_*`, `complaint_escalation_*`, `notification_outbox`, and each RPC.
- Every new SECURITY DEFINER: `SET search_path = public, pg_temp`, `REVOKE ALL ON FUNCTION ... FROM PUBLIC`, explicit `GRANT EXECUTE` to intended roles, `auth.uid()` checks, regulator-scope check.
- Assert client bundle never references service-role key (grep + build artifact scan in CI script).

### Phase 8 — Test + verification runs
- Add all SQL tests under `supabase/tests/complaints/` and Vitest suites under `src/test/complaints/`.
- Execute in order and capture output verbatim into evidence files:
  1. `bun install --frozen-lockfile`
  2. `bunx tsc --noEmit`
  3. `bun run lint`
  4. `bun run build`
  5. `bun run test`
  6. `supabase db reset` (disposable) + run `supabase/tests/complaints/*.sql`
  7. Edge function tests (`deno test` per function)
  8. `security--run_security_scan`, `code--dependency_scan`
- On failure: fix root cause, rerun, record both attempts.

### Evidence files
Create/update:
```
docs/verification/complaints/
  02_phase1_intake.md
  03_phase2_vulnerability_lookup.md
  04_phase3_attachments_status.md
  05_phase4_workflow.md
  06_phase5_duplicate_escalation.md
  07_phase6_tracking_notifications.md
  08_phase7_rls_security.md
  09_phase8_tests.md
  10_final_verification.md
```
Each contains: files touched, migrations, RPCs, RLS deltas, workflow config deltas, tests added, full command output, remaining risk.

### Final report (in chat + `10_final_verification.md`)
- Baseline hash `7a72985f`, per-phase commit hashes, final hash.
- 16-item status table (Fixed / Partially Fixed / Failed / Not Verified / Not Reproducible) with evidence pointer per row.
- RLS persona matrix, end-to-end lifecycle log, known limitations, regression risks.

### Technical notes (for reviewers)
- Single Supabase project (Lovable Cloud dev DB is disposable) — used for all SQL runs; no prod credentials involved.
- All new tables in `public` include GRANTs before RLS enable; existing tables get additive policies only.
- Workflow bypass trigger uses a session GUC set by the workflow engine RPC so app code cannot forge it.
- Notification outbox schema already exists (per prior work); this phase hardens the worker, not the schema, unless columns for idempotency/backoff are missing — in which case an additive migration is included in Phase 6.

### Constraints / non-goals
- No changes to unrelated modules (returns, prudential, F&P) except where they share the outbox worker.
- No new third-party dependencies without justification recorded in the phase evidence file.
- If a scope item cannot be verified (e.g. real SMTP), it is mocked at the transport boundary and labelled "Partially Fixed" — never "Fixed".
