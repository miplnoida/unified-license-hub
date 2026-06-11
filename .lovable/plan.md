# Plan: editable Step Order + full-fidelity Workflow Templates

Targets the two remaining gaps from the latest brief. Approver modes, Specific Users checkbox list, SLA hours wording, auto-approve toggle, step-entry / action notification editors, action routing and runtime enforcement are already implemented and stay untouched.

## 1. Editable Step Order

`src/pages/workflows/WorkflowList.tsx` (`StepCard`):

- Add a `Step Order` numeric `<Input min=1>` inside the SLA Controls row (visible in both view + edit; editable only when `isEditing`), bound to a `stepOrderDraft` local state mirroring the SLA pattern.
- On blur / Enter: parse → reject blank / non-numeric / `<= 0` (inline error). If valid and different from `step.step_order`, call `onUpdate(step.id, { step_order: n })` (the existing `useUpdateStep` mutation).
- Duplicate detection inside the card: compute `duplicateStepOrder = siblingSteps.some(s => s.id !== step.id && s.step_order === parsed)` and show an inline `text-destructive` message when the typed value or the persisted value collides.
- `validateWorkflow` already produces a duplicate-order issue, so the existing publish gate (`Turn On`) naturally fails when duplicates exist; no extra wiring needed for that path.
- Keep `Move up` / `Move down` buttons. `handleMove` continues to renumber `1..n`, which intentionally clears any manually entered gaps when the admin reorders.
- Sorting already uses `step_order` ascending in `useWorkflowSteps`; no change.

## 2. Full-fidelity Workflow Templates

New module `src/lib/workflowTemplateSnapshot.ts` (pure helpers + Supabase glue):

- `buildSnapshotFromRows({ steps, actionsByStepId, entryNotificationsByStepId, actionNotificationsByStepId })` → `{ version: 2, steps: TemplateStepV2[] }`.
- Each `TemplateStepV2` carries: `local_id` (= source step id), `step_order`, `name`, `description`, `approver_role`, `approver_role_id`, `approver_type`, `approver_config`, `sla_hours`, `auto_approve_on_timeout`, `allowed_actions`, `actions[]` (with `next_step_local_id`), `entry_notifications[]`, `action_notifications[]`.
- `fetchSnapshotForWorkflow(workflowId)` does the three parallel reads against `approval_step_actions`, `approval_step_entry_notifications`, `approval_action_notifications` and feeds the pure builder.
- `isV2Snapshot(steps)` — detects new vs legacy v1 templates so old templates keep applying as basic steps.
- `buildLocalIdMap(snapshot, createdStepIds)` — pure remap of local → real ids.
- `applyV2SnapshotToWorkflow({ workflowId, snapshot, fallbackRoleId, fallbackSystemRole })`:
  1. Batch-insert `approval_steps` with full modern columns, preserving `step_order`.
  2. Build the local→real id map from the returned rows (sorted by `step_order`).
  3. Batch-insert `approval_step_actions` (remapping `next_step_local_id` → `next_step_id` for `specific_step` mode, dropping it otherwise; honouring `end_state` only for `end_workflow`).
  4. Batch-insert `approval_step_entry_notifications` and `approval_action_notifications`.

Wire into `WorkflowList.tsx`:

- Extend the local `TemplateStep` / `WorkflowTemplate` types to optionally carry the v2 fields (back-compat preserved).
- `handleSaveAsTemplate`: replace the lossy `steps.map(...)` payload with `await fetchSnapshotForWorkflow(selectedId)` and insert `{ name, description, entity_type, steps: snapshot.steps }`. Keep the v1-compatible field names per step so the existing template-list badges still render (they read `approver_role` from each step, which is in v2 too).
- `handleCreate` (template branch): after the basic `createWorkflow` (using a single seed step to satisfy `createWorkflowWithSteps`’s contract), if the chosen template is v2, **delete** the seed step and call `applyV2SnapshotToWorkflow`. If v1, keep current behaviour.
  - Alternative path I will use: create workflow with `useCreateWorkflow` (workflow-only, no steps), then call `applyV2SnapshotToWorkflow` for v2 or the existing seeding logic for v1. This avoids the seed-step + delete dance and keeps the atomic v1 path untouched.

## 3. Tests

- `src/test/workflowTemplateSnapshot.test.ts` — pure tests:
  - v2 build preserves approver_type / approver_config / sla_hours / auto_approve_on_timeout.
  - `next_step_id` → `next_step_local_id` round-trip.
  - Entry + action notifications carried per step.
  - `buildLocalIdMap` happy path + length-mismatch throw.
  - `isV2Snapshot` v1 vs v2 detection.
- `src/test/workflowValidation.test.ts` — extend with cases for `validateStepOrder` duplicates and `validateSla` invalid values (the helpers exist; just add assertions).
- `src/test/workflowStepOrderEditing.test.tsx` — render `StepCard` in edit mode, type a duplicate order → assert inline error; type a unique order, blur → assert `onUpdate({ step_order: n })`.

## 4. Files touched

- `src/pages/workflows/WorkflowList.tsx` — step-order input + duplicate flag in `StepCard`; new save-template / apply-template paths.
- `src/lib/workflowTemplateSnapshot.ts` — new module.
- `src/test/workflowTemplateSnapshot.test.ts` — new.
- `src/test/workflowStepOrderEditing.test.tsx` — new.
- `src/test/workflowValidation.test.ts` — extra cases.

## 5. Verification

- `bunx vitest run` — all suites pass (current 320+).
- Manual smoke at `/workflows` per the brief: edit step order to duplicate (red error), to unique value (persists + reload preserves), save-as-template with Specific Users / SLA hours / auto-approve / entry notification / two actions + routing / action notification, apply the template → new workflow shows every field.

## Out of scope

- No schema migration. `workflow_templates.steps` is JSONB and absorbs the richer payload.
- Action-type allowlist (`SUPPORTED_ACTION_TYPES`) is unchanged — brief still says "runtime-supported only".
- No timeout processor.
