## Problem

Saving a role errors with `scope_required_for_module: <module>`.

Root cause (confirmed by reading `supabase/migrations/20260723051936_...sql` lines 60-68 and `src/pages/admin/RoleManagement.tsx` handleSave, plus `RecordScopePanel.tsx` which hides scopeless modules AND `getScopeCapability` which filters modules with only one option): `rbac_save_role` requires every permission's canonical module key to appear in `scope_config` unless the module is registered in `rbac_module_scopes` as scopeless (only `all`). The client only ever writes `scope_config` for modules the admin actively touched in `RecordScopePanel`, and the panel further deletes entries whenever the scope resets to `all`. Any multi-scope module (e.g. `returns_management`, `licensee_management`, `application_management`, `role_management` — the backend rbac_module_scopes registers it with more than just `all`) whose permission is selected without opening the scope panel triggers the exception. Legacy alias keys stored in a role's `scope_config` also fail because the DB canonicalizes module names to `lower(regexp_replace(module,'\s+','_','g'))`.

## Fix

Keep all backend validation intact. Normalize `scope_config` on the client so it is always consistent with the selected permissions.

### 1. New helper `src/lib/rbac/scopeConfig.ts`
Pure functions with unit tests:
- `canonicalModuleKey(module)` — mirrors the DB regex.
- `normalizeScopeConfig(scopeConfig, selectedPermissionIds, permissions, capabilities)`:
  - Rekey every entry to its canonical module key (drops legacy aliases like a mis-cased `Role_Management`).
  - Determine the set of canonical modules represented by selected permissions.
  - **Auto-set `{scope:'all'}`** for any selected module without an existing entry (works for scopeless AND multi-scope modules — satisfies the backend `scope_required_for_module` check).
  - **Preserve** existing scopes for modules still represented (metadata-only or permission-tweak edits do not drop the admin's configured scope + selector IDs).
  - **Remove** entries whose module no longer has any selected permission.
- `validateScopeSelectors(scopeConfig, capabilities)` — returns human-readable error strings, e.g. "Returns: choose at least one sector for the Selected Sectors scope."

### 2. `src/pages/admin/RoleManagement.tsx` `handleSave`
- Run `normalizeScopeConfig` on the resolved permission list right after dependency resolution.
- Run `validateScopeSelectors`; if it returns any error, `toast.error(firstError)` and abort before calling the mutation.
- Send the normalized config in the payload.

### 3. `RecordScopePanel.tsx`
- No behaviour change to selectors, but stop deleting the entry when scope resets to `all` — replace the delete with `{ scope: 'all' }` so scope stays authoritative and the "preserve on edit" contract holds. (Normalizer would re-add it anyway; this makes intent explicit and avoids UI flicker.)

### 4. Tests `src/test/rbac/scopeConfig.test.ts`
- Scoped module (`returns_management`) selected → auto-injects `{scope:'all'}` when admin didn't touch panel.
- Scopeless module (`role_management`, `settings`, `notification_management`) selected → auto-injects `{scope:'all'}`.
- Multi-module selection → each module gets its own entry, none dropped.
- Legacy alias key (`Role_Management`, `role management`) → rekeyed to canonical `role_management`, no duplicate.
- Removing the last permission for a module → entry deleted.
- Metadata-only edit (name/description change, no permission change) → existing sector/institution selections preserved verbatim.
- `validateScopeSelectors` rejects `scope:'sector'` with no `sectors[]` and `scope:'institution'` with no `licensees[]`.

Run: `bunx vitest run src/test/rbac/scopeConfig.test.ts` and existing `personaMatrix` / `adminNavGates` suites.

## Out of scope

- No changes to `rbac_save_role`, `validate_scope_config`, `has_scoped_permission`, or any RLS. Backend validation remains the source of truth.
- No hardcoded module lists — canonicalization uses the same regex as the DB; capability lookups come from `scopeCapabilities.ts` / `rbac_module_scopes`.

## Files touched

- `src/lib/rbac/scopeConfig.ts` (new)
- `src/pages/admin/RoleManagement.tsx` (handleSave only)
- `src/components/rbac/RecordScopePanel.tsx` (`setModule` reset branch)
- `src/test/rbac/scopeConfig.test.ts` (new)
