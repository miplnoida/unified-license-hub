## Problem

Two independent instances of `useNotifications` run at once — one in `Header.tsx`, one in `NotificationCenter.tsx` (the `/notifications` page). Each keeps its own `notifications` state array. When you click an unread item in the header tray, only the header's copy updates locally; the page's copy only refreshes if a Postgres realtime UPDATE event arrives, which is not a reliable sync path. So the page's unread count stays stale.

## Fix

**1. Single shared notification state**
- Create `src/contexts/NotificationsContext.tsx` that holds the existing logic currently in `useNotifications` (load, realtime subscription, `markRead`, `markAllRead`, `unreadCount`) exactly as-is, exposed via a provider.
- Mount the provider once, high in the tree (in `App.tsx`, inside the auth provider so `user` is available).
- Change `src/hooks/useNotifications.ts` into a thin consumer of that context so every existing call site (`Header`, `NotificationCenter`, any other) keeps working unchanged and shares one state object. Marking read anywhere instantly updates the header badge, the tray and the page counts.

**2. Remove the tray scroller**
- In `Header.tsx`, drop `max-h-80 overflow-y-auto` from the tray list container. The tray already slices to the 5 most recent items, so they render in full with no scrollbar.

## Notes

- No backend/schema/RLS changes; `markRead`/`markAllRead` keep writing to the same table the same way.
- No change to the bell click behaviour, badge styling, or the "View all notifications" link.
