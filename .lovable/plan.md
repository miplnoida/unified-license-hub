## Problem
On the Prudential "Create Action" dialog (and other Prudential module dialogs), the Submit/Create button stays enabled while the mutation is in flight. Users can click multiple times and create duplicate records.

## Fix
Wire every Prudential form/dialog submit button to the mutation's `isPending` state so it:
1. Disables while saving (prevents double-click).
2. Shows a spinner + "Saving…" / "Creating…" label for clear progress feedback.

Also add a guard in the submit handler (early-return if already pending) to defend against rapid clicks before React state updates.

## Files to update

**Dialogs / forms in Prudential module**
- `src/components/prudential/CreatePrudentialActionDialog.tsx` — Create button uses `create.isPending`.
- `src/components/prudential/CreatePrudentialEscalationDialog.tsx` — same treatment for its submit.
- `src/pages/prudential/ActionsList.tsx` — the Complete / Waive / Cancel confirm dialog "Confirm" button (uses `update` mutation) + "Sweep overdue" button (uses `overdue` mutation).
- `src/pages/prudential/AssessmentsList.tsx` — any create/submit action buttons.
- `src/pages/prudential/AssessmentDetail.tsx` — save / status-change buttons.
- `src/pages/prudential/EscalationsList.tsx` — action buttons that trigger mutations.
- `src/pages/prudential/StressIndicatorsAdmin.tsx` — create/save/delete confirm buttons.
- `src/pages/prudential/PrudentialTaxonomyAdmin.tsx` — create/save/delete confirm buttons.
- `src/pages/prudential/PrudentialEntityProfile.tsx` — any inline mutation-triggering buttons (e.g. escalate, run monitoring).

## Pattern applied to each button
```tsx
<Button
  disabled={saving || mutation.isPending || !isValid}
  onClick={handleSubmit}
>
  {mutation.isPending ? (
    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
  ) : 'Create'}
</Button>
```
Plus in the handler:
```ts
if (mutation.isPending) return;
```

## Out of scope
No business-logic, schema, or hook changes. No visual redesign — only disabled state, spinner, and label swap on existing buttons. Non-Prudential modules untouched.