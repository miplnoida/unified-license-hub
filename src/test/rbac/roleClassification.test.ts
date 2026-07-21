import { describe, it, expect } from 'vitest';
import { classifyRole, type PermissionLike } from '@/lib/rbac/roleClassification';

const p = (id: string, module: string, name: string): PermissionLike => ({ id, module, name });

const CATALOG: PermissionLike[] = [
  p('a1', 'application_management', 'view'),
  p('a2', 'application_management', 'create'),
  p('a3', 'application_management', 'edit'),
  p('a4', 'application_management', 'delete'),
  p('a5', 'application_management', 'approve'),
  p('a6', 'application_management', 'reject'),
  p('r1', 'role_management', 'view'),
  p('r2', 'role_management', 'create'),
  p('r3', 'role_management', 'edit'),
  p('r4', 'role_management', 'delete'),
  p('r5', 'role_management', 'assign_permissions'),
  p('s1', 'settings', 'view'),
  p('s2', 'settings', 'edit'),
];

describe('classifyRole', () => {
  it('empty selection classifies as read_only (nothing to do)', () => {
    const c = classifyRole([], CATALOG);
    expect(c.category).toBe('read_only');
    expect(c.perModule).toEqual([]);
  });

  it('view-only classifies as read_only', () => {
    const c = classifyRole(['a1'], CATALOG);
    expect(c.category).toBe('read_only');
    expect(c.perModule[0].level).toBe('view');
  });

  it('view+create+edit classifies as operational', () => {
    const c = classifyRole(['a1', 'a2', 'a3'], CATALOG);
    expect(c.category).toBe('operational');
    expect(c.perModule[0].level).toBe('contributor');
  });

  it('view+review+approve+reject classifies as approver', () => {
    const catalog = [
      ...CATALOG,
      p('a7', 'application_management', 'review'),
    ];
    const c = classifyRole(['a1', 'a5', 'a6', 'a7'], catalog);
    expect(c.category).toBe('approver');
  });

  it('managing role_management upgrades to administrator', () => {
    const c = classifyRole(['a1', 'r1', 'r2', 'r3'], CATALOG);
    expect(c.category).toBe('administrator');
  });

  it('sensitive delete does not affect category', () => {
    const c = classifyRole(['a1', 'a2', 'a3', 'a4'], CATALOG);
    expect(c.category).toBe('operational');
    expect(c.sensitive).toContain('application_management.delete');
  });

  it('unusual mix flagged as custom', () => {
    // approve alone with no view/review is malformed → custom
    const c = classifyRole(['a5'], CATALOG);
    expect(c.category).toBe('custom');
    expect(c.isCustom).toBe(true);
  });
});
