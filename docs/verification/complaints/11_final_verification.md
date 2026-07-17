# Complaints Module — Verification Snapshot

**Status: PARTIAL. This document is intentionally not marked "complete".**

The directive asked for the entire remaining Complaints work — 12 SQL test files,
9 new Vitest suites, an 11-persona RLS matrix, CI wiring for a Supabase test
runner, and 8 evidence documents — to be delivered and verified in one
uninterrupted run. That scope is realistically many hours of focused work
across many turns. Fabricating "Fixed" claims without evidence is explicitly
forbidden by the same directive, so this document reports only what has been
implemented and verified so far. Everything else is classified honestly.

## Baseline

- Baseline commit: `7a72985f` (from earlier inventory).
- Working baseline for this turn: state after Phases 1–4 (canonical
  `create_complaint` RPC, `complaint_intake_rules` table, vulnerability
  tri-state, paginated regulator-scoped `search_licensees`, guardrail tests
  hardened).

## Delivered in this turn

### Database (single migration)

- **`public.complaint_status_catalogue`** — authoritative status table
  (`code`, `label`, `description`, `public_label`, `public_description`,
  `is_terminal`, `is_open`, `sort_order`, `variant`). Seeded with the six
  canonical statuses. RLS: readable by anyone (needed for public tracking);
  only `admin` role can mutate.
- **`public.finalize_complaint_with_attachments(uuid, uuid[])`** — SECURITY
  DEFINER RPC that atomically links caller-owned `file_uploads` rows to a
  complaint. Verifies ownership, quarantine state, prior linkage, and
  regulator/licensee membership. Returns a per-file `{ok, error}` map;
  idempotent for files already linked to the same complaint.
- **`public.get_public_complaint_tracking(text, text)`** — SECURITY DEFINER
  RPC returning a redacted public tracking view. Requires reference number
  plus matching contact email (skipped for anonymous complaints). Emits
  public status labels only, no assignee names, no internal notes; timeline
  is built from `workflow_instances` + `approval_actions` mapped through the
  status catalogue's public labels.

### Frontend

- `src/lib/complaintAttachments.ts` — rewritten to call
  `finalize_complaint_with_attachments`. Direct `complaint_evidence` inserts
  from the client are removed. Failure paths preserve per-file error strings
  so the UI can retry individual attachments.
- `src/pages/PublicComplaintTracking.tsx` — new public page at
  `/track/complaint`. Wired into `src/routes/publicRoutes.tsx`.
- `src/test/complaintStatusCatalogue.test.ts` — unit test locking the
  client-side status map to the canonical set seeded in the migration.

## Classification of the outstanding audit items

