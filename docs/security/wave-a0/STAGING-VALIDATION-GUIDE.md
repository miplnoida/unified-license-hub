# Wave A0 — Staging Setup & Verification Guide

Scope: SEC-003 and SEC-004 only. Status stays **Ready for Deployment — Blocked** until every PASS criterion in §8 is met and the owner approves in writing.
Prepared files:
- M — `.lovable/drafts/drft_01m4aj14p5ejsregt7qdk15yb2/migrations/20261009110000_sec_a0_cert_function_lockdown.sql`
- R — `docs/security/wave-a0/rollback.sql`
- T — `supabase/tests/security/a0_cert_lockdown.sql`
- V — `src/test/secA0CertLockdown.test.ts`

> Never run any step against the shared backend (cluster `system_identifier` `7581440907192989109`). Every step below starts with the identity check in §3.1.

## 1. Create an isolated staging project
1. Create a **new, separate** Lovable Cloud project (for example "ULH Staging"). Do not use a draft of the live project, because drafts share the live backend.
2. Record staging's project ref and its `system_identifier` (§3.1). It must differ from the shared one.
3. Set `app_environment_config.environment = 'non_production'` (single row).
4. Secrets: add **no** real SMTP, SMS, payment, captcha or webhook credentials. Leave providers unconfigured so nothing can be delivered.
5. Disable scheduled workers and cron jobs (notification dispatch, SLA sweep, escalation) in staging.

## 2. Reproduce the schema without production data
1. Install the baseline from `supabase/baseline/` in manifest order (`00_manifest.sql`: types, sequences, schema, then `seed/*.csv`). These are reference and configuration data only.
2. Replay `supabase/migrations/` in filename order, so the 57 `cert_*` / `rc1_*` functions exist exactly as they do on the shared backend.
3. Create the platform roles the migration references, if absent: `app_certification_runner` (NOLOGIN). `anon`, `authenticated`, `service_role` and `authenticator` are provided by the platform.
4. **Parity check.** Run these read-only queries on the shared backend and on staging, then diff the outputs. Any difference blocks the run.
   ```sql
   -- a) inventory + attributes
   SELECT p.proname, pg_get_function_identity_arguments(p.oid), pg_get_function_arguments(p.oid),
          pg_get_function_result(p.oid), pg_get_userbyid(p.proowner), p.prosecdef, p.provolatile,
          p.proisstrict, p.proparallel, p.proconfig, l.lanname, md5(p.prosrc)
   FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
   WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE 'cert\_%' OR p.proname LIKE 'rc1\_%')
   ORDER BY 1,2;
   -- b) effective EXECUTE
   SELECT p.proname, r.rolname, has_function_privilege(r.rolname,p.oid,'EXECUTE')
   FROM pg_proc p CROSS JOIN pg_roles r
   WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE 'cert\_%' OR p.proname LIKE 'rc1\_%')
     AND r.rolname IN ('anon','authenticated','service_role','app_certification_runner','authenticator')
   ORDER BY 1,2;
   -- c) default privileges and role membership
   SELECT pg_get_userbyid(defaclrole), defaclobjtype, defaclacl FROM pg_default_acl
   WHERE defaclnamespace='public'::regnamespace ORDER BY 1,2;
   SELECT r.rolname, m.rolname FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.member
   JOIN pg_roles m ON m.oid=a.roleid WHERE r.rolname IN ('authenticator','anon','authenticated','service_role') ORDER BY 1,2;
   -- d) dependencies (must be 0 / 0)
   SELECT count(*) FROM pg_depend d JOIN pg_proc p ON p.oid=d.refobjid
   WHERE d.classid<>'pg_proc'::regclass AND d.deptype='n' AND p.pronamespace='public'::regnamespace
     AND (p.proname LIKE 'cert\_%' OR p.proname LIKE 'rc1\_%');
   SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
   WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'cert\_%';
   ```
   Expected: 57 rows in (a), all owned by `postgres`. Before the change, (b) shows `authenticated = true` for all 57.
5. **Data.** Create TEST users and TEST entities only, through the normal staging UI. Do not copy production rows, storage files, auth users or secrets.

## 3. Apply Wave A0 to staging only
1. Identity check (mandatory, immediately before applying):
   ```sql
   SELECT system_identifier::text FROM pg_control_system();   -- must NOT be 7581440907192989109
   SELECT environment FROM public.app_environment_config;     -- must be non_production
   ```
   Also record whether this call succeeds as the `postgres` owner. Wave A0 needs it to work inside the guard.
2. Apply M as the database owner in **one transaction**, for example `psql -v ON_ERROR_STOP=1 --single-transaction -f M`.
3. Expect no error. The migration's own inventory gate and self-check (in M) must pass.
4. Save the evidence:
   ```sql
   SELECT phase, role_name, count(*) FILTER (WHERE can_execute) AS can_exec, count(*)
   FROM public.sec_a0_grant_snapshot GROUP BY 1,2 ORDER BY 1,2;
   ```
   Expected after the change: anon, authenticated and app_certification_runner have 0 can_exec on any cert, rc1 or sec_a0 object. service_role can run wrappers only.

