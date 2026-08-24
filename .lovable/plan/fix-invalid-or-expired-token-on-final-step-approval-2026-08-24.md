# Fix "Invalid or expired token" on final-step approval

## What is actually happening

The approval itself is not being rejected by any business rule — the request never
reaches the approval logic. It is rejected by a redundant second identity check.

Confirmed from the backend logs:

- `perform-workflow-action` returned **401** at 12:58:04 and 13:01:52 UTC today.
- At those exact same seconds, the auth service logged `GET /user → 403 "Session not found"`.
- The same pattern also produced 401s on `evaluate-application-sufficiency`.

So the sequence is:

```text
Browser → perform-workflow-action
  1. requireUserPermission(...)  → verifies the JWT signature + permission  → PASSES
  2. userClient.auth.getUser()   → extra round-trip to the auth server      → 403 session_not_found
  3. function returns 401 "Invalid or expired token"
```

Step 2 is the problem. The token is cryptographically valid and the user is
authorised, but the auth server no longer recognises the *session row* behind it
(the session was rotated or a sign-out happened on another tab/device — the auth
log for this account shows a logout followed by fresh logins). Any refresh-token
rotation while the approval screen is open reproduces it, which is why it looks
random and only bites on the long-lived final-approval screen.

## The fix

Stop making the second identity round-trip. The gate already established the
caller's identity from the verified token, so the functions should use that
identity instead of asking the auth server again.

In each affected function:

- Take the caller id from the gate result (`__authzGate.userId`) instead of
  `userClient.auth.getUser()`.
- Delete the `if (authErr || !caller) return 401 "Invalid or expired token"` block.
- Keep the "missing Authorization header" 401 — that is a genuine unauthenticated case.
- Keep every downstream permission, step, and state check untouched.

Functions on the final-approval path (fixed first, in this order):

1. `perform-workflow-action` (application final approval, calls the final-approval RPC)
2. `approve-pre-licensee` (licensee web-user provisioning, invoked right after)
3. `perform-registration-workflow-action` (pre-licensee registration workflow steps)
4. `evaluate-application-sufficiency` (the sufficiency gate on the same screen)

Then the same one-line pattern is applied to the remaining functions that carry
the identical redundant check, so the class of bug is closed rather than one
instance: `add-application-remark`, `perform-return-workflow-action`,
`perform-license-action`, `resubmit-return`, `verify-and-submit`,
`sign-license-certificate`, `send-correspondence`, `document-extract`,
`bulk-intake`, `generate-application-ai-assessment`, `generate-return-analysis`,
`evaluate-return-prudential`, `notification-retry`, `notification-status`.

Note on `approve-pre-licensee`: it also resolves a legacy static role via
`get_user_role` and hard-codes four role names. That check stays as is in this
change, since the governed `registration_management.approve` gate already ran
ahead of it and widening it is a separate authorisation decision.

## Client-side resilience (small, complementary)

Before invoking the approval, the client will refresh the session
(`supabase.auth.getSession()`) so a stale in-memory token is not what gets sent,
and a genuine 401 will surface as "Your session expired — please sign in again
and retry" rather than a raw token error.

## Verification

- Re-run the final approval on the blocked pre-licensee application and confirm
  it completes (approval committed, licensee provisioned).
- Re-check the edge logs for `perform-workflow-action`: no new 401s.
- Run the existing Deno authz tests for the touched functions — the
  no-bearer 401 and no-permission 403 behaviour must stay green.
- Run `node scripts/verify-edge-authz.mjs` so every touched function keeps its
  authorization marker.
