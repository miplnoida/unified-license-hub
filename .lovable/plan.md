## Problem

On the licensee return-fill page, the `Next` (and `Previous`) buttons disappeared after the previous fix. Root cause: `FormRenderer` wraps Previous / Save Draft / Next / Submit in a single `{!hideActions && ...}` block. Setting `hideActions` on the return sub-form to remove the misleading Save Draft/Submit also removed the section navigation.

## Fix

Split the actions block in `src/components/form-renderer/FormRenderer.tsx` so navigation and persistence are controlled independently:

- Replace the single `hideActions` boolean with two concerns:
  - **Navigation buttons** (`Previous`, `Next`) — always render when the form has more than one section.
  - **Persistence buttons** (`Save Draft`, final-section `Submit`) — hidden when `hideActions` is true.
- Keep the existing `hideActions` prop name/signature so `FillReturnPage` and any other caller keeps working; only its meaning narrows to "hide Save Draft / Submit".
- Layout: keep Previous on the left, Next on the right; Save Draft only appears alongside Next when `hideActions` is false.
- Single-section forms: no Previous/Next rendered (unchanged behavior).

## Verification

- Open a multi-section return on the licensee portal → Previous/Next visible and functional, Save Draft/Submit not shown inside the sub-form.
- Open a normal application form (no `hideActions`) → all four buttons still present as before.
- Page-level Save Draft and Review & Submit on `FillReturnPage` still drive persistence (unchanged).

No backend or migration changes.
