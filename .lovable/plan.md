
# Complaints Module — Final Fix Plan (execute end-to-end)

Executed in Build mode after approval. One pass, all 16 sections. Nothing marked Fixed unless implementation + tests exist; runtime-only items (Docker/Supabase CLI) recorded as "Not Verified — CI" per your answer to Q3.

## 1. Backend — migrations & RPCs (single migration file)

`supabase/migrations/<ts>_complaints_final_hardening.sql`

- **`create_complaint_with_attachments(_variant, _payload, _staged_upload_ids uuid[], _idempotency_key text)`** — SECURITY DEFINER, atomic:
  1. Idempotency check on `(created_by, idempotency_key)`; return existing complaint if hit.
  2. Delegate payload validation to existing `create_complaint` internals (reused via extracted helper `_validate_and_insert_complaint`).
  3. For each staged upload: verify `uploaded_by = auth.uid()`, `context = 'complaint_staged'`, not already linked, regulator scope matches complaint's regulator.
  4. Insert `complaint_evidence` rows; on any failure raise → whole tx rolls back.
  5. Start workflow instance, write audit, enqueue notifications.
  6. Public/anonymous/licensee variants ignore server-controlled fields (severity/priority/regulator/assignee/status) — enforced in the validator.
- **`finalize_complaint_with_attachments`** kept for legacy retry path; new writes use the combined RPC.
- **`change_complaint_severity(_complaint_id, _new_severity, _reason, _expected_version)`** — SECURITY DEFINER:
  - Role check via `has_role`; regulator scope; workflow-state gate; optimistic concurrency on `complaints.version`; requires reason when previous severity non-null; audit + notification outbox row.
  - Adds `complaints.version int not null default 1` with bump trigger.
- **`list_complaint_assignment_teams(_regulator_id)`** — returns distinct active teams from workflow assignment config + `complaints.assigned_team`, regulator-scoped.
- **Complaint list/count RPCs** updated to accept `_date_from date, _date_to date, _tz text` and apply `(created_at AT TIME ZONE _tz)::date BETWEEN _date_from AND _date_to`.
- **Vulnerability escalation**: extend `complaint_escalation_rules.criterion` check to include `'vulnerability'`; extend `evaluate_complaint_escalations` with a vulnerability branch reading `complaints.vulnerability_indicator`, `vulnerability_categories`, `vulnerability_review_state`; regulator-scoped, dedupe active cases, skip closed.
- **Staged upload state**: `file_uploads.context = 'complaint_staged'` + partial index; new `cleanup_stale_staged_complaint_uploads()` (extends storage cleanup edge fn).
- GRANTs + RLS unchanged surface; new RPCs granted to `authenticated`, service_role.

## 2. Frontend

**Shared intake service** — `src/hooks/useCreateComplaint.ts` extended with variants (`public|anonymous|licensee|internal|referral|whistleblower|staff_intake`), staging → finalize flow, idempotency key (uuid per form mount), structured error translation via new `src/lib/complaintErrors.ts`. All complaint creation surfaces refactored:

- `src/pages/complaints/NewInternalComplaint.tsx` — wraps submit in try/catch/finally, resets pending state, keeps form dirty on failure, single toast source, uses shared service.
- `src/pages/complaints/ComplaintsList.tsx` — quick-create + Assigned-Team filter now sourced from `list_complaint_assignment_teams` via new `useComplaintAssignmentTeams(regulatorId)` hook; rename "Demo evidence view" → "Expand evidence summaries" with paginated expansion only.
- `src/pages/complaints/ComplaintDetail.tsx` — remove local `STATUS_META`; use `complaintStatusLabel/Variant` + `useComplaintStatusCatalogue`; replace direct `from('licensees').limit(20)` with shared `LicenseePicker` (server-side search RPC `search_licensees`, regulator-scoped, pagination, load-more, selection persistence, error states).
- Public + licensee complaint forms refactored onto the shared service; server remains authoritative on privileged fields.
- **Reference-data hook** (`useComplaintReferenceData`) — inspects every response, distinguishes permission/session/network/empty, renders `QueryErrorState` with Retry, blocks submit when mandatory refs failed. Query keys include `activeRegulatorId`, `activeSectorId`, `portalType`, `roleSetHash`.
- **Date filter**: DatePicker sends `{date_from, date_to, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone}`; no client Date math.
- **Cache hygiene**: `AuthContext` sign-out clears complaint query keys; regulator switch invalidates `['complaints', ...]` prefix.

## 3. Tests

