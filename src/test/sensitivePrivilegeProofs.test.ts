/**
 * Phase 6 — Sensitive Privilege Proofs.
 *
 * Guarantees that no standard business role template silently grants
 * sensitive privileges. Sensitive privileges (delete, publish, export,
 * override_workflow, manage_users, etc.) must ONLY be present when an
 * admin explicitly adds them to `template.sensitive`.
 *
 * These tests are the CI oracle for requirement "Sensitive privileges
 * are never leaked by access levels or templates".
 */
import { describe, it, expect } from 'vitest';
import {
  ACCESS_LEVEL_ORDER,
  SENSITIVE_ACTION_NAMES,
  expandLevelActionNames,
  type AccessLevel,
} from '@/lib/rbac/accessLevels';
import { ROLE_TEMPLATES } from '@/lib/rbac/roleTemplates';

describe('Sensitive privileges — access levels', () => {
  it('no access level expands to any sensitive action name', () => {
    for (const level of ACCESS_LEVEL_ORDER) {
      const expanded = expandLevelActionNames(level as AccessLevel);
      const leaked = expanded.filter((n) => SENSITIVE_ACTION_NAMES.has(n));
      expect(
        leaked,
        `Level "${level}" leaked sensitive actions: ${leaked.join(', ')}`,
      ).toEqual([]);
    }
  });

  it('manager level never includes delete, export, or workflow overrides', () => {
    const managerActions = new Set(expandLevelActionNames('manager'));
    for (const forbidden of [
      'delete',
      'bulk_delete',
      'export',
      'export_all',
      'bulk_export',
      'download_all',
      'override_workflow',
      'override',
      'suspend',
      'revoke',
      'manage_users',
      'manage_roles',
      'assign_permissions',
    ]) {
      expect(
        managerActions.has(forbidden),
        `manager level unexpectedly includes "${forbidden}"`,
      ).toBe(false);
    }
  });
});

describe('Sensitive privileges — role templates', () => {
  it('every declared template.sensitive entry is a known sensitive action', () => {
    for (const tpl of ROLE_TEMPLATES) {
      for (const s of tpl.sensitive) {
        expect(
          SENSITIVE_ACTION_NAMES.has(s.toLowerCase()),
          `Template "${tpl.key}" declares "${s}" as sensitive, but it is not in SENSITIVE_ACTION_NAMES`,
        ).toBe(true);
      }
    }
  });

  it('operational and read_only templates never opt into destructive sensitive privileges', () => {
    const destructive = new Set([
      'delete',
      'bulk_delete',
      'purge',
      'delete_evidence',
      'override_workflow',
      'override',
      'suspend',
      'revoke',
      'manage_users',
      'manage_roles',
      'assign_permissions',
    ]);
    for (const tpl of ROLE_TEMPLATES) {
      if (tpl.category !== 'operational' && tpl.category !== 'read_only') continue;
      const bad = tpl.sensitive.filter((s) => destructive.has(s.toLowerCase()));
      expect(
        bad,
        `Template "${tpl.key}" (${tpl.category}) declares destructive sensitive: ${bad.join(', ')}`,
      ).toEqual([]);
    }
  });

  it('administrator template does NOT pre-tick sensitive privileges', () => {
    const admin = ROLE_TEMPLATES.find((t) => t.key === 'administrator');
    expect(admin, 'administrator template missing').toBeDefined();
    expect(
      admin!.sensitive,
      'administrator template must not pre-tick sensitive privileges — admins must add them deliberately',
    ).toEqual([]);
  });

  it('no template silently grants "view_all_entities" (assignment bypass)', () => {
    for (const tpl of ROLE_TEMPLATES) {
      expect(
        tpl.sensitive.map((s) => s.toLowerCase()).includes('view_all_entities'),
        `Template "${tpl.key}" pre-ticks view_all_entities — this must always be a deliberate admin choice`,
      ).toBe(false);
    }
  });

  it('templates only use scope kinds registered in the capability registry', async () => {
    const { isScopeOptionAllowed, getScopeCapability } = await import('@/lib/rbac/scopeCapabilities');
    for (const tpl of ROLE_TEMPLATES) {
      for (const [moduleName, scope] of Object.entries(tpl.scope)) {
        if (scope === 'all' || scope === 'own' || scope === 'assigned') continue;
        // Only assert for modules that have a registered capability entry.
        if (!getScopeCapability(moduleName)) continue;
        expect(
          isScopeOptionAllowed(moduleName, scope as never),
          `Template "${tpl.key}" uses scope "${scope}" on module "${moduleName}" which is not registered`,
        ).toBe(true);
      }
    }
  });
});
