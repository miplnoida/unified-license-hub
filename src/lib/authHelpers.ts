import { supabase } from '@/integrations/supabase/client';
import { AppRole, PlatformUser, ROLE_HIERARCHY } from '@/types/platform';
import type { Database } from '@/integrations/supabase/types';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type PreLicenseUserRow = Database['public']['Tables']['pre_license_users']['Row'];

/**
 * Resolve the highest-priority role for a user from user_roles table.
 * Returns 'applicant' as safe default on failure or no rows.
 */
export async function resolveUserRole(userId: string): Promise<AppRole> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);

  if (error) {
    console.error('[Auth] Failed to fetch user_roles:', error.message);
    return 'applicant';
  }

  if (!data || data.length === 0) {
    console.warn('[Auth] No role found for user, defaulting to applicant');
    return 'applicant';
  }

  const roles = data.map(r => r.role as AppRole);
  for (const r of ROLE_HIERARCHY) {
    if (roles.includes(r)) return r;
  }
  return 'applicant';
}

/**
 * Resolve any active inbound delegation for the given user. Returns the
 * highest-priority delegated role (per ROLE_HIERARCHY) plus metadata about
 * the delegator and validity window. Both `effective_from` and
 * `effective_until` are treated as inclusive (the form stores them as
 * start-of-day and end-of-day respectively).
 *
 * Returns null when no active delegation applies right now.
 */
export async function resolveActiveDelegation(userId: string): Promise<{
  role: AppRole;
  fromUserId: string;
  fromUserName?: string;
  effectiveFrom: string;
  effectiveUntil: string;
} | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('delegation_rules')
    .select('id, target_role, delegate_from_user_id, effective_from, effective_until, is_active')
    .eq('delegate_to_user_id', userId)
    .eq('is_active', true);

  if (error) {
    console.error('[Auth] Failed to load delegations:', error.message);
    return null;
  }

  const active = (data || []).filter((r: any) => {
    if (!r.delegate_from_user_id) return false;
    const fromOk = !r.effective_from || r.effective_from <= nowIso;
    const untilOk = !r.effective_until || r.effective_until >= nowIso;
    return fromOk && untilOk;
  });
  if (active.length === 0) return null;

  // For each active delegation, resolve the delegator's actual highest role
  // (target_role is a hint but the delegator may have stronger roles like super_admin).
  const enriched: Array<{ role: AppRole; rule: any }> = [];
  for (const rule of active as any[]) {
    let role = rule.target_role as AppRole;
    if (rule.delegate_from_user_id) {
      try {
        const fromRole = await resolveUserRole(rule.delegate_from_user_id);
        // Pick the stronger of target_role hint vs the delegator's actual role
        const fromIdx = ROLE_HIERARCHY.indexOf(fromRole);
        const tgtIdx = ROLE_HIERARCHY.indexOf(role);
        if (fromIdx >= 0 && (tgtIdx < 0 || fromIdx < tgtIdx)) role = fromRole;
      } catch (e) {
        console.warn('[Auth] Could not resolve delegator role:', e);
      }
    }
    enriched.push({ role, rule });
  }

  // Pick the highest-priority role across all active delegations
  enriched.sort((a, b) => ROLE_HIERARCHY.indexOf(a.role) - ROLE_HIERARCHY.indexOf(b.role));
  const winner = enriched[0];

  // Resolve delegator name
  let fromName: string | undefined;
  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', winner.rule.delegate_from_user_id)
      .maybeSingle();
    fromName = (prof as any)?.full_name;
  } catch {
    /* ignore */
  }

  return {
    role: winner.role,
    fromUserId: winner.rule.delegate_from_user_id,
    fromUserName: fromName,
    effectiveFrom: winner.rule.effective_from,
    effectiveUntil: winner.rule.effective_until,
  };
}

/**
 * Build a PlatformUser from a pre_license_users row.
 */
function mapPreLicenseeProfile(userId: string, email: string, profile: PreLicenseUserRow): PlatformUser {
  return {
    id: userId,
    email,
    fullName: profile.full_name || email,
    role: 'pre_licensee',
    entityName: profile.entity_name || undefined,
    status: profile.status || 'active',
    isPreLicensee: true,
    forcePasswordChange: false,
    twoFactorEnabled: (profile as any).two_factor_enabled ?? false,
  };
}

