# Wave A0 v2: SEC-003 / SEC-004 (Stage Files Only)

**Status: SEC-003 and SEC-004 are Ready for Deployment — Blocked. They are not Fixed.**
They stay blocked until four things happen: staging validation, backup verification, regression testing, and explicit deployment approval.

## Database operations executed
- **No writes and no DDL.** Nothing was applied, accepted, deployed or published.
- **Read-only catalog queries only (2026-10-09):** `pg_proc`, `pg_depend`, `pg_trigger`, `pg_event_trigger`, `pg_default_acl`, `pg_auth_members`, `has_function_privilege`, and `pg_control_system()`.

## Files (Wave A0 scope only)
| File | State |
|---|---|
| M: `.lovable/drafts/drft_01m4aj14p5ejsregt7qdk15yb2/migrations/20261009110000_sec_a0_cert_function_lockdown.sql` | Rewritten (v2) |
| R: `docs/security/wave-a0/rollback.sql` | Rewritten |
| T: `supabase/tests/security/a0_cert_lockdown.sql` | Rewritten (14 assertions) |
| V: `src/test/secA0CertLockdown.test.ts` | Rewritten (8 tests) |
| `docs/security/WAVE-A0-REPORT.md` | This report |
| `roadmap.md` | Updated |

The draft must **not** be accepted, because accepting it applies M.

## Catalog evidence (verified, read-only)
- There are 57 `cert_*` / `rc1_*` signatures, one per name with no overloads, all owned by `postgres`. Before the change, all 57 are runnable by `authenticated`.
- **25 are destructive.** All 25 are plpgsql, SECURITY DEFINER, `search_path=public` and VOLATILE, and their bodies write data. They cover reset, cascade delete, detach, seed, purge/zero, metric writes, fixture registration, and `cert_v2_exec_unguarded` (dynamic SQL).
- `cert_v2_verify` was excluded. It is STABLE, so it cannot write. The other 31 functions are read-only helpers; they get the revoke only.
- **Dependencies on the 25:**
  - 0 non-function object dependencies (`pg_depend` deptype n)
  - 0 triggers
  - the 6 event triggers are all platform `extensions.*` functions
  - in-body callers resolve by name at run time and so reach the guarded wrapper

  Rename-and-wrap is therefore safe. M lines 26–33 abort if this changes.
- The shared backend's cluster `system_identifier` is `7581440907192989109`, read through `pg_control_system()` by the sandbox role.

## Corrections mapped to review findings
| # | Correction | Where |
|---|---|---|
| 1 | The destructive list grew from 4 to 25. The inventory gate pins all 57 signatures and aborts on drift. | M 8–34, 162–486 |
| 2, 4 | Tables, sequences and helper functions are revoked from PUBLIC, anon, authenticated, service_role and the runner. service_role keeps SELECT only, on the snapshot only. | M 86–107, 140 |
| 3 | The snapshot and the identity table block UPDATE, DELETE and TRUNCATE. | M 108–120 |
| 5, 6 | The guard drops session settings, JWT claims and caller identity. Authority now comes from EXECUTE privilege alone. The guard checks, in order: the deny row first, then `assert_nonproduction`, then arming by system identifier. | M 122–141 |
| 7 | The regex was replaced with explicit, generated wrapper SQL per function, reviewed below. Original bodies are renamed to `__a0_impl` and left untouched. | M 162–486 |
| 8 | Count gates: 57 public signatures and 25 impls. | M 9–24, 498–502 |
| 9 | The self-check covers PUBLIC (through anon), the runner, service_role on impls and helpers, tables, sequences, guard presence and empty arming. | M 495–end |
| 10, 11 | The rollback grants service_role on wrappers only, never on impls. It never touches PUBLIC, anon, authenticated or the runner, and it keeps the guard, impls, deny row and evidence. | R |
| 12 | V finds the migration in the draft folder or `supabase/migrations`. | V 6–14 |
| 13, 14 | T covers counts, EXECUTE for every role, impl reachability, the wrapper contract (args and defaults, result, SECURITY DEFINER, volatility, strict, parallel, retset, owner, config), object dependencies, table and sequence ACLs, empty arming, the deny row and the triggers. | T |

