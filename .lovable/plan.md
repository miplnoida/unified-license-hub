
## Complaints Module — Final Production Hardening

Scope: close the remaining ~8% so the module is production-ready. No UI redesign. Surgical changes only. Nothing is claimed done until the full verification pipeline is green.

---

### 1. Shared error UI (already partly done)

`src/components/complaints/QueryErrorState.tsx` exists. Confirm both `full` and `compact` variants and use it everywhere below.

---

### 2. Frontend — detail & panels

Files: `src/pages/complaints/ComplaintDetail.tsx`, `src/pages/complaints/ComplaintsList.tsx`, `src/components/complaints/*` (Investigation, Evidence, Escalation, Duplicate hub, Classification, Analytics, Banners).

For every secondary fetch (complainant, complaint type, enforcement case, attachments/evidence, assignees, licensee, acknowledgements, classification refs, duplicate cluster, escalation case):

- Convert to `useQuery` with `throwOnError: false` + explicit `isError` handling.
- Render `<QueryErrorState onRetry={refetch} />` on failure — never mask as empty.
- Remove every `catch {}`, `data || []`, `data ?? []` fallback on failed queries.
- Strip unused imports, dead state, TODO / FIXME / MOCK / seed references.
- Remove any remaining duplicate `interface RefLookup`.

Loading UI during Retry: reuse existing skeleton/spinner or `QueryErrorState`'s `isRetrying` prop.

---

### 3. SLA canonicalization

Canonical states (SQL + TS identical): `on_track | at_risk | breached | resolved_on_time | resolved_late`.

- SQL: already updated `complaint_sla_status()` to split resolved. Also update `list_complaints`, `get_complaint`, complaints analytics/dashboard RPCs, and any reports that emit `sla_status` to surface the canonical value. Remove legacy `resolved` writes.
- TS: `src/lib/complaintsSla.ts` already updated. Remove `normalizeLegacy` after SQL is canonical.
- Filters, badges, labels, tests use all five states.
- No inline SLA math outside `src/lib/complaintsSla.ts` — grep gate: `computeSlaStatus\(` returns zero non-lib hits.

---

### 4. Backend — one consolidation migration

Normalize every mutating complaint RPC:

`create_complaint`, `assign_complaint`, `start_complaint_investigation`, `update_complaint_severity`, `classify_complaint`, `transition_complaint_status`, `resolve_complaint`, `close_complaint`, `retry_complaint_triage`, complaint→enforcement escalation, investigation task ops, correspondence ops, duplicate decision RPCs, escalation rule/decision RPCs.

Each must:
1. `auth.uid()` present → else `complaint_forbidden`.
2. `has_permission` / role check → else `complaint_forbidden`.
3. Load current row; validate state transition → else `complaint_invalid_state`.
4. `_expected_updated_at` gate → else `complaint_stale`.
5. Single transaction; rollback on any downstream failure.
6. Exactly one audit row via `_apply_complaint_change` (before/after JSON).
7. Exactly one `notification_dispatch_log` row via the shared helper.
8. Return structured JSONB result `{ id, updated_at, status, ... }`.

Extra rules:
- `close_complaint`: `_category NOT NULL`, `length(trim(_reason)) >= 5`, status ∈ closable set.
- `update_complaint_severity`: require `_reason` when value actually changes.
- `list_complaints`: confirm filters `status, severity, priority, sla, type, product, channel, category, intake_source, team, triage_state, vulnerability, regulator_id, created_from, created_to` and matching facet counts.

Grants: `authenticated`, `service_role`. `SECURITY DEFINER` where needed.

Create one shared PL/pgSQL helper (`_complaint_guard(_id, _expected_updated_at, _perm)`) so behaviour stays consistent.

---

### 5. Frontend concurrency wiring

Every mutation passes `_expected_updated_at: complaint.updated_at` (assign, severity, classify, transition, resolve, close, retry-triage, escalation, duplicate decide, investigation task ops, correspondence ops).

Shared `handleStale(error)` helper: on `complaint_stale` toast "This complaint was updated by another user. Reloading…", invalidate the complaint query, do NOT auto-retry.