## 4. The 14 database checks and negative tests
1. Run `pg_prove -d <staging_db_url> supabase/tests/security/a0_cert_lockdown.sql`. **14/14 required.** The test calls no cert, rc1 or sec_a0 function.
2. Negative API tests, using only the staging URL and keys:
   | Caller | Request | Expected |
   |---|---|---|
   | anon key, no session | `POST /rest/v1/rpc/cert_v2_guard_ok` | 401/403/404 or 42501 |
   | TEST signed-in user | `POST /rest/v1/rpc/cert_v2_guard_ok` | 403 / 42501 |
   | TEST signed-in user | `POST /rest/v1/rpc/cert_v2_put_metric__a0_impl` with dummy args | 403/404 / 42501 (permission denied before the body runs) |
   | TEST signed-in user | `GET /rest/v1/sec_a0_grant_snapshot` | 401/403 / 42501 |
   | TEST signed-in user | `GET /rest/v1/sec_a0_destructive_arming` | 401/403 / 42501 |
3. Never call reset, seed, delete, detach, purge or zero functions in these tests.

## 5. Atomic rollback and identity guards
1. **Atomicity.** Use a disposable copy of staging, or reset staging to its pre-M state.
   - Make the inventory gate fail on purpose, for example by creating a harmless extra function `public.cert_zz_probe()`.
   - Apply M with `--single-transaction`. It must fail with `SEC-A0 inventory mismatch`.
   - Then verify:
     ```sql
     SELECT count(*) FROM pg_class WHERE relname LIKE 'sec\_a0\_%';            -- 0
     SELECT count(*) FROM pg_proc WHERE proname LIKE '%\_\_a0\_impl';           -- 0
     ```
     The parity query in §2.4(b) must be unchanged from before.
   - Drop the probe function afterwards.
2. **Disarmed path** (M applied, arming table empty). As service_role, call a benign wrapper, `cert_v2_begin_run('a0-probe','disarmed test')`. Expect `SEC-A0: cert_v2_begin_run is disarmed`.
3. **Deny path.** As owner, insert staging's own identifier into `sec_a0_environment_identity` with disposition `deny`, then repeat step 2. Expect `permanently denied on this backend`. This holds even though `assert_nonproduction()` passes. The deny table is append-only by design, so do this on a disposable staging copy and discard the copy afterwards.
4. **Armed path** (clean staging copy without the deny row).
   - As owner, insert `sec_a0_destructive_arming(system_identifier, armed_by, reason, expires_at)` for staging's ID, expiring in 10 minutes.
   - Call the same benign wrapper. It must succeed, which proves `pg_control_system()` works inside the guard.
   - Then delete the arming row as owner, repeat the call, and expect `disarmed`.
5. **Rollback script.** Run R on staging. Re-run T (14/14 still expected) and §2.4(b). Confirm that no anon, authenticated or runner grant appeared, and that the wrappers still carry the guard.

## 6. Application regression on staging
1. `bunx vitest run`: the full suite, with zero new failures against the recorded baseline.
2. Playwright `e2e/cert-v2` specs 01–05 against the staging URL, with no new failures.
3. Manual TEST journeys, recording screenshots:
   - login / logout
   - registration
   - a dynamic form save and submit
   - application approval
   - payment (simulated gateway)
   - return filing
   - complaint submission and tracking
   - an in-app notification shown
   - an audit-log entry recorded
4. Edge Function `cert-v2-user-fixtures` must still answer its non-destructive actions, which use `cert_v2_guard_ok`, `cert_v2_role_catalogue`, `cert_v2_auth_purge_precheck` and `cert_v2_auth_identity_classification`. These use the service-role key, so they stay granted.
5. Certification scripts under `scripts/cert-v2` and `scripts/rc1`: the destructive ones are expected to refuse while disarmed. Document this as intended behavior.

## 7. Backup and restore readiness (shared backend)
1. In Cloud settings, confirm point-in-time restore or daily backups are enabled. Record the latest backup timestamp.
2. Rehearse a restore by restoring a backup into staging, or by exporting one reference table and restoring it into staging, and check row counts.
3. Record RPO and RTO.
4. Keep R ready. It restores service_role access only and never reopens user access or removes the guard.

## 8. PASS / FAIL criteria for production deployment
**PASS requires every item. Any single failure, or any untested item, is FAIL.**
| # | Criterion |
|---|---|
| 1 | Parity diff (§2.4) between shared and staging is empty |
| 2 | M applies cleanly in staging; self-check passes |
| 3 | pgTAP 14/14 (§4.1), before and after running R |
| 4 | Every negative test in §4.2 is denied |
| 5 | The atomic failure test leaves zero `sec_a0_*` / `__a0_impl` residue and unchanged grants |
| 6 | Disarmed, deny and armed paths behave exactly as specified; `pg_control_system()` works inside the guard |
| 7 | Zero new Vitest or Playwright failures; all manual journeys pass |
| 8 | Edge Function non-destructive actions still work |
| 9 | Backup is confirmed with a timestamp and a restore has been rehearsed |
| 10 | Immediately before production apply, the shared inventory still matches (57 signatures, same `md5(prosrc)`) |
| 11 | Written owner approval |

Only after all 11 items PASS may the draft be accepted, which applies M to the shared backend. After that, run §4 (read-only parts) and §2.4(b) against production, and update SEC-003 and SEC-004 to Fixed.

## 9. Evidence template
| Step | Command / action | Run by | UTC timestamp | Result | Artifact link |
|---|---|---|---|---|---|
| 2.4 parity | | | | | |
| 3.1 identity | | | | | |
| 3.2 apply M | | | | | |
| 4.1 pgTAP | | | | | |
| 4.2 negatives | | | | | |
| 5.1 atomicity | | | | | |
| 5.2–5.4 guards | | | | | |
| 5.5 rollback | | | | | |
| 6 regression | | | | | |
| 7 backup/restore | | | | | |
| 8 approval | | | | | |
