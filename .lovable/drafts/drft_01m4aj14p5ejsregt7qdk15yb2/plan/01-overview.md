## Wave A0 independent review: verdict FAIL (not deployable as staged)

This was a read-only review. It used catalog reads and file inspection only. No SQL was written to the database, nothing was applied, and nothing was deployed.

Shorthand: M = `.lovable/drafts/drft_01m4aj14p5ejsregt7qdk15yb2/migrations/20261009110000_sec_a0_cert_function_lockdown.sql`; R = `docs/security/wave-a0/rollback.sql`; T = `supabase/tests/security/a0_cert_lockdown.sql`; V = `src/test/secA0CertLockdown.test.ts`.

### Findings
| # | Sev | Where | Finding (V = verified fact, A = assumption) | Required correction |
|---|---|---|---|---|
| 1 | **High** | M 82–83 | V: The guard only covers `cert_reset_force_delete`, `cert_reset_nonproduction_business_data_v1`, `cert_v2_put_metric` and `cert_seed_*`. These destructive functions are left unguarded: `cert_v2_reset`, `cert_v2_cascade_delete`, `cert_v2_seed_*` (6), `cert_reset_detach_optional_links`, `cert_v2_seed_calculate`. They are blocked only by the revoke, so service_role or the owner can still run them on the shared backend. | Guard every reset, purge, delete, seed, wipe and put function, using an explicit list checked against the catalog. Abort the migration if any listed name is missing. |
| 2 | **High** | M 14–16, 34 | V: The `postgres` default rules give tables `arwd` to `app_certification_runner` and `arwdDxtm` to service_role. The revokes leave `app_certification_runner` able to INSERT into the arming table, and leave service_role able to INSERT and TRUNCATE the snapshot. | Revoke ALL from `app_certification_runner` and service_role on both tables, then grant SELECT only on the snapshot to service_role. Also revoke the bigserial sequences from anon, authenticated and the runner. |
| 3 | Medium | M 20–24 | V: The append-only trigger does not block TRUNCATE. | Add a `BEFORE TRUNCATE` statement trigger. |
| 4 | Medium | M 39–56 | V: `sec_a0_require_armed` inherits default EXECUTE for `app_certification_runner` and is not revoked from it. A: harmless today, because the destructive bodies run as the owner. | Revoke from `app_certification_runner`. |
| 5 | Medium | M 48 | V: The arming check matches on `current_setting('app.project_ref')`, which is never set, so arming can never succeed in any environment. This is safe on shared (permanently disarmed) but also blocks legitimate staging certification. | Compare against a value an owner-only config stores, and document how to arm in staging only. |
| 6 | Medium | M 42 | V: The caller check allows `auth.role()='service_role'` or `session_user` postgres/supabase_admin. Because `authenticator` is the session user under the API, authenticated users cannot pass. A: the check is not bypassable once EXECUTE is revoked, but it trusts the JWT role claim. | Acceptable. Add `current_user` owner verification as defense in depth. |
| 7 | Medium | M 88–89 | V: Injection relies on regex for the first uppercase `BEGIN` after `$function$`. If no match is found, it aborts safely. A: lowercase `begin`, or a `BEGIN` inside a DECLARE default, could misplace the guard or cause an abort. | After injecting, assert that `pg_get_functiondef` contains the guard immediately after the main BEGIN, or hand-write each guarded definition. |
| 8 | Low | M 61–103 | V: Coverage is catalog-driven, so overloads are included, but the migration never asserts the 57-function count. | Assert the before-snapshot covers 57 signatures, or fail with the actual list. |
| 9 | Low | M 99–103 | V: The self-check covers anon and authenticated only; PUBLIC is caught indirectly; the runner is not checked. | Also check `app_certification_runner` and an explicit PUBLIC ACL. |
| 10 | Medium | R 12–15 | V: The rollback re-grants to `app_certification_runner` unconditionally, which contradicts its own comment. | Remove that grant, or put it behind an explicit opt-in variable. |
| 11 | Low | R | V: Never grants to PUBLIC, anon or authenticated, and keeps the guard. | None. |
| 12 | Medium | V 5 | V: The test hardcodes the draft migration path, so it will break after the draft is accepted. | Look the file up in both the draft folder and `supabase/migrations`. |
| 13 | Low | V | V: Regex tests confirm the text is present but do not prove behavior. | Accept as static only; behavior is proven by T in staging. |
| 14 | Medium | T | V: Does not check the table ACLs, the runner, that the arming table is empty, or the 57 count. It also inherits finding 1, because it tests only the partial destructive list. | Add these assertions. |
| 15 | Info | Callers | V: `cert-v2-user-fixtures` calls only `cert_v2_guard_ok`, `role_catalogue`, `auth_purge_precheck` and `auth_identity_classification` with the service-role key, so it is preserved. No policy references cert functions. `supervisory_detect_run` (SECURITY DEFINER) calls `cert_v2_guard_ok` as owner. A: the owner is postgres, so it is unaffected. | Confirm the owner in staging. |
| 16 | Info | Atomicity | A: The Lovable migration runner applies each file in one transaction, so any RAISE rolls everything back. This is not verified. | Verify in staging: inject a failure and confirm nothing persists. |
| 17 | Info | Report | V: The report's "no existing file modified" is accurate. It understates finding 1. | Update after the corrections. |

### Assessment
- **FAIL.** Findings 1 and 2 leave destructive capability and arming-table write paths open.
- UNVERIFIED: atomic apply, the supervisory function owner, and staged behavior.

### Next step if approved (files only, still no database)
- Fix findings 1–14 in M, R, T and V.
- Re-run the static Vitest.
- Update `WAVE-A0-REPORT.md`.

### Conditions before any deployment
1. All High and Medium items are corrected.
2. Staging exists and T passes there.
3. The atomic-failure test passes.
4. Backups are confirmed.
5. Browser regression passes.
6. You give explicit approval.

No Wave A1.
