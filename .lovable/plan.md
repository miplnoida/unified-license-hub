## Complaints Module — Final Production Hardening

Close every remaining gap. No UI redesign. Surgical changes only. Nothing ships until the full verification pipeline is green.

---

### 1. Shared error UI

**New:** `src/components/complaints/QueryErrorState.tsx`
- Small card: title, message, "Retry" button, optional compact variant.
- Used across every complaint surface: list, detail panels, analytics, escalation hub, duplicate hub, evidence panel, classification card.

---

### 2. Frontend — detail & panels (`src/pages/complaints/*`, `src/components/complaints/*`)

For every secondary fetch (complainant, complaint type, enforcement case, attachments/evidence, assignee profiles, licensee, acknowledgements, duplicate cluster, escalation case):

- Convert to `useQuery` with `throwOnError: false`, explicit `isError` handling.
- Render `<QueryErrorState onRetry={refetch} />` on failure — never mask as empty.
- Remove every `catch {}`, `data || []`, `data ?? []`, silent fallback.
- Remove duplicated `interface RefLookup` in `ComplaintsList.tsx` (keep single source).
- Strip unused imports, dead state, TODO/FIXME/mock/seed in complaint code paths.

---

### 3. SLA state standardization

Canonical states (SQL + TS identical):
`on_track | at_risk | breached | resolved_on_time | resolved_late`

- **SQL:** update `complaint_sla_status()` to return `resolved_on_time` / `resolved_late` (not collapse late-resolved into `breached`). Update `list_complaints` / `get_complaint` / analytics / dashboard RPCs to surface the new state.
- **TS:** update `src/lib/complaintsSla.ts` `SlaStatus` type, `computeSlaStatus`, `slaBucketFromRow`, labels, variants to match. Remove any callsite still using `computeSlaStatus` directly outside the lib.
- Filter UI accepts all five states.

---

### 4. Backend — one consolidation migration

Audit and normalize every mutating complaint RPC:

`create_complaint`, `assign_complaint`, `start_complaint_investigation`, `update_complaint_severity`, `classify_complaint`, `transition_complaint_status`, `resolve_complaint`, `close_complaint`, `retry_complaint_triage`, complaint→enforcement escalation, duplicate decision RPCs.

Each must:
1. `auth.uid()` present → else `complaint_forbidden`.
2. `has_permission` / role check → else `complaint_forbidden`.
3. Load current row; validate state transition → else `complaint_invalid_state`.
4. `_expected_updated_at` gate → else `complaint_stale`.
5. Apply change inside a single transaction (rollback on any downstream failure).
6. Exactly one `_apply_complaint_change` audit row (before/after JSON).
7. Exactly one `notification_dispatch_log` row via existing helper.
8. Return structured JSONB result `{ id, updated_at, status, ... }`.

Extra rules:
- `close_complaint`: `_category NOT NULL`, `length(trim(_reason)) >= 5`, current status ∈ closable set.
- `update_complaint_severity`: require `_reason` when value actually changes.
- `list_complaints`: confirm/extend filters — `status, severity, priority, sla, type, product, channel, category, intake_source, team, triage_state, vulnerability, regulator_id, created_from, created_to`. Facets include counts for all of these.

Grants: `authenticated`, `service_role`. `SECURITY DEFINER` where required.

---

### 5. Frontend — mutations

Every mutation call passes `_expected_updated_at: complaint.updated_at`:
- assign, severity, classify, transition, resolve, close, retry-triage, escalation, duplicate decide, investigation task ops.

Shared `handleStale(error)` helper: on `complaint_stale` → toast "Someone else updated this complaint. Reloading…" + invalidate query.

Remove every direct write to `complaints` / `complaint_evidence` / `complaint_escalation_*` / `complaint_duplicate_*` from frontend. All mutations go through RPCs.

---

### 6. Server-side list wiring

`ComplaintsList.tsx`:
- URL-synced controls for every filter listed above (types/statuses/severity/SLA/priority already wired; add product, channel, category, triage_state, team where missing).
- Sort, page, page-size, search all round-trip via URL.
- Error state uses `QueryErrorState`.

---

### 7. Test suite (`src/test/`)

Add real Vitest files (not references):

- `complaintsSla.test.ts` — all 5 states incl. `resolved_on_time` / `resolved_late`.
- `complaintsList.test.tsx` — pagination, page-size change, sort, search, every filter, URL round-trip, error card + retry.
- `complaintDetailErrors.test.tsx` — each panel renders `QueryErrorState` on RPC/table failure and recovers on retry.
- `closeComplaintDialog.test.tsx` — submit disabled without category + reason≥5; success passes `_expected_updated_at`.
- `complaintMutations.test.ts` — stale `updated_at` surfaces reload toast for every mutation.
- `complaintIntake.test.ts` — internal + external paths call `create_complaint`; triage runs exactly once server-side.
- `complaintTriage.test.ts` — retry only via `retry_complaint_triage`; unauthorized rejected; no duplicate triage.
- `complaintFlow.test.ts` — create → triage → assign → investigate → resolve → close.
- `complaintAuthorization.test.ts` — forbidden role → `complaint_forbidden` for every mutation.
- `complaintAuditNotifications.test.ts` — exactly one audit + one notification per mutation.
- `complaintEnforcementEscalation.test.ts` — escalation RPC rollback on downstream failure.
- `complaintAttachments.test.ts` — upload success, partial failure, retry.

---

### 8. Verification pipeline (must all be green before commit)

Commands:
```
bunx tsgo --noEmit
bun run lint
bun run build
bun run test
```

Grep gates — all must return zero non-test hits:
```
rg "from\(['\"]complaints['\"]\)\.(insert|update|delete)" src
rg "catch\s*\{\s*\}" src/pages/complaints src/components/complaints
rg "data\s*(\|\||\?\?)\s*\[\]" src/pages/complaints src/components/complaints
rg "throwOnError:\s*false" src/pages/complaints src/components/complaints
rg "interface RefLookup" src/pages/complaints/ComplaintsList.tsx   # expect ≤1
rg "computeSlaStatus\(" src/pages src/components                    # expect 0 (lib-internal only)
rg "MOCK_|mockData|seedPairs|seedClusters|TODO|FIXME" src/pages/complaints src/components/complaints src/hooks
rg "_reason:\s*null|_category:\s*null" src
```

Manual regression sweep against preview:
- Create (internal + external) → triage → assign → severity change → investigate → resolve → close.
- Escalation trigger + rollback.
- Duplicate hub list / cluster / decide.
- Analytics counts match `list_complaints` totals.
- Attachment upload + retry.
- List filters/search/pagination/URL back-forward.
- Two-tab stale-update toast.

---

### 9. Out of scope

- Any UI redesign.
- Reports module `report_logs` export path.
- Non-complaint dashboard slices.
- Enforcement `daysOpen`.

---

### 10. Technical notes

- Single new migration; `src/integrations/supabase/client.ts`, `types.ts`, `.env`, `supabase/config.toml` untouched.
- SLA math lives only in `src/lib/complaintsSla.ts`; UI always prefers server `sla_status`.
- `list_complaints` return shape unchanged: `{ total, page, page_size, rows, facets }`.
- No client Edge Function invokes for triage — server trigger only.

---

### 11. Final report format

- Files changed
- Migration name(s) + summary
- RPCs modified
- Exact test commands + pass/fail counts
- Type-check / lint / build results
- Grep-gate results
- Regression sweep summary
- Known limitations (if any)
- Final commit hash

Not production-ready until every item above is verified green.
