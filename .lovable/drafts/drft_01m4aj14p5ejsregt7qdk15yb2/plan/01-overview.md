## Wave A0: lock down the test reset/seed functions (SEC-003, SEC-004)

### What was found (read-only)
- The 57 `cert_*` / `rc1_*` functions and `cert_reset_force_delete` are all owned by `postgres`.
- All 57 can be run by any signed-in user (`authenticated`). Signed-out users (`anon`) cannot run them.
- The only in-app caller is the `cert-v2-user-fixtures` Edge Function. It uses the service-role key, so it keeps working once signed-in users lose access. Browser code only references them in generated types; there are no runtime calls.
- Certification scripts in `scripts/` run through direct database access as the owner, so the change does not affect them.

### The change: one staged, additive migration
1. Save a snapshot of the current access rights (every cert/rc1 function and who can run it) into a new read-only table, `sec_a0_grant_snapshot`. This is the audit evidence.
2. For every `cert_*` and `rc1_*` function (looked up from the catalog, so new overloads are covered):
   - remove run access from PUBLIC, anon and authenticated
   - give run access to service_role only
3. Add a fail-closed check at the start of the destructive functions:
   - `cert_reset_force_delete`
   - `cert_reset_nonproduction_business_data_v1`
   - `cert_seed_*`
   - `cert_v2_put_metric`

   Each one calls `assert_nonproduction()` and also refuses to run unless the caller is service_role or the owner. Their existing bodies stay otherwise identical.
4. Set default privileges so cert functions created in future are not runnable by signed-in users.
5. Add a test (`supabase/tests/security/a0_cert_lockdown.sql`, which rolls itself back) asserting:
   - no `cert_*` / `rc1_*` function is runnable by anon or authenticated
   - service_role can still run all of them
6. Rollback is written into the migration as a comment. It restores service_role or owner access only and never re-grants to signed-in users, as the brief requires.

### Verification
- **Before:** the privilege check returns 57/57 runnable by signed-in users. This is already captured.
- **After accept:** the same check is run read-only and must show 0/57 for signed-in users and 57/57 for service_role.
- **Safe negative test:** a TEST user calls the non-destructive `cert_v2_guard_ok` and must get permission denied. No reset, wipe or seed function is ever called.
- **Regression:** the full app test suite, plus browser smoke checks of login, registration, a dynamic form, an approval, a payment page, a return, a complaint, notifications and audit-log entries.

### Blocker to flag (needs your decision)
There is no separate staging database. A draft cannot run schema changes; the migration applies to the shared live backend only when you accept the draft. Backup and point-in-time-restore status cannot be checked from here. Per the brief, I will:
- stage the migration and the test
- validate them by review and by the rolled-back test logic only
- report "staging validation unavailable" as the blocker

Applying the change is then your call, by accepting the draft. SEC-003/004 get marked Fixed only after the post-accept check passes.

### SEC-024 isolation plan (document only)
`docs/security/SEC-024-production-isolation-plan.md` will cover:
- a new Cloud project for production
- the schema baseline (`supabase/baseline`) without certification objects
- moving data (users, licensees, records, storage files)
- re-pointing secrets and Edge Functions
- a cutover window (estimated 2–4 hours read-only)
- rollback (keep the old backend read-only for 14 days)

Nothing gets switched.

### Report
`docs/security/WAVE-A0-REPORT.md` will record:
- the functions secured
- access rights before and after
- the migration
- test results
- blocked items
- remaining risks
- the recommended next wave (A1)

Work stops after this.
