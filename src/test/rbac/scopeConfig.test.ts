import { describe, it, expect } from 'vitest';
import { normalizeScopeConfig, validateScopeSelectors, canonicalModuleKey } from '@/lib/rbac/scopeConfig';
import type { Permission } from '@/hooks/useRoles';

const perms: Permission[] = [
  { id: 'p-returns-view', name: 'view', module: 'returns_management', description: null },
  { id: 'p-returns-edit', name: 'edit', module: 'returns_management', description: null },
  { id: 'p-role-view', name: 'view', module: 'role_management', description: null },
  { id: 'p-settings-view', name: 'view', module: 'settings', description: null },
  { id: 'p-lic-view', name: 'view', module: 'licensee_management', description: null },
  // Alias variant to prove canonicalization.
  { id: 'p-alias', name: 'view', module: 'Role Management', description: null },
];

describe('canonicalModuleKey', () => {
  it('matches the DB canonicalization', () => {
    expect(canonicalModuleKey('Role Management')).toBe('role_management');
    expect(canonicalModuleKey('  Returns   Management ')).toBe('_returns_management_');
    expect(canonicalModuleKey('returns_management')).toBe('returns_management');
  });
});

describe('normalizeScopeConfig', () => {
  it('auto-injects {scope:"all"} for a scoped module the admin did not configure', () => {
    const out = normalizeScopeConfig({
      scopeConfig: {},
      selectedPermissionIds: ['p-returns-view'],
      permissions: perms,
    });
    expect(out.returns_management).toEqual({ scope: 'all' });
  });

  it('auto-injects {scope:"all"} for scopeless modules (role_management, settings)', () => {
    const out = normalizeScopeConfig({
      scopeConfig: {},
      selectedPermissionIds: ['p-role-view', 'p-settings-view'],
      permissions: perms,
    });
    expect(out.role_management).toEqual({ scope: 'all' });
    expect(out.settings).toEqual({ scope: 'all' });
  });

  it('gives each module its own entry across multi-module selection', () => {
    const out = normalizeScopeConfig({
      scopeConfig: {},
      selectedPermissionIds: ['p-returns-view', 'p-lic-view', 'p-role-view'],
      permissions: perms,
    });
    expect(Object.keys(out).sort()).toEqual(['licensee_management', 'returns_management', 'role_management']);
  });

  it('rekeys legacy alias entries to the canonical module key without duplicates', () => {
    const out = normalizeScopeConfig({
      scopeConfig: { 'Role Management': { scope: 'all' } } as any,
      selectedPermissionIds: ['p-alias'],
      permissions: perms,
    });
    expect(out.role_management).toEqual({ scope: 'all' });
    expect((out as any)['Role Management']).toBeUndefined();
  });

  it('removes an entry when the last permission for that module is removed', () => {
    const out = normalizeScopeConfig({
      scopeConfig: {
        returns_management: { scope: 'sector', sectors: ['s1'] },
        licensee_management: { scope: 'all' },
      },
      selectedPermissionIds: ['p-lic-view'],
      permissions: perms,
    });
    expect(out.returns_management).toBeUndefined();
    expect(out.licensee_management).toEqual({ scope: 'all' });
  });

  it('preserves admin-configured scope + selector IDs on a metadata-only edit', () => {
    const existing = {
      returns_management: { scope: 'sector' as const, sectors: ['sec-a', 'sec-b'] },
    };
    const out = normalizeScopeConfig({
      scopeConfig: existing,
      selectedPermissionIds: ['p-returns-view', 'p-returns-edit'],
      permissions: perms,
    });
    expect(out.returns_management).toEqual(existing.returns_management);
  });
});

describe('validateScopeSelectors', () => {
  it('flags sector scope with no sector IDs', () => {
    const errs = validateScopeSelectors({
      returns_management: { scope: 'sector', sectors: [] },
    });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/sector/i);
  });

  it('flags institution scope with no licensee IDs', () => {
    const errs = validateScopeSelectors({
      licensee_management: { scope: 'institution', licensees: [] },
    });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/institution/i);
  });

  it('passes when scope is all or selectors have IDs', () => {
    expect(validateScopeSelectors({
      returns_management: { scope: 'all' },
      licensee_management: { scope: 'institution', licensees: ['l-1'] },
    })).toEqual([]);
  });
});
