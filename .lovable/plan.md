# Fix: Notification Templates page fails to open

## What I verified

- The page itself is healthy. Loaded `/admin/notification-templates` in a real browser against the running app: it renders, and every backend call it makes returns success (template list, event configs, event/channel templates, `notification_recipient_rule_types`, `notification_template_render_preview`, `notification_template_versions_for`).
- TypeScript compiles clean, and a full production build succeeds and does emit the page's chunk — as `NotificationTemplates-Cickf9ZH.js`.
- The browser in your session requested a **different, older** filename: `NotificationTemplates-o0acv5D4.js`, and that request failed ("Failed to fetch dynamically imported module"). A failed asset fetch on the hosted preview surfaces as "Internal Server Error".

Conclusion: this is a stale-deploy / stale-cache problem, not a bug in the page. Your browser is running an old `index.html` that points at asset filenames that no longer exist in the current build, so the lazily loaded Notification Templates chunk 404/500s and the route dies. Every lazily loaded admin route is exposed to the same failure mode, not just this one.

## Fix

1. **Republish the app** so the hosted `index.html` and the asset filenames it references come from the same build. That alone restores the page.
2. **Make the app self-heal from stale chunks** so this class of error stops being a dead end for any lazy route:
   - Add a small `lazyWithReload` helper that wraps `React.lazy` imports. On a chunk-load / dynamic-import failure it triggers exactly one automatic page reload (guarded by a `sessionStorage` flag so it can never loop), which fetches the fresh `index.html` and the current asset names.
   - Use it for the lazily loaded route components in the admin/settings route files so any route hit after a deploy recovers instead of showing a hard error.
   - Keep the existing route `ErrorBoundary` as the final fallback, but give its message a "Reload" action for the case where the single retry has already been used.

## Technical notes

- Helper location: `src/lib/lazyWithReload.tsx`; detection matches the known Vite messages (`Failed to fetch dynamically imported module`, `error loading dynamically imported module`, `Importing a module script failed`).
- Only the `React.lazy(...)` call sites in the route files change — no page logic, no data hooks, no backend changes.
- No migrations and no edge-function changes; nothing on the backend was implicated by the checks above.

## Out of scope

- No redesign of the Notification Templates screen or its RPCs.
- The unrelated `DialogContent` missing-description warning and the React `forwardRef` warnings already present in the console.
