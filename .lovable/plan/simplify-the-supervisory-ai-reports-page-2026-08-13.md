# Simplify the Supervisory AI Reports page

A UI/information-architecture only change to `/analytics/ai-reports`. No hooks, RPCs, permissions, filters logic, deep links or version behaviour are altered — the same data, re-presented as a reports library.

## Header and disclaimer

- Title stays "Supervisory AI Reports".
- New description: "Review AI-assisted supervisory reports across regulated entities and supervisory areas."
- The advisory disclaimer moves from a full-width alert to one subtle muted line with a small info icon under the header.
- The "Showing reports prepared: last 30 days" line becomes a small chip row next to the filters instead of standalone text.

## Summary cards

Four soft cards with icons and short helper text, using the counts already returned by the hook:

| Card | Value (existing) | Helper text |
| --- | --- | --- |
| Total Reports | `counts.total` | across all supervisory areas |
| New This Week | `counts.recent` | prepared in the last 7 days |
| Needs Attention | count of loaded reports already flagged / outdated / limited evidence / incomplete | flagged, outdated or incomplete |
| Limited Evidence | `counts.limited` | based on thin underlying data |

Needs Attention is derived only from fields the report model already carries (`flagged`, `freshness === 'outdated'`, `limitedEvidence`, `reportState`), and its helper text states it counts the reports currently loaded, so no number is implied that the backend does not provide. Cards stay non-clickable except Needs Attention, which switches to the Needs Attention tab (pure client navigation).

## Tabs

Replace the current four tabs with:

1. **All Reports** (default) — newest first, the existing flat `reports` list.
2. **Needs Attention** — the same list filtered client-side to reports whose existing state is flagged, outdated, limited evidence or incomplete; grouped under short headings (Flagged for review / May be outdated / Limited evidence / Incomplete) with an empty state saying nothing needs attention in the current range.
3. **By Organisation** — the existing `EntityCoverageView`, fronted by a prominent organisation picker (the existing combobox) plus a small summary strip: reports available, areas covered, areas with no report yet, reports needing attention. All four come from the coverage rows already returned.
4. **By Supervisory Area** — the existing module grouping.

Lifecycle grouping is kept but demoted: inside **By Supervisory Area** a small "Group by" toggle switches between Supervisory area and Lifecycle stage, reusing `LIFECYCLE_GROUPS`.

## Filters

Primary row (always visible): Search, Organisation, Supervisory Area, Date, Analysis Type.

Collapsed "More filters" section: Evidence Quality (confidence), Report Status (freshness), Show incomplete analyses (include-failed switch), and the custom From/To date inputs when Date is Custom.

Renamed labels only — the underlying filter keys and values are untouched: Entity → Organisation, Area of work → Supervisory Area, Prepared → Date, Type of analysis → Analysis Type, Evidence confidence → Evidence Quality, Freshness → Report Status, "Include analyses that did not complete" → "Show incomplete analyses". A count badge shows how many advanced filters are active while collapsed. "Clear filters" stays as a subtle ghost link.

## Report cards

Reordered for scanning:

```text
Organisation / report title            (semibold, primary line)
Analysis type · Supervisory area       (muted metadata line)
Short summary                          (2 lines, clamped)
Prepared 13 Aug 2026, 10:12 am         (muted)
[status area]  Needs Review · May Be Outdated · Limited Evidence · Current
[View Report]              Open source record →
```

- Statuses move to one dedicated row at the bottom, with human labels: Needs Review, Current, May Be Outdated, Limited Evidence, Incomplete.
- Colour discipline: destructive only for flagged/incomplete, amber for outdated, green for current, neutral for informational metadata, existing primary tone for the CTA.
- `View Report` stays the primary action; the source-module link becomes a quiet ghost link.
- Softer cards: single subtle border, consistent padding, gentle hover elevation, wider section spacing.

## Technical notes

- Edited: `src/pages/analytics/SupervisoryAiReports.tsx` (structure, filters, tabs, cards) and `src/components/ai-reports/EntityCoverageView.tsx` (summary strip + heading wording).
- New presentation-only helpers in `src/lib/ai/reportHub.ts`: a `needsAttention(report)` predicate and a `reportStatusChips(report)` mapper, so card and tab logic share one source of truth.
- Unchanged: `useSupervisoryAiReports`, `useSupervisoryAiReportFacets`, `useSupervisoryAiReportEntityOptions`, `useSupervisoryAiReportSources`, `AiReportDetailDrawer`, all RPCs, URL params (`module`, `type`, `entity`, `q`, `range`, `from`, `to`, `report`), pagination and version history.
- Verification: typecheck, existing tests, a unit test for the new predicate/mapper, and a browser pass over the four tabs, filters, deep link and drawer at desktop and mobile widths.
