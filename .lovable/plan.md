# OLRAS Deck vs Platform — Capability Gap Tracker (Excel)

No code changes. The only output is a downloadable Excel workbook shared in chat.

## What the deck claims (from reading the file)

`OLRAS_Integrated_Regulatory_Supervisory_Technology_Platform_4.pptx` is a 29-slide capability pitch, not a screen-level spec. It splits the offering into two editions and 15 capability slides that each state concrete promises:

| Area | Deck slides |
| --- | --- |
| Editions & vision (Professional vs AI Advance) | 1, 4, 5, 6, 7, 8, 9 |
| Platform architecture | 10 |
| Licensing & registration lifecycle | 11 |
| Entity 360-degree profile | 12 |
| Fit & Proper assessment | 13 |
| Regulatory returns & filings | 14 |
| Risk monitoring & early-warning indicators | 15 |
| Inspection & examination management | 16 |
| Supervisory actions & enforcement | 17 |
| Market conduct & complaints | 18 |
| Role-based dashboards | 19 |
| AI-assisted supervisory intelligence | 20 |
| No-code configuration | 21 |
| Security, audit & governance | 22 |
| Notifications & SLA automation | 23 |
| Reporting & analytics | 24 |
| Integration readiness | 25 |
| Business value, implementation, closing | 26–29 |

Every bullet on those slides becomes one tracked capability row, so the tracker is claim-level (what a buyer would expect to be demonstrable), not slide-level.

## Workbook: `OLRAS_Deck_Gap_Tracker_v1.xlsx`

Sheets:

1. **Summary** — per-slide-area counts (Done / Partial / Missing / Not applicable), % ready, overall demo-readiness score, plus a split of readiness for OLRAS Professional scope vs AI Advance scope (the deck's own two editions).
2. **Tracker** — one row per deck claim: `Item ID | Deck Slide | Slide Title | Edition (Professional / AI Advance / Both) | Capability Claim (deck wording) | Status | % Complete | Evidence in system (route / component / table / function) | Gap detail (exactly what is missing) | Risk if demoed as-is | Effort (S/M/L) | Priority (P1/P2/P3) | Owner | Notes`.
3. **Gaps only** — Partial + Missing rows sorted by priority, for sprint planning.
4. **Demo risk register** — claims that would fail or look thin in a live demo, with the safest framing or the minimum work to make them true.

## How status is decided (evidence-based)

Each claim is checked against the repository and live database before scoring:

- routes in `src/routes/*` and pages under `src/pages/**` for screen existence and role gating,
- hooks/services in `src/hooks/**`, `src/lib/**`, `src/platform/**` for the behaviour the claim implies,
- database objects (tables, RPCs, triggers, RLS, cron jobs) and edge functions in `supabase/functions/**` for automation, notifications and audit claims,
- existing verification artefacts under `docs/verification/**`, `docs/rbac/**` and the earlier `FRD_Gap_Tracker_v4` findings where they already prove behaviour.

Rules: **Done** only when the screen, the stated behaviour and its audit/notification side effects all exist; **Partial** when it exists but a named element of the claim is absent (e.g. AI advisory panels, PFMI oversight, onsite examination lifecycle, thematic surveillance, data lineage); **Missing** when nothing backs it. Anything that cannot be confirmed by reading the repo is marked Partial with an explicit "unverified" note rather than assumed Done.

## Formatting

Arial throughout, frozen header row, autofilter, colour-coded status (green/amber/red), print-set column widths, and real numeric percentage formats so the Summary formulas compute. Written to `/mnt/documents/OLRAS_Deck_Gap_Tracker_v1.xlsx` and shared as a chat artefact. No application code, migrations or configuration are touched.
