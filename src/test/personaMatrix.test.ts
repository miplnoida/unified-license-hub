/**
 * Phase 7 — Persona-based end-to-end matrix.
 *
 * For each canonical persona (mapped to a shipped role template), we
 * compose the persona's effective granular permissions from
 *   template.perModuleLevel → expandLevelActionNames()
 *   + template.sensitive
 * and assert the full expected capability matrix across every module
 * the brief requires: view / edit / delete / export / approve / reject /
 * override_workflow / manage_users / issue / configure.
 *
 * This test is the CI oracle for requirement "Persona-based E2E tests
 * for 7 personas across modules".
 */
import { describe, it, expect } from 'vitest';
import {
  expandLevelActionNames,
  SENSITIVE_ACTION_NAMES,
  type AccessLevel,
} from '@/lib/rbac/accessLevels';
import { ROLE_TEMPLATES, type RoleTemplate } from '@/lib/rbac/roleTemplates';

function effectiveActions(tpl: RoleTemplate): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  for (const [mod, level] of Object.entries(tpl.perModuleLevel)) {
    const set = new Set<string>(expandLevelActionNames(level as AccessLevel));
    // Sensitive additions are per-role, not per-module in the template
    // shape. Apply them to every module the template touches (matches
    // the RoleManagement UI's "apply to every listed module" behaviour).
    for (const s of tpl.sensitive) set.add(s.toLowerCase());
    out[mod] = set;
  }
  return out;
}

interface PersonaExpectation {
  templateKey: string;
  label: string;
  /** Actions that MUST be present for each listed module. */
  allow: Record<string, string[]>;
  /** Actions that MUST NOT be present for each listed module. */
  deny: Record<string, string[]>;
  /** Modules the persona has no touch on at all. */
  untouchedModules: string[];
}

/**
 * The seven canonical personas from the brief. Each persona pins a real
 * shipped template and encodes the operational expectations we care
 * about in production.
 */
const PERSONAS: PersonaExpectation[] = [
  {
    templateKey: 'licensing_officer',
    label: 'Licensing Officer',
    allow: {
      application_management: ['view', 'create', 'edit'],
      license_management: ['view', 'create', 'edit'],
      registration_management: ['view'],
      fee_management: ['view'],
    },
    deny: {
      application_management: ['delete', 'export', 'approve', 'override_workflow'],
      license_management: ['delete', 'issue', 'suspend', 'revoke', 'export'],
      registration_management: ['create', 'approve', 'delete'],
    },
    untouchedModules: ['complaint_management', 'returns_management', 'role_management', 'settings'],
  },
  {
    templateKey: 'registration_officer',
    label: 'Registration Officer',
    allow: {
      registration_management: ['view', 'create', 'edit'],
      application_management: ['view'],
    },
    deny: {
      registration_management: ['delete', 'approve', 'export'],
      application_management: ['create', 'edit', 'delete', 'approve'],
    },
    untouchedModules: ['returns_management', 'complaint_management', 'role_management'],
  },
  {
    templateKey: 'complaint_officer',
    label: 'Complaint Officer',
    allow: {
      complaint_management: ['view', 'create', 'edit'],
    },
    deny: {
      complaint_management: ['delete', 'approve', 'reject', 'export', 'override_workflow'],
    },
    untouchedModules: ['returns_management', 'license_management', 'role_management', 'settings'],
  },
  {
    templateKey: 'returns_officer',
    label: 'Returns Officer',
    allow: {
      returns_management: ['view', 'create', 'edit', 'review', 'comment', 'assign', 'escalate'],
    },
    deny: {
      returns_management: ['delete', 'bulk_delete', 'export', 'export_all', 'approve', 'reject', 'override_workflow'],
    },
    untouchedModules: ['complaint_management', 'license_management', 'role_management', 'settings'],
  },
  {
    templateKey: 'returns_supervisor',
    label: 'Returns Supervisor',
    allow: {
      returns_management: ['view', 'create', 'edit', 'review', 'approve', 'reject'],
    },
    deny: {
      returns_management: ['delete', 'bulk_delete', 'export', 'export_all', 'override_workflow', 'manage_users'],
    },
    untouchedModules: ['role_management', 'settings'],
  },
  {
    templateKey: 'auditor',
    label: 'Auditor (Read-Only)',
    allow: {
      application_management: ['view'],
      license_management: ['view'],
      complaint_management: ['view'],
      returns_management: ['view'],
      prudential_supervision: ['view'],
      report_management: ['view'],
    },
    deny: {
      application_management: ['create', 'edit', 'delete', 'approve', 'export'],
      license_management: ['create', 'edit', 'delete', 'issue', 'suspend', 'revoke'],
      complaint_management: ['create', 'edit', 'delete', 'approve', 'reject'],
      returns_management: ['create', 'edit', 'delete', 'approve', 'reject', 'export'],
    },
    untouchedModules: ['role_management', 'user_management', 'settings'],
  },
  {
    templateKey: 'administrator',
    label: 'Administrator',
    allow: {
      user_management: ['view', 'create', 'edit'],
      role_management: ['view', 'create', 'edit'],
      settings: ['view', 'configure'],
      report_management: ['view', 'create', 'edit'],
    },
    deny: {
      // Even the Administrator template ships without pre-ticked sensitive
      // privileges; admins must add them deliberately. This is Phase 6's
      // guarantee, verified here at persona level.
      user_management: ['delete', 'manage_users'],
      role_management: ['delete', 'manage_roles', 'assign_permissions'],
      settings: ['manage_catalog', 'override_workflow'],
      report_management: ['export_all', 'bulk_export'],
    },
    untouchedModules: ['complaint_management', 'returns_management', 'license_management'],
  },
  {
    templateKey: 'prudential_analyst',
    label: 'Prudential Analyst',
    allow: {
      prudential_supervision: ['view', 'create', 'edit'],
      returns_management: ['view'],
    },
    deny: {
      prudential_supervision: ['delete', 'approve', 'override_workflow', 'export'],
      returns_management: ['create', 'edit', 'approve', 'reject', 'export'],
    },
    untouchedModules: ['role_management', 'settings', 'user_management'],
  },
  {
    templateKey: 'conduct_analyst',
    label: 'Market Conduct Analyst',
    allow: {
      complaint_management: ['view', 'review', 'comment', 'assign', 'escalate'],
    },
    deny: {
      complaint_management: ['delete', 'approve', 'reject', 'export', 'override_workflow'],
    },
    untouchedModules: ['role_management', 'settings', 'returns_management'],
  },
  {
    templateKey: 'inspector',
    label: 'Inspector',
    allow: {
      license_management: ['view'],
      application_management: ['view'],
    },
    deny: {
      license_management: ['create', 'edit', 'issue', 'suspend', 'revoke', 'export'],
      application_management: ['create', 'edit', 'delete', 'approve', 'reject'],
    },
    untouchedModules: ['role_management', 'settings', 'user_management', 'returns_management'],
  },
  {
    templateKey: 'enforcement_officer',
    label: 'Enforcement Officer',
    allow: {
      license_management: ['view', 'create', 'edit', 'review', 'approve', 'reject'],
      complaint_management: ['view', 'review', 'comment'],
    },
    deny: {
      license_management: ['delete', 'issue', 'suspend', 'revoke', 'export', 'override_workflow'],
      complaint_management: ['delete', 'approve', 'reject', 'export'],
    },
    untouchedModules: ['role_management', 'settings', 'user_management'],
  },
  {
    templateKey: 'read_only',
    label: 'Read-only User',
    allow: {
      application_management: ['view'],
      license_management: ['view'],
      complaint_management: ['view'],
      returns_management: ['view'],
    },
    deny: {
      application_management: ['create', 'edit', 'approve', 'export'],
      returns_management: ['create', 'edit', 'approve', 'export'],
    },
    untouchedModules: ['role_management', 'settings', 'user_management', 'prudential_supervision'],
  },
  {
    templateKey: 'complaint_supervisor',
    label: 'Complaint Supervisor',
    allow: {
      complaint_management: ['view', 'review', 'approve', 'reject', 'comment', 'assign'],
    },
    deny: {
      complaint_management: ['delete', 'export', 'export_all', 'override_workflow', 'bulk_delete'],
    },
    untouchedModules: ['role_management', 'settings', 'returns_management'],
  },
];

