import { AppRole, INTERNAL_ROLES, ROLE_LABELS } from '@/types/platform';

export interface EffectiveRoleInput {
  baseRole?: string | null;
  userType?: string | null;
  isPpoc?: boolean;
  actingAs?: 'primary' | 'ppoc';
  resolvedLicenseeId?: string | null;
  hasPrimaryUserAccess?: boolean;
  ppocLoading?: boolean;
}

export interface EffectivePortalContext {
  loading: boolean;
  audience: 'internal' | 'licensee' | 'pre_licensee' | 'applicant' | null;
  effectiveRole: string | null;
  isInternal: boolean;
  isLicensee: boolean;
  isPreLicensee: boolean;
  isApplicant: boolean;
}

const INTERNAL_ROLE_SET = new Set<AppRole>(INTERNAL_ROLES);
const LICENSEE_ROLE_SET = new Set<AppRole>(['licensee_primary', 'licensee_secondary']);

function humanizeRole(role?: string | null): string {
  if (!role) return 'User';
  return role
    .split(/[_\s-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getBaseRoleLabel(baseRole?: string | null, userType?: string | null): string {
  if (baseRole && ROLE_LABELS[baseRole as AppRole]) {
    return ROLE_LABELS[baseRole as AppRole];
  }

  const normalizedUserType = String(userType || '').toLowerCase();
  if (normalizedUserType === 'primary') return 'Primary User';
  if (normalizedUserType === 'secondary') return 'Secondary User';
  if (normalizedUserType === 'contact') return 'Contact User';

  return humanizeRole(baseRole);
}

export function getEffectivePortalContext(input: EffectiveRoleInput): EffectivePortalContext {
  const {
    baseRole,
    userType,
    isPpoc,
    actingAs,
    resolvedLicenseeId,
    hasPrimaryUserAccess,
    ppocLoading,
  } = input;

  const normalizedBaseRole = (baseRole || '').toLowerCase() as AppRole | '';

  if (ppocLoading) {
    return {
      loading: true,
      audience: null,
      effectiveRole: null,
      isInternal: false,
      isLicensee: false,
      isPreLicensee: false,
      isApplicant: false,
    };
  }

  if (normalizedBaseRole && INTERNAL_ROLE_SET.has(normalizedBaseRole)) {
    return {
      loading: false,
      audience: 'internal',
      effectiveRole: getBaseRoleLabel(baseRole, userType),
      isInternal: true,
      isLicensee: false,
      isPreLicensee: false,
      isApplicant: false,
    };
  }

  if (isPpoc && resolvedLicenseeId) {
    return {
      loading: false,
      audience: 'licensee',
      effectiveRole:
        actingAs === 'ppoc'
          ? 'PPOC'
          : hasPrimaryUserAccess
            ? 'Primary User'
            : getBaseRoleLabel(baseRole, userType),
      isInternal: false,
      isLicensee: true,
      isPreLicensee: false,
      isApplicant: false,
    };
  }

  if (hasPrimaryUserAccess || resolvedLicenseeId || (normalizedBaseRole && LICENSEE_ROLE_SET.has(normalizedBaseRole))) {
    const isSecondaryUser = normalizedBaseRole === 'licensee_secondary' || String(userType || '').toLowerCase() === 'secondary';

    return {
      loading: false,
      audience: 'licensee',
      effectiveRole: hasPrimaryUserAccess
        ? 'Primary User'
        : isSecondaryUser
          ? 'Secondary User'
          : getBaseRoleLabel(baseRole, userType),
      isInternal: false,
      isLicensee: true,
      isPreLicensee: false,
      isApplicant: false,
    };
  }

  if (normalizedBaseRole === 'pre_licensee') {
    return {
      loading: false,
      audience: 'pre_licensee',
      effectiveRole: getBaseRoleLabel(baseRole, userType),
      isInternal: false,
      isLicensee: false,
      isPreLicensee: true,
      isApplicant: false,
    };
  }

  return {
    loading: false,
    audience: 'applicant',
    effectiveRole: getBaseRoleLabel(baseRole, userType),
    isInternal: false,
    isLicensee: false,
    isPreLicensee: false,
    isApplicant: true,
  };
}

/**
 * Returns the human-readable role label to show in the UI.
 */
export function getEffectiveUserRoleLabel(input: EffectiveRoleInput): string {
  const portalContext = getEffectivePortalContext(input);
  if (portalContext.loading) return 'Loading access…';
  return portalContext.effectiveRole || getBaseRoleLabel(input.baseRole, input.userType);
}