## Wrapper review (line by line, one pattern applied to all 25)
For each function `<n>`:
1. `ALTER FUNCTION public.<n>(<args>) RENAME TO <n>__a0_impl`. The OID, body, owner, ACL and attributes are kept.
2. `REVOKE ALL` on the impl from PUBLIC, anon, authenticated, service_role and the runner. Only the owner can call it.
3. `CREATE FUNCTION public.<n>(<full args with defaults>) RETURNS <same result>` with `SECURITY DEFINER`, `search_path=public`, the same volatility, parallel safety, cost and rows. The body has two statements:
   - `PERFORM sec_a0_require_armed('<n>')`
   - then `RETURN` / `PERFORM` / `RETURN QUERY SELECT *` on the impl, matching the return kind
4. Wrapper EXECUTE is revoked from PUBLIC, anon, authenticated and the runner, and granted to service_role.

Return kinds:
- 7 TABLE: `clean_message_runtime`, `clear_message_runtime`, `detach_users`, `register_legacy_baseline`, `reset`, `zero_message_runtime`, `zero_runtime`
- 5 void: `seed_identity_v1`, `seed_returns_v1`, `seed_structure_v1`, `complete_run`, `put_metric`
- 13 scalar (jsonb, uuid, integer)

## Effective authorization after deployment (expected; UNVERIFIED until staging)
- anon, authenticated and the runner have no EXECUTE path to any cert, rc1 or sec_a0 object.
- service_role can run wrappers only. Each destructive wrapper refuses on the shared backend because of the deny row, even when `assert_nonproduction()` succeeds.
- The postgres owner (scripts) is also refused on the shared backend. In staging, it can run destructive functions only after inserting an unexpired arming row for that staging cluster's identifier.
- `authenticator` inherits service_role membership. Reaching that role needs a service-role JWT, which is the existing trust boundary.

## Dependencies preserved
- **Edge Function `cert-v2-user-fixtures`** calls only non-destructive helpers with the service-role key, and they stay granted. Verified by reading the source.
- **`supervisory_detect_run`** (SECURITY DEFINER) calls `cert_v2_guard_ok`, which is non-destructive. A: its owner is postgres, so it is unaffected.
- **Destructive scripts in `scripts/cert-v2/*` and `scripts/rc1/*`** are intentionally blocked on the shared backend. In staging they need an arming row.

## Tests executed
- **V (static, no DB): 8/8 passed** on 2026-10-09 at about 11:27 UTC. One earlier run failed because the pgTAP check matched quoted signature strings; the test now ignores string literals.
- **T: not run.** It needs staging.
- **Negative API test and browser regression: not run.** They need staging.

## Re-review verdict: UNVERIFIED (static design PASS, runtime properties unproven)
| Property | Result |
|---|---|
| 57 signatures covered, overloads included | PASS (static, catalog-pinned) |
| Destructive coverage, 25 of 25 | PASS (static) |
| No regex rewrite; contract preserved by generation | PASS (static); runtime equality UNVERIFIED (T #7) |
| Tables, sequences and helpers closed | PASS (static); effective privileges UNVERIFIED |
| Deny row authoritative over `assert_nonproduction` | PASS (static order) |
| `pg_control_system()` callable by the owner inside the guard | **UNVERIFIED**. If it is not callable, the guard fails closed by raising an error. |
| Atomic rollback on failure | **UNVERIFIED** (depends on how the migration runner applies files) |
| Rollback safety | PASS (static) |
| Callers unaffected | PASS for the Edge Function (static); scripts are intentionally blocked |

## Exact conditions before deployment
1. An isolated staging project exists. Apply M there and confirm the self-check passes.
2. T passes 14/14 in staging.
3. Atomicity is proven in staging: inject a failure, then confirm no `sec_a0_*` objects or `__a0_impl` functions persist.
4. `pg_control_system()` works inside the guard. Confirm by arming staging, running one non-destructive wrapper path, then disarming.
5. As a TEST user, `cert_v2_guard_ok` returns permission denied.
6. Vitest and browser regression pass: login, registration, dynamic form, approval, payment, return, complaint, notifications, audit.
7. A backup or point-in-time restore of the shared backend is confirmed.
8. The owner gives explicit approval. Only then accept the draft.

## Remaining risks
- SEC-003 and SEC-004 stay exploitable by any signed-in user until M is applied.
- The 57-signature pin makes M abort if cert functions change before deployment. In that case, regenerate M from a fresh read-only inventory.
- No Wave A1 work has started.
