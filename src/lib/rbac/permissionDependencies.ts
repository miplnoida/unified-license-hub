/**
 * Permission dependency map. The authoritative source is
 * `public.permission_dependent_actions` in the database; the server enforces
 * it through the `assert_role_permission_dependencies` trigger and
 * `public.permission_has_dependency(action)`.
 *
 * This TypeScript constant is the offline fallback used by the UI when the
 * DB is unreachable. It is regenerated from the table by
 * `scripts/sync-permission-dependencies.ts` — keep them in lock-step.
 *
 * Rule: every action listed here requires `view` on the same module.
 */
export const DEPENDENT_ACTIONS = [
  'edit',
  'update',
  'create',
  'delete',
  'approve',
  'reject',
  'export',
  'download',
  'upload',
  'import',
  'publish',
  'archive',
  'restore',
  'assign',
  'reassign',
  'bulk',
  'bulk_update',
  'bulk_delete',
  'configure',
  'status_change',
  'workflow_action',
  'dispatch',
  'execute',
  'close',
  'reopen',
  'resolve',
  'escalate',
  'issue',
  'revoke',
  'suspend',
  'renew',
] as const;

export type DependentAction = (typeof DEPENDENT_ACTIONS)[number];

const DEPENDENT_SET = new Set<string>(DEPENDENT_ACTIONS.map((a) => a.toLowerCase()));

/**
 * Normalize a module key the same way the DB does:
 *   lower(regexp_replace(module, '\s+', '_', 'g'))
 * Used everywhere we compare a permission's module to a `view` permission's
 * module, so whitespace/case drift in the catalog cannot bypass the check.
 */
export function normalizeModuleKey(module: string | null | undefined): string {
  return (module ?? '').trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * The DB rule (`public.rbac_save_role`) requires `view` for EVERY non-view
 * permission on the same module — not just the curated `DEPENDENT_ACTIONS`
 * list. Mirror that here so the UI never lets a role reach the server in a
 * state the server will reject.
 *
 * `DEPENDENT_ACTIONS` / `DEPENDENT_SET` are kept as a documented subset for
 * copy in UI messages and back-compat with existing callers.
 */
export function permissionHasDependency(action: string | null | undefined): boolean {
  if (!action) return false;
  const a = action.trim().toLowerCase();
  if (!a) return false;
  return a !== 'view';
}

/** True when `action` is in the curated dependent-action list (edit/create/…). */
export function isCuratedDependentAction(action: string | null | undefined): boolean {
  return !!action && DEPENDENT_SET.has(action.trim().toLowerCase());
}

export interface PermissionLike {
  id: string;
  module: string;
  name: string;
}

export interface DependencyViolation {
  action: string;
  module: string;
  requires: 'view';
  /** Permission id of the offending selection (the dependent action). */
  permissionId: string;
}

export interface DependencyResolution {
  /** Permission ids that would be auto-added when auto-fix is on. */
  addedPermissionIds: string[];
  /** Rule violations (dependent action selected without view). */
  violations: DependencyViolation[];
  /** Selected ids after auto-fix (union of original selection + added). */
  resolvedIds: string[];
}

/**
 * Given the current selection and the full permission catalog, compute the
 * missing prerequisites and their auto-fix.
 */
export function resolveDependencies(
  selectedIds: string[],
  catalog: readonly PermissionLike[],
): DependencyResolution {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const selected = new Set(selectedIds);

  // normalized module key -> id of the "view" permission on that module.
  const viewByModule = new Map<string, string>();
  for (const p of catalog) {
    if (p.name.trim().toLowerCase() === 'view') {
      viewByModule.set(normalizeModuleKey(p.module), p.id);
    }
  }

  const violations: DependencyViolation[] = [];
  const toAdd = new Set<string>();

  for (const id of selectedIds) {
    const p = byId.get(id);
    if (!p) continue;
    if (!permissionHasDependency(p.name)) continue;

    const viewId = viewByModule.get(normalizeModuleKey(p.module));
    if (!viewId) continue; // no view permission catalogued for this module — nothing to require
    if (selected.has(viewId)) continue; // dependency satisfied

    violations.push({
      action: p.name,
      module: p.module,
      requires: 'view',
      permissionId: p.id,
    });
    toAdd.add(viewId);
  }

  return {
    addedPermissionIds: [...toAdd],
    violations,
    resolvedIds: [...new Set([...selectedIds, ...toAdd])],
  };
}

