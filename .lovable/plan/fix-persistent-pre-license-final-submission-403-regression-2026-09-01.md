# Fix persistent pre-license final-submission 403 regression

## Confirmed cause

The live `verify-and-submit` requests are reaching the function successfully, but the latest attempts return HTTP 403.

The recently restored gate calls `requireUserPermission(req, "licensing", "submit")` before the application is loaded. The owner of the current in-progress application does not hold that internal RBAC permission, so the request stops there. This conflicts with the endpoint’s existing record-level authority contract: `can_submit_application(application_id)` allows the application creator, or an approved entity member with the submit capability, and is rechecked by the governed submission transaction.

The request payload and CORS preflight are valid; the former undefined-gate error is no longer present.

## Targeted fix

1. In `verify-and-submit`, replace the global `licensing.submit` permission gate with authenticated-user validation only.
2. Preserve the existing `can_submit_application(application_id)` check and the governed submission RPC as the authoritative record-level controls. Do not weaken ownership, entity capability, status, payment, form-completion, duplicate, workflow, audit, or notification rules.
3. Update the edge-function permission map to classify this endpoint as authenticated with record-level application authorization, matching its actual contract.
4. Replace the misleading gate-only test with focused regression coverage proving:
   - missing or malformed bearer tokens receive 401;
   - an authenticated application owner can reach the record-level submission checks without needing internal staff RBAC;
   - a different authenticated user is denied by `can_submit_application`;
   - the authorization gate cannot be placed inside the OPTIONS block.
5. Keep all other edge functions and workflows unchanged.

## Verification

- Run the edge authorization structural guard and focused `verify-and-submit` tests.
- Deploy only `verify-and-submit`.
- Confirm OPTIONS remains successful and unauthenticated POST returns clean JSON 401.
- Exercise final submission with a safe authenticated pre-license applicant fixture and verify the full persisted transaction: submitted status/timestamp, acknowledgement metadata when supplied, payment/form gates retained, and exactly one active workflow instance.
- Confirm an unrelated authenticated identity cannot submit that application.
- Run the relevant frontend tests, TypeScript check, and production build.
