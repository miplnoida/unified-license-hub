## Wave A0: stage files only (SEC-003, SEC-004)

No database operation of any kind. Files are written, and only static tests and tests that never touch the database are run.

### Files to create (all new; no existing file modified)
1. `.lovable/drafts/drft_01m4aj14p5ejsregt7qdk15yb2/migrations/<ts>_sec_a0_cert_function_lockdown.sql`. This is staged, not applied, and must not be accepted until you approve. It contains:
   - private tables `sec_a0_grant_snapshot` (before/after effective access inventory) and `sec_a0_destructive_arming` (empty, no expiry by default). Both are created only if this file is applied later. For both:
     - RLS is on with no policies
     - all access is revoked from PUBLIC, anon and authenticated
     - only service_role can SELECT
     - a trigger blocks UPDATE and DELETE on the snapshot
   - a loop over catalog signatures of `cert_*` / `rc1_*` only, including overloads. It revokes EXECUTE from PUBLIC, anon, authenticated and app_certification_runner, and grants service_role.
   - a first-line guard added to the destructive functions:
     - `cert_reset_force_delete`
     - `cert_reset_nonproduction_business_data_v1`
     - `cert_seed_*`
     - `cert_v2_put_metric`

     The guard requires service_role or the owner, `assert_nonproduction()`, and an unexpired arming row for the current project. The rest of each function body is unchanged; the original definitions are captured at apply time.
   - default privileges are not changed, because that would affect unrelated functions
   - a final self-check: if any cert/rc1 function is still runnable by PUBLIC, anon or authenticated, the migration aborts
2. `docs/security/wave-a0/rollback.sql`. This restores service_role and owner access only. It keeps the arming guard and never grants to PUBLIC, anon or authenticated.
3. `supabase/tests/security/a0_cert_lockdown.sql`. A pgTAP test, written for later, for staging only.
4. `src/test/secA0CertLockdown.test.ts`. A Vitest test that reads files only. It checks that:
   - the staged SQL revokes from PUBLIC, anon and authenticated
   - the rollback contains no grant to those roles
   - the arming guard is kept in both files
   - no default-privilege change is present
5. `docs/security/WAVE-A0-REPORT.md` covers:
   - the function list from the earlier read-only catalog query
   - access rights before (57/57 runnable by authenticated) and expected after (0/57)
   - the after-checks to run in staging
   - blockers: no staging, backup unverified
   - status for SEC-003 and SEC-004: **Ready for Deployment — Blocked**, not Fixed
6. `docs/security/SEC-024-production-isolation-plan.md`. A plan only.
7. `roadmap.md`. A new file listing Wave A0 open items and their blockers.

### Validation
Run only the new Vitest file, which does not connect to the database, plus a static SQL syntax check. The report confirms that zero database operations were executed. Work stops after this; no Wave A1.
