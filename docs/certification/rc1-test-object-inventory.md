# RC1 §4 — Test-only object inventory and production classification

Generated from catalog introspection of the certification project on 2026-08-23.
Every object in `public` whose name matches the certification / performance
harness patterns is classified below. The classification drives two artefacts:

* `supabase/baseline/` — the install baseline excludes everything marked
  `NONPROD_ONLY` or `TEST_ONLY`, so a fresh production install never creates them.
* the RC1 production cutover migration (`20260823163215_*.sql`) — drops them
  idempotently on an existing deployment classified as `production`.

## Classification legend

| Class | Meaning |
| --- | --- |
| `RUNTIME_REQUIRED` | Business runtime depends on it; ships to production. |
| `NONPROD_ONLY` | Certification harness. Must exist only on non-production; guarded and dropped at cutover. |
| `TEST_ONLY` | Test/measurement scaffolding with no business meaning at all. |

## Tables (8 matched)

| Object | Class | Notes |
| --- | --- | --- |
| `cert_certification_users` | NONPROD_ONLY | Certification persona registry. |
| `cert_machine_identities` | NONPROD_ONLY | Machine identity allow-list for auth purge. |
| `cert_fixture_runs` | NONPROD_ONLY | Fixture run ledger. |
| `cert_fixture_objects` | NONPROD_ONLY | Per-run object registry used by `cert_v2_reset`. |
| `cert_fixture_object_types` | NONPROD_ONLY | Reference data for the registry. |
| `cert_nonproduction_guard` | NONPROD_ONLY | Legacy environment allow-list; superseded by `app_environment_config`. |
| `cert_v2_diag` | TEST_ONLY | Scratch diagnostics table (RLS intentionally off; non-production only). |
| `certification_seed_manifest` | NONPROD_ONLY | Seed manifest for the certification universe. |

## Functions (57 matched, excluding extension-owned)

| Group | Count | Class | Notes |
| --- | --- | --- | --- |
| `cert_v2_*` (harness: `begin_run`, `seed_*`, `reset`, `zero_*`, `verify`, gates, spec/report helpers) | 46 | NONPROD_ONLY | All funnel through `cert_v2_assert_allowed()` / `cert_v2_guard_ok()`. |
| `cert_reset_*`, `cert_seed_*_v1`, `cert_verify_dataset_v1`, `cert_uuid` | 9 | NONPROD_ONLY | Legacy Wave-D helpers. `cert_reset_force_delete` / `cert_reset_detach_optional_links` / `cert_seed_{identity,returns,structure,wave_d}_v1` carry no in-body guard: EXECUTE is now `service_role`-only, they are absent from the install baseline, and the cutover drops them. Nothing in `src/` or `supabase/functions/` calls them. |
| `rc1_time_ms`, `rc1_time_as_user_ms` | 2 | TEST_ONLY | Latency measurement helpers used by the GAP-3E-002 perf harness. |

Deliberately **not** in scope (name looked similar, but business runtime depends
on them — classified `RUNTIME_REQUIRED`):
`purge_expired_audit_exports`, `reset_application_for_provisioning`,
`reset_system_role_permissions`, `reset_system_role_permissions_guarded`.

## Extensions

| Object | Class | Notes |
| --- | --- | --- |
| `pgtap` (1,074 owned functions in `public`) | TEST_ONLY | pgTAP unit-test framework. Excluded from the install baseline via `pg_depend` extension-membership filtering; dropped `CASCADE` at cutover. |
| `pg_net`, `pg_trgm` | RUNTIME_REQUIRED | Retained (both flagged by the "extension in public" linter warning — accepted platform placement). |

## Edge functions

| Object | Class | Notes |
| --- | --- | --- |
| `cert-v2-user-fixtures` | NONPROD_ONLY | Provisions/purges certification logins. Gated on `cert_v2_guard_ok()`, which now returns `false` on any production-classified deployment, so the whole function fails closed even before its cert tables are dropped. |

## Verification

Executed against a disposable local PostgreSQL cluster (`/tmp/rc1-pg`, database
`rc1_envsafety`) with the §3 migration applied and probe objects
(`cert_probe`, `cert_probe_fn`, `rc1_time_ms`) created:

```
NONPROD  is_production_environment() = f   assert_nonproduction() = pass
EMPTY    is_production_environment() = t   assert_nonproduction() raises 42501
PROD     is_production_environment() = t   cert_v2_guard_ok() = f   assert raises 42501
CUTOVER  NOTICE: RC1 cutover complete: 3 functions, 1 relations dropped
         remaining cert_/rc1_ relations = 0, functions = 0
RERUN    errors = 0 (idempotent)
```