/**
 * Build a PlatformUser from a profiles row.
 */
function mapSystemProfile(userId: string, email: string, role: AppRole, profile: ProfileRow, dynamicRoleName?: string): PlatformUser {
  return {
    id: userId,
    email,
    fullName: profile.full_name || email,
    role,
    entityName: profile.entity_name || undefined,
    status: profile.status || 'active',
    licenseeId: profile.licensee_id || undefined,
    isPreLicensee: false,
    forcePasswordChange: profile.force_password_change || false,
    dynamicRoleName,
    avatarUrl: (profile as any).avatar_url || undefined,
    phone: (profile as any).phone || undefined,
    department: (profile as any).department || undefined,
    bio: (profile as any).bio || undefined,
    twoFactorEnabled: profile.two_factor_enabled,
  };
}

/**
 * Apply any active inbound delegation to a base PlatformUser. The delegated
 * role becomes the *effective* `role` (so every existing permission, sidebar
 * and route check picks it up automatically), while the original role is
 * preserved as `baseRole` for fallback after expiry.
 */
async function applyDelegation(base: PlatformUser): Promise<PlatformUser> {
  try {
    const delegation = await resolveActiveDelegation(base.id);
    if (!delegation) return base;

    const baseIdx = ROLE_HIERARCHY.indexOf(base.role);
    const delIdx = ROLE_HIERARCHY.indexOf(delegation.role);
    // Only override if the delegated role is *stronger* than what the user
    // already has. Otherwise nothing changes (no downgrade).
    const useDelegated = delIdx >= 0 && (baseIdx < 0 || delIdx < baseIdx);

    return {
      ...base,
      role: useDelegated ? delegation.role : base.role,
      baseRole: base.role,
      delegatedRole: useDelegated ? delegation.role : undefined,
      delegatedFromName: delegation.fromUserName,
      delegationFrom: delegation.effectiveFrom,
      delegationUntil: delegation.effectiveUntil,
    };
  } catch (e) {
    console.warn('[Auth] applyDelegation failed:', e);
    return base;
  }
}

/**
 * Fetch and build the full PlatformUser for a given auth user.
 * Handles both pre-licensee and system user paths with proper error logging.
 */
export async function fetchPlatformUser(userId: string, email: string): Promise<PlatformUser> {
  const role = await resolveUserRole(userId);

  if (role === 'pre_licensee') {
    const { data, error } = await supabase
      .from('pre_license_users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('[Auth] Failed to fetch pre_license_users profile:', error.message);
    }

    if (data) {
      return applyDelegation(mapPreLicenseeProfile(userId, email, data));
    }

    // Fallback: no profile row found
    console.warn('[Auth] Pre-licensee profile row missing, using defaults');
    return applyDelegation({
      id: userId,
      email,
      fullName: email,
      role: 'pre_licensee',
      status: 'active',
      isPreLicensee: true,
      forcePasswordChange: false,
    });
  }

  // System user path
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[Auth] Failed to fetch profiles:', error.message);
  }

  if (data) {
    // Resolve dynamic role name (preferred display label) from user_dynamic_roles → roles.name.
    let dynamicRoleName: string | undefined;
    try {
      const { data: udr } = await supabase
        .from('user_dynamic_roles' as any)
        .select('role_id')
        .eq('user_id', userId);
      let roleIds: string[] = ((udr as any[]) || []).map(r => r.role_id).filter(Boolean);
      if (roleIds.length === 0 && (data as any).role_id) {
        roleIds = [(data as any).role_id];
      }
      if (roleIds.length > 0) {
        const { data: roleRows } = await supabase
          .from('roles' as any)
          .select('name')
          .in('id', roleIds);
        const names = ((roleRows as any[]) || []).map(r => r.name).filter(Boolean);
        if (names.length > 0) dynamicRoleName = names.join(', ');
      }
    } catch (e) {
      console.warn('[Auth] Could not resolve dynamic role name:', e);
    }
    return applyDelegation(mapSystemProfile(userId, email, role, data, dynamicRoleName));
  }

  // Fallback: no profile row found
  console.warn('[Auth] Profile row missing, using defaults');
  return applyDelegation({
    id: userId,
    email,
    fullName: email,
    role,
    status: 'active',
    isPreLicensee: false,
    forcePasswordChange: false,
  });
}
