## Problem

Editing a role that has permissions on `role_management` (or any other scopeless module like `settings`, `audit_management`, `notification_management`) fails on Save with:

```
scope_required_for_module: role_management
```

## Root cause

`RecordScopePanel` intentionally hides scopeless modules from the Record Scope UI, so the submitted `scope_config` payload contains no entry for them. However, the backend RPC `public.rbac_save_role` (migration `20260722054659_...sql`) requires `scope_config` to contain an entry for **every** module that appears in `rbac_module_scopes`, including scopeless ones — so it raises `scope_required_for_module`. There is no decision for the admin to make on a scopeless module (only `all` is registered), so the error is spurious.

## Fix

Migration that redefines `public.rbac_save_role` with one change: when checking for missing scope entries, ignore modules that are scopeless (i.e. the only registered scope kind in `rbac_module_scopes` is `all`). For those modules, auto-inject `{"scope":"all"}` into `scope_config` before persisting so the stored config stays explicit and consistent.

Behaviour for genuinely restrictable modules (returns, complaints, licensees, etc.) is unchanged — a missing entry there still raises `scope_required_for_module`, which is the intended forcing function.

No frontend changes; `RecordScopePanel` keeps hiding scopeless modules.

## Verification

- Reload `/admin/roles`, edit an existing role that has `role_management.view/edit`, click Save Changes → no error, role updates.
- Editing a role with a restrictable module and no scope entry still raises the same error (unchanged behaviour).
- Existing pgTAP suites under `supabase/tests/rbac/` remain green.