Frontend (`src/test/`):
- `complaintCreateWithAttachments.test.ts` — success, rollback, cross-user rejection, idempotent duplicate, retry.
- `complaintLicenseeSearch.test.ts` — pagination, licence# beyond 20, cross-regulator absent, permission error surfaced.
- `complaintReferenceData.test.ts` — permission vs empty vs network.
- `complaintSubmissionRecovery.test.tsx` — pending resets, form retained, no double toast.
- `complaintStatusCatalogueGuard.test.ts` — regex guard preventing new local STATUS_META in `src/pages/complaints/**`.
- `complaintAssignmentTeams.test.ts` — team on later page still listed.
- `complaintDateBoundaries.test.ts` — 00:00, 23:59:59, DST regulator, just-outside.
- `complaintSeverityGovernance.test.ts` — no-op, initial, reason required, unauthorised, stale version, cross-regulator.
- `complaintIntakeSharedService.test.ts` — variants + guardrail that only shared service calls `create_complaint*` RPCs.
- `complaintRegulatorCacheSwitch.test.ts` — switch regulator triggers refetch, sign-out clears cache.

pgTAP (`supabase/tests/complaints/`):
- `17_atomic_intake.sql` — combined RPC rollback, cross-user/regulator staged file rejection, idempotency.
- `18_severity_governance.sql` — full matrix.
- `19_assignment_teams.sql` — regulator scope + inactive exclusion.
- `20_date_boundaries.sql` — TZ conversion assertions.
- `07_escalations.sql` — replace documented-gap assertion with real vulnerability behavioural tests (indicator, category, unresolved review, closed skip, dedupe, cross-regulator).

Edge Function tests: existing 12 retained; add case in `complaint-storage-cleanup/index_test.ts` for stale `complaint_staged` uploads.

## 4. CI & Lint (Section 14 — Option B)

- Add `.eslintrc-baseline.json` capturing current violations via `eslint --format json` snapshot.
- New script `scripts/lint-baseline.mjs`: fails only on violations not in baseline OR in Complaints module paths (`src/pages/complaints/**`, `src/hooks/useCreateComplaint*`, `src/lib/complaint*`, `supabase/functions/complaint-*`).
- `.github/workflows/ci.yml`: lint job runs `node scripts/lint-baseline.mjs` (blocking); db-tests + edge-fn jobs no longer depend on legacy lint; no `continue-on-error` on Complaints checks. Add `docs/lint-baseline.md` explaining the baseline + removal tracker issue reference.

## 5. Verification doc

Rewrite `docs/verification/complaints/11_final_verification.md`:
- Baseline commit `21db8cc`, final commit (post-push).
- Files changed, migrations added, RPCs added/changed (table).
- Local results: `bun install`, `tsgo`, `bun run build`, `bun run test`, `deno test`.
- Section-by-section status using {Fixed | Partially Fixed | Failed | Not Verified | Not Reproducible}. `supabase test db`, `supabase db reset`, cron/storage runtime → **Not Verified — runs in CI** with exact commands & expected output (per your Q3 answer).
- Cron/env/edge-function checklist as SQL + expected rows.

## Technical notes

```
Migration order:
  1. ALTER complaints ADD version, add trigger
  2. ALTER complaint_escalation_rules criterion CHECK
  3. CREATE FUNCTION _validate_and_insert_complaint (extracted)
  4. CREATE/REPLACE create_complaint (delegates to helper)
  5. CREATE create_complaint_with_attachments
  6. CREATE change_complaint_severity
  7. CREATE list_complaint_assignment_teams
  8. CREATE/REPLACE evaluate_complaint_escalations (+ vulnerability)
  9. ALTER list/count RPCs for tz-aware date filters
  10. GRANTs
```

Idempotency key stored on `complaints.idempotency_key` (nullable, unique per `created_by`).

Optimistic concurrency: `complaints.version` bumped by trigger on any UPDATE; `change_complaint_severity` compares `_expected_version`.

Shared status source: `useComplaintStatusCatalogue` (existing hook) is the single reader of `complaint_status_catalogue`; helpers `complaintStatusLabel/Variant` accept a catalogue map.

Regulator-scoped query keys use existing `useRegulator()` + `useActiveSector()` — added to every complaint-related `useQuery`.

## Out of scope

- Non-Complaints modules — untouched unless a shared file (e.g. `AuthContext` sign-out cache clear) is required.
- Full repo lint cleanup (deferred via baseline per Q2).
- Docker-dependent runtime verification (documented per Q3).
