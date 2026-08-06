# ABC_FRD_v1 Gap Tracker v5 — with manual test steps

No code changes. The only output is a downloadable Excel workbook shared in chat.

## Scope

Re-read `ABC_FRD_v1.docx` (100 screen IDs across 8 modules: ADM, LIC, FP, PRU, MCS, DASH, AUD, NOT) and re-verify every screen against the current repository and live database, then produce a project-management tracker that also carries manual testing steps per row.

Since the previous tracker (`FRD_Gap_Tracker_v4.xlsx`) a lot has shipped — rule engine governance, integration manager, notifications/escalations, financial groups, onsite examinations, payment systems oversight, conduct analytics, interview records, complaint RFI raise + approval, thematic review closure, investigation closure & discontinuation. Those rows get re-scored from evidence, not carried over.

## Workbook: `FRD_Gap_Tracker_v5.xlsx`

Sheets:

1. **Summary** — per-module counts (Done / Partial / Missing / Not in scope), % complete per module and overall, computed by Excel formulas from the Tracker sheet.
2. **Tracker** — one row per FRD screen/capability:
   `Item ID | FRD Screen ID | Module | Sub-Module | Requirement (FRD title) | FRD Purpose | Status | % Complete | Evidence in system (route / file / DB object) | Gap detail | Effort (S/M/L) | Priority (P1/P2/P3) | Dependency | Owner | Notes`
3. **Manual test steps** — one row per test case, linked to the Tracker `Item ID`:
   `Test ID | Item ID | FRD Screen ID | Requirement | Role / persona to log in as | Preconditions | Step-by-step actions | Expected result | Pass / Fail | Actual result | Tester | Date`
   Written so a non-developer can execute them: exact route to open, exact button to click, exact field values, exact expected message or state change. Negative cases included where the FRD states a rule (e.g. closure blocked without a published report, RFI invisible to entity until dispatched).
4. **Gaps only** — Partial + Missing rows sorted by priority, for sprint planning.
5. **Module rollup** — module readiness plus the top blocking gaps per module.

## How status is decided (evidence-based)

Each screen is checked before scoring:

- routes in `src/routes/*` and pages under `src/pages/**` for existence and role gating,
- hooks/services in `src/hooks/**`, `src/lib/**`, `src/platform/**` for the behaviour the FRD demands,
- database objects (tables, RPCs, triggers, RLS, cron) and `supabase/functions/**` for automation, notification and audit requirements,
- existing verification artefacts under `docs/verification/**` and `docs/rbac/**` where they already prove behaviour.

Rules: **Done** only when screen + stated business rules + notifications + audit events all exist; **Partial** when the screen exists but named FRD capabilities are absent; **Missing** when nothing backs it. Nothing is marked Done without evidence recorded in the Evidence column; anything unverifiable is marked Partial with an explicit "unverified" note.

## Formatting

Arial throughout, frozen header rows, autofilter, colour-coded status (green/amber/red), print-set column widths, wrapped text for the step columns, and real numeric percentage formats so the Summary formulas compute. Written to `/mnt/documents/FRD_Gap_Tracker_v5.xlsx` and shared as a chat artefact. No application code, migrations or configuration are touched.
