## Problem

On `/admin/returns/configurations`, after opening a dialog (Add/Edit Configuration or Assign Forms) via the row actions menu and closing it, the Radix Dialog overlay/backdrop lingers and the page becomes unresponsive — menu items and buttons can no longer be clicked. This is the classic Radix "Dialog opened from inside DropdownMenu" interaction leaving `pointer-events: none` on `document.body`.

## Root cause

`ReturnConfigsPage.tsx` opens both dialogs from `RowActionsMenu` (a Radix DropdownMenu). When the dropdown closes at the same time the Dialog opens, and again when the Dialog closes, Radix's scroll-lock + focus-guard leaves the body with `pointer-events: none`, blocking all clicks until the next re-render/hover.

## Fix (scoped to this page only)

Edit `src/pages/admin/returns/ReturnConfigsPage.tsx`:

1. **Defer dialog open** from the row menu so the dropdown fully unmounts first:
   - Wrap `setSelectedConfigId(c.id); setFormAssignOpen(true)` and `openEdit(c)` in a `setTimeout(..., 0)` (or `requestAnimationFrame`) inside the `RowActionsMenu` `onClick` handlers.

2. **Restore body pointer-events on dialog close** as a safety net in both `Dialog`'s `onOpenChange`:
   - When `v === false`, call `requestAnimationFrame(() => { document.body.style.pointerEvents = ''; })` before resetting state.

3. **Prevent focus-return conflict** by adding `onCloseAutoFocus={(e) => e.preventDefault()}` to both `<DialogContent>` elements (main config dialog and `FormAssignmentDialog`).

No other files touched. No business logic, styling, or data behavior changes — only interaction cleanup.

## Verification

- Open Add Configuration → close via ✕ / backdrop / Esc → confirm sidebar and row menus remain clickable.
- Open row menu → "Assign forms" → close → confirm the same.
- Open row menu → "Edit" → save/cancel → confirm the same.