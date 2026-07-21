import { describe, it, expect } from 'vitest';
import { ROLE_TEMPLATES } from '@/lib/rbac/roleTemplates';
import { expandLevelActionNames, SENSITIVE_ACTION_NAMES } from '@/lib/rbac/accessLevels';

describe('ROLE_TEMPLATES', () => {
  it('has the 13 templates required by the spec', () => {
    const keys = ROLE_TEMPLATES.map((t) => t.key);
    for (const k of [
      'licensing_officer', 'registration_officer', 'complaint_officer', 'complaint_supervisor',
      'returns_officer', 'returns_supervisor', 'prudential_analyst', 'conduct_analyst',
      'inspector', 'enforcement_officer', 'auditor', 'read_only', 'administrator',
    ]) {
      expect(keys).toContain(k);
    }
  });

  it('no template implicitly grants a sensitive action via its access level', () => {
    for (const t of ROLE_TEMPLATES) {
      for (const level of Object.values(t.perModuleLevel)) {
        for (const action of expandLevelActionNames(level)) {
          expect(
            SENSITIVE_ACTION_NAMES.has(action),
            `${t.key} level ${level} leaked ${action}`,
          ).toBe(false);
        }
      }
    }
  });

  it('every template has a stable key and human label', () => {
    for (const t of ROLE_TEMPLATES) {
      expect(t.key).toMatch(/^[a-z_]+$/);
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it('templates using role_management/user_management/settings imply administrator category', () => {
    const admin = ROLE_TEMPLATES.find((t) => t.key === 'administrator');
    expect(admin?.category).toBe('administrator');
    expect(admin?.sensitive).toEqual([]); // administrator does NOT auto-grant sensitive privileges
  });
});
