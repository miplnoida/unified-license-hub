# Complaints Module — Completion Plan (Phases 3–8)

I have to be honest with you before we start: the scope you listed is roughly 2–4 weeks of engineering work for a senior team (16 backend items, 15 SQL test suites, 17 frontend test suites, CI overhaul, RLS persona matrix across 11 personas, concurrent-worker proofs). I cannot compress that into a single agent turn, and I will not pretend otherwise. What I *can* do is execute it in tightly-scoped, verifiable increments — each with runnable evidence — without pausing for verbal approval between them. Every migration still requires your one-click approval in the Lovable UI (that is a platform constraint, not a choice I control), but I will not stop to *ask* between them.

I am also required by the system to produce a plan before I start editing. This is that plan. Approve it and I will begin executing immediately and continue through all phases in sequence.

## Phase 3 — Licensee Search Hardening

**Backend (one migration)**
- Rewrite `search_licensees(_q, _limit, _offset)`:
  - Assert `auth.uid() IS NOT NULL` → raise `insufficient_privilege`.
  - Resolve caller's regulator scope via `profiles.regulator_id` + `user_roles` + `entity_user_access`.
  - Filter `licensees` to the caller's regulator(s); reject with structured error when scope is empty.
  - `total_count` uses the same predicate as the row query.
- Add `pg_trgm` index on `licensees.name` if missing (for >500-row perf).

**Frontend**
- `LicenseePicker`: real pagination via `useInfiniteQuery`, offset tracking, dedupe by id, reset on query change, "Load more" + end-of-results state, "Showing N of M".
- Error taxonomy: map Postgres codes to `no_results | permission_denied | auth_expired | network | rpc_error | shape_error`; render category-specific copy + retry; log raw error via `logger.error`, never render it.

**Tests**
- `src/test/licenseePicker.test.tsx`: pagination, reset-on-search, each error category, empty state, loading-more, selected-label load.

## Phase 4 — Vulnerability Migration Remediation

- Drop the `(not recorded)` backfill. Introduce `complaints.vulnerability_review_state` enum: `not_applicable | needs_remediation | confirmed`.
- Migration flips legacy rows with `vulnerability_indicator=true AND notes IS NULL` to `needs_remediation` and leaves notes NULL.
- Trigger updated: `confirmed` requires category or notes; `needs_remediation` blocks next lifecycle action until an authorised role clears it; `not_applicable` requires both null.
- UI: banner on complaint detail for `needs_remediation` with a "Complete remediation" action gated by permission.

## Phase 5 — Canonical Intake Completion + External Field Lock-Down

- Extend `create_complaint(_variant, _payload)`:
  - Always strip `severity`, `priority`, `sla_*`, `escalation_level` from public/licensee/anonymous variants (server-side, even if present).
  - Enforce `complaint_intake_rules` per (regulator, intake_source, active window): required-fields matrix (type, category, licensee, product, channel, email, vulnerability, attachment, anonymous-allowed).
  - Regulator scope stamped from caller context, not payload.
  - Atomic: complaint + workflow_instance + audit_log + notification_outbox + attachment link inside a single txn; on any failure, raise and roll back.
- Delete/deprecate any remaining direct-insert paths in the client (grep + remove).
- Public Edge Function `submit-public-complaint` re-validated against shared Zod + calls the RPC.

## Phase 6 — Attachment Atomicity

- New RPC `link_complaint_attachments(_complaint_id, _upload_ids[])`:
  - Verifies each upload belongs to caller, is unlinked, within regulator scope, size/type valid.
  - Inserts `complaint_evidence` rows; on failure, raises.
- `create_complaint` accepts `pending_upload_ids` and calls linker inside the same txn.
- Orphan cleanup job: cron RPC `cleanup_orphan_uploads()` removes uploads > 24h old with no link.
- Frontend: `attachStagedFilesToComplaint` becomes a fallback-only recovery path; primary flow is atomic via RPC.

## Phase 7 — Canonical Status Catalogue + Workflow Bypass Removal

- Table `complaint_status_catalogue` (code, internal_label, public_label, description, badge_variant, terminal, public_visible, sort_order) seeded from `complaintStatus.ts`.
- `complaintStatus.ts` regenerated from catalogue via a typed loader hook `useComplaintStatusCatalogue`.
- Audit every RPC/trigger: revoke EXECUTE on any generic transition function from `authenticated`; keep only `execute_complaint_workflow_action`.
- Concurrency: switch action RPC's optimistic token to `workflow_instances.updated_at`, `SELECT … FOR UPDATE`, structured `stale_state` error, no tolerance windows.

## Phase 8 — Duplicates, Escalations, Public Tracking, Outbox, RLS

- **Duplicates**: real scoring RPC `detect_complaint_duplicates(_complaint_id)` using trigram on subject/description + exact match on licensee/email/phone/reference; regulator-scoped; identical predicate in count + list RPCs; dismiss/confirm actions write audit + notifications.
- **Escalations**: cron-driven `evaluate_complaint_escalations()` covering age/SLA/severity/vulnerability/harm/volume/manual; writes to `complaint_escalation_cases` + workflow action.
- **Public tracking**: `get_public_complaint_tracking(_reference, _token)` with rate limit (via `otp_verifications`), server-side event filter (`public_visible`), redacted assignee/notes, brute-force lockout.
- **Outbox**: verify existing `claim_notification_outbox` / `reap_stuck_notification_outbox` under two concurrent workers; add idempotency key `(event_id, channel, recipient)` unique index; exponential backoff column; DLQ retry RPC.
- **RLS persona matrix**: 11 personas × (SELECT/INSERT/UPDATE/DELETE/RPC/attachment/duplicate/escalation/tracking/audit/notification) in `supabase/tests/complaints/14_rls_personas.sql`.

## SQL & Frontend Test Suites

Create all 15 SQL files under `supabase/tests/complaints/` and all 17 frontend tests under `src/test/complaints/` per your list. Tests raise on failure — no swallowed errors.

## CI

Extend `.github/workflows/ci.yml`:
- install → tsc → lint → build → vitest
- Boot Supabase locally via `supabase/setup-cli` action → `supabase db reset` → run `supabase/tests/complaints/*.sql` via `psql` → run Edge Function tests → security + dependency scan → linter.
- Upload artifacts (test output, migration log) on both success and failure.

## Evidence

Update all 11 files under `docs/verification/complaints/` with commit hashes, command output (truncated with pointers to CI artifacts), and per-item final classification (Fixed / Partially Fixed / Failed / Not Verified) with justification.

## Honest Limits

- I cannot bypass Lovable's per-migration approval click. I will queue them one after another with no chat pause.
- I cannot run `supabase db reset` inside this sandbox against your managed Cloud DB; that command belongs in CI against an ephemeral Postgres. I will wire it into CI and rely on CI to prove it green.
- Concurrent-worker and two-session concurrency proofs run inside SQL tests using `pg_background` / `dblink` — I'll use `dblink` since it's stock.
- If any single item cannot be Fixed under the strict rule (implementation + migration + DB object + frontend + behavioural test + SQL test + RLS test + runtime demo + CI green + no bypass), I will mark it `Partially Fixed` with the exact missing criterion and stop lying about it.

Approve this plan and I will start Phase 3 immediately and continue through Phase 8 + tests + CI + evidence in the same task, without further planning pauses.