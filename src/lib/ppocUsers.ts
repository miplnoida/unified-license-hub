import { supabase } from '@/integrations/supabase/client';

/**
 * A user record returned by getEligibleUsersForPpocMapping().
 *
 * IMPORTANT: Inclusion in this list does NOT mean the user is a PPOC.
 * It only means the user is a valid CANDIDATE that an admin may assign as
 * PPOC through `ppoc_entity_mappings`. PPOC rights take effect only once
 * an active mapping (and sector scope) exists.
 *
 * Distinction:
 *  - Primary User: licensee account owner (profiles.licensee_id /
 *    profiles.user_type = 'primary' / role 'licensee_primary'). Has access to
 *    own entity automatically — no PPOC mapping required.
 *  - PPOC: any user with an active row in ppoc_entity_mappings for a licensee.
 *    A Primary User is NOT automatically a PPOC.
 */
export interface EligiblePpocUser {
  id: string;
  full_name: string;
  email: string;
  role: string | null;
  user_type: string | null;
  status: string | null;
  role_labels: string[];
}

/**
 * Values in profiles.user_type that qualify a user as an external/licensee
 * primary contact (PPOC candidate).
 */
const ELIGIBLE_USER_TYPES = ['primary', 'secondary'];

/**
 * Legacy profile.role values that still indicate an external contact user.
 */
const ELIGIBLE_PROFILE_ROLES = ['licensee_primary', 'licensee_secondary', 'primary', 'ppoc', 'entity_contact'];

/**
 * app_role values in user_roles that qualify a user as a PPOC candidate.
 */
const ELIGIBLE_APP_ROLES = ['licensee_primary', 'licensee_secondary'];

const INTERNAL_APP_ROLES = ['super_admin', 'admin', 'supervisor', 'licensing_officer', 'analyst', 'developer'];

/**
 * Tokens (case-insensitive) on roles.system_role / roles.name that mark a
 * dynamic role as a "primary user / licensee contact" role.
 */
const DYNAMIC_ROLE_TOKENS = ['licensee_primary', 'licensee_secondary', 'primary_user', 'primary user', 'licensee primary', 'licensee secondary', 'ppoc', 'entity contact'];

const INTERNAL_ROLE_TOKENS = ['admin', 'super_admin', 'supervisor', 'analyst', 'officer', 'developer', 'regulator'];

/**
 * Load all eligible PPOC users by combining several role/user sources so the
 * dropdown is not bound to a single (and outdated) profiles.role value.
 *
 * Sources merged (de-duplicated by user id):
 *  - profiles.user_type ∈ ELIGIBLE_USER_TYPES
 *  - profiles.role ∈ ELIGIBLE_APP_ROLES (legacy)
 *  - user_roles.role ∈ ELIGIBLE_APP_ROLES
 *  - user_dynamic_roles → roles whose system_role/name matches DYNAMIC_ROLE_TOKENS
 *  - existing PPOC mappings (so existing mappings never disappear from edit)
 *  - includeUserId (current selection while editing) — always included
 */
