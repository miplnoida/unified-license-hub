/**
 * Static permission dependency map — kept in one place so client and server
 * share one rule set. The server enforces the same map via the
 * `assert_role_permission_dependencies` trigger installed by migration
 * `role_permission_dependency_trigger`.
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

export function permissionHasDependency(action: string | null | undefined): boolean {
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

  // module -> id of the "view" permission on that module (if any).
  const viewByModule = new Map<string, string>();
  for (const p of catalog) {
    if (p.name.trim().toLowerCase() === 'view') {
      viewByModule.set(p.module, p.id);
    }
  }

  const violations: DependencyViolation[] = [];
  const toAdd = new Set<string>();

  for (const id of selectedIds) {
    const p = byId.get(id);
    if (!p) continue;
    if (!permissionHasDependency(p.name)) continue;

    const viewId = viewByModule.get(p.module);
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
