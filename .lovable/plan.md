## Problem

On `/workflows` → **Templates** dialog → **Delete** on a template, the SweetAlert2 "Delete template?" confirmation appears but its **Delete / Cancel** buttons are not clickable.

## Root cause

`handleDeleteTemplate` (src/pages/workflows/WorkflowList.tsx:665) opens `Swal.fire(...)` while the Radix **Templates `<Dialog>`** (line 1077) is still open.

Radix Dialog sets `pointer-events: none` on `document.body` while it's open and only re-enables pointer events on its own portal content. SweetAlert2 renders its `.swal2-container` as a sibling on `<body>`, so it inherits `pointer-events: none` — the overlay/buttons receive no clicks. The same pattern works elsewhere in the app only because those Swal calls aren't fired from inside an open Radix Dialog.

This affects every Swal call triggered from inside the Templates dialog (delete; potentially "Save as template" if reached from a dialog context).

## Fix

Add a global CSS escape hatch so SweetAlert2's container always accepts pointer events, regardless of Radix's body lock.

In `src/index.css`, append:

```css
/* SweetAlert2 must remain interactive even when a Radix Dialog
   has set pointer-events: none on <body>. */
.swal2-container {
  pointer-events: auto !important;
}
```

That's a one-file, presentation-only change — no workflow logic, no handler refactor, no Dialog restructure. It fixes the Templates delete button and any future Swal-inside-Dialog usage.

## Verification

1. Go to `/workflows` → click **Templates**.
2. Click **Delete** on any template → SweetAlert appears.
3. **Cancel** and **Delete** buttons both respond to clicks.
4. Confirm the row disappears and a success toast fires.
5. Regression check: standalone Swal dialogs elsewhere (outside a Radix Dialog) still work normally.
