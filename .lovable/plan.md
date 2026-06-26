# Fix: /admin/registration-forms "Something went wrong"

## Root cause
Console shows:
`TypeError: Failed to fetch dynamically imported module: .../assets/RegistrationFormBuilder-De9aml2i.js`

This is a stale-chunk error. The deployed `index.html` bundle was built against an older build of `RegistrationFormBuilder`, whose hashed JS file no longer exists on the CDN after a rebuild/redeploy. Any user with an open tab (or cached HTML) hits this when navigating to a lazy-loaded route. The `ErrorBoundary` catches it and renders the generic fallback — that is what the user sees on `/admin/registration-forms`.

The page itself isn't broken; only the chunk fetch is.

## Fix (frontend-only, no behavior change)

1. **Add `src/lib/lazyWithRetry.ts`** — a wrapper around `React.lazy` that:
   - Retries the dynamic import once after a short delay.
   - If it still fails with a chunk-load / dynamic-import error AND we haven't already reloaded this session, sets a `sessionStorage` flag and triggers `window.location.reload()` so the browser fetches the fresh `index.html` and its new chunk hashes.
   - If the reload flag is already set (we just reloaded and still failing), rethrows so `ErrorBoundary` shows the existing fallback instead of infinite reloading.

2. **Use it in `src/routes/adminRoutes.tsx`** for the lazy routes — at minimum `RegistrationFormBuilder`, and ideally swap all `lazy(...)` calls in that file to `lazyWithRetry(...)` since the same failure mode applies to every admin lazy route.
   - Pure import swap, identical signature, no route or component changes.

3. **Optionally extend to the other route files** (`dashboardRoutes.tsx`, `publicRoutes.tsx`, `settingsRoutes.tsx`, `returnsRoutes.tsx`) — same one-line swap. Recommended for consistency; will confirm scope with the user before doing it.

## Out of scope
- No changes to RegistrationFormBuilder, registration submit flow, signature upload, OTP, or anything else from earlier tasks.
- No backend / RLS / edge function changes.

## Acceptance
- Visiting `/admin/registration-forms` after a redeploy no longer shows "Something went wrong"; the page reloads once and renders normally.
- If the chunk genuinely cannot load (offline, real 404 after reload), the existing ErrorBoundary fallback shows — no reload loop.
- All other lazy routes behave the same as before.
