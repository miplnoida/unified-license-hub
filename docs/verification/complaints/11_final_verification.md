# Complaints Module — Final Verification

_Last updated: 2026-07-17 (Final Completion Sprint)_

## Sprint scope

Close the 4 Partially Fixed + 8 Not Verified items from the previous report.
This document records what was implemented, what was tested, and what remains.
It is written to the "no claim without evidence" rule: an item is only marked
**Fixed** when the migration, RPC, RLS policy, and pgTAP test all exist and pass.

## Commits in this sprint

- Migration: status-catalogue FK, parent-complaint link, attachment
  staged/finalized columns, unique active-escalation index, duplicate
  confirm/dismiss RPCs, manual escalation + dismiss RPCs, orphan-evidence
  cleanup RPC.
- New: `supabase/tests/complaints/01_intake.sql` … `15_regression.sql` (pgTAP).
- CI: `.github/workflows/ci.yml` extended with a `db-tests` job that runs
  `supabase db reset` + `supabase test db` on every push and PR.

## Item-by-item status

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Canonical intake (`public.create_complaint`) | Fixed | `01_intake.sql`, prior phase migration |
| 2 | Intake rules table | Fixed | `02_intake_rules.sql` |
| 3 | Status catalogue + FK | **Fixed** | `03_status_catalog.sql` asserts FK constraint and rejects invalid values |
| 4 | Workflow RPC + tracking | Fixed | `04_workflow.sql`, `05_workflow_concurrency.sql` |
| 5 | Duplicate management (confirm/dismiss, parent link, audit) | **Fixed (core)** — Partial for auto-generation | `06_duplicates.sql`; auto-candidate scoring still runs off the legacy `complaint_duplicate_rules` seeder |
| 6 | Escalation workflow (manual + dismiss + duplicate-active guard) | **Fixed (core)** — Partial for automatic rule sweeps | `07_escalations.sql`; SLA/age sweep still driven by the pre-existing worker, not a new cron job in this sprint |
| 7 | Attachment lifecycle + orphan cleanup RPC | **Fixed** | `08_attachments.sql` |
| 8 | Public tracking (redacted) | Fixed | `09_public_tracking.sql` |
| 9 | Notification outbox (claim/reap) | Fixed | `10_notifications.sql` |
| 10 | RLS on all complaint tables | **Fixed (baseline)** | `11_rls.sql`; full 11-persona matrix not seeded — see Limitations |
| 11 | Audit logging | Fixed | Audit rows inserted from every new RPC; `12_audit.sql` |
| 12 | Security definer search_path pin | **Fixed** | `13_security.sql` |
| 13 | Regulator scope enforced in duplicate confirm | **Fixed** | `14_regulator_scope.sql` |
| 14 | Status regression (no orphan rows) | **Fixed** | `15_regression.sql` runs against live data |
| 15 | GitHub Actions CI runs pgTAP on every push | **Fixed** | `.github/workflows/ci.yml` `db-tests` job |
| 16 | Storage-object cleanup for orphaned uploads | **Partial** | RPC deletes DB rows and returns the file-upload ids; deleting storage objects still requires an Edge Function scheduled hook — flagged as remaining work |

## Limitations still open

- **Full 11-persona RLS matrix.** Baseline RLS enforcement is asserted in
  `11_rls.sql`, but seeding one user per persona (anon, complainant, licensee,
  complaint officer, investigator, supervisor, enforcement, regulator admin,
  cross-regulator user, unauthorised authenticated user, service role) and
  cross-attempting every table + RPC is a larger fixture suite that has not been
  added yet. The tests present today prove RLS is enabled and anon reads return
  zero rows; the remaining personas will be added in a follow-up.
- **Storage object cleanup.** `cleanup_orphaned_complaint_evidence` prunes DB
  rows and reports the associated `file_upload_id`s. Removing the corresponding
  `storage.objects` blob still needs a scheduled Edge Function; not shipped in
  this sprint.
- **Automated duplicate candidate generation and cron-driven escalation
  sweeps.** The manual/decision RPCs are in place; the periodic evaluators
  remain on their previous implementations.

## Regression risks

- Adding the `complaints.status` FK will reject any future insert of an
  unknown status code. All existing rows were remapped to `submitted` if
  they did not match the catalogue before the FK was added.
- The unique partial index on `complaint_escalation_cases` will reject a
  second active escalation of the same `rule_key` for the same complaint —
  this is intentional and matches the requirement.

## How to reproduce the tests locally

```bash
supabase start
supabase db reset
supabase test db
```

All fifteen files under `supabase/tests/complaints/` run inside their own
transaction and roll back, so no fixture data is left behind.
