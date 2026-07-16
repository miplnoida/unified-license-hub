## Complaints Module — Final 8% Production Hardening

Close out the remaining gaps from the previous pass. No UI redesign, no refactor of working code — surgical fixes only.

### 1. Backend: `list_complaints` filter completion (1 migration)

Extend `list_complaints(_page, _page_size, _sort, _dir, _search, _filters, _scope)`:
- Add filter keys: `regulator_id`, `sector_id`, `created_from`, `created_to`, `intake_source`, `vulnerability`, `team_id`.
- All filters null-safe; unknown keys ignored.
- Facets include counts for the new dimensions where the UI already shows them.
- Same migration audits every mutating complaint RPC (`create_complaint`, `assign_complaint`, `update_complaint_severity`, `transition_complaint_status`, `close_complaint`, `resolve_complaint`, `retry_complaint_triage`, `start_complaint_investigation`, `classify_complaint`, escalation trigger, duplicate decide) and patches any that miss:
  - `has_permission` / role check → `RAISE EXCEPTION 'complaint_forbidden'`
  - state validation → `RAISE EXCEPTION 'complaint_invalid_state'`
  - `_expected_updated_at` gate → `RAISE EXCEPTION 'complaint_stale'`
  - `_apply_complaint_change` audit call (before/after JSON)
  - `notification_dispatch_log` insert via existing helper
  - `close_complaint`: reject null/short `_reason` and null `_category`
- Grants: `authenticated`, `service_role`.

### 2. Frontend: filter wiring + error handling

**`src/pages/complaints/ComplaintsList.tsx`**
- Add filter controls + URL sync for `regulator_id`, `created_from`, `created_to`, `intake_source`, `vulnerability`, `team_id` (types/statuses/severity/SLA already wired).
- Pass all filters through to `list_complaints` via existing `_filters` payload.

**`src/pages/complaints/ComplaintDetail.tsx`**
- Convert every secondary fetch to `useQuery` with `throwOnError: true`: complainant, complaint type, enforcement case, attachments/evidence, assignee profiles, licensee, acknowledgements.
- Each panel gets an inline `<QueryErrorState onRetry={refetch} />` block. Remove any `catch {}` or `data || []` fallbacks that hide failure.
- Ensure `retry_complaint_triage` mutation passes `_expected_updated_at: complaint.updated_at`, uses the shared `handleStale` helper, and invalidates the detail query on success.

**Shared component**
- `src/components/complaints/QueryErrorState.tsx` — small "Failed to load. Retry" card, reused across panels.

### 3. Verification gates (must all pass, non-test)

```
rg "from\(['\"]complaints['\"]\)\.(insert|update|delete)" src
rg "from\(['\"]complaint_(evidence|escalation|duplicate)" src/pages/complaints src/components/complaints  # reads only
rg "computeSlaStatus\(" src/pages src/components
rg "MOCK_|mockData|seedPairs|seedClusters|TODO|FIXME" src/pages/complaints src/components/complaints src/hooks/useConductDashboardMetrics.ts src/hooks/useMarketConduct.ts
rg "catch\s*\{\s*\}|data\s*\|\|\s*\[\]" src/pages/complaints src/components/complaints
```
All must return zero non-test hits.

### 4. Test suite (`src/test/`)

Add / complete:
- `complaintsSla.test.ts` — on_track / at_risk / breached / resolved_on_time / resolved_late.
- `complaintsList.test.tsx` — server pagination, page-size change, sort, search, each filter (incl. regulator + date range), URL sync round-trip, error card + retry.
- `closeComplaintDialog.test.tsx` — submit disabled without reason+category; success passes both + `_expected_updated_at`.
- `complaintMutations.test.ts` — stale `updated_at` surfaces reload toast for assign / severity / transition / close / retry-triage.
- `complaintIntake.test.ts` — internal + external paths both call `create_complaint`; triage runs exactly once server-side.
- `complaintTriage.test.ts` — retry only via `retry_complaint_triage`; unauthorized rejected.
- `complaintFlow.test.ts` — create → triage → assign → investigate → resolve → close happy path.
- `complaintEnforcementEscalation.test.ts` — escalation RPC rollback on failure.
- `complaintAttachments.test.ts` — upload success + partial failure + retry.
- `complaintAuthorization.test.ts` — forbidden role → `complaint_forbidden`.
- `complaintAuditNotifications.test.ts` — one audit + one notification row per mutation (no duplicates).

### 5. Quality pipeline (run in order, fix before commit)

```
bunx tsgo --noEmit
bun run lint
bun run build
bun run test
```

### 6. Regression sweep

Manual smoke against the running preview:
- Create (internal + external) → triage runs → assign → severity change → investigate → resolve → close.
- Escalation trigger + rollback path.
- Duplicate detection hub (list, cluster detail, decide).
- Analytics dashboard counts match `list_complaints` totals.
- Attachment upload + retry.
- List filters/search/pagination/URL back-forward.
- Stale-update toast when two tabs mutate same complaint.

### 7. Final report format

- Files changed
- Migrations (name + summary)
- RPCs modified
- Test results (pass/fail counts)
- Build / lint / typecheck status
- Regression summary
- Known limitations (if any)

### Out of scope

- Any UI redesign.
- Reports module `report_logs` export path.
- Enforcement `daysOpen` (not SLA).
- Non-complaint dashboard slices.

### Technical notes

- One new migration; `src/integrations/supabase/client.ts`, `types.ts`, `.env`, `supabase/config.toml` untouched.
- SLA math stays only in `src/lib/complaintsSla.ts`; UI prefers server `sla_status`.
- `list_complaints` return shape (`{total, page, page_size, rows, facets}`) unchanged.
- No client Edge Function invokes for triage — server trigger only.
