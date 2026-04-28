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
  };
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
      return mapPreLicenseeProfile(userId, email, data);
    }

    // Fallback: no profile row found
    console.warn('[Auth] Pre-licensee profile row missing, using defaults');
    return {
      id: userId,
      email,
      fullName: email,
      role: 'pre_licensee',
      status: 'active',
      isPreLicensee: true,
      forcePasswordChange: false,
    };
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
    return mapSystemProfile(userId, email, role, data);
  }

  // Fallback: no profile row found
  console.warn('[Auth] Profile row missing, using defaults');
  return {
    id: userId,
    email,
    fullName: email,
    role,
    status: 'active',
    isPreLicensee: false,
    forcePasswordChange: false,
  };
}
