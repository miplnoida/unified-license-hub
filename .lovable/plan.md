## Goal

Bring `src/components/returns/ReturnWorkflowPanel.tsx` to full visual + interaction parity with `src/components/applications/WorkflowPanel.tsx` for every step, without changing any return-specific business logic (return status transitions, return mutations, `submit-return-decision` edge function, etc.).

## Approach

Refactor `ReturnWorkflowPanel.tsx` to mirror `WorkflowPanel.tsx`'s rendering pipeline. Reuse the shared building blocks that already exist (`useEntityActions`, `useActorsMap`, `useStepActions`, `useWorkflowSLA`, `SlaStatusBadge`, `SlaProgressPanel`, `renderStepHistory`, `renderStatusBadge`, Accordion structure). Keep the return-specific mutation, the `submit-return-decision` call path, `onStatusChange` behavior, and `ReturnDetail` integration unchanged.

## Changes

### `src/components/returns/ReturnWorkflowPanel.tsx` (rewrite)

Port from `WorkflowPanel.tsx`:

1. **Data hooks**
   - `useEntityActions({ entityType: 'return', entityId: returnId })` → build `actionsByStep` Map.
   - `useActorsMap(actionsByStep)` for actor names/emails in history.
   - `useStepActions(currentStep?.id)` for config-driven action button rows.
   - `useWorkflowSLA` via a local `StepSlaBadge` wrapper.
   - Keep existing `specificApproverIds`/profiles lookup for the `stepRoleLabel` fix.

2. **Computed state**
   - `stepStatuses` per step (completed/current/paused/returned/upcoming).
   - `stepStartedAt` per step for SLA clock.
   - `isPaused`, `isTerminal`, `pauseCauseAction`.
   - `canByType` with `!isPaused` guard on every action flag.
   - `enabledConfigured` → `actionButtonsList` from `useStepActions`.
   - `canAddRemark` matching WP semantics.

3. **Layout**
   - Title: `Workflow Review — Level N of M` with optional Paused badge.
   - Paused warning banner with last-action detail (when paused, not early-return).
   - Permissions-unknown inline warning.
   - Replace flat `<ol>` with `Accordion` (`type="single"`, auto-open the current step via `openStepId` + `useEffect`).
   - Per-`AccordionItem` trigger: status icon, step name, dynamic role/user label (keep the current `stepRoleLabel` behavior with specific-users names), `SlaStatusBadge`, `renderStatusBadge()`, signature badge.
   - Per-`AccordionContent` branches:
     - **current**: SLA progress panel, activity history (`renderStepHistory`), no-configured-actions warning, not-authorized warning with `canActResult.reason`, signature required banner, remarks `Textarea`, config-driven action buttons (with per-button `requireComments` badge), "Add Remark" button for non-acting internal users.
     - **done**: `renderStepHistory()` timeline.
     - **paused**: paused copy + `renderStepHistory()`.
     - **upcoming**: "This step is upcoming…" copy.
   - Terminal (completed/cancelled) read-only accordion view with per-step history, mirroring WP:519–663.
   - Contextual toasts via `actionSuccessMessage()` / `remarksRequiredMessage()` helpers.

4. **Return-specific glue (unchanged behavior)**
   - Keep calling the existing return action mutation / `submit-return-decision` code path when an action button is clicked.
   - Keep `onStatusChange(newStatus)` firing after successful transitions.
   - Keep the initialize-workflow-instance flow already in the file.
   - "Add Remark" button: wire to the existing return remark mutation if one exists; if not, disable/hide it (do NOT introduce a new backend endpoint in this task).
   - Skip the license/account approval Dialog (application-only).
   - Skip `LegalComplianceNotesSection` (application-only for now).

### `src/pages/returns-mgmt/ReturnDetail.tsx`

Pass through the extra props the new panel needs so SLA can render:
- `returnSubmittedAt` (existing on the record)
- `returnCreatedAt` (existing on the record)

No other changes.

## Out of scope (explicitly not touched)

- Application `WorkflowPanel.tsx`.
- `useWorkflowEngine`, `useStepActions`, `useEntityActions`, `useActorsMap`, `useWorkflowSLA` — reused as-is.
- Return status enum / transition rules.
- `submit-return-decision` edge function.
- Any DB schema, RLS, or migrations.
- Any other page or component.

## Verification

1. Open `RET-2026-00022` as an admin → step accordion, SLA, history, action buttons all render.
2. Open the same return as the assigned non-admin internal reviewer (e.g. `ratnpriyaemp@yopmail.com` once assigned) → same accordion layout, same badges, action buttons gated exactly like WorkflowPanel (via `user_can_act_on_workflow_step` RPC). No "Admin" fallback label.
3. Compare side-by-side against a pre/post-application workflow for a step — trigger row, expanded content, banners, and buttons should be visually identical (only the entity label differs).
4. Confirm existing approve / request-edit flow still updates return status and refreshes the panel.
