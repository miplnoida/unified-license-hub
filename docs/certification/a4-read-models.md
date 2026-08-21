# Package A4 — Read Models, Supervisory UX & Legacy Returns Closure

Certification run: final. Status: **A4 COMPLETE = YES** (defects found were fixed in-run and re-verified).

## Scope certified

| Area | Result |
| --- | --- |
| Canonical read model consistency (`sup_dashboard_summary`, `sup_priority_work_queue`, `sup_entity_supervisory_state`, `sup_team_performance`) | Pass after fixes D3/D4 |
| A2 regression via UX (detection → acknowledgement → directive) | Pass after fixes D1/D2 |
| A3 regression via UX (conduct alerts → investigation → action → enforcement, thematic closure) | Pass |
| Team Performance authorization (`admin_dashboard`/`report_management`/`employee_management` or super admin) | Pass — non-authorised callers raise `not authorised to view team performance` |
| KPI drill-down parity (dashboard counts vs. list pages) | Pass after fix D3 |
| Legacy returns retirement | Pass — legacy screens carry `LegacyReturnsNotice`, unlinked from active navigation, read-only |
| Entity 360 scoping (per-domain sections gated by `sup_can_read_domain`) | Pass |
| Security / RBAC integrity (`sup_read_guard`) | Pass after fix D0 |

## Defects found and fixed

**D0 — Role-less authenticated read access.** `sup_read_guard()` admitted authenticated users holding no internal role. Tightened to require at least one internal role; external users and role-less accounts are rejected.

**D1 — Acknowledgement parity.** Supervisor acknowledgements written to `return_threshold_breach_acknowledgements` were not reflected in `v_prudential_current_breaches.acknowledged_at`, so "awaiting acknowledgement" over-counted. The view now coalesces the latest acknowledgement row. Verified: 2 of 7 current signals now show acknowledged, matching the acknowledgement table.

**D2 — Directive linkage missing in Entity 360.** Supervisory directives raised off a breach (`prudential_actions.source_type = 'return_breach'`) were invisible in `sup_entity_supervisory_state`. Signals now carry a `directives[]` array (reference, type, title, status, severity, due date) plus an `open_directives` count; `EntitySupervisoryStatePanel` renders the directive reference and status. Verified: breach `d8ada7d6…` (CAPITAL_ADEQUACY_RATIO) links to `PA-2026-000009` (open).

**D3 — Returns KPI status-case mismatch.** `return_filings.status` is stored upper-case (`SUBMITTED`, `UNDER_REVIEW`); `sup_dashboard_summary` matched lower-case, so "Returns awaiting review" reported 0 while the canonical filing queue returned 32. Now case-insensitive — dashboard count and drill-down agree (32 awaiting, 64 overdue, 57 accepted).

**D4 — Team Performance unassigned filings.** Same case mismatch in `sup_team_performance.unassigned.filings_unassigned`; corrected.

## Evidence

- `v_prudential_current_breaches`: 4 breach + 3 warn signals across certification entities; deduplicated to the latest detection run per filing version.
- Certification entity states confirmed: Federation Credit Finance Ltd (breach + directive), Nevis Investment Management Ltd (pre-breach EWI), Atlantic Commercial Bank Ltd (normal).
- Security linter: no new findings introduced by A4 migrations (942 pre-existing, unchanged); `v_prudential_current_breaches` retains `security_invoker = on`.
- TypeScript project check: clean.

A4 remains frozen. No new dashboards, read models or UX surfaces were added during certification.
