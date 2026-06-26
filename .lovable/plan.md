## Diagnosis

The error is a classic stale-chunk issue, not a code bug:

```
Failed to fetch dynamically imported module:
  /assets/Index-DWMKhdJK.js
```

The user's browser tab was loaded against the previous build. After my last edit to `ApplicantDashboard.tsx` / `useApplicantMetrics.ts`, Vite rebuilt and re-hashed the lazy chunks, so the old `Index-DWMKhdJK.js` filename no longer exists on the server. Every lazy route fails to mount and the ErrorBoundary shows "Internal server error / Something went wrong".

This is not an SSR/server outage — the dev server is up; only the cached tab is wedged.

## Plan

1. Ask the user to do a hard reload of the preview (Ctrl/Cmd-Shift-R, or click "Reload page" on the error screen). This pulls the new asset manifest and the lazy chunks resolve again.
2. If a hard reload alone doesn't recover the page, restart the Vite dev server in the sandbox to guarantee the manifest is fresh, then ask the user to reload once more.
3. No source-code changes are required for this symptom. If after the reload the user still sees a real runtime error (different message / stack), I'll diagnose that separately.

## Verification

- After reload, the preview should render `/dashboard` (or `/register`) normally with no ErrorBoundary screen.
- Console should no longer show `Failed to fetch dynamically imported module`.
