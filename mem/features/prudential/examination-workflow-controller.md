---
name: Examination workflow controller
description: Examination stage can only be advanced from the Current step tab; supporting tabs are local-actions only
type: feature
---
- The Examination workspace has exactly one lifecycle controller: the **Current step** tab. `ExaminationStageActionsProvider` wraps only the current-step panel.
- `StageActions` takes `mode`: `current-step` renders the progression action + "Cancel examination"; `supporting` renders only a local Save plus the panel's own actions.
- Mandatory next-stage prerequisites (`guidance.transitionBlockers`) disable the progression button and are listed as "Before you can <action>:"; DB guards remain the ultimate authority.
- Blocker "Resolve" links open a supporting section with `?from=current`, showing a detour banner and "Return to current step". The stage is never changed from a supporting tab.
- After a successful transition the URL normalises to `section=current` (keeps `all=1`), so the user never sits on a stale tab.
- Current step also renders dependency rows (`dependencies()` in `src/lib/examinationWorkflow.ts`) for workpapers/findings/reports/data requests.
