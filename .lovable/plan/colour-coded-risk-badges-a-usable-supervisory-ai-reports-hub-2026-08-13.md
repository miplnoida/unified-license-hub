# Colour-coded risk badges + a usable Supervisory AI Reports hub

## 1. Stop printing "green" / "amber" / "red" as words

Verified: the only screen still rendering raw traffic-light tokens as text is the return
analysis page (`/returns-management/:id/analysis`) — key ratios, the risk heatmap, early
warning indicators, recommendations and concentration rows all print `m.risk_level` /
`w.level` directly.

Change (presentation only):
- Add a small shared `RiskBadge` built on the existing `src/lib/prudentialSeverity.ts`
  model (already maps red → Breach, amber → Warning, green → Within limits with semantic
  tone classes).
- Badge shows a coloured dot plus the supervisory label — colour carries the signal, the
  raw word never appears. Not colour-only, so it stays accessible and readable in print.
- Apply it to every place on the analysis page that currently prints the raw token.

## 2. Entity filter shows every supervised entity, not only a few

Verified against live data: there are 21 licensees but only 23 AI insight rows covering
**2 distinct entities**. The dropdown is built from report facets, so it can only ever
list entities that already have a generated report — that is why it looks nearly empty.

Change:
- Add a read-only `security definer` RPC that returns the supervised entities the current
  user is authorised to see, each with its AI-report count (0 included).
- Replace the entity `Select` with a searchable combobox, grouped:
  - **With AI reports** — name + count
  - **No reports yet** — name, muted, still selectable
- Selecting an entity with no reports shows an entity-specific empty state that explains
  where analyses are generated, instead of a generic "no results".

## 3. Make the reports understandable for non-technical users

Change:
- **Plain-language report cards and drawer**: lead with a one-sentence "What this says",
  then "Why it matters" and "What to look at next", each derived from the existing stored
  payload sections — no new AI calls, no new fields. Technical metadata (analysis type,
  fingerprint, provider state) moves into a collapsible "Report details" block.
- Keep the advisory disclaimer prominent; every card keeps its "Open source record" link
  so the authoritative module remains the decision point.

## 4. Entity view that actually covers the six supervisory areas

Add an **Entity view** tab to the hub. When an entity is selected it shows one row per
supervisory area — Filings & returns, Prudential risk, Inspections & examinations,
Complaints & market conduct, Enforcement actions, Entity history — each with:
- latest AI report for that area (date, confidence, freshness) and a link to open it, or
- "No analysis yet" plus a link to the module where it is generated.

This turns the hub from a flat list into the single governed supervisory view, and makes
gaps visible instead of invisible.

## Technical notes

- New: `src/components/prudential/RiskBadge.tsx`, `src/lib/ai/reportPlainLanguage.ts`,
  `src/components/ai-reports/EntityCoverageView.tsx`, one read-only RPC for entity options.
- Edited: `src/pages/returns-mgmt/ReturnAnalysis.tsx`, `src/pages/analytics/SupervisoryAiReports.tsx`,
  `src/hooks/useSupervisoryAiReports.ts`, `src/components/ai/AiReportDetailDrawer.tsx`.
- No AI generation, no writes, no schema changes to supervisory tables; existing
  per-module authorisation and source containment stay exactly as they are.
- Verification: typecheck, existing tests, a unit test for the severity badge mapping, and
  a browser pass on the analysis page and the hub (entity dropdown, entity view, drawer).
