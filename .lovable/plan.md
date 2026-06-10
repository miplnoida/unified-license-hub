# Returns Workflow Parity Plan

## Goal
Make `returns_filed` use the same configurable approval-workflow architecture (workflow_id + current_step_id + approval_actions + workflow_instances + per-step allowed_actions + Edit Request) that Pre/Post Licensee Applications already use, while preserving the existing SUB/VAL/TBR behavior as a fallback for returns with no workflow configured.

## Why this needs a plan (not just an edit)
The application workflow is not a thin frontend — it is a full stack:

- DB: `workflow_instances`, `approval_workflows`, `approval_steps`, `approval_actions`
- RPCs: `perform_workflow_transition`, `perform_final_workflow_approval` — both currently take `_application_id` and operate on `applications`
- Edge functions: `perform-workflow-action`, `approve-pre-licensee`, `verify-and-submit` — all `entity_type='application'` hardcoded
- Resolver: `src/lib/workflowApprovalResolver.ts` — uses `applications.license_type` + sector/category hierarchy
- UI: `WorkflowPanel`, `StatusTimeline`, `ActivityTab` — assume an `applications` row + license outcome

To support returns without breaking applications, we add a return-specific workflow track that mirrors the same components and tables but uses return-specific entity matching and final-approval semantics (no license issuance).

## Scope
Implement the entire chain end-to-end so an admin/reviewer can run a return through the same approve / send-back / request-resubmission UX as an application, with full activity timeline and Edit Request.

## Technical plan

### 1. Database migration (`returns_filed` + workflow plumbing)
- Add nullable columns to `returns_filed`:
  - `workflow_id uuid` (FK to `approval_workflows.id`)
  - `current_step_id uuid` (FK to `approval_steps.id`)
- Indexes on both.
- New SECURITY DEFINER RPC `perform_return_workflow_transition(_return_id, _instance_id, _step_id, _action_type, _comments, _actor_id)`:
  - Mirrors `perform_workflow_transition` but:
    - locks the `returns_filed` row instead of `applications`
    - writes `approval_actions` with `entity_type='return'`, `entity_id=return_id`
    - writes `workflow_instances` with `entity_type='return'`
    - on final approval sets `returns_filed.workflow_status='VAL'`
    - on `request_resubmission` / `send_back` sets `workflow_status='TBR'` and inserts a `return_requests` row (`status='active'`, `reasons=comments`)
    - on resubmission (via separate path below) reopens instance + sets `workflow_status='SUB'` and closes the active `return_requests` row
  - Logs to `return_audit_log` for backward compat AND to `approval_actions`.
- New RPC `start_return_workflow(_return_id)` that resolves a workflow (sector/sub_sector/return_type) and creates the first `workflow_instances` row if a workflow exists.
- New RPC `resubmit_return(_return_id, _actor_id, _comments)` that closes active `return_requests`, reopens the workflow instance to step 1 (or last review step per config), sets status SUB, logs audit.
- All FKs respect existing data; columns nullable for fallback.

### 2. Approval workflow scoping for returns
- Reuse `approval_workflows` with `entity_type='return'`.
- Resolution helper `src/lib/returnWorkflowResolver.ts`: match by `regulator_id` + `sector_id` + `sub_sector_id` + `return_type_id`, falling back hierarchically (mirrors `workflowApprovalResolver.ts`).
- Global toggle: `site_settings.review_settings.return_review_enabled` (default true).

### 3. Edge functions
- New `supabase/functions/perform-return-workflow-action/index.ts`:
  - Same shape as `perform-workflow-action` but calls `perform_return_workflow_transition` and skips license/licensee provisioning on final approval.
  - Dispatches notifications with `entity_type='return'`.
- New `supabase/functions/resubmit-return/index.ts`:
  - JWT-verifies licensee, calls `resubmit_return` RPC.

### 4. Frontend hooks/services
- New `src/hooks/useReturnWorkflowEngine.ts`: wraps the new edge function + queries `workflow_instances` for `entity_type='return'`.
- Extend `useReturnsManagement` with: `useReturnWorkflowInstance(returnId)`, `useReturnApprovalActions(returnId)`.

### 5. Generalize shared UI components
- Refactor `WorkflowPanel`, `StatusTimeline`, `ActivityTab` to accept a small adapter prop instead of an `application` row:
  - `entity: { id, entityType: 'application'|'return', currentStatus, workflowId, currentStepId, data }`
  - `actionInvoker: (params) => Promise<...>` injected from the parent so applications keep calling `perform-workflow-action` and returns call `perform-return-workflow-action`.
- Application call sites unchanged (thin wrapper preserves existing API).

### 6. `ReturnDetail.tsx` rewrite
- Resolve workflow via new resolver.
- If workflow ON: render shared `WorkflowPanel` + `StatusTimeline` + `ActivityTab` with the return adapter. Drop hardcoded Approve / Request Edit buttons.
- If workflow OFF / unresolved: keep current SUB→VAL/TBR mini-flow as fallback (one code path, gated by resolver result).
- Edit Request shows in both modes.

### 7. Licensee side (resubmit)
- `src/pages/entity/returns/...` resubmit action calls the new `resubmit-return` function instead of directly mutating `returns_filed`. Active `return_requests` row is closed by the RPC.
- Edit request reason already surfaced via `return_requests`; keep UI.

### 8. Status semantics (unchanged labels)
- `SUB` Submitted/Under Review, `VAL` Validated, `TBR` To Be Revised, draft/resubmitted as today.
- Workflow steps drive *transitions*; `workflow_status` remains the public status.

### 9. Routes touched
- `/returns-management/:id`
- `/admin/returns/:id` (same component)
- `/admin/returns/queue` (no logic change; badges driven off `workflow_status`)

### 10. Tests
- Vitest: workflow resolution + action filter for `entity_type='return'`.
- Existing application workflow tests must still pass.

### 11. Fallback / backward compat
- Existing returns with `workflow_id IS NULL` keep working with the legacy buttons.
- No data migration required; new columns are additive.

### 12. Verification
- `npm run build`
- `vitest run` (returns + workflow + application suites)
- Manual: create a return-scoped `approval_workflow`, submit a return, walk it through approve/send-back/request_resubmission/resubmit.

## Out of scope (explicitly)
- Changing application workflow behavior or RPC signatures.
- License/licensee provisioning hooks on return approval.
- Schema rename of `workflow_status`.

## Risk
Medium: shared UI refactor + new RPC + new edge function. Mitigated by keeping application call sites unchanged via adapter and by preserving the legacy fallback path on returns.

## Estimated change surface
~1 migration, 2 new edge functions, 3 refactored shared components, 1 rewritten `ReturnDetail.tsx`, 1 new resolver, 1 new hook, small touch-ups on licensee resubmit, ~5 test files.
