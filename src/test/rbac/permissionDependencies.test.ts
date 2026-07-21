import { describe, it, expect } from 'vitest';
import {
  permissionHasDependency,
  resolveDependencies,
  DEPENDENT_ACTIONS,
} from '@/lib/rbac/permissionDependencies';

const CATALOG = [
  { id: 'v-app', module: 'application_management', name: 'view' },
  { id: 'e-app', module: 'application_management', name: 'edit' },
  { id: 'a-app', module: 'application_management', name: 'approve' },
  { id: 'v-lic', module: 'license_management', name: 'view' },
  { id: 'c-lic', module: 'license_management', name: 'create' },
  // Module without any catalogued `view` — should be a no-op.
  { id: 'e-orphan', module: 'orphan_module', name: 'edit' },
];

describe('permissionDependencies', () => {
  it('recognises every documented dependent action', () => {
    for (const a of DEPENDENT_ACTIONS) {
      expect(permissionHasDependency(a)).toBe(true);
    }
    expect(permissionHasDependency('view')).toBe(false);
    expect(permissionHasDependency('')).toBe(false);
    expect(permissionHasDependency(null)).toBe(false);
  });

  it('auto-adds `view` when a dependent action is selected without it', () => {
    const res = resolveDependencies(['e-app'], CATALOG);
    expect(res.addedPermissionIds).toEqual(['v-app']);
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0]).toMatchObject({
      module: 'application_management',
      action: 'edit',
      requires: 'view',
    });
    expect(res.resolvedIds.sort()).toEqual(['e-app', 'v-app']);
  });

  it('does not add duplicates when view is already selected', () => {
    const res = resolveDependencies(['v-app', 'e-app', 'a-app'], CATALOG);
    expect(res.addedPermissionIds).toEqual([]);
    expect(res.violations).toEqual([]);
    expect(res.resolvedIds.sort()).toEqual(['a-app', 'e-app', 'v-app']);
  });

  it('handles multiple modules simultaneously', () => {
    const res = resolveDependencies(['e-app', 'c-lic'], CATALOG);
    expect(res.addedPermissionIds.sort()).toEqual(['v-app', 'v-lic']);
    expect(res.violations).toHaveLength(2);
  });

  it('skips modules that have no `view` permission in the catalog', () => {
    const res = resolveDependencies(['e-orphan'], CATALOG);
    expect(res.addedPermissionIds).toEqual([]);
    expect(res.violations).toEqual([]);
    expect(res.resolvedIds).toEqual(['e-orphan']);
  });

  it('ignores unknown permission ids', () => {
    const res = resolveDependencies(['does-not-exist'], CATALOG);
    expect(res.addedPermissionIds).toEqual([]);
    expect(res.violations).toEqual([]);
  });
});
