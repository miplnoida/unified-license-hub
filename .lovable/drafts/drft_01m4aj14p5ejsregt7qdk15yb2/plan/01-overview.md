# Security Remediation Plan (from the 2026-10-09 audit)

Fixes the 26 findings in the audit (4 Critical, 7 High, 8 Medium, 6 Low, 1 Info) in six waves. Each wave is approved separately, staged as files first, and only applied after its checks pass. Nothing in a wave reaches the shared backend until you accept it.

## Ground rules
- Database changes are staged as additive migration files in this draft; they apply only when the draft is accepted.
- Successful paths are proven with TEST users through the normal browser journey; API calls only for read-only or negative ("must be refused") checks.
- No real emails/SMS, no destructive certification functions, no AML/FSRA policy or protected-assessment changes.
- No finding is marked Fixed without evidence; unprovable items stay "Blocked" or "Unverified".
- Every wave ships a rollback that never re-opens the closed hole.

## Waves

**Wave 0 — Critical containment (blocked on staging)**
- SEC-003/004: apply the already-prepared Wave A0 lockdown of the 57 certification functions — needs an isolated staging project and backup confirmation first (SEC-024).
- SEC-025: background job server functions (process-notification-outbox, sla-escalation-sweep, risk-score-recompute, evaluate-prudential-early-warnings, notification-digest, notification-digest-run, process-queue, complaint-storage-cleanup, conduct-supervision-loop-digest) refuse callers that are not the service role or a shared worker secret.
- SEC-002: worker-token minting restricted to the service role.
- SEC-001: users can no longer change access-defining profile fields (entity link, role, status, forced-password flag); only admin functions can.

**Wave 1 — Sign-in, roles, table access**
- SEC-010: revoke TRUNCATE from signed-out/signed-in on all tables; revoke INSERT/UPDATE/DELETE privileges from signed-out except allow-listed public intake tables.
- SEC-011: permission helper functions only answer about the caller (or super admin).
- SEC-013: read and harden sign-in settings (leaked-password check, OTP expiry).
- SEC-009: add sign-in guard on the two unguarded entity pages.
- SEC-022: designate one authoritative role store; others become read-only mirrors.

**Wave 2 — Server functions and direct writes**
- SEC-008: add `has_permission` checks to privileged business functions missing them.
- SEC-016: move sensitive browser writes (applications, returns, payments, licences) behind checked server functions.
- CORS: restrict `*` origins on user-facing functions to the app's domains.

**Wave 3 — Audit and monitoring**
- SEC-005: audit actor always taken from the signed-in user, never the caller.
- SEC-023: triggers audit sensitive tables regardless of write path; log refused access attempts.
- SEC-018: remove personal data from browser console logs.

**Wave 4 — Notifications, files, input**
- SEC-006/007: notifications only to recipients the caller is entitled to address; pipeline functions worker-only.
- SEC-014: registration uploads bound to the registration's own folder; confirm public buckets only allow admin uploads.
- SEC-019: confirm sanitiser on the 3 raw-HTML sites.

**Wave 5 — Readiness**
- SEC-012: dependency audit and upgrades. SEC-020: security headers. SEC-024: separate production backend. SEC-026: document deny-all secret table with a test.
- Fresh security scan (0 critical), full app and browser regression, then publish only if all gates pass.
