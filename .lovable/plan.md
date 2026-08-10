# Examination workspace — stage actions moved into the panel footers

## What changes

Today the "Move to <next stage>" and "Cancel" buttons live in the page header, far from the form the examiner is filling in. Each tab has its own footer button ("Save memo", "Save exit meeting", etc.).

The stage actions move down into the active tab's footer, sitting beside the existing save button, and "Move to <next stage>" saves first:

```text
[ Save memo ]  [ Approve memo ]   |   [ Move to Team scoping ]  [ Cancel examination ]
```

- Clicking **Move to <stage>** saves the current tab's edits, then advances the stage — one click, no risk of losing typed data.
- **Cancel** stays a stage action (cancels the examination) and is styled as a distinct/outline action so it can't be mistaken for "discard form".
- The stage stepper stays where it is at the top so progress is still visible; only the two action buttons relocate.
- On tabs with no save form (Team, Data requests, Workpapers, Findings, Audit trail), the stage actions still appear in the same footer position and simply advance/cancel.
- Read-only examinations (closed/cancelled) show no stage actions, as today.

## Technical notes

- `src/pages/prudential/ExaminationWorkspace.tsx`: remove the header stage buttons; keep `useTransitionExamination` there and pass a small `stageActions` render prop (next stage label, `onAdvance(beforeAdvance?)`, `onCancel`, `pending`) down to each panel.
- Each panel in `src/components/prudential/examination/` renders the passed stage actions in its existing footer row. Panels with a save mutation hand their `persist()` to `onAdvance` so the save resolves before the transition RPC fires; if the save fails, the transition is not attempted.
- No database, RPC, or permission changes — buttons keep their existing `data-rbac` attributes (`prudential_supervision.edit` for save, `prudential_supervision.workflow_action` for stage actions).
