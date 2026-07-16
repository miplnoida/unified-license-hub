## Complaints Module — Final Refactor (Phase 3)

Close the gap between the Phase 2 plan and what's actually in the tree. Verified pending work by grep:

- `ComplaintsList.tsx` still does `.select('*')` on complaints, still `.insert()`s directly, still generates complaint numbers, still calls `close_complaint(..., _reason: null)`, and still uses `computeSlaStatus` at 3 sites.
- `ComplaintDetail.tsx` still `.select('*').from('complaints')`.
- `ComplaintEvidenceRow.tsx` still calls `computeSlaStatus`.
- `useMarketConduct.ts` still `.insert()`s complaints directly (duplicate intake path).
- `EscalationHub` pulls full `complaint_escalation_cases` / `_rules` tables client-side for stats.
- `EscalationCaseDrawer.tsx` and `RuleCard.tsx` still import `MOCK_COMPLAINTS`; `mockData.ts` still ships; `duplicates/seed.ts` still ships; `ClusterGroupsPanel.tsx` still imports `seedClusters`.
- `EscalationBanner` and `DuplicateAlertBanner` return `null`.
- No optimistic concurrency guard on complaint mutations.
- Duplicate cluster and rule-simulation endpoints are missing.

## 1. Backend (one migration + edge function tweak)

- Add missing RPCs, all `SECURITY DEFINER` with `assert_complaint_perm` + audit + notification helper + optimistic concurrency (`_expected_updated_at`):
  - `list_complaints(_filters jsonb, _sort text, _dir text, _page int, _page_size int, _search text) → jsonb` returning `{rows, total, facets}`. Applies regulator scope, status/severity/type/date/SLA filters, ILIKE across `complaint_number,title,consumer_name,email`, keyset-friendly ORDER BY.
  - `create_complaint(_payload jsonb)` — single canonical intake used by internal + external; server-side number generation (already exists via trigger — keep), SLA fill, dedupe short-circuit, triage enqueue, notification event `complaint.created`. Returns full row.
  - `close_complaint(_id, _reason text NOT NULL, _category text NOT NULL, _expected_updated_at timestamptz)` — reject NULL reason.
  - `update_complaint_severity(_id, _severity, _reason, _expected_updated_at)` — already exists; add concurrency guard + reason NOT NULL.
  - `transition_complaint_status(_id, _new_status, _reason, _expected_updated_at)` — replaces every remaining `.update({status:...})`.
  - `assign_complaint(_id, _assignee, _expected_updated_at)`.
  - `retry_complaint_triage(_id)` — wraps edge invocation server-side.
  - `escalation_hub_stats() → jsonb` — `{pending, critical, escalated, active_rules, total_rules}` computed in SQL.
  - `duplicate_hub_stats() → jsonb`, `list_duplicate_pairs(_filters)`, `decide_duplicate_pair(_id, _action)`, `list_duplicate_clusters(_dimension)`, `upsert_duplicate_rule`, `toggle_duplicate_rule`, `simulate_escalation_rule(_criterion, _threshold)`.
  - `pending_escalation_count()` and `pending_duplicate_count()` for banners.
