/**
 * Server-mirrored server-side validators for RBAC role writes.
 *
 * The DB RPC `rbac_save_role` is the authority; this module holds the same
 * rules in TS so the client can preview validation before hitting the server.
 * Any change here must be reflected in the migration in
 * supabase/migrations/20260721170000_rbac_transactional_saves.sql.
 */
import { DEPENDENT_ACTIONS, permissionHasDependency } from './permissionDependencies';
import { SENSITIVE_ACTION_NAMES } from './accessLevels';

export interface Permission { id: string; module: string; name: string }

export interface RoleValidationIssue {
  code: 'missing_view' | 'missing_edit_for_publish' | 'missing_view_for_export'
      | 'dependency_violation' | 'orphan_permission' | 'sensitive_without_manager'
      | 'empty_role';
  message: string;
  permissionId?: string;
}

const norm = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, '_');

/** Business-worded validator for a resolved role permission set. */
export function validateRolePermissions(
  permissionIds: string[],
  catalog: Permission[],
  opts: { category?: string | null } = {},
): RoleValidationIssue[] {
  const issues: RoleValidationIssue[] = [];
  if (permissionIds.length === 0) {
    issues.push({ code: 'empty_role', message: 'A role must include at least one permission.' });
    return issues;
  }

  const byId = new Map(catalog.map(p => [p.id, { module: norm(p.module), name: norm(p.name) }]));
  const selected = permissionIds.map(id => byId.get(id)).filter(Boolean) as { module: string; name: string }[];

  // 1. Every non-view action requires View for its module.
  const modulesWithView = new Set(selected.filter(p => p.name === 'view').map(p => p.module));
  for (const p of selected) {
    if (p.name !== 'view' && !modulesWithView.has(p.module)) {
      issues.push({
        code: 'missing_view',
        message: `"${p.name}" on ${p.module.replace(/_/g, ' ')} requires View — enable View first.`,
      });
    }
  }

  // 2. Publish requires Edit.
  const edits = new Set(selected.filter(p => p.name === 'edit').map(p => p.module));
  for (const p of selected.filter(x => x.name === 'publish')) {
    if (!edits.has(p.module)) {
      issues.push({
        code: 'missing_edit_for_publish',
        message: `Publish on ${p.module.replace(/_/g, ' ')} requires Edit.`,
      });
    }
  }

  // 3. Export / Download requires View.
  for (const p of selected.filter(x => x.name === 'export' || x.name === 'download')) {
    if (!modulesWithView.has(p.module)) {
      issues.push({
        code: 'missing_view_for_export',
        message: `${p.name} on ${p.module.replace(/_/g, ' ')} requires View.`,
      });
    }
  }

  // 4. Dependency map (from catalog).
  const selectedKeys = new Set(selected.map(p => `${p.module}.${p.name}`));
  for (const [key, deps] of Object.entries(permissionDependencies)) {
    if (!selectedKeys.has(key)) continue;
    for (const dep of deps) {
      if (!selectedKeys.has(dep)) {
        issues.push({
          code: 'dependency_violation',
          message: `${key} depends on ${dep} — enable ${dep} as well.`,
        });
      }
    }
  }

  // 5. Sensitive privileges must not appear in categories below manager/admin.
  const category = opts.category;
  const nonSensitiveCategories = new Set(['read_only', 'operational', 'reviewer']);
  if (category && nonSensitiveCategories.has(category)) {
    for (const p of selected) {
      if ((SENSITIVE_ACTIONS as readonly SensitiveAction[]).includes(p.name as SensitiveAction)) {
        issues.push({
          code: 'sensitive_without_manager',
          message: `A ${category} role cannot hold the sensitive privilege "${p.name}" on ${p.module.replace(/_/g, ' ')}.`,
        });
      }
    }
  }

  return issues;
}
