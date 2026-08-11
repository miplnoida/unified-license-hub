# Examination workflow — one controller, synchronized navigation

Frontend-only orchestration fix. No database, RPC, guard, RBAC or notification changes.

## The problem in the current code

`ExaminationWorkspace.tsx` wraps the entire `Tabs` in `ExaminationStageActionsProvider`, and every panel renders `<StageActions />` in its footer. So Workpapers, Team, Data requests, Findings and Documents & reports all show the global "Prepare final report" / "Start remediation" button, regardless of which tab is open. After a transition the URL keeps `section=workpapers`, leaving the user on a stale tab.

## Changes

### 1. Stage actions only in Current step
The provider stops being page-global. Only the panel rendered inside the **Current step** tab receives the stage-action context (provider moves to wrap `currentStepPanel()` only). Supporting tabs render the same panels with `mode="supporting"` and get `null` context, so `StageActions` renders no progression action there.

### 2. Supporting mode keeps a local Save
Today `StageActions` doubles as the panel save button (`beforeAdvance`). In supporting mode the component still renders **Save** (when the panel passes a save) plus the panel's own local actions (Approve scope, sign-offs, add/remove), and never renders the progression action or "Cancel examination".

### 3. Blockers disable progression
Current step shows a readiness block above the primary action:

```text
Before you can prepare the final report:
  ○ 2 workpapers require reviewer sign-off
  ✓ Corrective actions created
```

While any mandatory blocker for the next stage is present, the progression button is disabled with the reason shown; when clear it shows "✓ All prerequisites complete" and enables. The database guard remains the ultimate authority.

### 4. Blocker resolution is a temporary detour
"Resolve" / "Review workpapers" opens the supporting section with a `from=current` marker. That section then shows a banner at the top:

```text
Resolving a prerequisite for: Final report        [Return to current step]
```

and, once the specific blocker clears, "✓ All required workpapers have now been reviewed." The examination stage is untouched by the detour.

### 5. Current step becomes an orchestration view
For stages whose readiness depends on other sections (fieldwork, draft report, management response, final report, remediation), Current step renders the step panel plus compact dependency rows — Workpapers "5 of 7 reviewed [Open workpapers]", Findings "3 open findings [Open findings]", Report "Final report not yet prepared [Open report]" — derived from the summary data already loaded. Reports keeps its own internal Prepare → Review → Approve → Issue → Response lifecycle inside the Reports panel; Current step only observes report state.

### 6. Navigation synchronization
After a successful transition the workspace sets `section=current`, clears the `from` marker (keeps `all=1` if the user enabled the advanced workspace), and Current step re-derives its panel from the refetched stage, so it immediately reflects the new stage. Any external refresh that changes the stage while on Current step likewise re-renders the correct panel. "View full examination workspace" stays available for power users.

## Technical notes

- `ExaminationStageActions.tsx`: context gains no new plumbing, but `StageActions` accepts `mode?: 'current-step' | 'supporting'` (default `supporting`) — progression button and "Cancel examination" render only in `current-step` mode with a non-null context; blockers gate `disabled`.
- `ExaminationWorkspace.tsx`: provider moved inside the `current` TabsContent; each panel gets `mode`; `openSection(key, { from: 'current' })`; `transition` success handler normalizes `section=current` and drops `from`.
- `examinationWorkflow.ts`: split blockers into `blockers` (current step) and `transitionBlockers` (next stage, mandatory) plus a `dependencies(stage, data)` helper returning the Current-step dependency rows. Existing exports keep their signatures.
- Panels (`ScopingMemoPanel`, `TeamPanel`, `DataRequestsPanel`, `WorkpapersPanel`, `ExitMeetingPanel`, `ReportsPanel`, `FindingsPanel`): add `mode` passthrough and render the `ResolveBanner` when `from=current`; local actions unchanged.
- New small component `ExaminationResolveBanner.tsx` for the detour banner + return link.

## Verification

Walk the reviewer sign-off scenario on the open examination: blocker visible on Current step with progression disabled → "Review workpapers" opens Workpapers with no progression button and a return link → sign off preparer then reviewer → banner confirms cleared → return to Current step → progression enabled → transition succeeds and the view stays on Current step showing the new stage.
