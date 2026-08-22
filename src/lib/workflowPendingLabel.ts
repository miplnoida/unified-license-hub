/**
 * Shared "who is this step pending with" display logic.
 *
 * Presentation only — it never consults the authorization oracle result. The
 * sentence is derived strictly from the workflow step's own configuration so
 * viewers see the real configured approver(s) rather than a generic system role.
 *
 * Resolution order:
 *   1. specific users  -> approver_config.user_ids
 *   2. dynamic roles   -> approver_role_id + approver_config.role_ids
 *   3. legacy role     -> approver_role
 */

export interface PendingApproverStep {
  approver_type?: string | null;
  approver_role?: string | null;
  approver_role_id?: string | null;
  approver_config?: { user_ids?: string[]; role_ids?: string[] } | null;
}

export interface PendingLabelMaps {
  /** dynamic role id -> role name */
  dynamicRolesMap?: Record<string, string>;
  /** user id -> display name */
  userNamesMap?: Record<string, string>;
  /** legacy system role -> human label */
  legacyRoleLabels?: Record<string, string>;
}

export interface PendingStepMessage {
  names: string[];
  mode: 'users' | 'roles' | 'none';
  /** Full user-facing sentence. */
  text: string;
}

const UNRESOLVED_ROLE = 'Assigned Reviewer';
const UNRESOLVED_USER = 'Assigned Approver';

/** Names of everyone/every role the step is configured for, in config order. */
export function pendingApproverNames(
  step: PendingApproverStep | null | undefined,
  maps: PendingLabelMaps = {},
): { names: string[]; mode: 'users' | 'roles' | 'none' } {
  const cfg = (step?.approver_config || {}) as { user_ids?: string[]; role_ids?: string[] };
  const userIds = (cfg.user_ids || []).filter(Boolean);
  const isSpecificUsers = (step?.approver_type ?? '') === 'specific_users' || userIds.length > 0;

  if (isSpecificUsers && userIds.length > 0) {
    const names = userIds.map((id) => maps.userNamesMap?.[id] || UNRESOLVED_USER);
    return { names, mode: 'users' };
  }

  const roleIds = Array.from(
    new Set([step?.approver_role_id, ...(cfg.role_ids || [])].filter(Boolean) as string[]),
  );
  if (roleIds.length > 0) {
    const names = roleIds.map((id) => maps.dynamicRolesMap?.[id] || UNRESOLVED_ROLE);
    return { names, mode: 'roles' };
  }

  const legacy = step?.approver_role;
  if (legacy) {
    return { names: [maps.legacyRoleLabels?.[legacy] || legacy], mode: 'roles' };
  }

  return { names: [], mode: 'none' };
}

/** Full pending sentence for a step. */
export function pendingStepMessage(
  step: PendingApproverStep | null | undefined,
  maps: PendingLabelMaps = {},
): PendingStepMessage {
  const { names, mode } = pendingApproverNames(step, maps);
  if (mode === 'none' || names.length === 0) {
    return { names: [], mode: 'none', text: 'This step is pending review.' };
  }
  const joined = names.join(' / ');
  const text =
    mode === 'users'
      ? `This step is pending with ${joined}.`
      : `This step is pending at ${joined} level.`;
  return { names, mode, text };
}
