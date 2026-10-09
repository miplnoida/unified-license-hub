# Wave A0 — SEC-003 / SEC-004 (Stage Files Only)

**Status: SEC-003 and SEC-004 — Ready for Deployment — Blocked (not Fixed).**
Blockers: no isolated staging database; backup/restore readiness not verified.

## Database operations executed
None in this wave. The before-state below comes from read-only catalog queries run during Phase 0 (`has_function_privilege`, `pg_proc`, `pg_default_acl`, `pg_auth_members`).

## Before state (read-only evidence, 2026-10-09)
- 57 `public.cert_*` / `public.rc1_*` functions, all owned by `postgres`. **57/57 runnable by `authenticated`**, 0/57 by `anon`.
- `cert_reset_force_delete(text[])`: SECURITY DEFINER, disables user triggers and deletes every row of the named tables; no caller or environment check.
- `cert_reset_nonproduction_business_data_v1`, `cert_seed_returns_v1` and `cert_v2_put_metric`: no caller guard found in the body.
- `app_environment_config.environment = non_production`, yet this backend serves the published site.
- Default privileges for `postgres` in `public` grant EXECUTE on new functions to authenticated, service_role and app_certification_runner. These are deliberately left unchanged, because changing them would affect every future application function.
- `authenticator` is a member of anon, authenticated and service_role. No other role inherits from authenticated.

## Expected after state (to verify in staging)
- 0 cert/rc1 functions runnable by anon or authenticated.
- All cert/rc1 functions runnable by service_role.
- Destructive functions call `sec_a0_require_armed()`. Each call must pass all three checks:
  - the caller is service_role or the owner
  - `assert_nonproduction()` passes
  - an unexpired arming row matches `app.project_ref`
- The arming table ships empty, and `app.project_ref` is not set on the shared backend, so the functions are **permanently disarmed** there (fail closed).
- The migration aborts itself if any anon/authenticated grant remains.

## Files created
| File | Purpose |
|---|---|
| `.lovable/drafts/drft_01m4aj14p5ejsregt7qdk15yb2/migrations/20261009110000_sec_a0_cert_function_lockdown.sql` | Staged migration (not applied; applies only if this draft is accepted, so do not accept until approved) |
| `docs/security/wave-a0/rollback.sql` | Rollback: privileged grants only, keeps the arming guard |
| `supabase/tests/security/a0_cert_lockdown.sql` | pgTAP catalog checks, for staging |
| `src/test/secA0CertLockdown.test.ts` | Static Vitest test of the SQL files (no DB) |
| `docs/security/WAVE-A0-REPORT.md` | This report |
| `docs/security/SEC-024-production-isolation-plan.md` | Isolation plan |
| `roadmap.md` | Open items |

No existing file was modified.

## Callers that must keep working
- Edge Function `cert-v2-user-fixtures` uses the service-role key, so it is unaffected. Note that it calls `cert_v2_guard_ok` and other non-destructive helpers.
- `scripts/cert-v2/*` and `scripts/rc1/db/*` run as the database owner, so they are unaffected. Destructive ones will require an explicit arming record.
- App runtime: there are no browser calls to cert/rc1 functions; they are referenced only in generated types.

## Staging steps (later, after approval)
1. Apply the migration to staging.
2. Run `a0_cert_lockdown.sql`.
3. Compare the before and after rows in `sec_a0_grant_snapshot`.
4. As a TEST user, call `cert_v2_guard_ok`. Expect a denial.
5. Run the Vitest suite and browser smoke tests: login, registration, dynamic form, approval, payment, return, complaint, notifications, audit.
6. Confirm a backup, then apply to the shared backend.

## Test results
See the final run below. Only static tests were run.

## Remaining risks / next wave
- Until the migration is applied, SEC-003/004 remain exploitable by any signed-in user.
- Next is Wave A1 (SEC-001, SEC-002, SEC-010), which needs separate approval.
