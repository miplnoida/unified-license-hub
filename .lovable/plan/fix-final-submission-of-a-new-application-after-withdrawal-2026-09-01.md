# Fix final submission of a new application after withdrawal

## Confirmed diagnosis

- Application `83ffc118-f7d9-4644-be26-d7db2b0b689e` is the withdrawn record `APP-2026-001929`, with a completed payment and its saved wizard step still set to `payment`.
- The final submission attempt reached `verify-and-submit` at 09:23 UTC and returned HTTP 400.
- The function rejects the record because its status is `withdrawn`; the generic client SDK message hides that useful reason.
- The existing load-time closed-draft guard does not protect a wizard session that was already open when the application became closed or otherwise retained stale state.

## Implementation

1. **Revalidate immediately before final submission**
   - In `NewApplication.tsx`, fetch the current application status before invoking final submission.
   - If it is no longer editable, do not invoke the function, detach the withdrawn ID from wizard state, clear `draft`, `step`, and `mode` from the URL, return the user to the new-application selection step, and show the existing closed-request guidance.
   - Preserve all payment, form, and submission behavior for genuinely editable applications.

2. **Return a structured business error from the function**
   - Change only the closed-status branch in `verify-and-submit` to return the established `APPLICATION_NOT_EDITABLE` code in a parseable response without triggering the SDK’s generic non-2xx error wrapper.
   - Keep the backend status check authoritative so direct calls still cannot submit withdrawn or otherwise closed records.

3. **Improve final-submit error extraction**
   - Ensure the final-submit handler displays the backend’s structured message/code when available instead of “Edge Function returned a non-2xx status code.”
   - Reuse `friendlyApplicationError`; do not alter other workflow messages.

4. **Focused regression coverage and deployment verification**
   - Extend the closed-draft regression test to cover a stale payment-page session and verify that a withdrawn ID is never sent to `verify-and-submit`.
   - Add/extend the function test for the closed-status response contract.
   - Run focused tests, TypeScript validation, and the build; deploy only `verify-and-submit`, then verify preflight/auth behavior and the structured closed-record response.

## Scope

No changes to payment rules, application lifecycle rules, re-application policy, forms, workflow routing, or unrelated functions. The withdrawn record remains closed; the user is routed into a genuinely new application.
