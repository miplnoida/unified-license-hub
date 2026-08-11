# Examination module — guided workflow redesign (frontend only)

Turn the Examination workspace from an eight-tab technical console into a guided, task-first experience for non-technical supervisors. No database, stage-machine, RPC, RBAC, validation, audit or notification changes: every existing hook, mutation and guardrail in `useExaminations.ts` is reused as-is.

## What changes for the user

### 1. New workspace shell (4 tabs instead of 8)
- **Overview** — command centre: entity, reference, type, current phase + exact stage, lead examiner, fieldwork dates, and live counters (open findings, outstanding data requests, workpapers awaiting review, open remediation actions, key due dates). Shows one prominent **Next action** and a **Blocking items** list.
- **Current step** — renders only the panel(s) relevant to the current stage (Scoping for `scoping`, Data requests for `pre_exam_request`, Workpapers for `fieldwork`, Exit meeting for `exit_meeting`, Reports for report/response stages, Findings for `remediation`).
- **Findings & remediation** — always reachable.
- **Documents & reports** — always reachable.
- **History** — existing `ExaminationTimeline`.

Power users keep everything: an **All sections** toggle (or "View full examination workspace") re-exposes Scoping / Team / Data requests / Workpapers / Exit meeting / Reports / Findings in one place. Route `/prudential/examinations/:id` is unchanged; the active section is held in a `?section=` query param so links keep working.

### 2. Simplified progress indicator
Five business phases replace the 10-pill scrolling row: **Preparation → Examination → Reporting → Remediation → Complete**. The exact internal stage stays visible as a small caption/badge ("Stage: Pre-exam request"). Mapping (labels only, no stage changes):
- Preparation: planned, scoping, pre_exam_request
- Examination: fieldwork, exit_meeting
- Reporting: draft_report, management_response, final_report
- Remediation: remediation
- Complete: closed (cancelled shown as a separate terminal state)

### 3. Business-language actions
`ExaminationStageActions` keeps its single-primary-button behaviour (no reintroduced duplicate Save buttons) but the label comes from a target-stage → business-verb map, e.g. "Start data request", "Start fieldwork", "Record exit meeting", "Prepare draft report", "Record management response", "Prepare final report", "Start remediation", "Complete examination". **Cancel examination** moves out of the button row into a "More actions" dropdown with an explicit confirmation dialog explaining the consequence; permissions and the underlying transition call are untouched.

### 4. Panel-level clarity (same fields, same saves)
- **Scoping**: grouped into "Why are we examining?" (objectives, legal basis), "What are we examining?" (risk focus areas as chips, scope exclusions), "How will it be performed?" (methodology, examiner days). Chips serialise to the same comma/array format on save.
- **Team**: lead examiner shown as a prominent card; other members listed below; allocated days / specialisation / conflict details behind progressive disclosure. Missing-lead warning becomes actionable ("A lead examiner is required before fieldwork can begin" + Assign lead examiner).
- **Data requests**: summary counters (total / received / awaiting / overdue / draft) plus filter chips (Needs attention, Overdue, Draft, Issued, Received, All); one clear next action per row ("Send request", "Mark as received"); response entry no longer renders a textarea on every row at once.
- **Workpapers**: plain-language status ("Prepared — awaiting independent review"), header progress "5 of 7 workpapers reviewed", and preparer/reviewer sign-off buttons unchanged.
- **Findings & CAP**: each finding presented as What we found / Why it happened / What must happen, with an explicit remediation state line and a single "Create corrective action" call to action. Findings without a corrective action are pinned/highlighted at the top.
- **Reports**: a stepper (Prepare → Internal review → Approval → Issue → Management response → Finalise) with only the state-relevant action surfaced; management response captured in the response step rather than on every card.
- **Exit meeting**: cleaner labels ("Regulator attendees", "Entity attendees") with chip entry, same array persistence.
- Every empty state gets purpose + a primary call to action.

## Technical notes

- New files: `src/lib/examinationWorkflow.ts` (phase mapping, business action labels, next-action/blocking-items derivation), `src/components/prudential/examination/ExaminationOverview.tsx`, `ExaminationPhaseProgress.tsx`, `NextActionCard.tsx`, and a small `ChipsInput` used by Scoping/Exit meeting.
- Blocking items are derived purely from data already fetched (`useExaminationScoping`, `useExaminationTeam`, `useDataRequests`, `useWorkpapers`, `useExaminationFindings`) and mirror the existing DB guardrail messages in `examinationErrorMessage`, so the UI warns about the same conditions the RPC enforces — it never bypasses them.
- `ExaminationWorkspace.tsx` is restructured; existing panels are refactored in place and keep their props (`examinationId`, `readOnly`), `data-rbac` attributes, and `StageActions` usage.
- `ExaminationsList.tsx` gains a phase column/filter alongside the existing stage filter and a row action to open the workspace; query behaviour unchanged.
- Responsive and accessible: phase progress collapses to a compact indicator on mobile, tabs remain keyboard navigable, action buttons keep discernible labels.

## Verification

Walk the full lifecycle in the running app (planned → scoping → pre-exam request → fieldwork → exit meeting → draft report → management response → final report → remediation → closed), confirming at each stage that Overview names the current phase, the next action, and any blockers; that guardrail errors still surface (e.g. advancing to fieldwork without an approved memo or lead examiner); and that no functionality has become unreachable.
