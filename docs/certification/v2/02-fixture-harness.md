# Certification V2 — Wave 1 Fixture Harness

The harness makes every certification record **attributable** (which run and
scenario created it) and **reversible** (removable in dependency order, without
touching audit history or configuration).

## Registry

| Object | Purpose |
|--------|---------|
| `cert_fixture_runs` | One row per RESET/SEED cycle: `fixture_version`, `status`, `started_by`, timings |
| `cert_fixture_objects` | Ledger of every seeded record: `scenario_code`, `object_type`, `object_id`, `object_reference`, `cleanup_policy` |
| `cert_fixture_object_types` | Catalogue mapping object type → table → `delete_order` (higher deletes first) |

`cleanup_policy` values: `purge` (removed at RESET), `retain_audit`,
`retain_config` (never removed).

## Governed operations

| Function | Purpose |
|----------|---------|
| `cert_v2_begin_run(fixture_version, notes)` | Opens a run, returns `run_id` |
| `cert_v2_register_object(run_id, scenario_code, object_type, object_id, object_reference, cleanup_policy, metadata)` | Idempotent registration (upsert on dataset + type + id) |
| `cert_v2_complete_run(run_id, status)` | Closes a run |
| `cert_v2_reset(dataset_key)` | Deletes only registered purgeable objects, in dependency order; returns per-type deletion counts |
| `cert_v2_verify(dataset_key)` | Registry integrity checks (dangling rows, single active run, scenario codes, guard state) |
| `cert_v2_report(dataset_key)` | Object counts per scenario and type |

All are `SECURITY DEFINER` with a pinned `search_path`, revoked from `PUBLIC`,
and gated by `cert_v2_assert_allowed()`, which refuses to run unless:

- `cert_nonproduction_guard` shows `non_production` with `reset_enabled = true`, and
- the caller is either a trusted server context or a signed-in **super administrator**.

Read access to the three registry tables is restricted by RLS to
super administrators and administrators.

## Safety properties

1. RESET can never delete an unregistered row — deletion is driven entirely by
   the ledger.
2. RESET can never delete audit or delivery history — those are classified KEEP
   and are not registrable object types.
3. RESET is idempotent: after it runs, the purgeable ledger is empty and runs are
   marked `reset`.
4. A production-like environment (guard absent or disabled) fails closed with
   SQLSTATE `42501`.

## Smoke evidence (2026-08-23)

```
cert_v2_guard_ok()          -> true
cert_v2_begin_run(...)      -> run created
cert_v2_verify()            -> registry_objects_resolve PASS
                               single_active_run        PASS
                               objects_have_scenario    PASS
                               nonproduction_guard      PASS
cert_v2_reset()             -> completed; 0 purgeable objects remaining
```

Regression coverage: `supabase/tests/certification/10_fixture_harness.sql`.
