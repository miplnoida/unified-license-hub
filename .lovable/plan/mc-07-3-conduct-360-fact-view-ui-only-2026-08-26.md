# MC-07.3 — Conduct 360 Fact View (UI only)

Build the deterministic Conduct 360 supervisory view for a single entity, reading exclusively from the accepted `conduct_360_snapshot` fact read model. No backend or schema change, no AI provider call, no AI narrative, no AI review controls.

## Where it lives

- New route: `/conduct/entities/:entityId/360` inside the existing Market Conduct module guard.
- Entry point: a "Conduct 360" action on each row of the existing Market Conduct Entities list. No new sidebar item (the view is always entity-scoped).
- Page title: "Conduct 360 — <entity name>", with the supervision window shown as plain dates and a window selector offering last 90 days / last 12 months / last 24 months (default 12 months). Changing the window re-reads the server payload; nothing is recomputed in the browser.

## Sections delivered (one per fact section already returned)

Each section renders its server measures, its item list, and the section's own source line ("Complaints register and outcome records", etc.).

1. Entity context — name, licence status, sector, sub-sector, regulator, systemic importance, assigned supervisor, portfolio officer, licences held (reference, type, status, validity dates).
2. Conduct posture / key measures — headline measure tiles: complaints received, open, closed, upheld, overdue; signals raised/open; patterns detected/confirmed; alerts raised/open; redress ordered and paid amounts.
3. Complaints & outcomes — totals plus breakdowns by status, severity, category, outcome and month; item table (reference, subject, category, severity, status, harm level, product, channel, received, due, outcome).
4. Redress — required / completed / outstanding / overdue counts and ordered / paid / outstanding amounts; item table by complaint reference, redress type, affected party, amount, due date, status.
5. Conduct signals — totals, status and severity breakdowns, high systemic-potential count; item table with reference, title, source, category, severity, risk score, status.
6. Patterns — detected / confirmed / under review / dismissed; item cards showing measured value against threshold, comparison window, contributing record count, and the rule's own match explanation. Presented under the RULE OUTCOME classification.
7. Alerts — total and open counts, breakdown by kind and severity; item table with title, kind, severity, status, origin, linked complaint / linked pattern, explanation.
8. Products / channels — complaints by product, complaints by channel, signals by product, plus the server's sector comparison (entity complaints vs sector total, entities with complaints, sector average per entity).
9. Risk indicators / findings — complaints by risk category and conduct risk level, signals by risk category, findings recorded; findings table with reference, title, category, severity, risk rating, status, owner.
10. Trends — complaints received, complaints closed, signals raised, patterns detected, alerts raised: current window, comparison window, and the server-computed change.
11. Open supervisory items — open complaints, investigations, information requests, reconsiderations, supervisory actions and overdue actions; grouped item list.
12. Recent material activity — chronological list of the server-returned events with reference, detail and source.

## Presentation rules

- Fact discipline: every number displayed comes from the payload's `measures`. The UI only formats (dates, currency, thousands separators) and orders/filters lists for display — it never sums, derives, or re-rates authoritative measures.
- Drill-down: every item uses the `href` the server already supplies, so complaints, signals, patterns, alerts, investigations and actions open their existing records. Items without an href render as plain text rather than a dead link.
- Business language only: no UUIDs, no raw enum tokens, no table, column or RPC names on screen. Statuses, severities, outcomes, pattern types and measure codes pass through label helpers (extending the existing conduct signal/pattern label helpers with a small shared fact-label helper for status, severity, outcome, harm, redress and open-item types).
- Trends in plain words: "Complaints received rose from 12 to 19 (up 7) compared with the preceding 12 months", with a neutral up/down/no-change indicator, never a raw delta on its own.
- Empty states: a section with no measures above zero and no items shows a single calm line such as "No complaints recorded in this window" — never a blank card, a zero-filled table, or a hidden section.
- Read-only: the page issues no writes. Auditors and supervisors see the identical view; scope denial from the server renders an access message, not an error dump.
- No AI content anywhere on the page.

## Classification legend

A legend component shown once at the top of the view, and applied as a small tag on each section header:

- FACT — grey — active: recorded regulatory data.
- RULE OUTCOME — blue — active: deterministic rule detections (patterns, and rule-raised alerts/signals).
- AI SUGGESTION — amber — shown as inactive with "Available in next phase". No placeholder narrative, no sample text.
- HUMAN DECISION — green — shown as inactive, reserved for recorded supervisory decisions.

## Technical notes

- `src/hooks/useConduct360.ts` — single TanStack query calling `conduct_360_snapshot` with the entity id and resolved window; one round trip per view, no per-item follow-up queries.
- `src/pages/conduct/Conduct360.tsx` — page shell, window selector, legend, section composition.
- `src/components/conduct/three-sixty/` — `Conduct360Section.tsx` (header + classification tag + source line + empty state), `MeasureTiles.tsx`, `BreakdownList.tsx`, `TrendStatement.tsx`, `FactItemTable.tsx`, `ClassificationLegend.tsx`.
- `src/lib/conductFactLabels.ts` — display labels and formatters for statuses, severities, outcomes, amounts and measure names.
- Route registered in `src/routes/dashboardRoutes.tsx` under the `market_conduct` module guard; "Conduct 360" row action added to `ConductEntitiesList.tsx`.
- Verification: targeted UI tests for section rendering, empty-state rendering, legend states and label mapping; then typecheck and build.

## Out of scope

No schema or RPC change, no AI generation or review controls, no full certification run, no MC-07.4 work.
