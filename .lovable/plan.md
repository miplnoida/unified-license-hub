## Problem
The Collaborative Review panel still shows a "Post as:" role selector when the current user has more than one matching review role. Per the earlier requirement ("user's role should be auto-detected"), no role picker should be visible — the system must choose the role automatically.

## Fix (UI only, in `src/components/collab-review/CollaborativeReview.tsx`)

1. **Remove the "Post as" selector block** (lines ~488–501). Users never pick a role manually.

2. **Auto-select the effective role** whenever `collab.availableRoles` resolves:
   - Prefer the role tied to the user's effective portal context (via `useEffectivePortalContext`) when it matches one of `availableRoles`.
   - Otherwise fall back to the first entry in `availableRoles`.
   - Set it through the existing `setSelectedRoleId` state so `roleGateOk` becomes true without user interaction.
   - Keep it in sync via a `useEffect` that re-runs when `availableRoles` changes.

3. **Update the "Choose a role above before posting" helper text** (lines 517, 548) — since there is no picker anymore, replace with a neutral "Preparing your reviewer role…" hint that only shows in the brief moment before auto-selection completes. In practice `roleGateOk` will be true immediately.

4. **No backend, RLS, hook, or permission changes.** `useCollabReview` already accepts a `selectedRoleId`; we're just setting it programmatically instead of via a dropdown.

## Out of scope
- Permission logic, `review_step_permissions`, RLS, notifications, audit — unchanged.
- Track-changes markup, sidebar, seed content — unchanged.
- Other modules — unchanged.

## Verification
- Open a record where the signed-in user has 2+ configured review roles → "Post as" dropdown is gone, Add Comment is enabled immediately, submitted comment is stored with the auto-picked role.
- Open a record where user has exactly one role → behavior identical to before (already auto-used).
- Open a record where user has zero roles → existing "not configured to comment" empty state still shows.