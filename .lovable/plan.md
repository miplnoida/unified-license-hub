## Complaints Module — Enterprise Hardening Implementation

Implementing the 16 outstanding items from `docs/22_AUDIT_REPORT.md`. Delivered as small, reviewable commits, grouped by concern. No documentation-only commits; no `return null` suppressions; no mock data in production paths.

### Phase 0 — Baseline & verification (no code changes)

- Record baseline commit hash.
- Re-read `docs/22_AUDIT_REPORT.md` Complaints section.
- Re-inspect: `NewInternalComplaint.tsx`, `ComplaintsList.tsx`, `ComplaintDetail.tsx`, `useMarketConduct.ts`, `WorkflowActionPanel.tsx`, `complaintStatus.ts`, `complaintAttachments.ts`, duplicates/escalations components, `execute_complaint_workflow_action` RPC, triage Edge Function, `notification_outbox` worker, guardrail test.
- For each of the 16 items: mark "already fixed / partially / open" before touching code. Skip items already correct.

### Phase 1 — Canonical creation path (items 1, 2, 3, 6, 7)

Backend (forward-only migration):

- New RPC `create_complaint(payload jsonb, is_internal bool)` — SECURITY DEFINER, `search_path=public`, validates payload with `jsonschema`-style CHECKs, generates complaint_number, inserts complaint, kicks off `start_complaint_workflow` trigger equivalent, writes audit row, enqueues notification outbox rows in the same transaction. Returns `{ok, complaint_id, complaint_number, errors[]}`.
- Enforce server-side: external complainants cannot set `severity`/`priority` (columns stripped from payload before insert; regulator staff receive raw impact/urgency for triage).
- Configurable required fields via new `complaint_intake_rules` table (per regulator + intake source): complaint_type_required, category_required, product_required, etc. Backend validates against this table.
- Attachment atomicity: new RPC `finalize_complaint_with_attachments(complaint_id, upload_refs[])`. Flow becomes: (a) client uploads to storage → gets `file_uploads.id`; (b) client calls `create_complaint` with `pending_upload_ids[]`; (c) RPC atomically links them via `complaint_evidence` inside the same transaction. Orphan uploads reaped by scheduled job.
- Revoke `EXECUTE` from PUBLIC; grant to `authenticated`; anonymous public submissions go through existing `submit-public-complaint` Edge Function which then calls the same RPC with `SECURITY DEFINER`.

Frontend:

- New shared Zod schemas in `src/lib/complaintSchemas.ts` (public, internal, licensee variants) — used by both forms and Edge Function.
- `useCreateComplaint` hook becomes the single client entry point; `useCreateInternalComplaint` and any public submission hook are refactored to call it with variant. Duplicate `.insert()` paths removed.
- Field-level error rendering via `react-hook-form` + `zodResolver`; replace generic "please fill all fields" toasts.
- `NewInternalComplaint.tsx`: add Cancel/Back with unsaved-changes guard (existing `useUnsavedChanges` pattern); disabled state during submit; duplicate-submit protection.

### Phase 2 — Vulnerability & entity lookup (items 4, 5)

- DB CHECK / trigger: `vulnerability_indicator=false` → `vulnerability_notes` and `vulnerability_category` must be null; `true` → at least one of them required.
- RLS: `complaint.vulnerability_notes` readable only by regulator roles via a column-level view; public/licensee views expose only a boolean flag.
- Replace client-side 500-row licensee list with `search_licensees(query, regulator_id, limit, offset)` RPC. Frontend uses debounced async combobox (existing `LicenseeSwitcher` pattern).
- Reference-data hooks distinguish `{status: 'empty'|'denied'|'network'|'error'|'ok'}`; UI shows correct message per state.

### Phase 3 — Status model & workflow enforcement (items 8, 9)

- `complaintStatus.ts` becomes generated from a single DB view `v_complaint_status_catalog` (label, badge variant, is_public, allowed_transitions).
- Add missing DB enum values (`rejected`, `duplicate`) if not present; migrate any legacy mismatched rows.
- Audit and remove any remaining direct `.update({status})` / `.insert()` calls into `complaints`, `enforcement_actions`, `enforcement_case_events` from React. Add a lint rule / expand the guardrail test to fail on those patterns.
- Confirm `ComplaintDetail.tsx` and `EnforcementDetail.tsx` mutate lifecycle only via `execute_complaint_workflow_action`.

