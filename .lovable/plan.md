# Supervisory Intelligence Dashboard

Turn the current dashboard into a role-aware supervisory cockpit that pulls live metrics from the existing database (no mocks), generates rule-based insights, and respects RLS / dynamic permissions / PPOC scoping.

## Scope

Modules covered: Licensing, Applications, Licensees, Returns, Payments, Inspections, Enforcement, Complaints, Risk Ratings, Workflows/SLA, Notifications.

Audiences (already modelled in `EffectivePortalContext`):
- Internal supervisory (super_admin, admin, supervisor, officer, analyst…)
- Licensee (primary / secondary / PPOC w/ `activeLicenseeId`)
- Pre-licensee / applicant

## Architecture

```text
Dashboard.tsx
  ├─ DashboardFilters (date range, sector, regulator, status, risk)         [internal only]
  ├─ SummaryStrip      → MetricCard[] (top KPIs by audience)
  ├─ InsightsPanel     → InsightCard[] (severity sorted)
  ├─ ModuleSections    → grid of:
  │     • StatusBreakdownCard   (donut/bars by status)
  │     • SlaBreachCard
  │     • PriorityListCard      (oldest pending, expiring, overdue…)
  │     • TrendChartCard        (recharts, only if data available)
  └─ Existing legacy widgets remain available via registry fallback
```

New files:
- `src/components/dashboard/cards/MetricCard.tsx`
- `src/components/dashboard/cards/InsightCard.tsx`
- `src/components/dashboard/cards/StatusBreakdownCard.tsx`
- `src/components/dashboard/cards/SlaBreachCard.tsx`
- `src/components/dashboard/cards/PriorityListCard.tsx`
- `src/components/dashboard/cards/TrendChartCard.tsx`
- `src/components/dashboard/DashboardFilters.tsx`
- `src/components/dashboard/SupervisoryDashboard.tsx`
- `src/components/dashboard/LicenseeDashboard.tsx`
- `src/components/dashboard/ApplicantDashboard.tsx`
- `src/hooks/useSupervisoryMetrics.ts`
- `src/hooks/useLicenseeMetrics.ts`
- `src/hooks/useApplicantMetrics.ts`
- `src/lib/dashboardInsights.ts`  (pure rules → insights from metrics)

`src/pages/Dashboard.tsx` becomes a thin router that, based on `useEffectivePortalContext`, mounts one of the three audience dashboards.

`src/lib/dashboardRegistry.ts` is extended with a new `module → metric` map used to gate sections by `hasModuleAccess` (licensing, application_management, returns_management, fee_management, inspection_management, enforcement_management, complaint_management, risk_management). Sections whose module is not accessible are hidden.

## Data layer

Add Supabase RPCs (SECURITY DEFINER, enforce role/PPOC/licensee + sector scoping internally):

- `get_supervisory_dashboard_metrics(p_filters jsonb)` → jsonb with grouped counts for all modules, scoped by caller role:
  - internal: aggregates across regulator/sector(s) the caller can see
  - returns counts by status, SLA buckets (due_today, due_week, breached), totals, sums (outstanding amount, revenue this month), top-N priority lists (oldest pending apps, upcoming expiries, overdue returns, high-risk entities, open enforcement)
- `get_licensee_dashboard_metrics(p_licensee_id uuid)` → entity-scoped metrics (license status, apps, returns due/overdue, payments due, notifications, breaches). RPC verifies caller is owner / secondary / active PPOC mapping for that licensee.
- `get_applicant_dashboard_metrics()` → caller-scoped applications, payments, notifications.

All RPCs read aggregates server-side using existing tables (`licenses`, `applications`, `compliance_returns`/`returns_filed`, `payments`, `inspections`, `enforcement_actions`, `complaints`, `risk_ratings`, `workflow_instances`, `approval_steps`, `notifications`). No raw row dumps to client.

Hooks wrap RPCs with TanStack Query, keyed by audience + filters + active sector + `activeLicenseeId`, so PPOC switch refetches automatically.

## Insights engine

`dashboardInsights.ts` exports `buildInsights(metrics, ctx)` → `Insight[]` with:
`{ id, severity: 'critical'|'high'|'medium'|'low', module, title, explanation, action: { label, to } }`.

Rules (examples — all derived from real metric fields):
- apps SLA breached > 0 → critical, link `/applications/queue?sla=breached`
- licenses expiring ≤30d > 0 → high, link `/admin/approved-licensees?expiring=30d`
- high-risk entities with overdue returns → critical
- payments backlog blocking N submitted apps → high
- inspection coverage % per sector below threshold → medium
- workflow stage with avg dwell > SLA → medium (bottleneck)
- complaint SLA breach rate trending up vs last period → high
- repeat late filers count > 0 → medium

Sorted by severity then recency. Empty state when no insights.

## Role behavior

- `Dashboard.tsx` selects audience via `useEffectivePortalContext`:
  - `isInternal` → `SupervisoryDashboard`
  - `isLicensee` → `LicenseeDashboard` (uses `activeLicenseeId`)
  - `isPreLicensee || isApplicant` → `ApplicantDashboard`
- Within `SupervisoryDashboard`, each module section is wrapped in a `hasModuleAccess(...)` gate so officers/analysts only see permitted modules.
- Filters (sector, regulator) default to the user's active sector/regulator context; respect `RegulatorContext` + `ActiveSectorContext`.

## Security

- Server-side enforcement in every RPC (role check via `has_role`, PPOC mapping check via `ppoc_entity_mappings`, licensee ownership via `profiles.licensee_id` / `entity_user_access`).
- RLS on underlying tables remains the second line of defence.
- No client-side filtering of sensitive rows: RPCs return only aggregates + ids the caller is allowed to see.

## UX

- Skeletons (`<Skeleton />`) per card during load.
- Empty states with helpful copy and CTA.
- Charts via existing `recharts` (already in deps if used elsewhere — verify; otherwise render compact bar/donut with CSS only).
- Semantic tokens only (no raw colors); severities mapped to `destructive`, `warning` (added if missing), `primary`, `muted`.
- Responsive grid, mobile friendly.

## Out of scope / preserved

- Existing `dashboardRegistry` widgets stay; new audience dashboards render alongside (the registry-driven grid becomes a "Quick access" row beneath the supervisory content) so no existing routes/widgets break.
- No changes to auth, role resolution, or PPOC context logic.

## Acceptance

- Admin sees all modules + insights.
- Officer/analyst sees only permitted modules.
- Licensee primary/secondary sees entity-scoped metrics; PPOC dashboard refreshes when active mapping changes (driven by `activeLicenseeId` query key).
- Applicant sees only their applications/payments/notifications.
- No mock data; all numbers come from RPCs.
- Permission gates hide inaccessible modules.
- Loading + empty states present.

## Implementation order

1. Migration: create the three RPCs with security checks + grants to `authenticated`.
2. Hooks (`useSupervisoryMetrics`, `useLicenseeMetrics`, `useApplicantMetrics`).
3. Reusable cards + filters.
4. Insights engine + tests.
5. Three audience dashboards.
6. Rewire `Dashboard.tsx` to route by audience; keep registry widgets as secondary section.
7. Smoke test per audience in preview.