Remove every direct frontend write to `complaints`, `complaint_evidence*`, `complaint_escalation_*`, `complaint_duplicate_*`, `complaint_investigation_tasks`, `complaint_correspondence`, audit/notification tables. All mutations go through RPCs. `ComplaintInvestigationTab.tsx` will be refactored to call `add_complaint_task`, `update_complaint_task`, `add_complaint_correspondence` RPCs added in the migration.

---

### 6. Server-side list wiring

`ComplaintsList.tsx`: URL-synced controls for every filter listed in §4 (add product, channel, category, triage_state, team where missing). Sort, page, page-size, search round-trip via URL. Error state uses `QueryErrorState`. Already largely done — audit and finish.

---

### 7. Test suite (`src/test/`)

Real Vitest files:

- `complaintsSla.test.ts` — all 5 states (already added; extend for `resolved_late` edge cases).
- `complaintsList.test.tsx` — pagination, page-size, sort, search, every filter, URL round-trip, error card + retry.
- `complaintDetailErrors.test.tsx` — each panel renders `QueryErrorState` on failure and recovers.
- `closeComplaintDialog.test.tsx` — disabled without category + reason ≥ 5; passes `_expected_updated_at`.
- `complaintMutations.test.ts` — stale `updated_at` surfaces reload toast for every mutation.
- `complaintIntake.test.ts` — internal + external paths call `create_complaint`; triage runs exactly once server-side.
- `complaintTriage.test.ts` — retry only via `retry_complaint_triage`; unauthorized rejected.
- `complaintFlow.test.ts` — create → triage → assign → investigate → resolve → close.
- `complaintAuthorization.test.ts` — forbidden role → `complaint_forbidden` for every mutation.
- `complaintAuditNotifications.test.ts` — exactly one audit + one notification per mutation.
- `complaintEnforcementEscalation.test.ts` — escalation RPC rollback on downstream failure.
- `complaintAttachments.test.ts` — upload success, partial failure, retry.
- `complaintDuplicateFlow.test.ts` — cluster + decision RPC contract.
- `complaintEscalationRules.test.ts` — rule create/edit and auto-escalation trigger.

---

### 8. Verification pipeline (must all be green)

```
bunx tsgo --noEmit
bun run lint
bun run build
bun run test
```

Grep gates — zero non-test hits:

```
rg "from\(['\"]complaints['\"]\)\.(insert|update|delete)" src
rg "catch\s*\{\s*\}" src/pages/complaints src/components/complaints
rg "data\s*(\|\||\?\?)\s*\[\]" src/pages/complaints src/components/complaints
rg "throwOnError:\s*false" src/pages/complaints src/components/complaints
rg "computeSlaStatus\(" src/pages src/components
rg "MOCK_|mockData|seedPairs|seedClusters|TODO|FIXME" src/pages/complaints src/components/complaints src/hooks
rg "_reason:\s*null|_category:\s*null" src
rg "evaluate-complaint-triage" src/pages/complaints src/components/complaints src/hooks
```

Manual regression against preview:
external+internal create → triage → assign → severity → classify → investigate → resolve → close; escalation + rollback; duplicate cluster/decide; attachment upload + retry; analytics vs list totals; filters/search/pagination/URL back-forward; two-tab stale toast; unauthorized access; query failure + Retry.

---

### 9. Out of scope

UI redesign, reports `report_logs` path, non-complaint dashboards, enforcement `daysOpen`.

---

### 10. Technical notes

- Single new migration; `src/integrations/supabase/client.ts`, `types.ts`, `.env`, `supabase/config.toml` untouched.
- SLA math only in `src/lib/complaintsSla.ts`; UI always prefers server `sla_status`.
- `list_complaints` return shape unchanged: `{ total, page, page_size, rows, facets }`.
- No client edge-function invokes for triage — server trigger only.

---

### 11. Final report

Files changed · migration name(s) · RPCs changed · exact test commands + pass/fail counts · typecheck/lint/build results · grep-gate output · regression summary · known limitations · final commit hash.

Not production-ready until every item above is verified green.
