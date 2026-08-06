# Conduct Analytics Hub — Trend, Drill-through, Peer Comparison, Saved Views

Closes the four gaps on Market Conduct → Conduct Dashboard (`/conduct`) without changing existing complaint, alert, investigation or action workflows. The current page already loads filtered complaints/alerts and renders counts by product, channel, category, severity and top licensees — all of that stays.

## What gets added

The page becomes a tabbed analytics hub, keeping today's content as the first tab.

1. **Overview** (existing) — unchanged KPIs, attention banner, breakdown charts, recent complaints/alerts tables.

2. **Trends & patterns** (new)
   - Monthly (or weekly for short windows) volume lines for complaints raised, complaints resolved, alerts raised, and SLA breaches.
   - Rolling severity mix over time (stacked area) so escalation in severity is visible, not just volume.
   - Pattern signals list computed from the same filtered data: month-over-month spikes above a threshold, repeat-complaint concentration, vulnerable-customer concentration, and category/product pairs rising fastest. Each signal links into the filtered complaints list.

3. **Drill-through** (new)
   - Product × channel matrix (counts, RAG-toned by breach/critical share). Clicking a cell applies that product+channel to the page filters and shows the underlying complaint rows inline.
   - Same drill for risk category × product.
   - Row/cell click never navigates away; a "View in complaints list" link is provided for the full queue.

4. **Peer comparison** (new)
   - Pick an entity; compare its complaints per period, critical share, SLA breach rate, repeat rate and open alerts against the peer set (same sector/sub-sector licensees within the active regulator scope).
   - Shows entity value, peer median, peer p75/p90 and a percentile position bar per metric, plus a ranked peer table.
   - Reuses the existing entity/licensee data already available to the page; no new scoring engine.

5. **Saved analytical views** (new)
   - Save the current filter set + active tab + peer selection under a name; load, rename, delete, set one as default.
   - Private by default with an optional "share with my team" flag; shared views are readable by internal conduct users and editable only by the owner or an admin.
   - Default view auto-applies on page load; URL query params still win so existing deep links keep working.

## Technical notes

- New table `conduct_saved_views` (name, owner, is_shared, is_default, config jsonb, module scope) with GRANTs for `authenticated`/`service_role`, RLS: owner full access, shared rows readable by users passing the existing conduct read check, admin override. Update trigger for `updated_at`.
- Analytics stay client-side over the rows the page already fetches, so RLS/regulator scoping is inherited automatically — no new SECURITY DEFINER surface. The complaints query gains `sector_id`/`sub_sector_id`-bearing licensee join fields needed for peer sets and its limit is raised for the aggregation window.
- New files: `src/hooks/useConductSavedViews.ts`, `src/lib/conduct/analytics.ts` (pure bucketing/percentile/pattern functions), and components under `src/components/conduct/analytics/`: `ConductTrendsPanel.tsx`, `ConductDrillthroughPanel.tsx`, `ConductPeerComparisonPanel.tsx`, `SavedViewsBar.tsx`.
- `ConductDashboard.tsx` is edited additively: filters and data loading lifted into the tab shell, existing markup moved into the Overview tab body.
- Recharts and existing shadcn primitives only; colors via existing semantic tokens.

## Verification

- Unit tests for `src/lib/conduct/analytics.ts` (bucketing across month boundaries, percentile placement, spike detection, empty-data safety) run with vitest.
- pgTAP-style SQL checks for `conduct_saved_views` RLS: owner read/write, non-owner blocked on private, shared readable, non-owner cannot update.
- Browser pass on `/conduct`: each tab renders with live data, drill-through cell updates filters, peer panel resolves a peer set, save/load/default view round-trips, and Overview output matches the pre-change numbers.
- Typecheck plus a regression pass over `/complaints`, `/conduct/alerts`, `/conduct/entities` to confirm nothing else moved.
