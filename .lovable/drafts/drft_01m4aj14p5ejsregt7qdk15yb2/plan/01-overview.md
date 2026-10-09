## Wave A0 corrections (stage files only)

Only these files change: the staged migration (M), the rollback (R), the pgTAP test (T), the Vitest test (V), `docs/security/WAVE-A0-REPORT.md` and `roadmap.md`. The only commands run are read-only catalog reads to build the inventory and static file tests. Nothing is applied, accepted or deployed.

### 1. Destructive inventory (catalog evidence)
- Build the list from a read-only `pg_proc` query. It matches names containing reset, purge, delete, wipe, detach, seed, put, truncate or cascade, and then each function body is read to confirm it writes data. Current candidates (21):
  - `cert_reset_force_delete`, `cert_reset_nonproduction_business_data_v1`, `cert_reset_detach_optional_links`
  - `cert_seed_identity_v1`, `cert_seed_returns_v1`, `cert_seed_structure_v1`, `cert_seed_wave_d_v1`
  - `cert_v2_reset`, `cert_v2_cascade_delete`, `cert_v2_put_metric`
  - `cert_v2_seed_calculate`, `cert_v2_seed_entities`, `cert_v2_seed_reference`, `cert_v2_seed_returns`, `cert_v2_seed_universe`
  - plus any confirmed writers among the remaining cert/rc1 functions
- Read-only helpers such as `cert_reset_classify_tables` and `auth_purge_precheck` are listed as "non-destructive, revoke only", with evidence.
- M holds the exact list of signatures. It aborts if any listed signature is missing, or if a new name-pattern match in the catalog is not on the list.

### 2. Syntax-safe guard (replaces the regex)
For each destructive signature:
1. `ALTER FUNCTION ... RENAME TO <name>__a0_impl`. The original body, owner and SECURITY DEFINER setting stay untouched.
2. Revoke ALL on the impl from every role except the owner.
3. Create a wrapper under the original name and signature, with the same return type. It first calls `sec_a0_require_armed('<name>')` and then returns the impl's result.
4. Wrappers are explicit generated SQL written into M, one per signature and reviewable. They are not built at runtime.

### 3. Spoof-proof arming
- Drop the session-setting and JWT-claim checks.
- The guard requires all three of these:
  - `current_user` is the owner, because wrappers run as SECURITY DEFINER and the role is checked through `session_user` membership in an owner-only allow-list table
  - `assert_nonproduction()` passes
  - an unexpired row in `sec_a0_destructive_arming` matches the database's system identifier, read through an owner-only function
- A permanent deny row stores the shared/published backend's identifier. The guard always refuses that identifier, even if someone adds an arming row for it.
- **Unverified:** whether the owner role can read the system identifier on this platform. If it can't, the fallback is `current_database()` plus an owner-written identity row. This gets verified in staging.

### 4. Privileges
For both tables, their sequences and every helper and impl function:
- `REVOKE ALL` from PUBLIC, anon, authenticated, service_role and `app_certification_runner`
- grant back only SELECT on the snapshot to service_role
- the snapshot gets append-only triggers covering UPDATE, DELETE and TRUNCATE, and INSERT is allowed only for the owner

M ends with a self-check over `has_table_privilege`, `has_sequence_privilege` and `has_function_privilege` for every role. If any unexpected right remains, the migration aborts.

### 5. Rollback
R puts the service_role grant back on the wrappers only. It never grants to PUBLIC, anon, authenticated or the runner. Wrappers, impl functions, the guard and the deny row are kept, and a header lists what is never reversed.

### 6. Tests
- **V:** finds the migration in either the draft folder or `supabase/migrations`, then asserts:
  - the explicit destructive list
  - no regex body edits
  - no `current_setting` or `auth.role` checks in the guard
  - the rollback grant rules
  - the TRUNCATE trigger
  - the revoke-from-runner statements
- **T:** asserts:
  - 57 base signatures plus the impl count
  - zero anon/authenticated/runner EXECUTE
  - table and sequence ACLs
  - the arming table is empty and the deny row is present
  - every destructive wrapper calls the guard and every impl is owner-only

  T never calls a destructive function.

### 7. Report and re-review
- Update WAVE-A0-REPORT.md with each correction mapped to its finding, line numbers and test results.
- Run a fresh static review and give a PASS / FAIL / UNVERIFIED verdict.
- SEC-003 and SEC-004 stay **Ready for Deployment — Blocked**. No Wave A1.
