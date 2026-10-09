## Blockers you need to resolve
- **Isolated staging backend** (SEC-024): required before Wave 0 certification-function changes; strongly recommended for every wave.
- **Backup confirmation** before applying any wave.
- Worker secret for SEC-025 will be requested as a secure secret when Wave 0 starts.

## Verification per wave
- pgTAP suites per finding (e.g. `supabase/tests/security/a0_cert_lockdown.sql`, new `wave1_table_privileges.sql`, `wave3_audit_actor.sql`).
- Negative checks: signed-out and ordinary user calls return 401 / 42501.
- Browser journeys for affected roles (applicant, licensee primary/secondary, officer, supervisor, admin).
- Vitest + Playwright regression; tracker and audit workbook updated (new versions, not overwritten).

## Technical notes
- Worker functions: constant-time compare of `Authorization` against service role or `WORKER_SHARED_SECRET`, fail closed.
- Profile lockdown: column-level `REVOKE UPDATE` on access columns + BEFORE UPDATE trigger rejecting changes unless super admin / admin RPC.
- TRUNCATE revoke is safe for the app (the client cannot issue TRUNCATE); default privileges for future tables adjusted for `postgres` in `public` only after inventory diff.
- Audit/notification functions ignore actor arguments and use `auth.uid()`; old signatures kept as wrappers for compatibility.
- Rollbacks restore functionality only, never broad grants.

## Effort (approx.)
Wave 0: 4–5 days (after staging) · Wave 1: 6 · Wave 2: 10 · Wave 3: 5 · Wave 4: 5 · Wave 5: 5 — roughly 35–40 person-days.
