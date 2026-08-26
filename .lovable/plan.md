# MC-01 Runtime Certification Blocker

## Goal
Trace the real public complaint submission failure, apply the smallest secure backend correction, and certify the existing seven-step wizard without changing its UX or starting MC-02.

## Execution
1. **Capture internal diagnostics**
   - Add structured server-only logging to the `public-complaint-intake` RPC error branch.
   - Log only database diagnostics and non-sensitive counts/flags; retain the generic `submission_failed` public response.
   - Deploy the function and reproduce the browser-shaped request.

2. **Reproduce and isolate the live failure**
   - Build a non-sensitive fixture matching the edge function’s normalized payload exactly.
   - Exercise `public_complaint_intake_submit`, then isolate `complaint_intake_decide`, `create_complaint`, structured persistence, and attachment finalization one layer at a time.
   - Capture SQLSTATE, message, detail, hint, and nested context internally to identify the exact failing statement.

3. **Verify live schema and security contracts**
   - Compare every structured persistence field against live columns, constraints, foreign keys, triggers, and enum/check values.
   - Verify regulator routing uses the current operating-structure relationship with configured fallback and no hard-coded authority.
   - Verify tracking hash generation, uniqueness, TTL, one-time plaintext return, grants, RLS, hardened search paths, workflow, audit, and notification outbox behavior.

4. **Apply one minimal migration**
   - Replace only the faulty function/helper through a new migration.
   - Preserve atomicity, `SECURITY DEFINER` hardening, grants/revokes, and RLS.
   - Record root cause, exact failing statement, why prior tests missed it, and the correction.

5. **Add regression coverage**
   - Add a pgTAP/SQL test using the real structured payload shape.
   - Prove first-call creation and all required child records, workflow/audit/outbox/tracking state, then idempotent replay with no duplicate.
   - Cover no attachment, valid attachment finalization, and invalid/partial attachment handling without orphan evidence.

6. **Runtime certification**
   - Run the existing 34 wizard tests, complaint/MC-01 backend suites, typecheck/build checks, and the new regression.
   - Submit through `/complaints/file`, verify reference/access code/timestamp and success page, public redacted tracking, invalid-code non-disclosure, and authorized staff visibility of the complete record.
   - Update the MC-01 certification document and current-state document only after all runtime checks pass.

## Scope Guardrails
- No wizard UX changes.
- No MC-02 work.
- No weakening of authentication, grants, RLS, or error handling.
- No PII or SQL/Postgres diagnostics exposed to public callers or stored in fixtures/log documentation.
