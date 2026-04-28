/**
 * Shared permission registry.
 *
 * Single source of truth that links each permission *module* to:
 *   - the sidebar menu items it unlocks
 *   - the route paths it unlocks
 *   - the available actions (view / create / edit / approve / reject)
 *   - human-friendly labels and descriptions
 *
 * This is consumed by the Role Management UI so admins can see — for every
 * module — exactly which menus and routes a permission grants, and by the
 * sidebar/route guards so menu visibility and route access stay in sync.
 */

import type { PermissionModule } from '@/lib/permissionModules';
import { mainNavSections, type NavItem } from '@/config/navigation';

export type PermissionAction = 'view' | 'create' | 'edit' | 'approve' | 'reject';

export interface ModuleRegistryEntry {
  module: PermissionModule;
  label: string;
  description: string;
  /** All actions that exist for this module in the `permissions` table. */
  actions: PermissionAction[];
  /** Sidebar menu labels this module unlocks. */
  menus: string[];
  /** Route prefixes this module unlocks. */
  routes: string[];
}

export const ACTION_LABELS: Record<PermissionAction, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  approve: 'Approve',
  reject: 'Reject',
};

export const ACTION_DESCRIPTIONS: Record<PermissionAction, string> = {
  view: 'See and open records in this module. Required for any other action to be useful.',
  create: 'Create new records in this module.',
  edit: 'Modify existing records in this module.',
  approve: 'Approve / accept records in this module.',
  reject: 'Reject / deny records in this module.',
};

/**
 * Module-level metadata. Action lists must match what exists in the
 * `permissions` table; if you add a new action there, add it here too.
 */
export const MODULE_REGISTRY: Record<PermissionModule, Omit<ModuleRegistryEntry, 'menus' | 'routes'>> = {
  application_management: {
    module: 'application_management',
    label: 'Application Management',
    description: 'Review, process and approve license applications.',
    actions: ['view', 'create', 'edit', 'approve', 'reject'],
  },
  license_management: {
    module: 'license_management',
    label: 'License Management',
    description: 'Manage issued licenses and licensee entities.',
    actions: ['view', 'create', 'edit', 'approve'],
  },
  returns_management: {
    module: 'returns_management',
    label: 'Returns Management',
    description: 'Configure and review periodic regulatory returns.',
    actions: ['view', 'create', 'edit', 'approve'],
  },
  complaint_management: {
    module: 'complaint_management',
    label: 'Complaint Handling',
    description: 'Handle complaints filed against licensees.',
    actions: ['view', 'create', 'edit'],
  },
  user_management: {
    module: 'user_management',
    label: 'User Management',
    description: 'Manage internal employees and licensee portal users.',
    actions: ['view', 'create', 'edit'],
  },
  role_management: {
    module: 'role_management',
    label: 'Role Management',
    description: 'Create roles and assign permissions.',
    actions: ['view', 'create', 'edit'],
  },
  report_management: {
    module: 'report_management',
    label: 'Reports',
    description: 'View analytics dashboards and run reports.',
    actions: ['view', 'create'],
  },
  fee_management: {
    module: 'fee_management',
    label: 'Fee Management',
    description: 'Configure application and license fees.',
    actions: ['view', 'create', 'edit'],
  },
  form_management: {
    module: 'form_management',
    label: 'Form Management',
    description: 'Build and version application & registration forms.',
    actions: ['view', 'create', 'edit'],
  },
  workflow_management: {
    module: 'workflow_management',
    label: 'Workflow Management',
    description: 'Configure approval workflows and delegation rules.',
    actions: ['view', 'create', 'edit'],
  },
  settings: {
    module: 'settings',
    label: 'System Settings',
    description: 'Manage system configuration, branding, master data and audit logs.',
    actions: ['view', 'edit'],
  },
};

/** Collect every leaf nav item (with href) flat. */
function flattenNav(): NavItem[] {
  const out: NavItem[] = [];
  for (const section of mainNavSections) {
    for (const item of section.items) {
      if (item.children?.length) {
        for (const child of item.children) out.push(child);
      } else {
        out.push(item);
      }
    }
  }
  return out;
}

/** Build module → menus / routes maps by inspecting navigation config. */
function buildModuleAccessMap() {
  const menus: Record<string, string[]> = {};
  const routes: Record<string, string[]> = {};
  for (const item of flattenNav()) {
    if (!item.module) continue;
    menus[item.module] ??= [];
    routes[item.module] ??= [];
    if (!menus[item.module].includes(item.label)) menus[item.module].push(item.label);
    if (item.href && !routes[item.module].includes(item.href)) routes[item.module].push(item.href);
  }
  return { menus, routes };
}

const { menus: MENU_MAP, routes: ROUTE_MAP } = buildModuleAccessMap();

/** Full registry entry including dynamically-resolved menus/routes. */
export function getModuleEntry(module: PermissionModule): ModuleRegistryEntry {
  const base = MODULE_REGISTRY[module];
  return {
    ...base,
    menus: MENU_MAP[module] || [],
    routes: ROUTE_MAP[module] || [],
  };
}

export function getAllModuleEntries(): ModuleRegistryEntry[] {
  return (Object.keys(MODULE_REGISTRY) as PermissionModule[]).map(getModuleEntry);
}

/**
 * Validate a set of selected action keys for a single module and return
 * actionable warnings (e.g. "Create selected without View").
 */
export function validateModuleSelection(
  module: PermissionModule,
  selectedActions: PermissionAction[],
): string[] {
  const warnings: string[] = [];
  const set = new Set(selectedActions);
  const hasView = set.has('view');
  const otherActions = selectedActions.filter(a => a !== 'view');
  if (otherActions.length > 0 && !hasView) {
    warnings.push(
      `${MODULE_REGISTRY[module].label}: "View" is recommended when ${otherActions
        .map(a => ACTION_LABELS[a])
        .join(', ')} ${otherActions.length === 1 ? 'is' : 'are'} selected — users may not see records they can act on.`,
    );
  }
  return warnings;
}
