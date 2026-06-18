## Problem

After deleting a role on `/admin/roles`, the page becomes unclickable. The delete dialog and toast disappear visually, but `<body>` keeps `pointer-events: none` (and/or a residual overlay), so all clicks are swallowed.

## Root cause

This is the well-known Radix interaction bug: the delete confirmation `Dialog` is opened from inside a modal `DropdownMenu` (`RowActionsMenu`). When the dialog closes, Radix's dropdown cleanup re-applies `pointer-events: none` to `<body>` after the dialog's own cleanup ran, so the existing workaround in `RoleManagement.tsx` (a single `setTimeout(..., 0)`) clears it too early and the style comes back.

The same `RowActionsMenu` → `Dialog` pattern is used for Edit too, but Edit currently happens to close cleanly because its dialog stays open long enough for the dropdown teardown to finish first. Delete is faster (mutation + auto-close + toast), which exposes the race.

## Fix

Scope: `src/pages/admin/RoleManagement.tsx` and the row-actions menu used on that page only. No business logic, no other pages, no styling changes.

1. **Stop the dropdown from re-locking the body.** Render the `RowActionsMenu` for role rows with `dropdownModal={false}`. The prop already exists on `RowActionsMenu`; passing `false` disables Radix's body-pointer-events lock for that dropdown, which removes the source of the race without affecting keyboard/focus behavior of the dialog itself.

2. **Harden the existing cleanup effect in `RoleManagement.tsx`.** Replace the single `setTimeout(0)` with a short, bounded poll (e.g. clear `document.body.style.pointerEvents` on `requestAnimationFrame` plus a couple of follow-up checks within ~250 ms, then stop) so that if any other Radix layer re-applies the lock during unmount, it still gets cleared. The effect must:
   - only run when both `dialogOpen` and `deleteConfirm` are falsy,
   - never run on an interval indefinitely (bounded retries),
   - fully clean up its timers on unmount / re-run.

3. **Also clear any orphaned Radix dialog overlay** belonging to a closed dialog in the same cleanup pass (defensive `querySelectorAll('[data-radix-dialog-overlay][data-state="closed"]')` removal) so a leftover backdrop element cannot intercept clicks either. Only closed overlays are touched; open dialogs are untouched.

## Files to change

- `src/pages/admin/RoleManagement.tsx`
  - Pass `dropdownModal={false}` to the `RowActionsMenu` rendered for each role row (around line 489).
  - Replace the `useEffect` workaround at lines 135–144 with the hardened version described above.

## Out of scope

- `RowActionsMenu` itself (no API change; we only use its existing `dropdownModal` prop).
- Other admin pages that use `RowActionsMenu` + `Dialog` (will be revisited only if the same symptom is reported there).
- Delete flow logic, permissions, RLS, or the `useDeleteRole` mutation.

## Verification

- Open `/admin/roles`, open the row menu on any role, click Delete, confirm. After the toast disappears, the page must remain fully clickable (sidebar, buttons, other row menus). Repeat for Edit → Cancel and Edit → Save to confirm no regression.
- Confirm `document.body.style.pointerEvents` is empty after the dialog closes (DevTools).
