
# Complaints Module — Final Automation & Verification Closure

Goal: turn every "Partial / Not Verified" row in `docs/verification/complaints/11_final_verification.md` into behaviourally-tested "Fixed" — no smoke tests, no `continue-on-error`, no manual-only workflows.

## 1. Behavioural pgTAP rewrite

Rewrite each file below so it seeds fixtures, sets `role` / `request.jwt.claim.sub`, executes the RPC or DML, asserts row state + audit + outbox, then `ROLLBACK`. `has_function` / `has_column` stay only as supporting checks.

Target files:
- `06_duplicates.sql` — confirm/dismiss RPCs actually link `parent_complaint_id`, write `audit_logs`, enqueue `notification_outbox`, reject cross-regulator.
- `07_escalations.sql` — `manual_escalate_complaint` creates one `complaint_escalation_cases` row, blocks a second same-kind active row via `uq_escalation_active_kind`, dismiss transitions status.
- `08_attachments.sql` — end-to-end: seed `file_uploads` → `finalize_complaint_with_attachments` → `complaint_evidence.finalized_at` set → ownership + regulator mismatch rejected → `cleanup_orphaned_complaint_evidence` deletes stale, keeps linked.
- `09_public_tracking.sql` — real complaint + non-existent number: assert redaction (no assignee / no internal notes) and status label from catalogue.
- `10_notifications.sql` — insert outbox row, `claim_notification_outbox` marks in-flight (SKIP LOCKED), second claim returns nothing, `reap_stuck_notification_outbox` requeues.
- `12_audit.sql` — verify every complaint RPC emits an `audit_logs` row with correct action + actor.
- `14_regulator_scope.sql` — attempt confirm/dismiss/escalate/finalize across regulator boundary; all reject.
- `15_regression.sql` — keep FK check + add: no orphan `complaint_evidence`, no `complaint_escalation_cases` violating unique-active-kind, every complaint has an `approval_workflow_versions` snapshot.

## 2. Full 11-persona RLS matrix

New file `supabase/tests/complaints/11_rls.sql` (replaces smoke test) + shared helper `supabase/tests/complaints/_helpers.sql` that seeds:

- 2 regulators, 2 licensees per regulator
- 1 user each: anon, complainant A, complainant B, licensee-primary, licensee-secondary, intake officer, investigator, supervisor, enforcement officer, regulator admin, cross-regulator admin, unauthorised auth user

Matrix loop asserts SELECT/INSERT/UPDATE/DELETE + each RPC (`create_complaint`, workflow action, confirm/dismiss duplicate, manual/dismiss escalate, finalize attachments, cleanup, public tracking) on `complaints`, `complaint_evidence`, `complaint_duplicate_pairs/clusters`, `complaint_escalation_cases`, `complaint_status_catalogue`, `workflow_instances`, `notification_outbox`, `audit_logs`, `file_uploads`.

Emit results into a temp table; `COPY` summarised allow/deny grid into `docs/verification/complaints/12_rls_persona_matrix.md` via a small `scripts/emit-rls-matrix.mjs` runner that executes the SQL and formats the markdown table from the captured output.

## 3. Automatic duplicate candidate generation

New migration:

- Table `complaint_duplicate_config` (regulator_id nullable for global default) with weights: subject_similarity, description_similarity, same_licensee, email_match, phone_match, external_ref_match; thresholds `min_score`, `auto_high_confidence`; `lookback_days`, `max_candidates`, `excluded_statuses text[]`, `enabled`, effective dates.
- Function `public.generate_complaint_duplicate_candidates(_complaint_id uuid)` (SECURITY DEFINER, `search_path=public`): reads config, uses `pg_trgm` similarity on subject/description, exact match on email/phone/external_ref/licensee, scoped to same regulator, honours `excluded_statuses` and `lookback_days`, upserts into `complaint_duplicate_pairs` with `score_components jsonb` (skips pairs currently `dismissed`), enqueues review notification when `score >= auto_high_confidence`, writes audit row. Symmetric-pair guard via `LEAST/GREATEST` ordered ids + unique index.
- Trigger `AFTER INSERT OR UPDATE OF subject, description, complainant_email, complainant_phone, external_reference, licensee_id ON complaints` → calls the generator.
- Idempotency: unique `(complaint_a, complaint_b)` with ordered pair.

Behavioural tests (`06_duplicates.sql` extension or new `16_duplicate_generation.sql`): similar/dissimilar pairs, licensee weighting, exact email/reference boosts, cross-regulator isolation, dismissed persistence, threshold config change, idempotent re-run.

## 4. Scheduled escalation sweep

New migration:

