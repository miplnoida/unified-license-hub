# Complaints Module — Verification-First Completion Plan

This plan finishes the Complaints hardening work from `docs/22_AUDIT_REPORT.md` under a strict "no claim without evidence" policy. Each phase produces artifacts (logs, SQL output, screenshots) checked into `docs/verification/complaints/` so classification (Fixed / Partial / Not Verified / Failed) is auditable.

## Phase 0 — Baseline & Honest Inventory (read-only)

- Record baseline commit hash into `docs/verification/complaints/00_baseline.md`.
- Re-read `docs/22_AUDIT_REPORT.md` (Complaints section) and `.lovable/plan.md`.
- Inventory every complaints artifact:
  - Frontend: `src/pages/complaints/*`, `src/components/complaints/*`, `src/hooks/useMarketConduct.ts`, `useComplaint*`, `WorkflowActionPanel.tsx`, `ComplaintTrackingTimeline.tsx`, banners, `complaintStatus.ts`, `complaintSchemas.ts`, `complaintAttachments.ts`.
  - Backend: every migration touching `complaints`, `complaint_*`, `approval_*` for entity_type='complaint', `notification_outbox`, `execute_complaint_workflow_action`, `get_complaint_tracking`, `claim_notification_outbox`, `reap_stuck_notification_outbox`, `retry_dead_notification_outbox`, complaint triggers.
  - Edge Functions: `submit-public-complaint`, `evaluate-complaint-triage`, `dispatch-notification-event`, `process-notification-outbox`.
  - Tests: `complaintSchemas.test.ts`, `complaintWorkflowGuardrails.test.ts`, `complaintsSla.test.ts`, `marketConduct.test.ts`.
- For each of the 16 audit items produce a row in `docs/verification/complaints/01_inventory.md` with columns: **Already Fixed / Partial / Broken / Missing**, backed by file+line references. No code changes in this phase.

## Phase 1 — Canonical Creation Path (audit items 1, 2, 3, 6, 7)

Backend (single forward-only migration):

- `create_complaint(payload jsonb, variant text)` — SECURITY DEFINER, `SET search_path=public`, `REVOKE ... FROM PUBLIC`, `GRANT EXECUTE TO authenticated`. Validates against `complaint_intake_rules`, strips `severity`/`priority` for non-staff variants, generates complaint number, inserts complaint, writes audit row, kicks off the existing `trg_start_complaint_workflow`, enqueues notification outbox rows in the same transaction. Returns `{ok, complaint_id, complaint_number, errors[]}`.
- `finalize_complaint_with_attachments(complaint_id uuid, pending_upload_ids uuid[])` — atomically links uploads via `complaint_evidence` inside a single transaction; scheduled reaper cleans orphans older than 24h.
- New table `complaint_intake_rules` (regulator_id, intake_source, required fields flags) — with CREATE → GRANT → RLS ENABLE → POLICY in that order, in the same migration.

Edge Function:

- `submit-public-complaint` refactored to be a thin wrapper: verify captcha/rate-limit, call `create_complaint` via service role, return only the sanitized result.

Frontend:

- `useCreateComplaint` becomes the single client entry point (variants: `public | internal | licensee`).
- `NewInternalComplaint.tsx`, public form, and licensee form all switched to `react-hook-form + zodResolver` using `src/lib/complaintSchemas.ts`.
- Field-level errors; disabled state during submit; duplicate-submit guard; unsaved-changes guard on Cancel.

Verification for Phase 1:

- SQL integration tests in `supabase/tests/complaints/01_create.sql` (pgTAP-style asserts via `psql -v ON_ERROR_STOP=1`):
  - happy path returns complaint_number
  - severity injection stripped for public variant
  - missing required field → structured error, no row inserted
  - attachments link only on success; on rollback no `complaint_evidence` rows persist
- Vitest: schema unit tests + hook tests for all three variants.
- Manual Playwright run against local preview for each variant, screenshots stored under `docs/verification/complaints/phase1/`.

## Phase 2 — Vulnerability & Entity Lookup (items 4, 5)

- DB trigger `enforce_vulnerability_consistency` on `complaints` (indicator false → notes+category null; indicator true → at least one populated).
- `search_licensees(query, regulator_id, limit, offset)` RPC; frontend switched to debounced async combobox based on existing `LicenseeSwitcher` pattern.
- Reference-data hooks return discriminated `{status: 'empty'|'denied'|'network'|'error'|'ok', data}`; banners/errors reflect the real state.

Verification: SQL tests for the trigger; RTL tests for combobox states; screenshots of empty/denied/network states.

## Phase 3 — Status Model & Workflow Enforcement (items 8, 9)

- New view `v_complaint_status_catalog`; `complaintStatus.ts` generated from it (script under `scripts/gen-complaint-status.ts`).
- Ensure enum values `rejected` and `duplicate` exist; migrate legacy rows.
- Expand `complaintWorkflowGuardrails.test.ts` to fail on any direct `.update({status})` / `.insert()` into `complaints`, `enforcement_actions`, `enforcement_case_events` from `src/**`.
- Confirm `ComplaintDetail.tsx` and `EnforcementDetail.tsx` mutate lifecycle only via `execute_complaint_workflow_action`.

