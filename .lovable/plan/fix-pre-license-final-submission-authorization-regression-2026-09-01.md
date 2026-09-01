# Fix pre-license final-submission authorization regression

## Confirmed root cause

`verify-and-submit` has its `requireUserPermission(req, "licensing", "submit")` gate inside the CORS preflight block, after its unconditional return:

```text
if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });   <-- always returns here

    const __authzGate = await requireUserPermission(req, "licensing", "submit");   <-- unreachable
    if (!__authzGate.ok) return __authzGate.response;
}
```

Consequences confirmed from the current source:

1. The gate never runs, so `__authzGate` is never defined — but the main body still uses it (`__authzGate.userId`, `__authzGate.email`). That throws a reference error on **every** real POST, which the outer `catch` converts into an HTTP 500. The client sees exactly "Edge Function returned a non-2xx status code".
2. Because the gate is unreachable, normal requests also fail to enforce the intended `licensing.submit` permission at that location.

A structural scan of every `supabase/functions/*/index.ts` confirmed exactly seven malformed occurrences. In addition to `verify-and-submit`, they are `list-web-users`, `manage-web-user`, `toggle-user-status`, `test-smtp-email`, `process-queue`, and `rfi-near-due-sweep`. No correctly placed gate will be changed.

## Implementation

Fix `verify-and-submit` first, then the six directly related occurrences:

- Move only the existing gate out of the `OPTIONS` block so it executes immediately after the preflight early-return and before protected logic.
- Preserve the exact gates: `verify-and-submit` → `licensing.submit`; `list-web-users` → `user_management.view`; `manage-web-user` and `toggle-user-status` → `user_management.edit`; `test-smtp-email` → `notification_management.test_send`; `process-queue` and `rfi-near-due-sweep` → worker invocation.
- Preserve CORS responses and all application validation, capability/membership checks, duplicate/re-application rules, payment, workflow, audit, notification, and frontend behavior.
- Add or tighten a focused structural regression check so an authorization helper nested after an OPTIONS return cannot silently pass marker-only coverage again.

No database schema or RLS changes are planned.

## Verification and production proof

- Run relevant Edge Function authorization tests, including OPTIONS without authentication, no bearer → JSON 401, valid identity without `licensing.submit` → 403, and authorized identity reaching submission logic.
- Run the repository-wide structural scan again and `node scripts/verify-edge-authz.mjs`.
- Run project typecheck and build, then deploy the corrected affected functions.
- Execute a pre-license application final submission end to end with an authorized applicant.
- Verify persisted results, not only the UI message: submitted status, submission timestamp/metadata, configured workflow attachment, active first workflow step, exactly one workflow instance, preserved audit trail, and applicant-visible success state.
- Report the exact files changed, retained gate for every function, all command/test results, and confirm that no unrelated business logic changed.
