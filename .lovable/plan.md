# Supervision Loop Dashboard (MCS-MON-002)

Closed-loop conduct supervision oversight: one screen that proves complaints flow through classification, investigation, enforcement, compliance, closure and recurrence monitoring — and measures whether interventions worked. Nothing existing changes behaviourally; this is a new read-oriented screen plus one small new table for supervisor annotations.

## What gets built

New page at `/conduct/supervision-loop`, sidebar entry "Supervision Loop" under Market Conduct, read-only for approver/executive roles and full access for conduct supervisors.

1. **Filters** — entity typeahead (all entities or one), period 6M / 12M / 24M / custom range, and a "Sector view" toggle that switches from entity-specific to sector-aggregate.

2. **Supervision cycle flow (Sankey)** — Complaints Received → Classified → Investigated → Enforcement Actions → Compliance → Closed → Recurrence Monitoring → Recurrences Detected. Flow width = volume, tone = severity mix. Clicking a node or flow opens a drill-down list of the underlying cases with links to each record.

3. **Intervention effectiveness KPIs** — pre- vs post-intervention complaint rate for entities that received enforcement; complaint→enforcement time (avg / best / worst); enforcement→compliance time; recurrence rate on closed enforcement; count of interventions with a measurable drop in complaint volume.

4. **Entity conduct timeline** — multi-year chronological band for the selected entity: complaints as dots, investigations as bars, enforcement actions as markers, monitoring-rule triggers as warning icons. Zoom by period, hover for detail, click to open the record. Annotation mode lets a supervisor attach a narrative label to a date/event, stored as an internal note and visible only to internal users.

5. **Unresolved risks panel** — entities where a monitoring rule fired repeatedly without escalation, enforcement compliance is overdue, an investigation is open well past its due date, or conduct risk band rose with no linked supervisory action. Each row has "Action Required" that navigates to the enforcement / investigation / monitoring record.

6. **Regulatory learning feed** — learning captured from closed thematic reviews and closed investigations, shown newest-first with the review/investigation it came from, so current monitoring patterns can be read against past lessons.

7. **Export full conduct report** — generates a formatted, print-ready conduct history report (entity header, cycle summary, KPIs, timeline events, unresolved risks, learning) suitable for a Board pack, and writes an audit entry.

8. **Weekly unresolved-risk digest** — scheduled job emails the unresolved risks list to conduct supervisors and executive supervisors once a week, reusing the existing notification event pipeline.

## Technical notes

- **New table** `conduct_supervision_annotations` (licensee_id, event_date, event_ref_type/id nullable, label, note, author, timestamps) with GRANTs for `authenticated`/`service_role`, RLS gated on the existing conduct read/manage checks, and an `updated_at` trigger.
- **New RPCs** (SECURITY DEFINER, authorisation via the existing `can_view_conduct_investigation` / conduct read helper, `search_path` pinned):
  - `conduct_supervision_loop_summary(entity_id, from, to, sector_view)` — funnel counts, severity mix, effectiveness metrics.
  - `conduct_supervision_loop_cases(stage, entity_id, from, to)` — drill-down rows per flow segment.
  - `conduct_supervision_timeline(entity_id, from, to)` — merged complaint / investigation / enforcement / monitoring-trigger events.
  - `conduct_supervision_unresolved_risks(entity_id, sector_view)` — the four risk conditions with reason codes and target record refs.
  - `conduct_supervision_learning(limit)` — thematic `regulatory_learning` plus investigation closure `regulatory_learning`.
  - `conduct_supervision_log_view(...)` / `conduct_supervision_log_export(...)` — write `SUPERVISION_LOOP_DASHBOARD_VIEWED` and `SUPERVISION_LOOP_REPORT_EXPORTED` to the compliance audit log; annotation writes log too.
  - Sources are the existing tables only: `complaints`, `conduct_investigations`, `conduct_investigation_closures`, `enforcement_actions`, `conduct_monitoring_results`, `conduct_monitoring_rule_runs`, `conduct_post_closure_monitoring`, `thematic_reviews`, `entity_risk_scores`, `conduct_alerts`. No changes to those tables.
- **New notification event** `conduct_supervision_unresolved_risk_digest` seeded into the existing event config, plus edge function `conduct-supervision-loop-digest` (worker-gated, same pattern as `evaluate-conduct-monitoring`) on a weekly cron.
- **Frontend**: `src/pages/conduct/SupervisionLoop.tsx`, hook `src/hooks/useSupervisionLoop.ts`, pure helpers in `src/lib/conduct/supervisionLoop.ts`, and components under `src/components/conduct/supervision-loop/`: `SupervisionCycleSankey.tsx`, `EffectivenessKpis.tsx`, `EntityConductTimeline.tsx`, `UnresolvedRisksPanel.tsx`, `RegulatoryLearningFeed.tsx`, `StageDrilldownDialog.tsx`, `ConductReportExport.tsx`. Recharts `Sankey` for the flow; existing shadcn primitives and semantic tokens only.
- Route registered in `dashboardRoutes.tsx` under the `market_conduct` module guard; sidebar entry added in `navigation.tsx`.

## Verification before I report done

- Vitest unit tests for `supervisionLoop.ts` (funnel derivation, pre/post rate maths, timeline merge ordering, empty-data safety).
- pgTAP suite `supabase/tests/conduct/03_supervision_loop.sql`: RPCs exist and are permission-gated, annotation RLS (internal read/write, external blocked), unresolved-risk conditions return expected rows against seeded fixtures.
- Live browser pass on `/conduct/supervision-loop`: filters apply, Sankey renders with real data, a flow click opens the correct case list, timeline renders and an annotation round-trips, unresolved risks navigate to their target records, export produces a clean report, and audit rows appear.
- Typecheck plus a regression pass over `/conduct`, `/conduct/investigations`, `/conduct/alerts` and the enforcement register to confirm nothing else moved.