Verification: guardrail test output captured; SQL test that direct status writes by non-service roles are blocked by RLS.

## Phase 4 — Duplicate & Escalation Wiring (items 10, 11)

- `generate_duplicate_candidates(complaint_id)` using pg_trgm on subject/description + licensee + email/phone; nightly job + on-insert trigger. Populates `complaint_duplicate_pairs` + `complaint_duplicate_clusters`.
- Actions: `dismiss_duplicate_pair`, `confirm_duplicate_link` (sets status='duplicate', links parent, writes audit).
- `evaluate_complaint_escalations()` scheduled function reads `complaint_escalation_rules` (age, severity, harm, repeat volume) and inserts into `complaint_escalation_cases`.
- `DuplicateAlertBanner` / `EscalationBanner` already return error UIs; hubs wired to paginated RPCs `list_duplicate_pairs`, `list_escalation_cases`. Remove any remaining mock data.

Verification: SQL fixtures create near-duplicates → RPC returns pair with score > threshold; escalation rule fixture ages a complaint → escalation case appears. Recorded in `phase4/`.

## Phase 5 — Public Tracking & Notifications (items 12, 13)

- `get_public_complaint_tracking(reference, verification_token)` returns only events where `approval_steps.is_public_visible=true`; strips assignee names & internal notes.
- Add `approval_steps.public_stage_label` / `public_stage_description`; seed for complaint workflow.
- Re-verify `claim_notification_outbox` uses `FOR UPDATE SKIP LOCKED`; add unique idempotency index `(event_key, entity_id, recipient, correlation_id)`; confirm enqueue is inside `execute_complaint_workflow_action` transaction.

Verification: SQL test — internal note never appears in public RPC result; concurrent claim test proves no double delivery; forced worker crash → row returns to queue.

## Phase 6 — RLS, Permissions & Guardrail Honesty (items 14, 15)

- Tighten `WITH CHECK (true)` policies on `complaints` and related tables; scope by regulator + role via `has_role` / `has_regulator_scope` security-definer functions.
- Guardrail test rewritten to distinguish `rg` exit codes 0/1/≥2 (already partially done — verify).
- Grep-based test asserts no service-role client is imported into `src/**` browser code.
- Full RLS matrix executed via `supabase/tests/complaints/rls_matrix.sql` across 11 personas: Anonymous, Public complainant, Authenticated complainant, Licensee Primary, Licensee Secondary, Complaint Officer, Investigator, Supervisor, Enforcement, Regulator Admin, Different Regulator. For every complaint table: SELECT/INSERT/UPDATE/DELETE expected vs actual, recorded as a table in `phase6/rls_matrix.md`.

## Phase 7 — Automated & Manual Verification (item 16)

Automated (all outputs captured verbatim in `phase7/`):

```
bun install --frozen-lockfile
bunx tsgo --noEmit
bun run lint
bun run build
bun run test
```

SQL: `psql -v ON_ERROR_STOP=1 -f supabase/tests/complaints/*.sql` against a disposable DB reset from migrations.
Edge Functions: `supabase functions test` for the four complaint-relevant functions.
Security: `security--run_security_scan` output stored.

Manual (Playwright, headless=True, viewport 1280×1800; screenshots per step):

- Public submission end-to-end (anonymous + identified)
- Internal creation (staff)
- Licensee submission
- Full lifecycle: submission → triage → assignment → investigation → evidence → correspondence → escalation → enforcement → resolution → appeal → closure
- Bypass attempts: invalid transition, skipped step, wrong assignee, stale update, cross-regulator access — each MUST fail; failure captured
- Public tracking page shows only public stages
- Attachment upload/download with signed URL expiry
- Duplicate detection candidate + confirm/dismiss
- Escalation auto-trigger by age fixture

## Phase 8 — Final Report

`docs/verification/complaints/REPORT.md` containing exactly the sections the user requires:

- Baseline + final commit hash
- Files changed / migrations added / RPCs added-changed / Edge Functions changed / Tables changed / RLS changes / Workflow changes / Tests added
- Build, test, SQL test, RLS matrix, workflow execution log, manual verification log
- Performance observations, security observations
- Remaining issues, regression risks
- Per-issue table with columns: **Status, Evidence path, File, Function/RPC, Root cause, Confidence**
- Any item that could not be executed (missing env, unavailable service) is marked **NOT VERIFIED** with the exact reason — never "should work" / "likely works"

## Technical constraints honored

- Forward-only migrations only; every new public table follows CREATE → GRANT → RLS ENABLE → POLICY in the same migration.
- Every new SECURITY DEFINER function: `SET search_path=public`, `REVOKE FROM PUBLIC`, narrow `GRANT`, `auth.uid()` + regulator-scope checks, structured error returns, `SELECT ... FOR UPDATE` where required.
- No mock/demo data on production paths.
- No `return null` swallowing of errors.
- No edits to `src/integrations/supabase/client.ts` or `types.ts`.

## Out of scope

- Non-complaint modules.
- Repo-wide `as any` cleanup (tracked separately in the audit).
- Historical migration edits.

## Deliverables per phase

Each phase closes with a signed-off entry in `docs/verification/complaints/PROGRESS.md` (Fixed / Partial / Not Verified / Failed + evidence link). Nothing is marked Fixed without a linked artifact.
