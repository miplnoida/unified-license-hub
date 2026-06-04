import { AppRole, ROLE_LABELS } from '@/types/platform';

export interface EffectiveRoleInput {
  baseRole?: string | null;
  userType?: string | null;
  isPpoc?: boolean;
  actingAs?: 'primary' | 'ppoc';
  hasPrimaryUserAccess?: boolean;
}

/**
 * Returns the human-readable role label to show in the UI.
 * - 'PPOC' when actingAs is 'ppoc' or user has PPOC mappings without primary context
 * - 'Primary User' when actingAs is 'primary' and user has direct licensee access
 * - Otherwise the humanized base role
 */
export function getEffectiveUserRoleLabel(input: EffectiveRoleInput): string {
  const { baseRole, userType, isPpoc, actingAs, hasPrimaryUserAccess } = input;

  if (actingAs === 'ppoc') return 'PPOC';
  if (actingAs === 'primary' && hasPrimaryUserAccess) return 'Primary User';
  if (isPpoc) return 'PPOC';

  if (baseRole && ROLE_LABELS[baseRole as AppRole]) {
    return ROLE_LABELS[baseRole as AppRole];
  }
  if (String(userType || '').toLowerCase() === 'primary') return 'Primary User';
  if (String(userType || '').toLowerCase() === 'secondary') return 'Secondary User';
  if (baseRole) {
    return baseRole
      .split(/[_\s-]+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return 'User';
}
