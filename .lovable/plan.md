## Goal
When a reviewer submits an "Escalate" action on an application, also invoke the new server-gated `public.escalate_application(application_id, reason)` RPC with the reviewer's remarks as the `reason`, so the permission gate + audit entry from Batch 3 Phase D are exercised on every escalation.

## Scope
- Frontend only. No schema/RPC changes; the RPC already exists.
- Only the application escalate path (`entityType === 'application'`, `actionType === 'escalate'`). Registration escalations and other action types are untouched.
- No changes to any other business logic, notifications, or UI layout.

## Change
Single file: `src/components/applications/WorkflowPanel.tsx`, inside `executeAction`.

After the existing `perform-workflow-action` edge-function invocation returns success (i.e. after the current success/error handling passes), and before the toast/query invalidation, add:

```ts
if (entityType === 'application' && actionType === 'escalate') {
  const { error: rpcError } = await supabase.rpc('escalate_application', {
    application_id: applicationId,
    reason: comment,
  });
  if (rpcError) {
    toast.error(rpcError.message || 'Escalation gate failed');
    return;
  }
}
```

Rationale for placement:
- Runs only for application escalations, keeping registration flow and every other action unchanged.
- Uses `comment` (the reviewer's remarks textarea — already validated as required for escalate via `isRemarksRequired`), matching the RPC's `reason` parameter.
- Runs after the edge function so the workflow action is recorded first; the RPC serves as the gated status/audit reinforcement introduced in Phase D. If the RPC rejects (permission denied), we surface the error and stop before invalidating caches so the UI reflects reality on next refetch.

## Verification
- Manually escalate an application as an authorized reviewer → toast success, `approval_actions` row from edge fn + `escalate_application` audit row both present.
- Escalate as a user missing `application_management.escalate` → edge fn path already blocks; if it somehow passes, the RPC now denies with a permission error toast.
- No changes to approve/reject/send_back/etc. paths.

## Out of scope
- Refactoring the edge function to delegate to the RPC.
- Registration escalation.
- Any UI copy or layout changes.