- Add `complaint_duplicate_clusters` table (dimension, key, member_ids uuid[]) with GRANTs + RLS + `updated_at` trigger (Phase 2 planned it, migration didn't ship it).
- Every RPC writes an `audit_logs` row via `log_self_audit`-style helper: actor, before/after JSON, reason, entity_id, event.
- Concurrency: mutating RPCs compare `_expected_updated_at` to current row; on mismatch RAISE `complaint_stale` — frontend surfaces "Someone else updated this complaint, please reload".

## 2. `src/lib/complaintsSla.ts` — single SLA source

- Keep the pure JS helper (already SQL-aligned) for optimistic UI on a single already-fetched row.
- Prefer server-computed `sla_bucket` from `list_complaints` / `complaints_analytics` everywhere possible. `ComplaintsList`, `ComplaintEvidenceRow`, `ConductDashboard` will read `row.sla_bucket` from the RPC payload — no more per-render recompute.
- Add exhaustive unit test to guarantee JS ↔ SQL parity for on_track / at_risk / breached / resolved_on_time / resolved_late.

## 3. Frontend rewiring

### `ComplaintsList.tsx`
- Replace the raw select with `useQuery(['complaints', filters, sort, page, search])` calling `list_complaints`. URL-sync `page/pageSize/sort/search/filters` via `useSearchParams`. Add pagination controls (Prev / Next / page size 25/50/100). No client slicing.
- `handleCreate` → `create_complaint`. Remove:
  - the `generate_complaint_number` client call,
  - the manual `logAudit`,
  - the manual `notification_dispatch_log` insert,
  - the direct `evaluate-complaint-triage` invoke.
- Remove all `computeSlaStatus` sites; render `row.sla_bucket` + label helper.
- Row close action opens a `<CloseComplaintDialog>` (reused from detail) that requires `reason` (textarea, min 5 chars) + `category` (select: resolved / withdrawn / duplicate / no-jurisdiction / other) before `close_complaint`. Remove the `_reason: null` call entirely.
- Every query passes `throwOnError` / uses `isError` to render an error card with retry — no empty-state masking.
- Status changes → `transition_complaint_status`; assignment → `assign_complaint`; triage retry → `retry_complaint_triage`. All pass `expected_updated_at`.

### `ComplaintDetail.tsx`
- Replace `.select('*')` with `list_complaints({id})` single-row form OR a new lightweight `get_complaint(_id)` RPC that returns the row + derived `sla_bucket` + workflow state. (Choosing the RPC — cleaner.)
- Severity, close, transition, assign — all through RPCs with `expected_updated_at`.
- Extract `<CloseComplaintDialog>` and share with the list.

### `NewInternalComplaint.tsx` + `useMarketConduct.ts`
- Both intake paths call `create_complaint`. Delete the direct `sb.from('complaints').insert(...)` in `useMarketConduct.ts` and route it through the RPC. Single canonical create path.

### `ComplaintsAnalytics.tsx`
- Already on RPC — add filters UI (date range, regulator, sector, type, severity) that pass into `_filters`. Explicit `isError` error card with retry.

### `ComplaintEvidenceRow.tsx`, `useConductDashboardMetrics.ts`, `useSupervisoryMetrics.ts`, reports
- Consume `sla_bucket` from RPC responses. Dashboards call `complaints_analytics` (or a slim `complaints_dashboard_counts` RPC) instead of running four `count: 'exact'` queries client-side.

### Escalation hub
- `EscalationHub` stats → `escalation_hub_stats` RPC.
- Delete `mockData.ts`. `EscalationCaseDrawer` fetches the linked complaint via `get_complaint`. `RuleCard` "Would fire on N" uses `simulate_escalation_rule` RPC (server-computed count) — no MOCK_COMPLAINTS.
- Restore `EscalationBanner` — query `pending_escalation_count()`; render live badge with link to hub.
- Rule toggle/upsert already RPC-backed — keep.

### Duplicate hub
- Delete `src/pages/complaints/duplicates/seed.ts`.
- `ClusterGroupsPanel` → `list_duplicate_clusters(_dimension)` RPC (add new table + RPC in §1).
- `DetectionRulesPanel`, `SuspectedDuplicatesTable`, `DuplicateDetectionHub` — replace direct table selects with the new list RPCs so RLS + permission checks are centralized.
- Restore `DuplicateAlertBanner` with `pending_duplicate_count()`.

### Error handling standard
- Introduce `<ComplaintsErrorCard onRetry>` used by every complaint query. `throwOnError: true` on `useQuery`, caught by an `ErrorBoundary` around each surface — never fall through to "0" stats.

## 4. Cleanup (grep gates must be zero)

Delete / migrate:
- `src/pages/complaints/escalations/mockData.ts`
- `src/pages/complaints/duplicates/seed.ts`
- All `MOCK_*` / `seed*` imports.
- `computeSlaStatus(` usages outside `src/lib/complaintsSla.ts` and its test.
- `from('complaints').insert(` and `from('complaints').update(` in `src/` (production).
- `close_complaint(..., _reason: null)`.

## 5. Verification (must all return zero non-test hits)

```
rg "from\(['\"]complaints['\"]\)\.insert" src
rg "from\(['\"]complaints['\"]\)\.update" src
rg "from\(['\"]complaints['\"]\)\.select" src        # only list/get_complaint RPC allowed
rg "computeSlaStatus\(" src | rg -v "src/lib/complaintsSla|\.test\."
rg "MOCK_CASES|MOCK_RULES|MOCK_COMPLAINTS|MOCK_TRIGGERS|seedPairs|seedClusters|seedRules|duplicates/seed|escalations/mockData" src
rg "close_complaint.*_reason:\s*null" src
rg "generate_complaint_number" src/pages src/components
```

Plus manual smoke: paginated list, filter+search+sort round-trip through URL, close with mandatory reason, severity override with reason, analytics with date filter, escalation rule toggle + sweep + banner count, duplicate decide + cluster panel + banner count, stale-update (open two tabs, change one, second submit shows concurrency error), unauthenticated triage retry rejected.

## Technical notes

- `list_complaints` returns `sla_bucket` computed via existing `complaint_sla_status` SQL fn — keeps FE dumb.
- All lifecycle RPCs share an internal `_apply_complaint_change(_id, _patch jsonb, _reason, _event, _expected_updated_at)` helper for audit + notification + concurrency uniformity.
- Indexes: `(regulator_id, status, created_at desc)`, `(assigned_to, status)`, `(complaint_number)` unique already exists.
- No changes to `src/integrations/supabase/client.ts`, `types.ts`, `.env`; types regenerate after migration.
- Migration order: table + grants + RLS + policies + trigger, then all RPCs, then edge function redeploy (`evaluate-complaint-triage` unchanged interface).

## Non-goals

- No UI redesign. Layouts, columns, and copy stay. New pieces (pagination controls, close dialog, error card, banners) match existing shadcn patterns.
- No feature removal. Every existing button keeps working post-refactor.
