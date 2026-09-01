# Fix "Submission failed: Edge Function returned a non-2xx status code" on final submission

## Why it broke now

The final-submission function `verify-and-submit` has its permission gate written **inside** the CORS preflight block, after that block's `return`:

```text
if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });   <-- always returns here

    const __authzGate = await requireUserPermission(req, "licensing", "submit");   <-- unreachable
    if (!__authzGate.ok) return __authzGate.response;
}
```

Two consequences, both confirmed by reading the file:

1. The gate never runs, so `__authzGate` is never defined — but the main body still uses it (`__authzGate.userId`, `__authzGate.email`). That throws a reference error on **every** real POST, which the outer `catch` converts into an HTTP 500. The client sees exactly "Edge Function returned a non-2xx status code".
2. Because the gate is unreachable, the function also lost its `licensing.submit` authorization check.

This is a regression introduced when the centralized authorization markers were inserted — the marker landed one brace too deep. It worked earlier because previously the identity came from a call that actually executed.

The same misplacement exists in six more functions, so the fix is applied as a class, not a one-off:
`list-web-users`, `manage-web-user`, `toggle-user-status`, `test-smtp-email`, `process-queue`, `rfi-near-due-sweep`.

## The fix

For each of the seven functions:

- Move the gate (`requireUserPermission` / `requireWorkerInvocation`) out of the `OPTIONS` block so it runs immediately **after** the preflight early-return, matching the correct pattern already used by `audit-export`, `evaluate-application-sufficiency`, `test-resend-email`, etc.
- Keep the preflight response, the gate's module/action pair, and every downstream check byte-for-byte identical. No business logic, workflow, notification or permission-value changes.

Order of work: `verify-and-submit` first (the reported break), then the other six.

## Verification

- Deno authz tests for the touched functions (`verify-and-submit/authz_test.ts` and siblings): no-bearer → 401, no-permission → 403 must stay green.
- `node scripts/verify-edge-authz.mjs` — every function keeps its authorization marker.
- Direct call to `verify-and-submit` without a bearer token: expect a clean JSON 401, not a 500.
- Re-run the pre-licensee final submission end to end and confirm the application moves to submitted with the workflow attached.
- Typecheck + build.