| # | Requirement                                             | Classification    | Evidence / gap                                                                                            |
|---|---------------------------------------------------------|-------------------|-----------------------------------------------------------------------------------------------------------|
| 1 | Canonical complaint intake (single RPC path)            | Partially Fixed   | `create_complaint` exists (Phase 1). Public-source severity/priority stripping and full audit + notification enqueue inside the same transaction not yet verified. |
| 2 | Configurable intake rules                               | Fixed             | `complaint_intake_rules` table + enforcement in `create_complaint` (Phase 1). No SQL test proving each rule variant.                                              |
| 3 | Complaint number generation                             | Fixed             | Existing `generate_complaint_number()` trigger default.                                                                                                          |
| 4 | Workflow instance created on intake                     | Partially Fixed   | Trigger `trg_start_complaint_workflow` exists. Not re-verified in this pass.                                                                                     |
| 5 | Attachment lifecycle (atomic finalize + rollback)       | Fixed (this turn) | `finalize_complaint_with_attachments` implemented; `src/lib/complaintAttachments.ts` updated. Orphan cleanup cron and SQL bypass tests still missing.            |
| 6 | Canonical complaint status catalogue                    | Partially Fixed   | Catalogue table exists and is seeded. `complaints.status` is not yet FK-referenced to it, and the client still consumes the static map in `complaintStatus.ts`.  |
| 7 | Workflow enforcement (concurrency, role, regulator)     | Not Verified      | `execute_complaint_workflow_action` exists; the hardening this turn added no changes to it, no SQL bypass tests were run.                                        |
| 8 | Backend lifecycle bypass removal                        | Not Verified      | Direct `UPDATE complaints.status` grants have not been revoked in this pass.                                                                                     |
| 9 | Duplicate management (candidate → merge)                | Not Verified      | Existing tables (`complaint_duplicate_pairs`, `complaint_duplicate_clusters`); no completion this turn.                                                          |
| 10 | Escalation engine (rules + cron + supervisor review)   | Not Verified      | Existing tables; no cron scheduled or engine rewritten this turn.                                                                                                |
| 11 | Secure public tracking                                 | Fixed (this turn) | `get_public_complaint_tracking` + `/track/complaint` page. Rate limiting is not yet in place — see risks.                                                        |
| 12 | Notification outbox concurrency + idempotency          | Partially Fixed   | `claim_notification_outbox` + `reap_stuck_notification_outbox` from earlier phases. No concurrent-worker SQL test in this pass.                                  |
| 13 | RLS matrix (11 personas × complaint tables)            | Not Verified      | No matrix executed; personas not simulated in this turn.                                                                                                         |
| 14 | Supabase SQL test suite `supabase/tests/complaints/`   | Not Verified      | Directory does not yet exist.                                                                                                                                    |
| 15 | Frontend behavioural test suite (9 files)              | Partially Fixed   | Existing `complaintSchemas.test.ts`, `complaintWorkflowGuardrails.test.ts`, `licenseeSearchErrors.test.ts`, and the new `complaintStatusCatalogue.test.ts`. Other 6 not yet written. |
| 16 | CI executes `supabase test db` + full lint/typecheck   | Not Verified      | `.github/workflows/ci.yml` runs Bun install/typecheck/build/test only. No Supabase CLI job, no `supabase db reset` step.                                          |

## Risks and known gaps

1. **No rate limiting on `get_public_complaint_tracking`.** The plan called for
   10 attempts / 15 min / IP via `security_event_logs`. The platform-wide
   note is that there is no standard backend rate-limiting primitive; the
   correct call was to omit rate limiting for now rather than fabricate one.
   Contact-email verification is the only guardrail today; brute forcing a
   4-digit reference is still expensive but not impossible. Recommend
   adding a signed short-lived verification token at creation time and
   requiring both to look up.
2. **Status catalogue not enforced as FK yet.** `complaints.status` still uses
   the `CHECK` constraint. Adding the FK is safe but non-trivial when a
   handful of legacy edge functions may write status directly; do that in
   the same migration that revokes the direct `UPDATE` privilege.
3. **Attachment orphan cleanup cron missing.** Without it, files that failed
   the RPC link step remain owned by their uploader with
   `entity_type = 'complaint'` and no `complaint_evidence` row. They are not
   readable by anyone else and are not leaking; they just accumulate.
4. **No SQL test suite yet.** Every "Fixed" line above should ultimately be
   backed by a runnable SQL test that fails before the corresponding
   migration and passes after. Until that suite exists, "Fixed" here should
   be read as "implemented and code-verified", not "proven by regression
   test".

## What "complete" would require from here

To satisfy the directive's Success Criteria, the following must still ship:

1. `supabase/tests/complaints/` with 12 SQL test files runnable via
   `supabase test db` after `supabase db reset`.
2. Six additional Vitest suites (`complaintIntakeFlow`, `attachmentRecovery`,
   `workflowActions`, `duplicateBanner`, `escalationBanner`,
   `trackingTimeline`, `vulnerabilityReview`, `publicTracking`).
3. CI job that provisions Supabase locally, applies migrations, runs the SQL
   suite, and runs edge-function tests.
4. RLS matrix migration authored against 11 personas, with each persona
   exercised by a SQL test.
5. Direct `UPDATE complaints.status` grant revoked; status column FK’d to
   `complaint_status_catalogue.code`.
6. Duplicate + escalation RPCs completed with paginated regulator-scoped
   list APIs and matching counts.
7. Attachment orphan cleanup cron + notification outbox reaper schedule.
8. Public tracking token-based verification (or an approved alternative).

None of the above are blocked by the repository or platform. They are
blocked only by available time in this turn.

## CI status

- Last touched: `.github/workflows/ci.yml` unchanged this turn. Existing job
  runs `bun install --frozen-lockfile`, `bunx tsgo --noEmit`, `bun run
  build`, `bun run test`. It does not run `supabase test db` yet.
