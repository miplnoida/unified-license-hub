# Complaints Module — Final Completion Plan (Phases 5–8)

Baseline: Phases 1–4 complete (canonical `create_complaint` RPC, intake rules, vulnerability tri-state, paginated regulator-scoped `search_licensees`, guardrail tests honest).

Remaining work delivered in one continuous run, no approval gates between commits.

## Phase 5 — Canonical Intake Completion & Attachment Atomicity

**Database**
- Extend `public.create_complaint` to: strip client-provided severity/priority for public/licensee sources, enforce intake rules server-side, generate complaint number, insert workflow instance + first `approval_step_actions` row, enqueue notifications via `notification_outbox`, write `audit_logs`, all in one transaction with `EXCEPTION` rollback and structured error codes.
- New RPC `public.finalize_complaint_with_attachments(complaint_id, staged_upload_ids[])`:
  - Verifies caller owns each `file_uploads` row and regulator matches complaint.
  - Inserts `complaint_evidence` rows, updates `file_uploads.linked_entity_*`.
  - Rolls back on any failure; returns per-file success/error map.
- Cron job `cleanup_orphan_complaint_uploads()` — removes staged uploads older than 24h with no `complaint_evidence` link.

**Frontend**
- Route every creation path (`NewInternalComplaint`, licensee submit, public submit edge fn) through `useCreateComplaint` + `finalize_complaint_with_attachments`. Delete direct `complaint_evidence` inserts in `src/lib/complaintAttachments.ts` — replace with RPC call.
- Show per-file retry UI on partial attachment failure.

## Phase 6 — Canonical Status Catalogue & Workflow Enforcement

**Database**
- Table `public.complaint_status_catalogue` (code, label, description, public_label, public_description, is_terminal, sort_order, variant).
- Seed with the 6 statuses in `src/lib/complaintStatus.ts`.
- FK `complaints.status → complaint_status_catalogue.code`.
- Harden `execute_complaint_workflow_action`: validate instance version (optimistic lock), current step, action availability, assignee, role, regulator; reject with typed error codes; write audit + enqueue notifications atomically.
- Revoke direct `UPDATE complaints.status` from `authenticated` role — force workflow RPC path.

**Frontend**
- Replace `src/lib/complaintStatus.ts` label/variant maps with a `useComplaintStatusCatalogue` hook backed by the table (cached via TanStack).
- All complaint list/detail/timeline components read from the hook.

## Phase 7 — Duplicate Management & Escalation Engine

**Database**
- Complete `generate_complaint_duplicate_candidates(complaint_id)` — trigram similarity across subject/description + licensee/complainant match; upserts `complaint_duplicate_pairs`.
- RPCs: `review_duplicate_pair`, `merge_duplicate_complaints`, `dismiss_duplicate_pair`, `link_related_complaint`. All regulator-scoped, audited, notification-enqueued.
- Escalation engine `evaluate_complaint_escalations()` (cron every 15 min): age, SLA breach, severity, harm score, repeat-volume rules from `complaint_escalation_rules`; opens `complaint_escalation_cases`, notifies supervisors, optionally links to enforcement.
- Manual escalation RPC `escalate_complaint_manual(complaint_id, reason, target_role)`.

**Frontend**
- Duplicate management page: paginated candidate list, filters, review/merge/dismiss actions, regulator-scoped counts (same query as list).
- Escalation dashboard tab in ConductDashboard: open cases, supervisor review action, enforcement link.

## Phase 8 — Public Tracking, Notifications, RLS

**Database**
- RPC `get_public_complaint_tracking(reference_number, verification_token)`:
  - Rate-limited via `security_event_logs` (10 attempts / 15 min / IP).
  - Returns only public labels/descriptions from status catalogue, public workflow milestones, no assignee names, no internal notes.
  - Redacts vulnerability/complainant PII beyond what submitter provided.
- Notification outbox hardening verification: idempotency keys, `FOR UPDATE SKIP LOCKED` (already in `claim_notification_outbox`), retry counter, dead-letter status, `reap_stuck_notification_outbox` cron.
- RLS matrix audit — one migration adjusting policies where 11-persona test uncovers gaps. Personas: anonymous, complainant (via token), licensee primary, licensee secondary, PPOC, complaint officer, investigator, supervisor, enforcement, regulator admin, cross-regulator user, unauthorised authenticated.

**Frontend**
- `/track/:reference` public route using the new RPC, no internal fields shown.
- Complaint tracking timeline (internal + licensee) driven by status catalogue + workflow instance.

## Testing

**SQL suite** at `supabase/tests/complaints/`:
- `01_intake.sql`, `02_intake_rules.sql`, `03_workflow.sql`, `04_workflow_concurrency.sql`, `05_authorisation.sql`, `06_attachments.sql`, `07_duplicates.sql`, `08_escalation.sql`, `09_notifications.sql`, `10_public_tracking.sql`, `11_rls_matrix.sql`, `12_audit_integrity.sql`.
- Each proves both success and failure paths, including bypass attempts.
- Runnable via `supabase db reset && supabase test db`.

**Frontend Vitest** additions:
- `complaintIntakeFlow.test.tsx`, `attachmentRecovery.test.tsx`, `workflowActions.test.tsx`, `duplicateBanner.test.tsx`, `escalationBanner.test.tsx`, `trackingTimeline.test.tsx`, `vulnerabilityReview.test.tsx`, `statusCatalogue.test.ts`, `publicTracking.test.tsx`.

## CI

- Extend `.github/workflows/ci.yml` with jobs: `supabase db reset`, `supabase test db` for complaints suite, edge function tests. Fail on any red.

## Evidence Documents

Author under `docs/verification/complaints/`:
- `04_phase3_attachments_status.md`
- `05_phase4_workflow.md`
- `06_phase5_duplicates.md`
- `07_phase6_escalations.md`
- `08_phase7_public_tracking.md`
- `09_phase8_notifications_rls.md`
- `10_test_results.md` (full SQL + Vitest output)
- `11_final_verification.md` — baseline commit, final commit, all migrations/RPCs/edge fns/policies changed, CI run URL, remaining risks, classification (Fixed / Partially Fixed / Failed / Not Verified / Not Reproducible) for every original audit item.

## Technical Details

```text
Migration order:
  1. status catalogue table + seed + FK
  2. create_complaint rewrite + finalize_complaint_with_attachments
  3. execute_complaint_workflow_action hardening + revoke direct status update
  4. duplicate + escalation RPCs + cron
  5. get_public_complaint_tracking + rate limit
  6. RLS matrix adjustments
  7. orphan cleanup cron + outbox reaper schedule
```

Structured error envelope for all new RPCs:
```json
{ "error_code": "COMPLAINT_INTAKE_RULE_VIOLATION", "field": "complaint_type_id", "message": "..." }
```

Concurrency: all workflow RPCs take `expected_instance_updated_at`; return `WORKFLOW_STALE` on mismatch.

## Blocker Policy

If a blocker cannot be resolved in-repo (e.g. Supabase test runner unavailable in CI image), Phase-11 doc records exact blocker, affected files, evidence needed. Every other requirement continues.
