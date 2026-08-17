# Prudential Supervision — Fix the Remaining Module Defects

A close pass over every prudential screen (dashboard, entities, assessments, actions, escalations, examinations, taxonomy, stress indicators, payment systems) plus the backing data found one real data/automation failure and a long list of presentation and workflow gaps. Findings below were confirmed against the running code and the live database this turn.

## Verified findings

Automation / data
- The daily `prudential-monitoring-sweep` cron job is active but its last recorded run is 31 Jul 2026 — nothing for the last 10 days. The overdue-action sweep last ran the same day. So breach detection, stress events and overdue flags are stale.
- 5 EWI rules are configured and 186 threshold breaches exist, yet `prudential_ewi_alerts` has 0 rows — the alert generation path has never produced an alert.
- The most recent stress event is 10 Jul 2026, which is why the dashboard "Stress events (30d)" card reads 0 even though 12 events exist.
- All 13 stress indicators have an empty `taxonomy_code`, so the taxonomy column on that screen is always "—" and the taxonomy configuration is effectively unused.

Dashboard
- Two figures for the same thing: "Supervised entities" counts client-side rows while the metrics function returns its own total; "High-risk" is just critical + amber, and three cards link to two filters, so the tile grid double-counts and confuses.
- "Next Automatic Run" is hard-coded to local midnight instead of the actual cron schedule, and sweep timestamps use ad-hoc `toLocaleString` rather than the app's shared date/time format.
- Recent stress events and other lists print raw dates and raw indicator ids when the label is missing.
- No indication that the sweep has gone stale, which is exactly the condition currently in place.

Actions
- Every row shows raw status and review tokens (`awaiting_review`, `not_required`) with a single-colour badge, so severity and status carry no visual weight.
- The page subtitle promises drill-through "to the action and its source finding", but the row only opens a drawer — there is no link to the originating EWI alert, assessment, examination finding or entity profile.
- No search, no entity/severity filter, no assignee or owner column, and due dates are printed raw rather than formatted or flagged when near due.

Escalations
- No dates, no raised-by, no entity link, no filter or search, no view of the attached evidence, and status shown as a raw token.
- The resolve dialog marks Decision as required but does not block confirmation on an empty decision.

Assessments
- List shows `period_start → period_end` with no formatting (nulls render as blanks), uses `toLocaleDateString` instead of the shared formatter, has no status filter/search and no loading state.
- Creating an assessment asks for a "Linked return id" as a free-text UUID field; users cannot know that value.
- Navigation after create uses a full page reload instead of the router.

Taxonomy
- `parent_id` exists in the model and is referenced by the hierarchy, but the form has no parent picker, so nested categories can't be built.
- Duplicate `code` inserts surface as a raw database error.
- A React "function components cannot be given refs" warning is logged from this page on every visit.

Examinations / payment systems
- There are 0 examinations, so the workspace is unverified end-to-end; the list needs an explicit empty state and the create flow should navigate via the router instead of `window.location`.
- Payment systems tab switching rewrites the whole query string, dropping any other params.

## What will be fixed

Backend (one migration + function check)
1. Diagnose and repair the stalled `prudential-monitoring-sweep` and `overdue-action-sweep` invocations (same single-use worker-token pattern already used to fix the SLA sweeps), then re-run both once so breach, stress and overdue state is current.
2. Fix EWI alert generation so configured rules actually raise alerts from existing breach/ratio data, and backfill alerts for currently breaching entities.
3. Add a `taxonomy_code` reference on stress indicators to the configured taxonomy (validated against `prudential_risk_taxonomy`), and expose parent category on the taxonomy admin.

Frontend
4. Dashboard: single source of truth for each tile (metrics function), remove the duplicated high-risk tiles, show the real next scheduled run and a visible "sweep is stale" warning when the last successful run is older than expected, and use the shared date/time formatting everywhere.
5. Actions: severity- and status-coloured badges with human labels, source drill-through links (entity profile, and the originating alert/assessment/examination), search plus entity and severity filters, owner and assignee columns, formatted and due-soon-highlighted dates.
6. Escalations: raised/decided timestamps, raised-by name, entity link, status filter and search, evidence list, human status labels, and confirmation blocked until a decision is entered.
7. Assessments: formatted periods with a clear "not set" state, rating and status badges, status filter and search, loading/empty states, a return picker instead of a raw UUID field, and router navigation after create.
8. Taxonomy: parent category picker, friendly duplicate-code message, and the ref warning removed.
9. Examinations and payment systems: explicit empty state, router navigation on create, and tab switching that preserves other query params.

## Verification

Re-run both sweeps and confirm fresh rows in the feed log; confirm EWI alerts appear for entities that currently have breaches; then walk each screen — dashboard tiles reconcile with the underlying lists, an action row drills through to its source, an escalation cannot be resolved without a decision, an assessment can be created by picking a return, and a nested taxonomy category can be saved.
