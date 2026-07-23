## Root cause (verified)

The error `invalid_scope: module=admin_dashboard, scope=all` comes from `public.rbac_save_role` (migration `20260723051936_*`), which rejects any `scope_config` entry whose `(module, scope)` pair is not registered in `public.rbac_module_scopes`.

A live query against `rbac_module_scopes` shows that `admin_dashboard` has **no rows at all**. It's not just this module — 17 modules currently have permissions registered but no entry in `rbac_module_scopes`:

```
admin_dashboard, complaint_type, executive_oversight, fit_and_proper_committee,
fit_and_proper_screening, ai_management, report_management,
market_conduct_investigation, prudential_payment_systems,
fit_and_proper_initiation, enforcement_management, coordination,
security_management, workflow_management, licensing, user_management,
compliance_management
```

When the role editor selects any permission belonging to one of these modules, the client-side normalizer (`scopeConfig.ts`) correctly auto-injects `{"scope":"all"}`. The backend then looks for `(admin_dashboard, all)` in `rbac_module_scopes`, doesn't find it, and raises `invalid_scope`.

The recent `admin_dashboard.view` permission seed forgot the matching `rbac_module_scopes` row, and the same gap exists for the other 16 modules above — so this bug is not admin_dashboard-specific.

## Fix

Single migration that backfills missing `rbac_module_scopes` rows so every module that has at least one permission has at least an `all` scope registered, and future permission seeds cannot drift again.

1. **Backfill migration** — for every distinct `lower(regexp_replace(permissions.module,'\s+','_','g'))` not already present in `rbac_module_scopes`, insert `(module, 'all')`. Idempotent `ON CONFLICT DO NOTHING`.
2. **Drift guard** — add an `AFTER INSERT` trigger on `public.permissions` that ensures a matching `(module,'all')` row exists in `rbac_module_scopes` (insert if missing). Prevents this class of bug from recurring the next time someone seeds a new permission/module.
3. **Test** — add a pgTAP assertion that every distinct permission module has at least one row in `rbac_module_scopes`.

No frontend changes; no weakening of backend validation. Scoped modules (returns, complaints, etc.) keep their existing multi-scope registrations untouched.

## Verification after apply

- Retry "Save Changes" on the role that triggered the screenshot — expect success.
- Re-run the query `SELECT ... FROM permissions WHERE NOT EXISTS (rbac_module_scopes ...)` — expect zero rows.
- pgTAP test passes in CI.
