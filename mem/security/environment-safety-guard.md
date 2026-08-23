---
name: Environment safety guard
description: app_environment_config classifies deployments; destructive certification/reset tooling is denied on production and fails closed
type: constraint
---

`public.app_environment_config` (single row, `environment` = `production` |
`non_production`) is the authoritative deployment classification. Writable only by
`service_role` / deployment tooling.

Rules:
- `public.is_production_environment()` fails closed: missing row, empty table or
  unknown value = production. Never soften this default.
- Any destructive / reset / reseed / fixture-provisioning routine must call
  `public.assert_nonproduction('<operation>')` (raises `42501`) or funnel through
  `public.cert_v2_guard_ok()`, which returns false on production.
- `cert_*` and `rc1_*` functions are `service_role`-only. Never grant EXECUTE to
  `anon` or `authenticated`.
- The production cutover migration drops all `cert_*` / `rc1_*` / `_time_trial*`
  objects and the `pgtap` extension, but only when the deployment is classified
  production. Keep it idempotent.
- The RC1 install baseline (`supabase/baseline/`) must never contain
  certification/test-only objects; regenerate with
  `scripts/rc1/db/generate-baseline.sh` after schema changes.
