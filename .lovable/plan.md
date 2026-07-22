# Fix: `system_role_not_deletable` on every role delete

## Root cause (verified)

`public.rbac_delete_role` rejects a role when **either**:

1. `is_system = true`, **or**
2. `system_role NOT IN ('custom','')`

In the current `roles` table, every row has `system_role` set to a template key like `analyst`, `admin`, `supervisor`, etc. — including user-created custom roles (`is_system = false`). So condition (2) blocks every delete, even for legitimate custom roles such as "Application Intake Clerk" or "Insurance Regulator".

`system_role` on this table is a **template lineage tag** (which starter template the role was cloned from), not a "this row is a built-in" flag. The authoritative built-in marker is `is_system`.

## Fix

Migration to redefine `public.rbac_delete_role` so deletion is blocked **only** when `is_system = true`. Drop the `system_role` clause.

```sql
IF COALESCE(target.is_system, false) THEN
  RAISE EXCEPTION 'system_role_not_deletable' USING ERRCODE = '22023';
END IF;
```

Everything else (auth check, `has_permission('role_management','delete')`, cascading cleanup of `role_permissions` and `user_dynamic_roles`, audit) stays exactly as-is.

## Verification

- Attempting to delete a role with `is_system = true` (e.g. "Super Admin", "Legacy Admin") still raises `system_role_not_deletable`.
- Attempting to delete a custom role (`is_system = false`, e.g. "Application Intake Clerk") succeeds and cascades.
- Existing pgTAP coverage under `supabase/tests/rbac/` continues to pass; add one assertion for a custom-role deletion happy path.

## Out of scope

No UI changes. No changes to `rbac_save_role`, catalog, or persona matrix.