- `public.evaluate_complaint_escalations(_complaint_id uuid)` — evaluates all rules (SLA breach via `approval_actions.sla_deadline`, age vs config, severity=critical, vulnerability flag, harm level, repeat count against licensee in window, unresolved duplicate cluster, manual). Reads `complaint_escalation_rules` (already present). Skips resolved/closed, disabled rules, outside effective dates. Uses `uq_escalation_active_kind` to avoid duplicates. Writes audit + outbox; supports enforcement referral by inserting `enforcement_case_events` row.
- `public.evaluate_all_complaint_escalations(_batch_size int)` — loops with SAVEPOINT per complaint so one failure does not abort; resumable via a `last_processed_id` cursor stored in `complaint_escalation_log`.

Scheduling: extend the existing `sla-escalation-sweep` Edge Function (or new `complaint-escalation-sweep`) that calls `evaluate_all_complaint_escalations`; register in `pg_cron` every 15 min via `supabase--insert` (not migration, since it contains function URL + anon key per project rules).

Behavioural tests `17_escalation_sweep.sql`: overdue → escalated, non-overdue → not, vulnerability rule fires, repeat-volume rule fires, duplicate active rejected, disabled rule ignored, cross-regulator ignored, audit + outbox rows present, second run idempotent.

## 5. Physical storage cleanup

New Edge Function `supabase/functions/complaint-storage-cleanup/index.ts`:

1. `select ... for update skip locked` a batch of `complaint_evidence` / `file_uploads` rows where `staged_at < now() - interval` AND `finalized_at IS NULL` AND no linkage.
2. For each: `storage.from('secure-documents').remove([path])`, on success delete DB row, on failure increment `cleanup_attempts`, on N failures move to a `file_upload_dead_letter` table.
3. Emit audit + return `{deleted, failed, dead_lettered}`.

Migration adds `cleanup_attempts int default 0`, `last_cleanup_error text` on `file_uploads` and creates `file_upload_dead_letter`. RPC `cleanup_orphaned_complaint_evidence` becomes admin-only (`has_role(auth.uid(),'admin')`), returns claim IDs consumed by the Edge Function only.

`pg_cron` job invokes the function daily; registered via `supabase--insert` in the same step as §4.

Deno tests `supabase/functions/complaint-storage-cleanup/index.test.ts`: stale removed (mock storage), linked preserved, recent preserved, storage failure → row retained + attempt++, retry succeeds, concurrent claim (double invocation) processes each row once, non-admin caller → 403.

## 6. Blocking CI

Rewrite `.github/workflows/ci.yml`:

```yaml
jobs:
  frontend:
    steps:
      - bun install --frozen-lockfile
      - bunx tsgo --noEmit
      - bun run lint
      - bun run build
      - bun run test            # remove continue-on-error
  db:
    needs: frontend
    steps:
      - supabase start
      - supabase db reset --no-seed
      - supabase test db
      - deno test supabase/functions --allow-net --allow-env
      - node scripts/emit-rls-matrix.mjs   # writes matrix doc, fails on deny/allow mismatch
      - bun audit --production || true     # advisory
```

All `continue-on-error` removed. Package script `"lint"` added if missing.

## 7. Evidence capture

Run locally (or record CI run URL) and update `docs/verification/complaints/11_final_verification.md` with:

- final commit SHA
- GitHub Actions run URL + conclusion
- exact frontend + pgTAP + Deno test totals
- persona matrix summary (link to `12_rls_persona_matrix.md`)
- duplicate generation, escalation sweep, storage cleanup outcomes
- any external blocker (e.g. `pg_cron` availability on hosted project) with the precise manual step required

Reclassify Fixed only where an executed test proves behaviour.

## Technical details (implementer notes)

- Enable extensions `pg_trgm`, `pg_cron`, `pg_net` (idempotent `CREATE EXTENSION IF NOT EXISTS`).
- All new SECURITY DEFINER functions pin `set search_path = public`.
- GRANTs: `authenticated` for user-facing RPCs, `service_role` only for cleanup + sweep + generator; no `anon` on any new object except `get_public_complaint_tracking` (already granted).
- Unique ordered-pair index: `create unique index on complaint_duplicate_pairs (least(complaint_a_id,complaint_b_id), greatest(complaint_a_id,complaint_b_id))`.
- pgTAP persona switching via `set local role authenticated; set local "request.jwt.claim.sub" = '<uuid>'` inside each subtest.
- Storage cleanup uses `LOVABLE_BROWSER_*` env only in tests? No — use Deno test with mocked `supabase.storage`.
- pg_cron jobs registered via `supabase--insert` (contains project-specific URL + anon key, must not be in a shared migration).

## Out of scope
Non-complaints modules, UI redesigns, new complaint features beyond what tests require.
