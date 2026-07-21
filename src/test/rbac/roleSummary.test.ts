import { describe, it, expect } from 'vitest';
import { buildRoleSummary } from '@/lib/rbac/roleSummary';
import type { PermissionLike } from '@/lib/rbac/roleClassification';

const p = (id: string, module: string, name: string): PermissionLike => ({ id, module, name });

const CATALOG: PermissionLike[] = [
  p('a1', 'application_management', 'view'),
  p('a2', 'application_management', 'create'),
  p('a3', 'application_management', 'edit'),
  p('a4', 'application_management', 'delete'),
  p('a5', 'application_management', 'approve'),
  p('a6', 'application_management', 'reject'),
];

describe('buildRoleSummary', () => {
  it('reports "Can View/Create/Edit" and "Cannot Approve/Reject/Delete"', () => {
    const s = buildRoleSummary(['a1', 'a2', 'a3'], CATALOG);
    expect(s.can.some((x) => x.startsWith('View'))).toBe(true);
    expect(s.can.some((x) => x.startsWith('Create'))).toBe(true);
    expect(s.can.some((x) => x.startsWith('Edit'))).toBe(true);
    expect(s.cannot.some((x) => x.startsWith('Approve'))).toBe(true);
    expect(s.cannot.some((x) => x.startsWith('Reject'))).toBe(true);
  });

  it('uses plain-language module labels — no raw permission keys', () => {
    const s = buildRoleSummary(['a1'], CATALOG);
    for (const line of [...s.can, ...s.cannot]) {
      expect(line).not.toMatch(/application_management/);
      expect(line).toContain('Application Management');
    }
  });

  it('empty permission set yields empty "can" list', () => {
    const s = buildRoleSummary([], CATALOG);
    expect(s.can).toEqual([]);
  });
});
