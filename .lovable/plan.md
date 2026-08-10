# Examination panels: one save action per step

## Problem
On the examination workspace tabs, two overlapping buttons appear: the panel's own save ("Save memo", "Save exit meeting") and the footer stage action ("Save & move to Fieldwork"). Both save the same form, which is confusing.

## Change
Keep a single primary action per panel footer.

- Scoping tab: remove the separate "Save memo" button. The footer keeps "Save & move to <next stage>" (which saves first, then advances), "Approve memo" where applicable, and "Cancel examination".
- Exit meeting tab: remove the separate "Save exit meeting" button; the footer's "Save & move to <next stage>" is the only save.
- Tabs whose data is saved per row (Team, Data requests, Workpapers, Findings, Reports) are unchanged — their row-level actions stay, and the footer shows "Move to <next stage>" / "Cancel examination" as today.
- When there is no next stage (last stage or terminal), the footer still shows a plain "Save" button on the form-based panels so the memo/exit meeting can still be saved.

## Technical notes
- `ExaminationStageActions.tsx`: when `beforeAdvance` is supplied but no next stage exists, render a single "Save" button that calls `beforeAdvance`; otherwise keep current behaviour.
- `ScopingMemoPanel.tsx`: drop the "Save memo" button, keep "Approve memo" and move it next to the stage actions row.
- `ExitMeetingPanel.tsx`: drop the "Save exit meeting" button.
- No backend, hook, or RPC changes; no change to permissions (`data-rbac` attributes preserved).
