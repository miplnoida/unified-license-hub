### Additional conditions folded in (approval of 11:19 UTC)

**A. Dependency analysis before any rename.** Read-only checks run for every destructive signature:
- `pg_depend` objects that point at the function: views, defaults, generated columns, policies, index expressions
- `pg_trigger.tgfoid`
- `pg_rewrite` rules
- `pg_proc` bodies that mention the name
- event triggers

Objects that point at the function directly follow the rename to `__a0_impl`. That would skip the guard, so if any such object exists, rename-and-wrap is dropped for that function. In that case the fallback is a hand-written `CREATE OR REPLACE` of the original definition, with the guard as its first statement, written out in M for review. Callers that reference the function by name inside plpgsql/SQL bodies resolve at run time, so they reach the guarded wrapper. Each case is recorded in the report.

**B. Execution contract.** Each wrapper is generated in the file, not at run time, from:
- `pg_get_function_identity_arguments` and `pg_get_function_arguments` (keeps names and defaults)
- `pg_get_function_result`, including SETOF and TABLE returns
- `prosecdef`, `proconfig` (search_path), `provolatile`, `proisstrict`, `proparallel`, `procost` / `prorows`, owner and language

A read-only query lists these attributes for every signature in the report, and T asserts the wrapper matches the impl on each one.

**C. Authorization model.** Caller identity is not read from `session_user`, `current_user`, settings or the JWT.
- **Authority:** EXECUTE privilege. Only the owner and service_role hold it on the wrappers, and only the owner holds it on the impls. This is enforced by the database and is the proven mechanism.
- **Guard:**
  1. Refuse if this database's identity is on the deny list. This check runs first and holds even if `assert_nonproduction()` passes.
  2. Require `assert_nonproduction()` to pass.
  3. Require an unexpired arming row matching the identity.
- **Identity:** an owner-written row in an owner-only table, `sec_a0_environment_identity`. The source of the identity value is still **UNVERIFIED**: either the cluster system identifier, or `current_database()` plus a project ref written by the owner. It is resolved in staging.

**D. Impl reachability.**
- All rights on impls are revoked from every role except the owner.
- T checks `has_function_privilege` for PUBLIC, anon, authenticated, service_role, runner and authenticator.
- A read-only check confirms that no view, policy, trigger or default references an impl.

**E. Inventory.** T and the self-check in M separately assert:
- 57 original names and signatures still exist (as wrappers or unchanged)
- N impl functions, where N equals the number of destructive signatures

**F. Wrapper review.** Every wrapper's SQL is printed in M and reviewed line by line in the report, not just matched by text.

**G. Rollback.** No wrapper or impl is dropped, and callers keep reaching the same names. Only the service_role grant on wrappers is restored.

**H. Status.** Any property that hasn't been shown in staging is reported as UNVERIFIED and never as PASS. SEC-003 and SEC-004 stay **Ready for Deployment — Blocked**.
