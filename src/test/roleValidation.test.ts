import { describe, it, expect } from 'vitest';
import { validateRolePermissions } from '@/lib/rbac/roleValidation';
import { MODULE_SCOPE_CAPABILITIES, isScopeOptionAllowed } from '@/lib/rbac/scopeCapabilities';

const catalog = [
  { id: 'v-app',    module: 'application_management', name: 'view' },
  { id: 'e-app',    module: 'application_management', name: 'edit' },
  { id: 'p-app',    module: 'application_management', name: 'publish' },
  { id: 'x-app',    module: 'application_management', name: 'export' },
  { id: 'v-rep',    module: 'reports_management',    name: 'view' },
  { id: 'x-rep',    module: 'reports_management',    name: 'export' },
];

describe('roleValidation.validateRolePermissions', () => {
  it('flags empty roles', () => {
    const issues = validateRolePermissions([], catalog);
    expect(issues.some(i => i.code === 'empty_role')).toBe(true);
  });
  it('flags non-view action without view', () => {
    const issues = validateRolePermissions(['e-app'], catalog);
    expect(issues.some(i => i.code === 'missing_view')).toBe(true);
  });
  it('allows edit when view is present', () => {
    const issues = validateRolePermissions(['v-app', 'e-app'], catalog);
    expect(issues.some(i => i.code === 'missing_view')).toBe(false);
  });
  it('flags publish without edit', () => {
    const issues = validateRolePermissions(['v-app', 'p-app'], catalog);
    expect(issues.some(i => i.code === 'missing_edit_for_publish')).toBe(true);
  });
  it('flags publish on read_only category as sensitive', () => {
    const issues = validateRolePermissions(['v-app', 'e-app', 'p-app'], catalog, { category: 'read_only' });
    expect(issues.some(i => i.code === 'sensitive_without_manager')).toBe(true);
  });
});

describe('rbac scope capability registry', () => {
  it('every module lists all + at least one narrow option or is scopeless', () => {
    for (const cap of MODULE_SCOPE_CAPABILITIES) {
      expect(cap.options.some(o => o.kind === 'all')).toBe(true);
      if (!cap.scopeless) {
        expect(cap.options.length).toBeGreaterThan(1);
      }
    }
  });
  it('unknown module returns only "all"', () => {
    expect(isScopeOptionAllowed('__unknown__', 'all')).toBe(true);
    expect(isScopeOptionAllowed('__unknown__', 'sector')).toBe(false);
  });
  it('narrow options declare a selector when they need one', () => {
    const cap = MODULE_SCOPE_CAPABILITIES.find(c => c.module === 'returns_management')!;
    const sector = cap.options.find(o => o.kind === 'sector')!;
    expect(sector.selector).toBe('sectors');
    const institution = cap.options.find(o => o.kind === 'institution')!;
    expect(institution.selector).toBe('licensees');
  });
});