### Phase 4 — Duplicate & escalation live wiring (items 10, 11)

- Duplicate detection RPCs: `generate_duplicate_candidates(complaint_id)` using trigram similarity on subject/description + licensee + complainant email/phone; scheduled nightly + on-insert trigger. Populates `complaint_duplicate_pairs` and `complaint_duplicate_clusters`.
- Actions: `dismiss_duplicate_pair`, `confirm_duplicate_link` (sets `status='duplicate'`, links parent, writes audit).
- `DuplicateAlertBanner` / `EscalationBanner`: replace `return null` on error with a proper error toast + retry; only hide on genuine zero-count success. Wire hubs to real paginated RPCs (`list_duplicate_pairs`, `list_escalation_cases`).
- Escalation engine: `evaluate_complaint_escalations()` scheduled function reads `complaint_escalation_rules` (age, severity, harm amount, repeat volume) and inserts into `complaint_escalation_cases`. Manual escalation and enforcement linkage go through workflow action.

### Phase 5 — Public tracking & notifications (items 12, 13)

- New RPC `get_public_complaint_tracking(reference, verification_token)` returning only workflow events where `approval_steps.is_public_visible=true`; no assignee names, no internal notes.
- Public tracking page renders friendly stage descriptions from `approval_steps.public_stage_label` / `public_stage_description` columns (added by migration, seeded).
- Notification outbox: verify `claim_notification_outbox` uses `FOR UPDATE SKIP LOCKED`; add idempotency key `(event_key, entity_id, recipient, correlation_id)` unique index; enqueue happens inside `execute_complaint_workflow_action` transaction (already partially done — verified end-to-end). Admin retry surface reused from existing dead-letter view.

### Phase 6 — RLS, permissions & guardrail honesty (items 14, 15)

- Rewrite `src/test/complaintWorkflowGuardrails.test.ts` helper to distinguish `rg` exit codes: 0=matches, 1=no matches, ≥2=error → throw. All secondary greps preserved.
- Tighten permissive `WITH CHECK (true)` policies flagged by the audit on `complaints` and related tables; scope by regulator + role via `has_role`/`has_regulator_scope`.
- Ensure no `service_role` client is used from the browser (grep-based guardrail test).

### Phase 7 — Automated tests (item 16)

- SQL integration tests under `supabase/tests/complaints/` using `pgtap` (or plain SQL + `psql --set ON_ERROR_STOP=1`) covering: create, transitions, wrong-role denial, cross-regulator denial, stale-state (optimistic concurrency), assignment resolution, required workflow fields, transaction rollback on notification enqueue failure, duplicate detection, escalation rule matching, attachment atomicity, outbox concurrency + idempotency + dead-letter retry, public tracking redaction, audit-log creation.
- Vitest behavioural tests for: Zod schemas, `useCreateComplaint` variants, `WorkflowActionPanel` state machine, tracking timeline visibility filter, duplicate/escalation banner error states, status catalog consistency.
- Edge Function tests for `submit-public-complaint`, `dispatch-notification-event`, `process-notification-outbox` (existing pattern using dotenv).

### Phase 8 — Verification & completion report

Run and record output of:

```text
bun install --frozen-lockfile
bunx tsc --noEmit
bun run lint
bun run build
bun run test
supabase db reset (disposable env)
psql -f supabase/tests/complaints/*.sql
supabase functions test
```

Deliver report with: baseline + final commit hashes, files changed, migrations added, RPCs added/changed/retired, per-issue status table (Fixed/Partial/Not-fixed/Not-reproducible) with evidence, RLS test matrix across the 11 personas, manual workflow results, remaining limitations, regression risks.

### Technical constraints honored

- All new `SECURITY DEFINER` functions: explicit `SET search_path = public`, `REVOKE ... FROM PUBLIC`, `GRANT` narrowly, validate `auth.uid()` and regulator scope, use `SELECT ... FOR UPDATE` where needed, return structured errors.
- New public tables (if any) follow: CREATE → GRANT → RLS ENABLE → POLICY, in that order, in the same migration.
- Forward-only migrations; no edits to historical migrations.
- No mock/demo data ships in production paths.
- Existing visual design preserved; only minimal UX additions (Cancel/back, field errors, loading/empty/error states).

### Out of scope

- Non-complaint modules.
- Broader repo-wide `as any` cleanup (audit item, not a complaints issue).
- Historical migration edits.
