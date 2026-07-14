
## Root cause (evidence from DB + code)

**A. Collaborative Review is hidden for every pre-license application.**
`src/hooks/useCollabReview.ts` line ~82 maps `entityType === 'application'` → `wfEntityType = 'pre_application'` and then calls `useWorkflowInstances('pre_application', id)`. But every active workflow instance in the DB is stored with `entity_type = 'application'` (legacy):

```
app_wf=490130a8… inst_wf=490130a8… inst_entity='application' status=active
```

So the hook finds no instance → `workflowInstanceId` and `stepId` are null → `stepPermsQ` disabled → `perms.enabled=false`, `can_view=false` → the panel silently hides itself in `CollaborativeReview.tsx`. This is why the section disappeared after the earlier entity-type refactor.

**B. Workflow panel shows the wrong step count / generic names.**
`WorkflowPanel` reads steps via `useWorkflowSteps(workflowId)` using the `workflowId` prop passed from `ApplicationDetail` — which is `app.workflow_id`. It never cross-checks the active `workflow_instance.workflow_id`. When an application's `workflow_id` still points to an older 2-step workflow while a 4-step workflow is the currently-configured pre-license one (`Pre License Approval Workflow`, id `10238551-a025-41e2-9ac2-8a39199eddbc`, 4 steps: Quality Assurance / Analyst Review / Licensing Officer / Final Approval), the UI shows 2. Also, step `61b9c779… Final Approval` has `step_order=6` (gap from 3), which is fine after ordering but shows there is no numeric-position based naming — real names already exist in `approval_steps.name`; the "Step 1 / Step 2" placeholders in the screenshot come from some other workflow's actual `name` column (needs verification per-workflow). The fix is to always resolve to the instance's workflow.

## Fix plan

### 1. `src/hooks/useCollabReview.ts`
- Replace the single-shot `wfEntityType` mapping with a legacy-aware resolver: when `entityType === 'application'`, query `workflow_instances` for **both** `'pre_application'` and `'application'` (via `.in('entity_type', [...])`) and take the newest active/paused one. Use its `entity_type` as the canonical for later reads (comments/suggestions still use the caller's `entityType`, which is correct — those tables key on the collab entity type, not the workflow entity type).
- Add a new small hook `useWorkflowInstanceForApplication(applicationId)` (or inline the query) that returns `{ instance, workflowId, currentStepId, workflowEntityType }`.

### 2. `src/components/applications/WorkflowPanel.tsx`
- Derive `effectiveWorkflowId`:
  ```
  effectiveWorkflowId = instance?.workflow_id ?? props.workflowId
  ```
  where `instance` is the newest active/paused row for this application (queried with `entity_type IN ('application','pre_application')` for pre-license, `'post_application','application'` for post-license — driven by `getApplicationCategory(app.data)`).
- Pass `effectiveWorkflowId` to `useWorkflowSteps`, and use `steps.length` for the "Level X of Y" denominator (already does — but now Y is correct because the source is right).
- When `props.workflowId && instance?.workflow_id && props.workflowId !== instance.workflow_id`: render a small admin-only banner "Application is linked to a different workflow than its active instance — showing the instance's workflow." (visible only when `isInternal` role has admin permission; otherwise silent). No auto-repair.
- Keep the existing sort `.order('step_order', asc)` and add a secondary in-memory sort by `created_at, id` to make duplicate-order deterministic.
- Titles: continue using `entityType === 'registration' ? 'Registration Workflow Review' : 'Workflow Review'`, but append the configured workflow name when available: `Workflow Review: {workflow.name} — Level X of Y`. Load the workflow row via a lightweight query keyed on `effectiveWorkflowId`.

### 3. `src/pages/applications/ApplicationDetail.tsx`
- Compute the effective workflow context in ONE place and pass it to both `<WorkflowPanel>` and `<CollaborativeReview>`. Cleanest option: add an optional prop `workflowInstance` (or `effectiveWorkflowId` + `workflowInstanceId` + `currentStepId`) to both components; when omitted they fall back to their internal resolver. Both will use the same resolver so the values agree.
- Move `<CollaborativeReview>` from the very bottom of the page into the review column, immediately after `<WorkflowPanel>`, so it's visible alongside the workflow (per acceptance criteria "near the workflow review area"). Existing narrative fields (assessment_notes / decision_rationale / review_notes) preserved.
- Add an admin-only "Collaborative Review is not enabled for this step" hint when `perms.enabled === false` and user has workflow-admin permission (reuses existing `usePermissions`).

### 4. No database changes required
- The DB already has correct step names in `approval_steps.name` and the 4-step workflow exists.
- No mass reassignment. The mismatch banner surfaces admin-fixable cases; we do **not** rewrite `applications.workflow_id` automatically.

### 5. Tests (Vitest)
Add `src/test/workflowEffectiveResolution.test.ts`:
- Instance workflow_id overrides stale application.workflow_id.
- Application workflow_id used only when no instance.
- Legacy `entity_type='application'` instance is found for a pre-license app.
- Canonical `entity_type='pre_application'` instance is found.
- No duplicate instance created (resolver is read-only).

Add `src/test/collabReviewLegacyInstance.test.ts`:
- `useCollabReview('application', id)` resolves an instance stored with legacy `entity_type='application'` and returns non-null `workflowInstanceId` / `stepId`.

Add `src/test/workflowPanelSteps.test.tsx`:
- Renders 4 rows for a workflow with 4 approval_steps.
- Uses `approval_steps.name` verbatim.
- Duplicate `step_order` values still render all rows.

Extend existing `src/test/workflowEntityTypes.test.ts` — no changes needed.

### 6. Regression coverage (kept working)
Approve / Reject / Send Back / remarks / digital signature / SLA / action history are all inside `WorkflowPanel` and driven off `steps` + `instance` + `actions`. Because we only *change the source* of `steps` (from `props.workflowId` to `effectiveWorkflowId = instance.workflow_id || props.workflowId`), and `actions` are already keyed off `entity_id/application_id`, all downstream logic (canActResult, isLastLevel, focusStepId) continues to work — with correct denominators. Manual verification list in the evidence section.

## Files to change

- `src/hooks/useCollabReview.ts` — legacy-aware instance lookup.
- `src/components/applications/WorkflowPanel.tsx` — effective workflow resolution + admin mismatch banner + configured workflow name in title.
- `src/pages/applications/ApplicationDetail.tsx` — hoist effective context, move `<CollaborativeReview>` next to `<WorkflowPanel>`, pass shared context down.
- `src/test/workflowEffectiveResolution.test.ts` (new)
- `src/test/collabReviewLegacyInstance.test.ts` (new)
- `src/test/workflowPanelSteps.test.tsx` (new)

No DB migration. No changes to Registration / Return / Complaint modules. No changes to `useWorkflowEngine` public API (add one new helper only).

## Evidence I will return after implementing

1. Root cause summary (above).
2. Sample `application.workflow_id` vs `workflow_instance.workflow_id` for the reported app (unchanged — no writes).
3. `effectiveWorkflowId` used by the UI.
4. `approval_steps` count and names for that workflow (from DB).
5. Canonical/legacy entity type resolved by the new helper for that app.
6. Explanation of why Collab Review was hidden (legacy `entity_type='application'` mismatch).
7. Diff of changed files.
8. `vitest run` output for new + existing collab/workflow tests.
9. `tsgo` typecheck result.
10. Playwright screenshot of the application detail page showing all steps + Collaborative Review visible.
