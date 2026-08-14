# Make Supervisory AI Report cards instantly identifiable

Presentation-only change to the report cards on `/analytics/ai-reports`. No hooks, RPCs,
filters, permissions, report content or drawer behaviour change.

## The problem

Every card currently leads with the organisation name in bold, so a screen full of reports
for the same entity looks like four identical cards. What the report actually *is*
(analysis type) sits in small muted text below, and the supervisory area is only a word in
that same grey line.

## The fix

Reorder and re-weight the card so the report identity comes first:

```text
[icon]  Area chip (Enforcement)                    [status chips]
Enforcement case chronology            <- primary line, semibold
New FinCorp Commercial Bank Limited    <- organisation, secondary line
Short summary (2 lines, clamped)
Prepared 12 Aug 2026, 08:34 pm · Awaiting human review
[View Report]                       Open enforcement case →
```

Details:
- **Primary line** = analysis type label (what the report is). **Second line** = organisation
  name with a small building icon, muted but clearly legible.
- **Area chip** at the top-left with a per-area icon and a consistent, subdued tone per
  supervisory area (filings, prudential risk, inspections, complaints & conduct,
  supervisory actions, entity history, cross-module) so cards are distinguishable at a
  glance without colour-coding overload.
- **Status chips** (Needs Review / Current / May Be Outdated / Limited Evidence /
  Incomplete) move to the top-right of the card header so the meta line under the summary
  stays quiet; wraps below on narrow widths.
- Left accent border tinted by supervisory area for scanability.
- Period key, when present, shown as a small neutral chip next to the area chip instead of
  buried in the prepared line.
- Card actions unchanged: `View Report` primary, source-module link as quiet ghost link.

Same treatment applied to the report rows inside the **By Organisation** coverage view so
both surfaces read consistently.

## Technical notes

- Edited: `src/pages/analytics/SupervisoryAiReports.tsx` (`ReportCard` only),
  `src/components/ai-reports/EntityCoverageView.tsx` (row header ordering).
- New presentation-only map in `src/lib/ai/reportHub.ts`: per-module icon + tone class,
  reused by both surfaces. No changes to existing exports' behaviour.
- Colours come from existing semantic tokens; no hardcoded hex.
- Unchanged: `useSupervisoryAiReports`, facets, entity options, `AiReportDetailDrawer`,
  all RPCs, URL params, pagination, tabs, filters, summary cards.
- Verification: typecheck, existing tests, and a browser pass over the four tabs at desktop
  and narrow widths.
