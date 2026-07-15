## Problem

`/applications/:id` crashes with "Rendered more hooks than during the previous render." Stack points to `src/components/collab-review/CollaborativeReview.tsx`.

Root cause: hooks-order violation. The component has an early `return null` around line 103 (when `collab.perms.enabled`/`can_view`/`stepId` are not yet resolved). Below that early return, two more hooks execute:
- `useMemo` for `autoRoleId` (line 216)
- `useEffect` to seed `selectedRoleId` (line 222)

On first render `collab` is still loading → early return triggers → those hooks are skipped. When permissions resolve on the next render, the early return no longer fires, so React now sees extra hooks and throws.

## Fix

Move the `autoRoleId` `useMemo` and the `selectedRoleId` `useEffect` (plus the derived `multiRole`, `effectiveRoleId`, `roleGateOk` constants that depend on them) **above** the early-return block at line 103. This keeps the hook call order identical on every render regardless of perms/loading state. No behavior change — only the ordering of hook declarations relative to the guard.

Scope:
- File: `src/components/collab-review/CollaborativeReview.tsx`
- Move lines ~215–226 to just before line 101 (before `if (!collab.perms.enabled || ...)`).
- Verify no other hooks appear after the early return (they don't; the rest is plain code / JSX).

## Verification

- Reload `/applications/da9028ff-16e3-4c54-bb1e-144eab362a64`; the error boundary should not fire.
- Check console — the "Rendered more hooks" error is gone.
- Confirm Collaborative Review still renders normally for admin and reviewer roles.