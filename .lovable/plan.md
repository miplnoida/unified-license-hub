## Problem

On `/payments`, an applicant sees the page load forever — the table skeleton never resolves. Root cause is in `src/pages/payments/PaymentHistory.tsx → loadAll()`:

1. For non-admin users the code calls `loadVisibleApplications({ licenseeId: resolvedLicenseeId })`, which invokes the RPC `get_application_list_page`. That RPC is gated for internal / licensee-scoped callers and **throws** for a bare applicant (no licensee, no dynamic role).
2. `loadAll()` has no `try/catch`, so the thrown error skips `setLoading(false)` — the table stays in the spinner state indefinitely (matches the "keeps loading" symptom).
3. Even if the RPC returned empty, the current filter (`visibleAppIds.has(payment.application_id)`) would then hide the applicant's own linked payments, because their applications are not in that visible set.

Nothing else on the page is broken — receipts/refunds fetches succeed, the RLS on `payments` already scopes rows for external users.

## Fix (scoped, presentation layer only)

Edit only `src/pages/payments/PaymentHistory.tsx`:

1. **Skip the RPC for pure external applicants.** Compute a `needsVisibleAppLookup` flag = `isAdmin || !!resolvedLicenseeId`. Only call `loadVisibleApplications` when true. Otherwise the applicant sees payments filtered strictly by `payment.user_id === user.id` (which is what RLS already returns anyway).
2. **Fail-safe the load.** Wrap the whole body of `loadAll` in `try / catch / finally`, toast the error, and always call `setLoading(false)` in `finally`. This eliminates the "spinner forever" class of bug for any future RPC/RLS regression.
3. **Applicant fallback for enrichment.** When there's no visible-app lookup, still enrich linked applications by querying `applications` directly with `.in('id', appIds)` (RLS already restricts to their own rows) so the Applicant / Sector columns render.

No RLS, RPC, backend, or other-page changes. Complaints and other public pages remain untouched.

## Verification

- Reload `/payments` as an applicant → spinner resolves, table renders with the applicant's own payments (or a real "No payments found" state).
- Reload `/payments` as admin / licensee primary → behaviour unchanged (RPC path still runs, all payments visible with enrichment).
- Simulated RPC failure → toast surfaces, spinner clears (no more stuck loading state).