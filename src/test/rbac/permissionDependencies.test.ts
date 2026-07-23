import { describe, it, expect } from 'vitest';
import {
  permissionHasDependency,
  resolveDependencies,
  cascadeRemoveDependents,
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

  it('treats every non-view action (including custom ones) as requiring view', () => {
    // "add_legal_notes" is not in the curated DEPENDENT_ACTIONS list, but the
    // DB still requires view — the resolver must mirror that.
    const catalog = [
      { id: 'v-lic', module: 'licensing', name: 'view' },
      { id: 'aln-lic', module: 'licensing', name: 'add_legal_notes' },
    ];
    const res = resolveDependencies(['aln-lic'], catalog);
    expect(res.addedPermissionIds).toEqual(['v-lic']);
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0].action).toBe('add_legal_notes');
    expect(res.resolvedIds.sort()).toEqual(['aln-lic', 'v-lic']);
  });

  it('adds view only once for multiple non-view actions on the same module', () => {
    const catalog = [
      { id: 'v-lic', module: 'licensing', name: 'view' },
      { id: 'aln', module: 'licensing', name: 'add_legal_notes' },
      { id: 'fc', module: 'licensing', name: 'flag_concern' },
      { id: 'rc', module: 'licensing', name: 'recommend_conditions' },
    ];
    const res = resolveDependencies(['aln', 'fc', 'rc'], catalog);
    expect(res.addedPermissionIds).toEqual(['v-lic']);
    expect(res.violations).toHaveLength(3);
  });

  it('normalizes module keys (whitespace / case) when matching view', () => {
    const catalog = [
      { id: 'v', module: 'License Management', name: 'view' },
      { id: 'mla', module: 'license_management', name: 'manage_license_actions' },
    ];
    const res = resolveDependencies(['mla'], catalog);
    expect(res.addedPermissionIds).toEqual(['v']);
    expect(res.violations).toHaveLength(1);
  });
});

describe('cascadeRemoveDependents', () => {
  const CAT = [
    { id: 'v-app', module: 'application_management', name: 'view' },
    { id: 'e-app', module: 'application_management', name: 'edit' },
    { id: 'a-app', module: 'application_management', name: 'approve' },
    { id: 'v-lic', module: 'license_management', name: 'view' },
    { id: 'c-lic', module: 'license_management', name: 'create' },
  ];

  it('drops dependents when view is absent on a module', () => {
    const res = cascadeRemoveDependents(['e-app', 'a-app'], CAT);
    expect(res.removedIds.sort()).toEqual(['a-app', 'e-app']);
    expect(res.resolvedIds).toEqual([]);
    expect(res.affectedModules).toEqual(['application_management']);
  });

  it('leaves the module untouched when view is present', () => {
    const res = cascadeRemoveDependents(['v-app', 'e-app', 'a-app'], CAT);
    expect(res.removedIds).toEqual([]);
    expect(res.resolvedIds.sort()).toEqual(['a-app', 'e-app', 'v-app']);
    expect(res.affectedModules).toEqual([]);
  });

  it('preserves permissions on unrelated modules', () => {
    const res = cascadeRemoveDependents(['e-app', 'v-lic', 'c-lic'], CAT);
    expect(res.removedIds).toEqual(['e-app']);
    expect(res.resolvedIds.sort()).toEqual(['c-lic', 'v-lic']);
  });

  it('normalizes module key when view is on a different-cased module label', () => {
    const catalog = [
      { id: 'v', module: 'License Management', name: 'view' },
      { id: 'mla', module: 'license_management', name: 'manage_license_actions' },
    ];
    const res = cascadeRemoveDependents(['v', 'mla'], catalog);
    expect(res.removedIds).toEqual([]);
    expect(res.resolvedIds.sort()).toEqual(['mla', 'v']);
  });

  it('keeps view even when nothing depends on it', () => {
    const res = cascadeRemoveDependents(['v-app'], CAT);
    expect(res.removedIds).toEqual([]);
    expect(res.resolvedIds).toEqual(['v-app']);
  });
});


