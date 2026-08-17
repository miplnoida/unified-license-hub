# Examination workspace — pre-empt the sign-off block and show captured work on Overview

Two related problems on `/prudential/examinations/:id`, both frontend-only.

## 1. "Every workpaper needs reviewer sign-off before the final report"

The error is correct — the database blocks the move to Final report while any workpaper is unreviewed. On this examination the single workpaper (`Credit file reviewed`) is still a draft: neither preparer nor reviewer has signed off. The problem is the UX around it:

- The examination is at **Management response**. The guidance card only checks items for the *current* stage, so no blocker is shown; the user presses "Save & move to Final report" and only then meets a raw error.
- When the error appears there is no route to the thing that must be fixed — Workpapers is hidden behind "View full examination workspace" at this stage.

Changes:

- Guidance is derived for **the next transition as well as the current step**, so at Management response the user sees "1 workpaper requires reviewer sign-off before the report can be finalised" and "Every open finding needs a corrective action" *before* attempting the move.
- Each blocking item becomes actionable: a "Resolve" link that opens the relevant section (Workpapers, Findings, Data requests, Team, Scoping) directly, even when that section is not the current step.
- The primary stage action shows the blockers in a short "Why this is blocked" note beneath the button, using the same plain-language text, instead of relying on the toast alone. The button itself stays enabled and the database guard remains the source of truth — nothing is bypassed.

No change to `transition_examination_stage`, its guard rules, RBAC, or any RPC.

## 2. Overview does not show previously entered information

Overview currently shows only the phase strip, the next task, four counters and the examination header fields. Everything already captured (scoping memo, team, data requests, workpapers, exit meeting, reports, findings) is invisible until the user hunts for the right tab.

Overview gains a **"What has been captured so far"** section: one compact read-only summary card per area, each with a "View / edit" link into that section:

- **Scoping memo** — objectives, risk focus areas, approval state (or "Not started")
- **Examination team** — lead examiner plus member count
- **Information requests** — issued / received / outstanding, with overdue highlighted
- **Workpapers** — reviewed count vs total and each workpaper's plain-language status
- **Exit meeting** — date and matters discussed
- **Reports** — draft / final report state and whether a management response is recorded
- **Findings** — count with and without corrective actions

Areas with no data show a one-line "Nothing recorded yet" with the same link, so nothing looks broken.

## Technical notes

- `src/lib/examinationWorkflow.ts`: `deriveGuidance` returns blockers for the current step *and* for the next stage transition, each blocker carrying a `section` key so the UI can link to it; add a small `capturedSummary` derivation used by Overview. Existing exports keep their signatures where possible.
- `src/components/prudential/examination/NextActionCard.tsx`: blockers render as actionable rows with a section link.
- `src/components/prudential/examination/ExaminationOverview.tsx`: new summary cards fed from the hooks the workspace already loads (`useExaminationScoping`, `useExaminationTeam`, `useDataRequests`, `useWorkpapers`, `useExitMeeting`, `useExaminationReports`, `useExaminationFindings`) — no new queries.
- `src/pages/prudential/ExaminationWorkspace.tsx`: passes an `onOpenSection` handler that sets `?section=` (auto-enabling `all=1` for the advanced sections) so blocker and summary links always land somewhere reachable.
- `src/components/prudential/examination/ExaminationStageActions.tsx`: optional blocker note under the primary action.

## Verification

On this examination: Overview lists the workpaper as "Draft — awaiting preparer sign-off" and shows the sign-off blocker before any transition attempt; the blocker link opens Workpapers; signing off as preparer then reviewer clears the blocker and the move to Final report succeeds.