describe('Phase 7 — Persona capability matrix', () => {
  for (const persona of PERSONAS) {
    describe(persona.label, () => {
      const tpl = ROLE_TEMPLATES.find((t) => t.key === persona.templateKey);
      if (!tpl) {
        it(`template ${persona.templateKey} exists`, () => {
          expect(tpl, `template ${persona.templateKey} missing`).toBeDefined();
        });
        return;
      }
      const effective = effectiveActions(tpl);

      for (const [mod, actions] of Object.entries(persona.allow)) {
        for (const action of actions) {
          it(`ALLOW ${mod}.${action}`, () => {
            expect(
              effective[mod]?.has(action),
              `${persona.label} should have ${mod}.${action}. Actual: [${[...(effective[mod] ?? [])].join(', ')}]`,
            ).toBe(true);
          });
        }
      }

      for (const [mod, actions] of Object.entries(persona.deny)) {
        for (const action of actions) {
          it(`DENY ${mod}.${action}`, () => {
            expect(
              effective[mod]?.has(action) ?? false,
              `${persona.label} must NOT have ${mod}.${action}. Actual: [${[...(effective[mod] ?? [])].join(', ')}]`,
            ).toBe(false);
          });
        }
      }

      for (const mod of persona.untouchedModules) {
        it(`UNTOUCHED ${mod}`, () => {
          expect(
            effective[mod],
            `${persona.label} unexpectedly has access to ${mod}: [${[...(effective[mod] ?? [])].join(', ')}]`,
          ).toBeUndefined();
        });
      }

      it('never silently grants sensitive privileges beyond the template.sensitive list', () => {
        const declared = new Set(tpl.sensitive.map((s) => s.toLowerCase()));
        for (const [mod, actions] of Object.entries(effective)) {
          for (const a of actions) {
            if (!SENSITIVE_ACTION_NAMES.has(a)) continue;
            expect(
              declared.has(a),
              `${persona.label} module ${mod} silently grants sensitive "${a}" not in template.sensitive`,
            ).toBe(true);
          }
        }
      });
    });
  }

  it('all 7 personas resolve to a real, shipped template', () => {
    for (const p of PERSONAS) {
      expect(
        ROLE_TEMPLATES.find((t) => t.key === p.templateKey),
        `Persona ${p.label} pins missing template ${p.templateKey}`,
      ).toBeDefined();
    }
    expect(PERSONAS.length).toBeGreaterThanOrEqual(7);
  });
});
