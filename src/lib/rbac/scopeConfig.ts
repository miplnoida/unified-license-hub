/**
 * Client-side normalizer for `roles.scope_config`.
 *
 * The backend RPC `rbac_save_role` enforces that every selected permission's
 * canonical module key appears in `scope_config` (unless the module is
 * registered as scopeless in `rbac_module_scopes`). It also canonicalizes
 * module names via `lower(regexp_replace(module,'\s+','_','g'))`.
 *
 * This module mirrors those rules so the UI never sends a payload that the
 * backend would reject with `scope_required_for_module`, without hardcoding
 * module names or weakening any server-side validation.
 */
import type { Permission, RoleScopeConfig } from '@/hooks/useRoles';
import {
  MODULE_SCOPE_CAPABILITIES,
  getScopeCapability,
  requiredSelectorFor,
  type ScopeKind,
} from '@/lib/rbac/scopeCapabilities';

/** Mirrors the DB expression `lower(regexp_replace(module,'\s+','_','g'))`. */
export function canonicalModuleKey(module: string | null | undefined): string {
  return String(module ?? '').replace(/\s+/g, '_').toLowerCase();
}

export interface NormalizeArgs {
  scopeConfig: RoleScopeConfig;
  selectedPermissionIds: string[];
  permissions: Permission[];
}

/**
 * Normalize a `scope_config` blob against the currently selected permissions:
 * - Rekeys every entry to its canonical module key (drops legacy aliases).
 * - Auto-injects `{ scope: 'all' }` for any selected module missing an entry.
 * - Preserves existing scope + selector IDs for modules still represented.
 * - Removes entries for modules whose last permission was just deselected.
 */
export function normalizeScopeConfig({
  scopeConfig,
  selectedPermissionIds,
  permissions,
}: NormalizeArgs): RoleScopeConfig {
  // Canonicalize existing entries; later duplicates win only if the earlier
  // one was empty, so admin-configured scopes are preserved.
  const canonical: RoleScopeConfig = {};
  for (const [rawKey, value] of Object.entries(scopeConfig ?? {})) {
    if (!value) continue;
    const key = canonicalModuleKey(rawKey);
    if (!key) continue;
    const existing = canonical[key];
    // Prefer the more-specific entry (non-'all' or one with selector IDs).
    const incomingSpecific =
      (value.scope && value.scope !== 'all') ||
      (value.sectors?.length ?? 0) > 0 ||
      (value.licensees?.length ?? 0) > 0;
    if (!existing || incomingSpecific) {
      canonical[key] = { ...value };
    }
  }

  // Which canonical modules are represented by the selected permissions?
  const permById = new Map(permissions.map(p => [p.id, p]));
  const selectedModules = new Set<string>();
  for (const id of selectedPermissionIds) {
    const p = permById.get(id);
    if (p) selectedModules.add(canonicalModuleKey(p.module));
  }

  // Drop entries for modules with no selected permission left.
  for (const key of Object.keys(canonical)) {
    if (!selectedModules.has(key)) delete canonical[key];
  }

  // Auto-inject `{ scope: 'all' }` for every selected module missing an entry.
  for (const key of selectedModules) {
    if (!canonical[key]) canonical[key] = { scope: 'all' };
    else if (!canonical[key].scope) canonical[key] = { ...canonical[key], scope: 'all' };
  }

  return canonical;
}

/**
 * Human-readable errors for scope entries that reference a selector but have
 * no IDs picked. The backend `validate_scope_config` blocks these too; this
 * lets the UI surface a clear message before the round-trip.
 */
export function validateScopeSelectors(scopeConfig: RoleScopeConfig): string[] {
  const errors: string[] = [];
  for (const [rawKey, entry] of Object.entries(scopeConfig ?? {})) {
    if (!entry?.scope || entry.scope === 'all') continue;
    const key = canonicalModuleKey(rawKey);
    const cap = getScopeCapability(key);
    const label =
      cap?.label ??
      MODULE_SCOPE_CAPABILITIES.find(c => c.module === key)?.label ??
      key;
    const selector = requiredSelectorFor(key, entry.scope as ScopeKind);
    if (!selector) continue;
    const ids =
      selector === 'sectors' ? entry.sectors ?? [] :
      selector === 'licensees' ? entry.licensees ?? [] : [];
    if (ids.length === 0) {
      errors.push(
        `${label}: choose at least one ${selector === 'sectors' ? 'sector' : 'institution'} for the "${entry.scope}" scope.`
      );
    }
  }
  return errors;
}
