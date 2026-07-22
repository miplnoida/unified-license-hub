/**
 * Business-facing access-level model for Role Management.
 *
 * Backend permissions remain granular (module.action). This file layers a
 * small, business-friendly vocabulary on top:
 *
 *   No Access | View Only | Contributor | Reviewer | Approver | Manager
 *
 * plus a separate registry of **Sensitive Privileges** (delete, publish,
 * override workflow, manage users/roles, configure settings, export
 * confidential data, bulk actions, issue/suspend/revoke) which are NEVER
 * granted implicitly by choosing a level — administrators must tick them
 * on purpose.
 *
 * This module is UI-only. It doesn't change RLS/RPC/Edge/storage. It only
 * decides which granular action names to include when an admin picks
 * "Contributor for Form Management".
 *
 * The mapping intentionally uses action *name* patterns (lowercased) rather
 * than hard-coded permission IDs, so the same rules work across every
 * module even as new granular actions land in the enforced catalogue.
 */

export type AccessLevel = 'none' | 'view' | 'contributor' | 'reviewer' | 'approver' | 'manager';

export const ACCESS_LEVEL_ORDER: AccessLevel[] = ['none', 'view', 'contributor', 'reviewer', 'approver', 'manager'];

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  none: 'No Access',
  view: 'View Only',
  contributor: 'Contributor',
  reviewer: 'Reviewer',
  approver: 'Approver',
  manager: 'Manager',
};

export const ACCESS_LEVEL_DESCRIPTIONS: Record<AccessLevel, string> = {
  none: 'Cannot see the menu, open pages, or call APIs for this area.',
  view: 'Can open pages and view records. Cannot create, edit or take action.',
  contributor: 'Can view, create and edit records. Cannot review, approve, or delete.',
  reviewer: 'Can view and review records, add comments, and return for correction.',
  approver: 'Can view, review, and approve or reject records in the workflow.',
  manager: 'Full day-to-day operational control for this area. Sensitive privileges remain separate.',
};

/**
 * Action-name patterns each level implies, in addition to the ones from
 * lower levels. Matching is case-insensitive and by *exact* action name
 * against the enforced catalogue. If an action doesn't exist for a
 * particular module, it's silently skipped — that's the whole point.
 */
const LEVEL_ADDITIONAL_ACTIONS: Record<AccessLevel, string[]> = {
  none: [],
  view: ['view', 'view_status', 'search', 'list', 'download_own', 'view_history'],
  contributor: ['create', 'edit', 'submit', 'upload_documents', 'respond_rfi', 'save_draft', 'clone', 'duplicate'],
  reviewer: ['review', 'comment', 'add_comment', 'add_legal_notes', 'return_for_correction', 'request_information', 'assign', 'reassign', 'escalate'],
  approver: ['approve', 'reject', 'conditional_approve', 'recommend_conditions', 'recommend_approval'],
  manager: ['close', 'reopen', 'configure', 'reset', 'import'],
};

/**
 * Action-name patterns that are ALWAYS treated as Sensitive Privileges —
 * NEVER auto-included by any level. Admins must enable them deliberately.
 * These map to the same granular keys the DB enforces; the UI simply
 * pulls them into a dedicated "Sensitive Privileges" panel with warning
 * styling and a plain-language description.
 */
export const SENSITIVE_ACTION_NAMES: ReadonlySet<string> = new Set([
  'delete',
  'bulk_delete',
  'bulk_update',
  'publish',
  'unpublish',
  'change_status',
  'override_workflow',
  'override',
  'suspend',
  'revoke',
  'issue',
  'issue_digital_license',
  'export',
  'export_all',
  'bulk_export',
  'export_confidential',
  'download',
  'download_all',
  'download_bulk',
  'print_bulk',
  'view_all_entities',
  'manage_users',
  'manage_roles',
  'manage_catalog',
  'assign_permissions',
  'reset',
  'configure_workflows',
  'access_audit',
  'purge',
  'delete_evidence',
]);

/**
 * Business-friendly labels for sensitive action names. Falls back to a
 * humanised version of the key when not listed.
 */
