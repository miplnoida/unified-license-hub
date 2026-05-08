import { supabase } from '@/integrations/supabase/client';

/**
 * Eligible PPOC user record returned by getEligiblePpocUsers().
 */
export interface EligiblePpocUser {
  id: string;
  full_name: string;
  email: string;
  user_type: string | null;
  status: string | null;
  role_labels: string[];
}

/**
 * Values in profiles.user_type that qualify a user as an external/licensee
 * primary contact (PPOC candidate).
 */
const ELIGIBLE_USER_TYPES = ['primary', 'licensee_primary', 'licensee', 'secondary'];

/**
 * app_role values in user_roles that qualify a user as a PPOC candidate.
 */
const ELIGIBLE_APP_ROLES = ['licensee_primary', 'licensee_secondary'];

/**
 * Tokens (case-insensitive) on roles.system_role / roles.name that mark a
 * dynamic role as a "primary user / licensee contact" role.
 */
const DYNAMIC_ROLE_TOKENS = ['licensee_primary', 'primary_user', 'primary user', 'licensee primary', 'ppoc'];

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
  const ids = new Set<string>();
  const roleLabelsByUser: Record<string, Set<string>> = {};

  const addLabel = (uid: string, label: string) => {
    if (!roleLabelsByUser[uid]) roleLabelsByUser[uid] = new Set();
    roleLabelsByUser[uid].add(label);
  };

  // 1) profiles.user_type / legacy profiles.role
  const { data: profileRows } = await supabase
    .from('profiles')
    .select('id, role, user_type')
    .or(
      [
        `user_type.in.(${ELIGIBLE_USER_TYPES.join(',')})`,
        `role.in.(${ELIGIBLE_APP_ROLES.join(',')})`,
      ].join(','),
    );
  (profileRows || []).forEach((p: any) => {
    ids.add(p.id);
    if (p.user_type) addLabel(p.id, String(p.user_type));
    if (p.role) addLabel(p.id, String(p.role));
  });

  // 2) user_roles legacy mapping
  const { data: ur } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .in('role', ELIGIBLE_APP_ROLES as any);
  (ur || []).forEach((r: any) => {
    ids.add(r.user_id);
    addLabel(r.user_id, String(r.role));
  });

  // 3) user_dynamic_roles → roles
  const { data: roles } = await supabase
    .from('roles')
    .select('id, name, system_role');
  const eligibleRoleIds = (roles || [])
    .filter((r: any) => {
      const hay = `${r.system_role || ''} ${r.name || ''}`.toLowerCase();
      return DYNAMIC_ROLE_TOKENS.some((t) => hay.includes(t));
    })
    .map((r: any) => ({ id: r.id, label: r.name as string }));
  if (eligibleRoleIds.length > 0) {
    const { data: udr } = await supabase
      .from('user_dynamic_roles' as any)
      .select('user_id, role_id')
      .in('role_id', eligibleRoleIds.map((r) => r.id));
    const labelById = Object.fromEntries(eligibleRoleIds.map((r) => [r.id, r.label]));
    (udr || []).forEach((r: any) => {
      ids.add(r.user_id);
      addLabel(r.user_id, labelById[r.role_id] || 'dynamic');
    });
  }

  // 4) existing PPOC mappings — keep mapped users discoverable even if their
  // role config drifted away from the eligibility rules.
  const { data: mapped } = await supabase
    .from('ppoc_entity_mappings' as any)
    .select('ppoc_user_id');
  (mapped || []).forEach((m: any) => {
    ids.add(m.ppoc_user_id);
    addLabel(m.ppoc_user_id, 'mapped_ppoc');
  });

  // 5) currently selected user (edit form safety)
  if (includeUserId) ids.add(includeUserId);

  if (ids.size === 0) return [];

  // Hydrate profile details for the merged user-id set
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email, user_type, status')
    .in('id', Array.from(ids));

  const list: EligiblePpocUser[] = (profiles || []).map((p: any) => ({
    id: p.id,
    full_name: p.full_name || '—',
    email: p.email || '',
    user_type: p.user_type || null,
    status: p.status || null,
    role_labels: Array.from(roleLabelsByUser[p.id] || []),
  }));

  list.sort((a, b) =>
    (a.full_name || a.email).localeCompare(b.full_name || b.email, undefined, { sensitivity: 'base' }),
  );
  return list;
}
