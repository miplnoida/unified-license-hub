## Problem

The server RPC `rbac_save_role` rejects saves when a role has any non-view action on a module but no `view` on that same module. The client blocks this in one place only — the individual `togglePerm` handler — so the error still slips through via other permission-mutation paths in `RoleManagement.tsx`:

- **`applyLevel(level)`** (module access-level dropdown): rebuilds regular actions from a level template but preserves sensitive privileges untouched. If the chosen level's action set does not include `view` while a sensitive privilege for that module is still selected, `view` gets stripped and the sensitive action becomes an orphan.
- **`clearAll()`** (module header checkbox / search-scoped clear): removes every currently-filtered permission on the module. If the search filter is narrow (e.g. user searched "view"), `view` is dropped while dependents survive.
- **Category/system template loads** and existing role data can also arrive without `view` for a module that has dependents (legacy data).

Result: user clicks Save and the server returns `dependency_still_referenced: cannot remove application_management.view while dependent actions remain on the role`.

## Fix

Mirror the DB rule everywhere the selection changes, and add a last-line client-side validator before we call the RPC. Two small pieces:

### 1. Shared cascade helper — `src/lib/rbac/permissionDependencies.ts`

Add a pure function:

```ts
cascadeRemoveDependents(selectedIds, catalog): { resolvedIds, removedIds }
```

Behaviour: for each module where `view` is NOT in `selectedIds`, drop every non-view permission on that module from the selection. Uses the existing `normalizeModuleKey` helper so it matches the DB comparison.

### 2. Apply the cascade at every mutation point — `src/pages/admin/RoleManagement.tsx`

- `applyLevel`: after computing `next`, run `cascadeRemoveDependents` (before `resolveDependencies`). If anything was removed, `toast.info` explaining that dependent actions on the module were cleared because the chosen level does not include View.
- `clearAll`: run the cascade on the result so removing `view` also removes its dependents on the same module.
- `togglePerm` (view-off branch): replace the current hard block with the same cascade — if the user unticks `view`, automatically remove the dependents on that module and toast which actions were cleared, instead of refusing the click. This matches how the "on" branch already auto-adds View.
- `selectAll`: unchanged (only adds, resolveDependencies covers it).
- **Pre-save guard in `handleSave`**: run `resolveDependencies(formPerms, permissions)`; if `violations.length > 0`, show a single toast listing the offending module/actions and abort the save. This is the last-line defence that guarantees the RPC never sees a bad payload, even for legacy roles opened for edit.

### 3. Tests — `src/test/rbac/permissionDependencies.test.ts`

Add cases:

- `cascadeRemoveDependents` drops `edit`/`approve` on a module when `view` is absent.
- Cascade leaves modules with `view` untouched.
- Cascade preserves permissions on unrelated modules.
- Normalization: works when catalog stores `"License Management"` but selection references `license_management`.

## Files touched

- `src/lib/rbac/permissionDependencies.ts` — add `cascadeRemoveDependents`.
- `src/pages/admin/RoleManagement.tsx` — apply cascade in `togglePerm`, `applyLevel`, `clearAll`; add pre-save validator in the save handler.
- `src/test/rbac/permissionDependencies.test.ts` — cover the new helper.

## Out of scope

Backend behaviour is unchanged — the DB rule stays authoritative. No other module, hook, or RLS policy is touched.