export const SENSITIVE_ACTION_LABELS: Record<string, string> = {
  delete: 'Delete records',
  bulk_delete: 'Bulk delete records',
  bulk_update: 'Bulk update records',
  publish: 'Publish',
  unpublish: 'Unpublish',
  change_status: 'Change status',
  override_workflow: 'Override workflow',
  override: 'Override rules',
  suspend: 'Suspend licences',
  revoke: 'Revoke licences',
  issue: 'Issue licences',
  issue_digital_license: 'Issue digital licence',
  export: 'Export data',
  export_all: 'Export all records',
  bulk_export: 'Bulk export',
  export_confidential: 'Export confidential data',
  download: 'Download data',
  download_all: 'Download all records',
  download_bulk: 'Bulk download',
  print_bulk: 'Bulk print',
  view_all_entities: 'View all institutions (bypass assignments)',
  manage_users: 'Manage users',
  manage_roles: 'Manage roles',
  manage_catalog: 'Manage permission catalogue',
  assign_permissions: 'Assign permissions to roles',
  reset: 'Reset to defaults',
  configure_workflows: 'Configure workflows',
  access_audit: 'Access audit information',
  purge: 'Purge records',
  delete_evidence: 'Delete evidence',
};

/**
 * Expand an access level for a given module into the concrete action names
 * that should be selected. Non-matching actions are omitted — the caller
 * intersects with what actually exists in the enforced catalogue.
 *
 * "manager" cumulatively includes every lower level's actions.
 * Sensitive actions are NEVER included regardless of level.
 */
export function expandLevelActionNames(level: AccessLevel): string[] {
  if (level === 'none') return [];
  const idx = ACCESS_LEVEL_ORDER.indexOf(level);
  const acc: string[] = [];
  for (let i = 1; i <= idx; i++) {
    const lvl = ACCESS_LEVEL_ORDER[i] as AccessLevel;
    for (const a of LEVEL_ADDITIONAL_ACTIONS[lvl]) {
      const key = a.toLowerCase();
      if (SENSITIVE_ACTION_NAMES.has(key)) continue;
      if (!acc.includes(key)) acc.push(key);
    }
  }
  return acc;
}

/**
 * Classify a set of selected action names for a single module into the
 * best-fit access level. If the selection matches a level exactly (modulo
 * sensitive actions and actions the module doesn't offer) we return that
 * level; otherwise we return 'custom'. Sensitive actions are reported
 * separately and never affect the level.
 */
export function classifyModuleSelection(
  selectedNames: string[],
  availableNames: string[],
): { level: AccessLevel | 'custom'; sensitive: string[] } {
  const selected = new Set(selectedNames.map((n) => n.toLowerCase()));
  const available = new Set(availableNames.map((n) => n.toLowerCase()));
  const sensitive: string[] = [];
  const nonSensitiveSelected = new Set<string>();
  for (const n of selected) {
    if (SENSITIVE_ACTION_NAMES.has(n)) sensitive.push(n);
    else nonSensitiveSelected.add(n);
  }

  if (nonSensitiveSelected.size === 0) {
    return { level: 'none', sensitive };
  }

  for (const level of ACCESS_LEVEL_ORDER) {
    if (level === 'none') continue;
    const expected = new Set(
      expandLevelActionNames(level).filter((n) => available.has(n)),
    );
    // Levels only make sense if they cover at least one available action.
    if (expected.size === 0) continue;
    // Exact match (ignoring extras)
    const sameSize = expected.size === nonSensitiveSelected.size;
    if (!sameSize) continue;
    let allPresent = true;
    for (const n of expected) {
      if (!nonSensitiveSelected.has(n)) { allPresent = false; break; }
    }
    if (allPresent) return { level, sensitive };
  }
  return { level: 'custom', sensitive };
}

/**
 * Levels that make sense for a given module, computed from the actions
 * actually available. If a level would resolve to no new actions we omit
 * it (e.g. Approver hidden from a module that has no approve/reject).
 */
export function meaningfulLevelsForModule(availableNames: string[]): AccessLevel[] {
  const available = new Set(availableNames.map((n) => n.toLowerCase()));
  const kept: AccessLevel[] = ['none'];
  let prevSize = 0;
  for (const level of ACCESS_LEVEL_ORDER) {
    if (level === 'none') continue;
    const expanded = expandLevelActionNames(level).filter((n) => available.has(n));
    if (expanded.length > prevSize) {
      kept.push(level);
      prevSize = expanded.length;
    }
  }
  return kept;
}

/**
 * Split a list of action-name → id entries into "regular" and "sensitive".
 */
export function partitionSensitive<T extends { name: string }>(actions: T[]): { regular: T[]; sensitive: T[] } {
  const regular: T[] = []; const sensitive: T[] = [];
  for (const a of actions) {
    if (SENSITIVE_ACTION_NAMES.has(a.name.toLowerCase())) sensitive.push(a);
    else regular.push(a);
  }
  return { regular, sensitive };
}

export function sensitiveActionLabel(name: string): string {
  const key = name.toLowerCase();
  if (SENSITIVE_ACTION_LABELS[key]) return SENSITIVE_ACTION_LABELS[key];
  return name.split('_').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : '')).join(' ');
}
