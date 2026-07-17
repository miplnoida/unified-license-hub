# Complaints Module — Final Verification

_Last updated: 2026-07-17 (Automation Sprint a+b+c — duplicate scoring, escalation sweep, and storage cleanup landed with behavioural pgTAP tests, edge functions, and pg_cron schedules.)_

## Sprint (a+b+c) delivered this turn

### (a) Automatic duplicate candidate generation — Fixed
- Migration: `public.complaint_duplicate_scoring_config` (weights + time window + min score), symmetric uniqueness index `uq_duplicate_pair_symmetric`, trigram indexes on `subject`/`description`, `lower(email)` index.
- Function: `public.generate_complaint_duplicate_candidates(uuid)` — SECURITY DEFINER, `search_path=public`, weighted scoring (exact email/licensee + `pg_trgm` similarity), regulator-scoped, time-windowed, skips already-decided or existing pending pairs (symmetric).
- Trigger: `trg_complaints_generate_duplicates` `AFTER INSERT OR UPDATE OF email, licensee_id, subject, description`.
- Behavioural tests in `supabase/tests/complaints/06_duplicates.sql`:
  - Auto-pair for near-duplicate complaints in same regulator.
  - No pair across regulators.
  - Re-run produces no additional pair (symmetric uniqueness).
  - No pair outside time window.

### (b) Scheduled escalation sweep — Fixed
- Function: `public.evaluate_complaint_escalations(uuid)` — evaluates enabled rules by `criterion` (`age`, `harm`, `risk_rating`, `volume`), respects `uq_escalation_active_kind`, writes `audit_logs` with `auto_escalate`.
- Function: `public.evaluate_all_complaint_escalations()` — sweep for all active complaints.
- Edge function: `supabase/functions/complaint-escalation-sweep/index.ts` — service-role, RPC-driven, HTTP 200 error bodies.
- Cron: `complaint-escalation-sweep` scheduled every 15 minutes via `pg_cron` + `pg_net` (registered via insert tool).
- Behavioural tests in `supabase/tests/complaints/07_escalations.sql`:
  - Aged complaint fires the age rule.
  - Second run does not re-open the active case.

### (c) Physical storage cleanup — Fixed
- Function: `public.cleanup_orphaned_complaint_evidence(interval)` extended to return `(evidence_id, file_upload_id, bucket_name, file_path)`.
- Table: `public.complaint_storage_cleanup_deadletter` with RLS (service_role manages, admins read).
- Edge function: `supabase/functions/complaint-storage-cleanup/index.ts` — deletes storage objects with 3-attempt backoff; failures land in dead-letter with `attempts` + `last_error`.
- Cron: `complaint-storage-cleanup` scheduled daily at 02:00.
- Behavioural tests in `supabase/tests/complaints/08_attachments.sql`:
  - Cleanup returns exactly the stale staged evidence, leaves fresh rows alone.

## Item-by-item status

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Canonical intake (`public.create_complaint`) | Fixed | `01_intake.sql` |
| 2 | Intake rules table | Fixed | `02_intake_rules.sql` |
| 3 | Status catalogue + FK | Fixed | `03_status_catalog.sql` |
| 4 | Workflow RPC + tracking | Fixed | `04_workflow.sql`, `05_workflow_concurrency.sql` |
| 5 | Duplicate management (auto-gen + confirm/dismiss) | **Fixed** | Sprint (a) — migration + `06_duplicates.sql` |
| 6 | Escalation workflow (manual + auto sweep) | **Fixed** | Sprint (b) — evaluator + sweep + cron + `07_escalations.sql` |
| 7 | Attachment lifecycle + orphan cleanup RPC | Fixed | `08_attachments.sql` |
| 8 | Public tracking (redacted) | Fixed | `09_public_tracking.sql` |
| 9 | Notification outbox (claim/reap) | Fixed | `10_notifications.sql` |
| 10 | RLS on all complaint tables | Fixed (baseline) | `11_rls.sql` — see Limitations |
| 11 | Audit logging | Fixed | `12_audit.sql`, `auto_escalate` rows written by sweep |
| 12 | Security definer search_path pin | Fixed | `13_security.sql` |
| 13 | Regulator scope enforced | Fixed | `14_regulator_scope.sql`, scoring function scopes by regulator |
| 14 | Status regression | Fixed | `15_regression.sql` |
| 15 | GitHub Actions CI runs pgTAP | Fixed | `.github/workflows/ci.yml` `db-tests` job (blocking) |
| 16 | Storage-object cleanup for orphaned uploads | **Fixed** | Sprint (c) — edge function + deadletter + cron |

## Still open (explicitly NOT Fixed)

1. **Full 11-persona RLS matrix.** Baseline RLS is asserted; per-persona cross-table matrix has not been seeded.
2. **Observed green GitHub Actions run for the final commit.** Must be observed on GitHub itself — cannot be produced from inside the build sandbox.

## How to reproduce locally

```bash
supabase start
supabase db reset
supabase test db
```

All complaint test files run in their own transaction and roll back.
