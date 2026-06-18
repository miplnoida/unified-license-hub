## Problem

In `src/pages/admin/RoleManagement.tsx` the right-hand "Role Summary" cards still don't scroll properly in two places:

1. **Add/Edit Role dialog** (right column, ~line 805–857): the Card uses `max-h-[70vh]` but no definite height, and the inner `ScrollArea` uses `h-full max-h-[60vh]`. Inside a grid column whose row height is driven by the (tall) left column, Radix's `ScrollArea` viewport never gets a definite size in some cases, so the card just grows and the page/dialog scrolls instead of the card.
2. **Roles list page** (right column, ~line 518–590): the "Role Summary" card has `sticky top-6` with **no height cap at all**. Only the "Cannot" list is wrapped in a `ScrollArea`; the "Can" list and the whole card can grow taller than the viewport, so the sticky card scrolls off-screen and feels unscrollable.

## Fix (UI-only, no logic changes)

Edit only `src/pages/admin/RoleManagement.tsx`.

### 1. Add/Edit dialog right summary card (line ~807)

- Give the Card a definite height instead of just `max-h`, so the inner ScrollArea has something to fill:
  - `lg:sticky lg:top-2 flex flex-col h-[70vh]` (drop `max-h-[70vh]`).
- Keep `CardHeader` as `shrink-0`.
- `CardContent`: `flex-1 min-h-0 overflow-hidden p-4 pt-0`.
- Replace the inner `ScrollArea className="h-full max-h-[60vh] pr-3"` with `ScrollArea className="h-full pr-3"` so it fills the now-definite CardContent.
- On screens smaller than `lg` (where the grid collapses to one column), use `h-auto max-h-[60vh]` via responsive classes so the card doesn't force a 70vh block on mobile: `h-auto lg:h-[70vh] max-h-[70vh]`.

### 2. Roles list page right summary card (line ~520)

- Change `<Card className="sticky top-6">` to a bounded, scroll-friendly card:
  - `sticky top-6 flex flex-col max-h-[calc(100vh-8rem)]`.
- Make `CardHeader` `shrink-0`.
- Wrap the entire body (Badges + Users + Separator + Can + Cannot blocks) inside one `ScrollArea` with `className="flex-1 min-h-0 pr-3"` inside a `CardContent` that is `flex-1 min-h-0 overflow-hidden p-6 pt-0`.
- Remove the inner `ScrollArea` around just the "Cannot" list (it becomes redundant — the outer one handles all overflow, including a long "Can" list).
- When no role is selected, keep the existing empty state inside the same scroll container (it will simply not scroll).

### 3. Sanity

- No changes to data hooks, permission logic, `PermissionGate`, `editSummary`, `detailSummary`, or any save/load behavior.
- No new dependencies.
- Verify with TypeScript build.

## Expected result

- Add/Edit Role: right "This role will be able to" card has a fixed visible height; both Can and Cannot lists scroll inside the card while header stays put.
- Roles list page: right "Role Summary" card stays sticky, never exceeds viewport height, and the whole body (Can + Cannot + meta) scrolls internally.
- No layout overflow, no page-level scroll caused by the summary card.
