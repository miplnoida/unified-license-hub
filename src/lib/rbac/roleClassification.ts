/**
 * Role classification — figure out, for an existing role's raw permission
 * set, which business "Access Level" applies to each module, which
 * sensitive privileges are enabled, and which overall business category
 * best fits.
 *
 * This module is pure UI metadata. It never mutates permissions.
 */

import {
  classifyModuleSelection,
  SENSITIVE_ACTION_NAMES,
  type AccessLevel,
} from './accessLevels';

export type RoleCategory =
  | 'operational'
  | 'reviewer'
  | 'approver'
  | 'supervisor'
  | 'administrator'
  | 'read_only'
  | 'custom';

export const ROLE_CATEGORY_LABELS: Record<RoleCategory, string> = {
  operational: 'Operational User',
  reviewer: 'Reviewer',
  approver: 'Approver',
  supervisor: 'Supervisor',
  administrator: 'Administrator',
  read_only: 'Read Only',
  custom: 'Custom',
};

export const ROLE_CATEGORY_DESCRIPTIONS: Record<RoleCategory, string> = {
  operational: 'Day-to-day operational staff who create and edit records.',
  reviewer: 'Staff who review submissions and return items for correction.',
  approver: 'Staff authorised to approve or reject records.',
  supervisor: 'Senior staff who manage teams and unblock day-to-day operations.',
  administrator: 'System administrators managing configuration.',
  read_only: 'Staff who can only view records — no create, edit, or workflow actions.',
  custom: 'Custom mix of permissions that does not match a standard business role.',
};

export interface PermissionLike {
  id: string;
  module: string;
  name: string;
}

export interface ModuleLevelClassification {
  moduleKey: string;
  level: AccessLevel | 'custom';
  sensitive: string[];
  actionNames: string[];
}

export interface RoleClassification {
  perModule: ModuleLevelClassification[];
  sensitive: string[];
  category: RoleCategory;
  isCustom: boolean;
  reason?: string;
}

/**
 * Group permissions selected on a role by module and classify each into an
 * AccessLevel. `availableByModule` is the full catalogue so we know what
 * actions could have been selected.
 */
export function classifyRole(
  selectedPermissionIds: string[],
  allPermissions: PermissionLike[],
): RoleClassification {
  const selectedIds = new Set(selectedPermissionIds);
  const byModuleSelected = new Map<string, string[]>();
  const byModuleAvailable = new Map<string, string[]>();
  const sensitive: string[] = [];

  for (const p of allPermissions) {
    const mod = p.module;
    const name = p.name.toLowerCase();
    (byModuleAvailable.get(mod) ?? byModuleAvailable.set(mod, []).get(mod)!).push(name);
    if (selectedIds.has(p.id)) {
      (byModuleSelected.get(mod) ?? byModuleSelected.set(mod, []).get(mod)!).push(name);
      if (SENSITIVE_ACTION_NAMES.has(name)) sensitive.push(`${mod}.${name}`);
    }
  }

  const perModule: ModuleLevelClassification[] = [];
  for (const [moduleKey, actionNames] of byModuleSelected) {
    const available = byModuleAvailable.get(moduleKey) ?? [];
    const { level, sensitive: modSensitive } = classifyModuleSelection(actionNames, available);
    perModule.push({ moduleKey, level, sensitive: modSensitive, actionNames });
  }

  // Global classification: category is the "shape" that best fits the
  // union of module-level classifications.
  const hasAny = perModule.length > 0;
  const anyCustom = perModule.some((m) => m.level === 'custom');
  const levels = new Set(perModule.map((m) => m.level).filter((l) => l !== 'custom' && l !== 'none'));

  let category: RoleCategory;
  let isCustom = false;
  let reason: string | undefined;

  if (!hasAny) {
    category = 'read_only';
    reason = 'No permissions assigned.';
  } else if (anyCustom) {
    category = 'custom';
    isCustom = true;
    reason = 'One or more modules use a permission mix that does not match a business access level.';
  } else if (levels.size === 1) {
    const only = [...levels][0];
    if (only === 'view') category = 'read_only';
    else if (only === 'contributor') category = 'operational';
    else if (only === 'reviewer') category = 'reviewer';
    else if (only === 'approver') category = 'approver';
    else if (only === 'manager') category = 'supervisor';
    else category = 'custom';
  } else if (levels.has('manager')) {
    category = 'supervisor';
  } else if (levels.has('approver')) {
    category = 'approver';
  } else if (levels.has('reviewer')) {
    category = 'reviewer';
  } else if (levels.has('contributor')) {
    category = 'operational';
  } else {
    category = 'read_only';
  }

  // Administrator override — any role touching role/user/settings management
  // with more than view is administrator-shaped regardless of other modules.
  const adminModules = new Set(['role_management', 'user_management', 'settings']);
  const hasAdminManage = perModule.some(
    (m) => adminModules.has(m.moduleKey) && ['contributor', 'reviewer', 'approver', 'manager'].includes(m.level as string),
  );
  if (hasAdminManage && !isCustom) category = 'administrator';

  return { perModule, sensitive, category, isCustom, reason };
}
