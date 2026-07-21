/**
 * Business role templates. Each template describes intent using the
 * business access-level vocabulary — not raw permission keys.
 *
 * Templates are prefills only. Administrators may modify a template's
 * output freely before saving; templates never mutate on save.
 */

import type { AccessLevel } from './accessLevels';
import type { RoleCategory } from './roleClassification';

export type RecordScope =
  | 'own'
  | 'assigned'
  | 'assigned_institutions'
  | 'team'
  | 'department'
  | 'sector'
  | 'all';

export const RECORD_SCOPE_LABELS: Record<RecordScope, string> = {
  own: 'Own records only',
  assigned: 'Records assigned to me',
  assigned_institutions: 'Assigned institutions',
  team: 'My team',
  department: 'My department',
  sector: 'My sector',
  all: 'All institutions',
};

export const RECORD_SCOPE_DESCRIPTIONS: Record<RecordScope, string> = {
  own: 'Only records this user created or owns.',
  assigned: 'Only records explicitly assigned to this user.',
  assigned_institutions: 'Records belonging to institutions this user is mapped to as regulator.',
  team: 'Records handled by this user\'s team.',
  department: 'Records handled by this user\'s department.',
  sector: 'Records belonging to the user\'s regulatory sector.',
  all: 'Every record in the system (requires sensitive privilege).',
};

export interface RoleTemplate {
  key: string;
  label: string;
  category: RoleCategory;
  description: string;
  roleType: 'internal' | 'external';
  /** Per-module access level. Modules not listed get 'none'. */
  perModuleLevel: Record<string, AccessLevel>;
  /** Sensitive privileges to prefill (action names). */
  sensitive: string[];
  /** Default record scope for each module. */
  scope: Record<string, RecordScope>;
}

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: 'licensing_officer',
    label: 'Licensing Officer',
    category: 'operational',
    description: 'Processes licence applications and issued licences day-to-day.',
    roleType: 'internal',
    perModuleLevel: {
      application_management: 'contributor',
      license_management: 'contributor',
      registration_management: 'view',
      fee_management: 'view',
    },
    sensitive: [],
    scope: {
      application_management: 'assigned',
      license_management: 'assigned',
    },
  },
  {
    key: 'registration_officer',
    label: 'Registration Officer',
    category: 'operational',
    description: 'Handles licensee registration submissions.',
    roleType: 'internal',
    perModuleLevel: {
      registration_management: 'contributor',
      application_management: 'view',
    },
    sensitive: [],
    scope: { registration_management: 'assigned' },
  },
  {
    key: 'complaint_officer',
    label: 'Complaint Officer',
    category: 'operational',
    description: 'Intake and initial handling of complaints.',
    roleType: 'internal',
    perModuleLevel: { complaint_management: 'contributor' },
    sensitive: [],
    scope: { complaint_management: 'assigned' },
  },
  {
    key: 'complaint_supervisor',
    label: 'Complaint Supervisor',
    category: 'approver',
    description: 'Reviews and closes complaint cases.',
    roleType: 'internal',
    perModuleLevel: { complaint_management: 'approver' },
    sensitive: [],
    scope: { complaint_management: 'team' },
  },
  {
    key: 'returns_officer',
    label: 'Returns Officer',
    category: 'operational',
    description: 'Reviews submitted returns for assigned institutions.',
    roleType: 'internal',
    perModuleLevel: { returns_management: 'reviewer' },
    sensitive: [],
    scope: { returns_management: 'assigned_institutions' },
  },
  {
    key: 'returns_supervisor',
    label: 'Returns Supervisor',
    category: 'approver',
    description: 'Signs off on returns and manages returns queue.',
    roleType: 'internal',
    perModuleLevel: { returns_management: 'approver' },
    sensitive: [],
    scope: { returns_management: 'sector' },
  },
  {
    key: 'prudential_analyst',
    label: 'Prudential Analyst',
    category: 'operational',
    description: 'Runs prudential assessments and actions.',
    roleType: 'internal',
    perModuleLevel: {
      prudential_supervision: 'contributor',
      returns_management: 'view',
    },
    sensitive: [],
    scope: { prudential_supervision: 'assigned_institutions' },
  },
  {
    key: 'conduct_analyst',
    label: 'Conduct Analyst',
    category: 'operational',
    description: 'Market conduct monitoring and case work.',
    roleType: 'internal',
    perModuleLevel: {
      complaint_management: 'reviewer',
    },
    sensitive: [],
    scope: { complaint_management: 'assigned_institutions' },
  },
  {
    key: 'inspector',
    label: 'Inspector',
    category: 'operational',
    description: 'On-site inspections and findings.',
    roleType: 'internal',
    perModuleLevel: {
      license_management: 'view',
      application_management: 'view',
    },
    sensitive: [],
    scope: { license_management: 'assigned_institutions' },
  },
  {
    key: 'enforcement_officer',
    label: 'Enforcement Officer',
    category: 'approver',
    description: 'Enforcement actions on licensees.',
    roleType: 'internal',
    perModuleLevel: {
      license_management: 'approver',
      complaint_management: 'reviewer',
    },
    sensitive: [],
    scope: { license_management: 'assigned_institutions' },
  },
  {
    key: 'auditor',
    label: 'Auditor',
    category: 'read_only',
    description: 'Read-only access for audit purposes.',
    roleType: 'internal',
    perModuleLevel: {
      application_management: 'view',
      license_management: 'view',
      registration_management: 'view',
      returns_management: 'view',
      complaint_management: 'view',
      fit_and_proper: 'view',
      prudential_supervision: 'view',
      report_management: 'view',
    },
    sensitive: ['access_audit'],
    scope: {},
  },
  {
    key: 'read_only',
    label: 'Read Only',
    category: 'read_only',
    description: 'View-only access to operational modules.',
    roleType: 'internal',
    perModuleLevel: {
      application_management: 'view',
      license_management: 'view',
      registration_management: 'view',
      returns_management: 'view',
      complaint_management: 'view',
    },
    sensitive: [],
    scope: {},
  },
  {
    key: 'administrator',
    label: 'Administrator',
    category: 'administrator',
    description: 'System administrator managing users, roles and settings. Sensitive privileges still require explicit selection.',
    roleType: 'internal',
    perModuleLevel: {
      user_management: 'manager',
      role_management: 'manager',
      settings: 'manager',
      report_management: 'manager',
    },
    sensitive: [],
    scope: {},
  },
];

export function findTemplate(key: string): RoleTemplate | undefined {
  return ROLE_TEMPLATES.find((t) => t.key === key);
}
