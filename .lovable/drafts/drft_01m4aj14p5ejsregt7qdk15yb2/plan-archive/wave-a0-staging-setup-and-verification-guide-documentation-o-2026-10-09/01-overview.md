## Wave A0 staging setup and verification guide (documentation only)

This produces one new document, `docs/security/wave-a0/STAGING-VALIDATION-GUIDE.md`. No code changes, database changes, migrations, deploys or Wave A1. SEC-003 and SEC-004 stay **Ready for Deployment — Blocked**.

### Guide contents
1. **Create isolated staging.**
   - Create a new, separate Lovable Cloud project, for example "ULH Staging".
   - Never reuse the shared backend; record staging's own project ref.
   - Set `app_environment_config.environment = non_production` there.
   - Use no real secrets: no SMTP/SMS/payment keys, and notification workers turned off.
2. **Reproduce the schema without production data.**
   - Install from `supabase/baseline/` (types, sequences, schema, seed CSVs of reference/config data only).
   - Then replay `supabase/migrations/` in order, so the cert/rc1 objects exist exactly as they do in production.
   - Check that staging matches production with read-only inventory queries:
     - the 57 cert/rc1 signatures and their argument lists
     - owner = postgres
     - `proacl` and `has_function_privilege` for anon, authenticated, service_role, the runner and authenticator
     - default privileges
     - `pg_auth_members`
     - no dependency or trigger refs
   - Any diff blocks the run.
   - Create only TEST users and TEST entities; no production rows, files or auth users get copied.
3. **Apply Wave A0 to staging only.**
   - Confirm the target is staging, not the shared backend, by checking that `pg_control_system().system_identifier` is not `7581440907192989109`.
   - Run the staged migration file in a single transaction.
   - Record the before and after snapshot rows.
4. **Run the 14 checks and negative tests.**
   - Run `supabase/tests/security/a0_cert_lockdown.sql` with pg_prove; it needs 14/14.
   - Negative test via API, as a TEST signed-in user and as anon:
     - call `cert_v2_guard_ok` and one wrapper's `__a0_impl`
     - expect 401/403/42501
   - Destructive functions are never called.
5. **Atomicity and identity guards.**
   - **Atomicity:** on a throwaway staging copy, alter one expected signature so the inventory gate fails, apply, then confirm:
     - no `sec_a0_*` tables
     - no `__a0_impl` functions
     - grants unchanged
   - **Deny path:** temporarily insert staging's own ID as a deny row, call a harmless wrapper (`cert_v2_begin_run` on a disposable run) as service_role, and expect a "permanently denied" error.
   - **Disarmed path:** with no arming row, expect "disarmed".
   - **Armed path:**
     - arm staging for 10 minutes and run one benign wrapper
     - delete the arming row and check it is refused again
     - confirm `pg_control_system()` is callable inside the guard
6. **Application regression on staging.**
   - Full Vitest run.
   - Playwright cert-v2 specs 01–05.
   - Manual TEST journeys: login, registration, dynamic form, application approval, payment (simulated), return filing, complaint, in-app notification, audit-log entry.
   - Confirm the `cert-v2-user-fixtures` Edge Function still answers its non-destructive actions.
7. **Backup and restore readiness (shared backend).**
   - Confirm that point-in-time restore or a daily backup exists, and its timestamp, through Cloud settings.
   - Rehearse restore into staging, or export and restore one reference table.
   - Record the RPO/RTO.
   - Keep `rollback.sql` ready; it never reopens user access.
8. **PASS / FAIL criteria for production approval.** PASS needs every item below; any failure is FAIL.
   - parity diff is empty
   - migration self-check passes
   - pgTAP 14/14
   - negative tests are denied
   - the atomic failure test leaves no residue
   - the deny, disarmed and armed paths behave as specified
   - zero new Vitest/Playwright failures against the baseline
   - all manual journeys pass
   - backup is confirmed and restore is rehearsed
   - the inventory still matches production (57 signatures)
   - written owner approval
9. **Evidence template.** A table to fill in for each step: command, timestamp, result, and a link to the artifact.

After the guide is written, work stops until you approve.
