## Wave A0 (revised with your safeguards): SEC-003 and SEC-004 only

### Facts confirmed read-only
- The 57 `cert_*` / `rc1_*` functions, including `cert_reset_force_delete`, are owned by `postgres`. All 57 can be run by `authenticated`. `anon` cannot run any of them.
- The API login role `authenticator` is a member of anon, authenticated and service_role. No other role inherits from authenticated.
- `postgres` has a default rule in the `public` schema that gives `authenticated`, `service_role` and `app_certification_runner` run access to every new function. This is why every new cert function became callable. Changing that rule would affect every future app function, so **it will not be changed**. Recurrence is caught by a test instead (step 6).
- The only in-app caller is the `cert-v2-user-fixtures` Edge Function, which uses the service-role key. The scripts in `scripts/` run as the database owner.

### Implementation: one staged migration, only cert/rc1 objects
1. **Inventory before the change.** Record every cert/rc1 function signature, including overloads. For each role (PUBLIC, anon, authenticated, service_role, app_certification_runner, authenticator), store its effective EXECUTE result from `has_function_privilege`. This goes into `sec_a0_grant_snapshot`.
   - No grants to anon or authenticated, so the table is unreachable through the API.
   - RLS is on with no policies.
   - Only service_role can read it.
   - A trigger rejects UPDATE and DELETE.
2. **Revoke.** For every cert/rc1 function signature from the catalog, revoke run access from PUBLIC, anon, authenticated and app_certification_runner, then grant it to service_role only. Nothing outside `cert_*` / `rc1_*` is touched.
3. **Hard stop for destructive functions.** This works even though the environment is classified `non_production`. A new owner-only table, `sec_a0_destructive_arming`, holds an explicit arming row with a project-ref allow-list and an expiry. It ships empty. The destructive functions get a first-line check that raises an error unless all of these are true:
   - the caller is service_role or the owner
   - `assert_nonproduction()` passes
   - an unexpired arming row matches the current project

   Those functions are `cert_reset_force_delete`, `cert_reset_nonproduction_business_data_v1`, `cert_seed_*` and `cert_v2_put_metric`. On the shared backend they stay blocked permanently until someone deliberately arms them. The rest of each function body stays as it is.
4. **Inventory after the change.** The migration ends with a check: if any cert/rc1 signature is still runnable by PUBLIC, anon or authenticated, the whole migration aborts.
5. **Rollback.** A written rollback script restores only service_role and owner access and removes the arming check. It never grants to PUBLIC, anon or authenticated.
6. **Tests:**
   - a pgTAP file asserting 0 cert/rc1 functions are runnable by anon or authenticated, and the destructive ones raise an error when disarmed (checked through the catalog only, never called)
   - a Vitest test that fails if a future migration adds a cert/rc1 function without the revoke

### Staging and backup: blockers, stop point
No isolated staging database is available. A draft cannot run schema changes; staged SQL applies to the shared backend only when you accept the draft. Backup and restore readiness cannot be confirmed from here. Your conditions require staging tests and confirmed backups before anything touches the shared backend, so I will:
- write the migration, rollback script, tests and reports
- run static review plus the Vitest checks
- **not** accept or apply anything
- mark SEC-003/004 as "Ready, blocked: staging and backup unverified", not Fixed

Two ways to unblock:
1. You provide a staging project, which I validate there first.
2. You explicitly accept the risk and accept the draft after confirming a backup. I then run the read-only after-check, the negative test as a TEST user calling the harmless `cert_v2_guard_ok`, which must be denied, and browser regression.

### Documents
- `docs/security/WAVE-A0-REPORT.md`: function list, access rights before and expected after, migration, tests, blockers, remaining risks, next wave A1
- `docs/security/SEC-024-production-isolation-plan.md`: separate production project, baseline without cert objects, data/storage/user migration, secrets and Edge cutover, about 2–4 hours read-only downtime, 14-day fallback. Plan only.

Work stops after this. No Wave A1.
