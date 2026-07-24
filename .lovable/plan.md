## Goal
Fix header bell notification count across all panels and add a hover-preview tray with the 5 most recent notifications plus a "View all" link to `/notifications`.

## Current State (verified)
- `src/components/layout/Header.tsx` renders a plain `Button` around the bell that navigates to `/notifications` on click. No hover tray.
- Unread count comes from `useNotifications()` which filters `notifications` table by `user_id`, `channel='in_app'`, ordered desc, limit 100. Realtime INSERT/UPDATE/DELETE subscriptions already keep it in sync.
- Two notifications pages exist: `src/pages/Notifications.tsx` (static demo data) and `src/pages/notifications/NotificationCenter.tsx` (real data via `useNotifications`). Need to confirm which route `/notifications` maps to and make it the real one so the count matches the list.

## Changes

### 1. `src/components/layout/Header.tsx` — hover tray
- Wrap the bell button in a `HoverCard` (shadcn) so the tray opens on hover and stays open when moving into it. Keep the click behavior navigating to `/notifications` for keyboard/mobile users.
- Tray content:
  - Header row: "Notifications" + small unread badge.
  - List of most recent 5 items from `useNotifications().notifications` (already sorted desc). Each row: type icon, title (bold if unread), one-line message truncated, relative time. Clicking a row calls `markRead(id)` then navigates to `/notifications`.
  - Empty state when list is empty.
  - Footer: "View all" link → `/notifications` and a "Mark all read" button when `unreadCount > 0`.
- Preserve the existing red unread badge on the bell.

### 2. Route sanity for `/notifications`
- Inspect `src/routes/dashboardRoutes` to confirm `/notifications` points at `NotificationCenter` (real data). If it still points at the static `pages/Notifications.tsx`, switch it so the header count and the destination page use the same source. No behavior change beyond that.

### 3. No backend / hook changes
- Count logic already correct via `useNotifications`; realtime subscription handles updates. The reported "count not showing correctly" is expected to resolve once the header consistently reads from this hook (it already does) and the destination page uses the same hook rather than mocked data.

## Technical Notes
- Use existing shadcn `HoverCard` (`@/components/ui/hover-card`) — no new deps. Fall back to `openDelay=100`, `closeDelay=150`.
- Format time with `date-fns` `formatDistanceToNow` (already used elsewhere).
- Keep bell as the `HoverCardTrigger asChild` so the current click-to-navigate + badge markup is unchanged.
- Tray width ~ `w-80`, max-height with scroll for safety, `z-50`.

## Out of Scope
- Redesigning the full Notifications page.
- Email/SMS channel changes.
- Per-notification deep-link routing based on `entity_type` (can be a follow-up).