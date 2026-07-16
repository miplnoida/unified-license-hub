## Complaints Module — Production Hardening (Final Pass)

Backend RPCs (`list_complaints`, `create_complaint`, `close_complaint`, `transition_complaint_status`, `assign_complaint`, `update_complaint_severity`, `retry_complaint_triage`, `escalation_hub_stats`, `duplicate_hub_stats`, `list_duplicate_clusters`, `simulate_escalation_rule`, `pending_escalation_count`, `pending_duplicate_count`) already exist with `_expected_updated_at` concurrency guards. The remaining work is frontend rewiring, small backend gap-filling, cleanup, and tests.

## 1. `ComplaintsList.tsx` rewrite (biggest change)

- Replace `supabase.from('complaints').select('*')` with `useQuery(['complaints', filters, sort, page, search])` calling `list_complaints({ _filters, _sort, _dir, _page, _page_size, _search })`. URL-sync via `useSearchParams`. Add Prev/Next pagination + page-size selector (25/50/100). No client slicing.
- `handleCreate` → `create_complaint` only. Remove: client `generate_complaint_number`, manual `logAudit`, manual `notification_dispatch_log` insert, and the post-create `evaluate-complaint-triage` invoke (trigger already enqueues triage).
- Remove all three `computeSlaStatus(...)` call sites; render `row.sla_status` via `slaBucketFromRow` + `slaStatusLabel/Variant`.
- Row close action opens shared `<CloseComplaintDialog>` requiring `reason` (min 5 chars) + `category` select (resolved / withdrawn / duplicate / no_jurisdiction / other); never send `_reason: null` or `_category: null`.
- Status change → `transition_complaint_status`; assignment → `assign_complaint`; triage retry → `retry_complaint_triage` RPC (drop the direct edge invoke at line 408). Every mutation passes `_expected_updated_at` from the loaded row and surfaces `complaint_stale` as a "Someone else updated this complaint, please reload" toast.
- Query uses `throwOnError` + explicit `isError` render of a retryable error card — never silent empty state.

## 2. `ComplaintDetail.tsx`

- Replace `.from('complaints').select('*')` with `get_complaint(_id)` RPC (add if missing — see §5). Consume `sla_status` from the response.
- Extract `<CloseComplaintDialog>` (shared with list). Keep existing severity / transition / assign paths but pass `_expected_updated_at`.

## 3. Intake unification

- `useMarketConduct.ts`: replace direct `sb.from('complaints').insert(...)` with `create_complaint`; drop the post-insert `evaluate-complaint-triage` invoke.
- `ConductClassificationCard.tsx` + `TriageRules.tsx` classification "run triage" button → call `retry_complaint_triage` RPC (permission-checked, audited server-side).

## 4. Dashboards & analytics — no more head counts

- `useConductDashboardMetrics.ts`, `useSupervisoryMetrics.ts`, `useSupervisoryTrends.ts`, `ConductEntitiesList.tsx`, `AnalyticsDashboard.tsx`, `ExecutiveSupervisoryDashboard.tsx`: replace the raw `from('complaints').select(count: 'exact')` scans with a single new `complaints_dashboard_counts(_scope jsonb)` RPC (SQL aggregate, regulator-scoped) returning `{open, critical, breached, under_investigation, closed, trend[]}`. One round-trip per surface.
- `ComplaintsAnalytics.tsx`: keep RPC; add filters UI (date range, regulator, sector, type, severity) piped into `_filters`; add explicit error card with retry.

## 5. Backend gap-fill (single new migration)

- `get_complaint(_id uuid) returns jsonb` — returns full row + `sla_status` (via `complaint_sla_status`) + workflow state; scoped by `assert_complaint_perm`.
- `complaints_dashboard_counts(_scope jsonb default '{}') returns jsonb` — regulator/entity-scoped aggregates.
- Confirm `close_complaint` rejects NULL `_reason` and NULL `_category` (add `RAISE EXCEPTION` if missing).
- Confirm every mutating RPC writes to `audit_logs` and inserts into `notification_dispatch_log` via the shared helper; add where missing.
- Grants: `authenticated`, `service_role`.

## 6. Cleanup (grep gates must be zero)

Delete/rewrite so these all return empty in `src/` production code (tests excluded):

```
rg "from\(['\"]complaints['\"]\)\.insert" src
rg "from\(['\"]complaints['\"]\)\.update" src
rg "from\(['\"]complaints['\"]\)\.select\('\*'\)" src/pages/complaints
rg "evaluate-complaint-triage" src/pages/complaints src/hooks src/components/complaints
rg "computeSlaStatus\(" src/pages/complaints src/components/complaints
rg "MOCK_|mockData|seedPairs|seedClusters|duplicates/seed" src
rg "_reason:\s*null|_category:\s*null" src/pages/complaints
rg "generate_complaint_number" src/pages src/components src/hooks
```

Note: `src/pages/reports/ReportPage.tsx` uses a local `mockData` const unrelated to complaints — out of scope, leave alone.

## 7. Tests (add under `src/test/`)

- `complaintsSla.test.ts` — parity with SQL `complaint_sla_status` across on_track / at_risk / breached / resolved_on_time / resolved_late.
- `complaintsList.test.tsx` — mock `list_complaints`, assert server-side pagination + search + sort + filter + error card + retry.
- `closeComplaintDialog.test.tsx` — submit disabled without reason/category; success calls RPC with both.
- `complaintMutations.test.ts` — stale `_expected_updated_at` surfaces reload toast; permission denial surfaces error.
- `complaintIntake.test.ts` — internal + external paths both hit `create_complaint`, no duplicate triage.
- `complaintTriage.test.ts` — retry only via RPC, unauthorized rejected.

## 8. Verification before commit

- `bunx tsgo --noEmit`
- `bun run lint`
- `bun run build`
- `bun run test`
- All grep gates in §6 return no non-test hits.
- Manual smoke: paginated list w/ URL round-trip, close with mandatory reason+category, severity override with reason, analytics with filters, escalation sweep + banner, duplicate decide + cluster panel + banner, two-tab stale-update, unauthenticated triage retry rejected.

## Non-goals

- No UI redesign. Layouts, columns, copy stay identical.
- No feature removal. Every existing button keeps working.
- `ReportPage` local `mockData` (unrelated to complaints) untouched.

## Technical notes

- All complaint mutations flow through RPCs that share `_apply_complaint_change` for audit + notification + concurrency uniformity.
- `list_complaints` and `get_complaint` return server-computed `sla_status`; `slaBucketFromRow` prefers it, JS helper is fallback only.
- One new migration; `src/integrations/supabase/client.ts`, `types.ts`, `.env` untouched (types regen after apply).
