## Problem

Saving the Licensing Officer role (and any other role that mixes custom actions with `view`) fails with:

> permission_dependency_violation: action selected without view on its module

### Root cause (confirmed)

The database RPC `public.rbac_save_role` (migration `20260723051936_...`) enforces the invariant for **every** non-`view` permission:

```sql
WHERE p.id = ANY(perm_ids) AND lower(p.name) <> 'view'
  AND NOT EXISTS (view on same normalized module in payload)
```

The client-side mirror in `src/lib/rbac/permissionDependencies.ts` (`resolveDependencies`, `permissionHasDependency`) only considers a fixed allow-list `DEPENDENT_ACTIONS` (edit, create, delete, approve, …). The Licensing Officer role holds actions the list does not know about, e.g. `licensing.add_legal_notes`, `licensing.flag_concern`, `licensing.recommend_conditions`, `licensing.respond_rfi`, `licensing.upload_documents`, `license_management.manage_license_actions`. Consequences:

1. When the user unticks `view` on `licensing` or `license_management`, the "cannot remove view" guard in `RoleManagement.tsx` (line 362-371) checks only `permissionHasDependency(name)`, so it lets `view` be removed even though those custom actions are still selected. The DB then rejects the save.
2. When the user ticks one of those custom actions on a module where `view` is not yet selected, `resolveDependencies` does not auto-add `view` either.
3. Module comparison in the removal guard uses `p.module === perm.module` (no normalization), so a whitespace/case drift between catalog rows would also miss the guard — the DB normalizes with `regexp_replace(module,'\s+','_','g')` and `lower(...)`.

## Fix (frontend only, mirrors the DB rule)

Make the client-side dependency logic match the server rule exactly: any non-`view` action requires `view` on the same normalized module.

### `src/lib/rbac/permissionDependencies.ts`
- Keep `DEPENDENT_ACTIONS` as documentation/back-compat export.
- Change `permissionHasDependency(action)` to `action && action.toLowerCase() !== 'view'`.
- In `resolveDependencies`, key `viewByModule` and the per-permission lookup by the same normalized module key the DB uses: `lower(module).replace(/\s+/g,'_')`. Apply the same normalization when comparing `p.module` to `view.module`.

### `src/pages/admin/RoleManagement.tsx`
- In the toggle handler (~line 362-380), when deciding whether removing `view` is safe or whether toggling on a non-view action should auto-enable `view`, compare modules using the same normalized key helper. The updated `permissionHasDependency` will make the guard fire for every non-view action automatically.
- No changes to payload shape, mutations, or scope-config handling.

### Tests
Extend `src/test/rbac/permissionDependencies.test.ts`:
- A custom action (e.g. `add_legal_notes`) on a module without `view` triggers a violation and auto-adds `view`.
- Two custom actions on the same module add `view` only once.
- Module keys with whitespace / mixed case still match their normalized `view` permission.
- Removing `view` while any non-view action remains selected is reported as a violation (via `resolveDependencies` from the parent state).

## Out of scope

- No DB migration — server rule is already correct, we are aligning the UI to it.
- No changes to scope_config, role classification, `rbac_save_role`, or unrelated modules.

## Verification

1. `bunx vitest run src/test/rbac/permissionDependencies.test.ts` — new + existing cases pass.
2. Manual: open Licensing Officer, untick then re-tick a custom action, hit Save — no `permission_dependency_violation` toast; role saves.
3. Manual: create a fresh role with only `licensing.add_legal_notes` — UI auto-enables `licensing.view` and save succeeds.