export async function getEligiblePpocUsers(includeUserId?: string | null): Promise<EligiblePpocUser[]> {
  const candidateIds = new Set<string>();
  const mappedIds = new Set<string>();
  const roleLabelsByUser: Record<string, Set<string>> = {};

  const addLabel = (uid: string, label: string) => {
    if (!roleLabelsByUser[uid]) roleLabelsByUser[uid] = new Set();
    roleLabelsByUser[uid].add(label);
  };

  const [{ data: activeProfiles }, { data: userRoles }, { data: roles }, { data: userDynamicRoles }, { data: mapped }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, user_type, role, status, licensee_id, role_id').eq('status', 'active'),
    supabase.from('user_roles').select('user_id, role'),
    supabase.from('roles').select('id, name, system_role'),
    supabase.from('user_dynamic_roles' as any).select('user_id, role_id'),
    supabase.from('ppoc_entity_mappings' as any).select('ppoc_user_id'),
  ]);

  const rolesById = Object.fromEntries((roles || []).map((role: any) => [role.id, role]));
  const internalIds = new Set<string>();

  (userRoles || []).forEach((row: any) => {
    if (INTERNAL_APP_ROLES.includes(String(row.role))) internalIds.add(row.user_id);
  });

  (activeProfiles || []).forEach((profile: any) => {
    const roleText = String(profile.role || '').toLowerCase();
    if (INTERNAL_APP_ROLES.includes(roleText)) internalIds.add(profile.id);
    const profileRole = profile.role_id ? rolesById[profile.role_id] : null;
    const profileRoleHay = `${profileRole?.system_role || ''} ${profileRole?.name || ''}`.toLowerCase();
    if (INTERNAL_ROLE_TOKENS.some((token) => profileRoleHay.includes(token))) {
      internalIds.add(profile.id);
    }
  });

  (userDynamicRoles || []).forEach((row: any) => {
    const dynamicRole = rolesById[row.role_id];
    const hay = `${dynamicRole?.system_role || ''} ${dynamicRole?.name || ''}`.toLowerCase();
    if (INTERNAL_ROLE_TOKENS.some((token) => hay.includes(token))) {
      internalIds.add(row.user_id);
    }
  });

  let eligibleByProfileRole = 0;
  let eligibleByProfileType = 0;
  let eligibleByUserRoles = 0;
  let eligibleByDynamicRoles = 0;

  // Debug checklist used during diagnosis:
  // - active profile count
  // - eligible by profiles.role
  // - eligible by profiles.user_type
  // - eligible by user_roles
  // - eligible by user_dynamic_roles / profiles.role_id
  // - final merged PPOC user count
  (activeProfiles || []).forEach((profile: any) => {
    if (ELIGIBLE_USER_TYPES.includes(String(profile.user_type))) {
      candidateIds.add(profile.id);
      eligibleByProfileType += 1;
      addLabel(profile.id, String(profile.user_type));
    }
    if (ELIGIBLE_PROFILE_ROLES.includes(String(profile.role))) {
      candidateIds.add(profile.id);
      eligibleByProfileRole += 1;
      addLabel(profile.id, String(profile.role));
    }

    const linkedRole = profile.role_id ? rolesById[profile.role_id] : null;
    const linkedHay = `${linkedRole?.system_role || ''} ${linkedRole?.name || ''}`.toLowerCase();
    if (linkedRole && DYNAMIC_ROLE_TOKENS.some((token) => linkedHay.includes(token))) {
      candidateIds.add(profile.id);
      eligibleByDynamicRoles += 1;
      addLabel(profile.id, linkedRole.name || linkedRole.system_role || 'dynamic_role');
    }
  });

  (userRoles || []).forEach((row: any) => {
    if (ELIGIBLE_APP_ROLES.includes(String(row.role))) {
      candidateIds.add(row.user_id);
      eligibleByUserRoles += 1;
      addLabel(row.user_id, String(row.role));
    }
  });

  (userDynamicRoles || []).forEach((row: any) => {
    const dynamicRole = rolesById[row.role_id];
    const hay = `${dynamicRole?.system_role || ''} ${dynamicRole?.name || ''}`.toLowerCase();
    if (dynamicRole && DYNAMIC_ROLE_TOKENS.some((token) => hay.includes(token))) {
      candidateIds.add(row.user_id);
      eligibleByDynamicRoles += 1;
      addLabel(row.user_id, dynamicRole.name || dynamicRole.system_role || 'dynamic_role');
    }
  });

  (mapped || []).forEach((row: any) => {
    mappedIds.add(row.ppoc_user_id);
    candidateIds.add(row.ppoc_user_id);
    addLabel(row.ppoc_user_id, 'mapped_ppoc');
  });

  if (includeUserId) candidateIds.add(includeUserId);

  if (candidateIds.size === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, user_type, status')
    .in('id', Array.from(candidateIds));

  const list: EligiblePpocUser[] = (profiles || [])
    .filter((profile: any) => {
      const isEditingFallback = includeUserId === profile.id;
      const isMappedFallback = mappedIds.has(profile.id);
      const isActive = profile.status === 'active';
      const isInternal = internalIds.has(profile.id);

      if (isInternal && !isEditingFallback) return false;
      if (!isActive && !isEditingFallback) return false;
      return isEditingFallback || isMappedFallback || candidateIds.has(profile.id);
    })
    .map((profile: any) => ({
      id: profile.id,
      full_name: profile.full_name || '',
      email: profile.email || '',
      role: profile.role || null,
      user_type: profile.user_type || null,
      status: profile.status || null,
      role_labels: Array.from(roleLabelsByUser[profile.id] || []),
    }));

  list.sort((a, b) =>
    (a.full_name || a.email).localeCompare(b.full_name || b.email, undefined, { sensitivity: 'base' })
      || a.email.localeCompare(b.email, undefined, { sensitivity: 'base' }),
  );

  void eligibleByProfileRole;
  void eligibleByProfileType;
  void eligibleByUserRoles;
  void eligibleByDynamicRoles;

  return list;
}
