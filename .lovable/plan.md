# Complaints Module — Final Completion Sprint Plan

## Scope
Close all 12 outstanding items from `docs/verification/complaints/11_final_verification.md` (4 Partially Fixed + 8 Not Verified). No new inventory docs, no rewrite of existing verification narrative — only implementation, tests, CI wiring, and evidence-based verification updates.

## Work Breakdown

### 1. Duplicate Management (DB + RPC + UI)
- Migration: extend `complaint_duplicate_pairs` / `complaint_duplicate_clusters` for regulator scoping (regulator_id NOT NULL, RLS scoped via `has_regulator_access`).
- RPCs (all `SECURITY DEFINER`, regulator-scoped):
  - `generate_duplicate_candidates(complaint_id uuid)` — trigram + configurable weights from `complaint_duplicate_rules`.
  - `list_duplicate_candidates(...)` and `count_duplicate_candidates(...)` — identical scope filter, pagination, sort, filter.
  - `confirm_duplicate(pair_id, parent_id)` — links child→parent, writes audit, enqueues notification.
  - `dismiss_duplicate(pair_id, reason)` — audit + notification.
- Trigger: on complaint insert → auto-generate candidates.
- UI: `DuplicateReviewQueue.tsx`, `DuplicateCandidateList.tsx` on `ComplaintDetail`, remove any mock data paths in `src/pages/admin/complaints/Duplicates*`.

### 2. Escalation Workflow
- Migration: `complaint_escalation_rules` seed rows for SLA / age / severity / vulnerability / repeat-offender; add `escalation_kind` enum, unique `(complaint_id, kind, active)` partial index to prevent duplicate active escalations.
- RPCs: `evaluate_complaint_escalations(complaint_id)`, `manual_escalate_complaint`, `approve_escalation`, `refer_to_enforcement`, `dismiss_escalation`. All write audit + outbox rows.
- Scheduler: pg_cron job hourly calling `evaluate_all_complaint_escalations()`.
- UI: escalation panel in `ComplaintDetail` + admin queue.

### 3. Attachment Cleanup
- Migration: add `staged_at`, `finalized_at` to `complaint_evidence`; helper RPC `cleanup_orphaned_complaint_evidence(older_than interval)` deleting DB rows + storage objects via `storage.objects` (using service role in edge function, since SQL cannot delete storage — plan calls for an Edge Function `complaint-evidence-cleanup` scheduled via pg_cron→pg_net).
- Rollback path inside `finalize_complaint_with_attachments` on failure.
- Edge Function scheduled daily.

### 4. Status Catalogue Integrity
- Migration: add FK `complaints.status_code REFERENCES complaint_status_catalogue(code)`; backfill any invalid rows to `open`; add trigger validating transitions per `allowed_next` JSONB.
- Verify all client status usage funnels through catalogue via existing test.

### 5. SQL Test Suite
- Create `supabase/tests/complaints/01_intake.sql` … `15_regression.sql` using `pgtap`. Add `supabase/tests/run.sh` helper.
- Cover positive + negative regulator scope cases, attachment theft, workflow bypass, RLS matrix (11 personas via `set_config('request.jwt.claims', ...)`).

### 6. Test Execution
- Local via `supabase db reset && supabase test db` in CI. Capture failure→fix→pass cycle in verification doc.

### 7. RLS Matrix Verification
- File `11_rls.sql` seeds 11 personas, iterates every complaint table + RPC asserting allow/deny. Include cross-regulator theft attempts.

### 8. GitHub Actions CI
- Add `.github/workflows/ci.yml`:
  ```
  bun install --frozen-lockfile
  bunx tsc --noEmit
  bun run lint
  bun run build
  bun run test
  supabase start && supabase db reset && supabase test db
  ```
- Include Edge Function deno test step and `bun audit`.

### 9. Verification Doc Update
- Overwrite `docs/verification/complaints/11_final_verification.md` with: baseline commit, sprint commits, files, migrations, RPCs, RLS changes, SQL test output, RLS matrix result, CI run link, remaining limitations. Only mark "Fixed" when all gates pass.

## Technical Notes
- All new RPCs: `SECURITY DEFINER`, `SET search_path = public`, regulator scope enforced via `has_regulator_access(auth.uid(), regulator_id)`.
- All new tables get GRANT + RLS + policies in same migration.
- Storage deletion requires Edge Function (SQL can't delete storage objects); scheduled cleanup uses pg_cron→pg_net→edge fn.
- Concurrency: duplicate/escalation writes use `SELECT ... FOR UPDATE` on parent complaint row.
- Notifications: reuse `notification_outbox` + existing worker.

## Deliverables Checklist
- [ ] Duplicate management migration + RPCs + UI + tests
- [ ] Escalation engine migration + RPCs + cron + UI + tests
- [ ] Attachment cleanup migration + edge fn + cron + tests
- [ ] Status FK + transition trigger + tests
- [ ] `supabase/tests/complaints/*.sql` (15 files) executing on `supabase db reset`
- [ ] `.github/workflows/ci.yml` with visible green run
- [ ] Updated `11_final_verification.md` with evidence per item

## Out of Scope
- Rewriting inventory or earlier phase docs.
- Non-complaint modules.
- UX polish beyond what's needed to expose new RPCs.
