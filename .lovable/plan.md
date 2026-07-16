## Complaints Module — Production Hardening (Final Pass)

Goal: finish the wiring the previous pass left incomplete — real server-side pagination/filters, URL sync, optimistic concurrency on every mutation, explicit error/retry UI, backend-aggregated dashboards, and a real test suite. Keep UI/features identical.

### 1. `ComplaintsList.tsx` — real server-side list

- Convert current one-shot `useEffect` + `_page_size: 200` load into a `useQuery(['complaints', {page, pageSize, sort, dir, search, filters}])` calling `list_complaints` with actual paging.
- Controls: Prev/Next, page-number input, page-size selector (25/50/100). Consume `total`, `page`, `page_size`, `facets` from RPC.
- Filters wired to backend `_filters`: status, severity, sla bucket, type, product, channel, team, intake source, vulnerability, regulator, `created_from`/`created_to`. Changing any filter → reset to page 1 and refetch.
- URL sync via `useSearchParams` (page, pageSize, q, sort, dir, plus each filter key). Back/forward restores state.
- `throwOnError: true` + explicit `isError` render: error card with message + Retry button. No `data || []` fallbacks masking failure.
- Row/table mutations (assign, severity, transition, close, retry-triage) pass `_expected_updated_at: row.updated_at`; on `complaint_stale` show toast: "This complaint was updated by another user. Reload before continuing." and invalidate the query.

### 2. `ComplaintDetail.tsx` — concurrency + errors on every mutation

- Every mutating call (`start_investigation`, `assign_complaint`, `update_complaint_severity`, classification RPC, `transition_complaint_status`, `resolve_complaint`, `close_complaint`, escalation trigger) reads `complaint.updated_at` and passes `_expected_updated_at`. Shared `handleStale(err)` helper.
- All secondary loads (types, categories, products, channels, licensees, profiles, complainant, enforcement case, attachments, assignees) become `useQuery` with `throwOnError` + inline error+retry blocks. No silent `catch {}`.
- Close path always sends non-null `_reason` (min 5 chars) and `_category` from a required Select — button disabled until both present. Same rule in `CloseComplaintDialog` shared with list.

### 3. Shared close dialog

Extract `src/components/complaints/CloseComplaintDialog.tsx` used by list + detail. Enforces:
- Category select: resolved | withdrawn | duplicate | no_jurisdiction | other.
- Reason textarea (min 5 chars).
- Submit disabled otherwise. Passes `_expected_updated_at`.

### 4. Dashboards & analytics — backend aggregation only

New RPC `complaints_dashboard_counts(_scope jsonb) returns jsonb` returning `{open, critical, breached, under_investigation, closed, by_licensee[], trend[]}`. Rewire:

- `src/hooks/useConductDashboardMetrics.ts`
- `src/hooks/useSupervisoryMetrics.ts` (complaint portion only)
- `src/hooks/useSupervisoryTrends.ts` (complaint trend only)
- `src/pages/conduct/ConductEntitiesList.tsx`
- `src/pages/analytics/AnalyticsDashboard.tsx` (complaint count only)
- `src/components/dashboard/ExecutiveSupervisoryDashboard.tsx` (complaint slice only)

All replace `.from('complaints').select(..., count:'exact', head:true)` and full-table `.select('id,status,...')` scans with the new RPC. Non-complaint queries in those files stay untouched.

`ComplaintsAnalytics.tsx`: add filters UI (date range, regulator, sector, type, severity) piped into `_filters`; error card + retry.

Out of scope (justified): `src/pages/reports/services/reportService.ts` complaint select is a reports export path, permission-checked and bounded — leave alone. `src/pages/enforcement/EnforcementList.tsx` `daysOpen` is enforcement age, not SLA — leave alone. `src/pages/reports/ReportPage.tsx` `mockData` is a reports placeholder unrelated to complaints — leave alone.

### 5. Backend gap-fill (single migration)

- `complaints_dashboard_counts(_scope jsonb default '{}')` — regulator/entity/date-scoped aggregates via SQL.
- Confirm every mutating RPC (`create_complaint`, `assign_complaint`, `update_complaint_severity`, `transition_complaint_status`, `close_complaint`, `resolve_complaint`, `retry_complaint_triage`, escalation RPCs, duplicate decide RPCs) has: permission check, state validation, `_expected_updated_at` enforcement raising `complaint_stale`, structured audit before/after via `_apply_complaint_change`, `notification_dispatch_log` insert, `RAISE EXCEPTION` on null `_reason`/`_category` for close. Patch any that don't.
- Grants: `authenticated`, `service_role`.

### 6. Grep gates (must all pass, non-test)

```
rg "from\(['\"]complaints['\"]\)\.insert" src
rg "from\(['\"]complaints['\"]\)\.update" src
rg "from\(['\"]complaints['\"]\)\.select" src/pages/complaints
rg "_page:\s*1|_page_size:\s*200|_filters:\s*\{\}|_search:\s*null" src/pages/complaints
rg "_reason:\s*null|_category:\s*null" src
rg "computeSlaStatus\(" src/pages src/components   # only src/lib and tests may match
rg "MOCK_|mockData|seedPairs|seedClusters|duplicates/seed" src/pages/complaints src/components/complaints src/hooks
rg "catch\s*\{\s*\}|data\s*\|\|\s*\[\]" src/pages/complaints src/components/complaints
```

### 7. Tests (`src/test/`)

- `complaintsSla.test.ts` — on_track / at_risk / breached / resolved_on_time / resolved_late parity.
- `complaintsList.test.tsx` — mock `list_complaints`, assert server-side pagination, page-size change, sort, search, each filter, URL sync round-trip, error card + retry.
- `closeComplaintDialog.test.tsx` — submit disabled without reason+category; success passes both + `_expected_updated_at`.
- `complaintMutations.test.ts` — stale `updated_at` surfaces reload toast for assign/severity/transition/close.
- `complaintIntake.test.ts` — internal (`useMarketConduct`) and external (`ComplaintsList` create) both call `create_complaint`; triage runs exactly once (no client edge invoke).
- `complaintTriage.test.ts` — retry only via `retry_complaint_triage` RPC; unauthorized rejected.
- `complaintFlow.test.ts` — create → triage → assign → investigate → resolve → close full happy path against mocked RPCs.
- `complaintEnforcementEscalation.test.ts` — escalation RPC rollback on failure.
- `complaintAttachments.test.ts` — upload success + partial failure + retry.

### 8. Verification before commit

- `bunx tsgo --noEmit`
- `bun run lint`
- `bun run build`
- `bun run test`
- All grep gates in §6 zero non-test hits.

### Technical notes

- `list_complaints` return shape used as-is: `{ total, page, page_size, rows, facets }`.
- SLA helper stays only in `src/lib/complaintsSla.ts`; UI always prefers server-provided `row.sla_status` and falls back to `slaBucketFromRow` only when absent.
- One new migration; `src/integrations/supabase/client.ts`, `types.ts`, `.env` untouched.
- No UI redesign, no feature removal.

### Non-goals

- Reports module `mockData` and enforcement `daysOpen` (not complaint SLA) stay untouched.
- No refactor of unrelated dashboards beyond the complaint slice.
