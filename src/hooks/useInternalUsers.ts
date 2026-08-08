/**
 * Internal-staff picker for "specific users" approver type and other pickers
 * that need to select internal employees.
 *
 * Returns profiles that:
 *  - have at least one row in `user_roles` (system staff), and
 *  - are NOT external portal users (pre_licensee/licensee), and
 *  - have profiles.status = 'active' (when activeOnly=true).
 *
 * `alwaysIncludeIds` forces inclusion of specific user ids even when inactive
 * (used to preserve legacy assignees in read-only display without allowing
 * them to be selected again).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface InternalUser {
  id: string;
  full_name: string | null;
  email: string | null;
  primary_role: string | null;
  status: string | null;
  is_active: boolean;
}

/**
 * External portal identities. Anyone holding one of these roles belongs to a
 * licensed/applicant entity (primary or secondary user) and is never an
 * internal staff member, even if they also carry another role.
 */
const EXTERNAL_ROLES = new Set([
  'pre_licensee',
  'licensee',
  'licensee_primary',
  'licensee_secondary',
  'applicant',
]);

export function useInternalUsers(
  search?: string,
  opts?: { activeOnly?: boolean; alwaysIncludeIds?: string[] },
) {
  const activeOnly = opts?.activeOnly ?? true;
  const alwaysIncludeIds = (opts?.alwaysIncludeIds ?? []).filter(Boolean);
  const alwaysKey = alwaysIncludeIds.slice().sort().join(',');
  return useQuery({
    queryKey: ['internal_users', search ?? '', activeOnly, alwaysKey],
    queryFn: async (): Promise<InternalUser[]> => {
      const { data: roleRows, error: rolesErr } = await supabase
        .from('user_roles')
        .select('user_id, role');
      if (rolesErr) throw rolesErr;

      const roleByUser = new Map<string, string[]>();
      const externalUsers = new Set<string>();
      for (const r of (roleRows ?? []) as Array<{ user_id: string; role: string }>) {
        if (EXTERNAL_ROLES.has(r.role)) {
          externalUsers.add(r.user_id);
          continue;
        }
        const arr = roleByUser.get(r.user_id) || [];
        if (!arr.includes(r.role)) arr.push(r.role);
        roleByUser.set(r.user_id, arr);
      }
      // Anyone mapped to a licensed entity is an external portal user.
      const { data: entityUsers } = await supabase
        .from('entity_user_access')
        .select('user_id');
      for (const e of (entityUsers ?? []) as Array<{ user_id: string | null }>) {
        if (e.user_id) externalUsers.add(e.user_id);
      }
      for (const id of externalUsers) roleByUser.delete(id);

      const ids = new Set<string>(roleByUser.keys());
      for (const id of alwaysIncludeIds) ids.add(id);
      if (ids.size === 0) return [];


      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, status')
        .in('id', Array.from(ids));
      if (pErr) throw pErr;

      const q = (search || '').trim().toLowerCase();
      const includeSet = new Set(alwaysIncludeIds);
      return ((profiles ?? []) as any[])
        .map((p) => {
          const status = (p.status as string | null) ?? null;
          const isActive = (status || '').toLowerCase() === 'active';
          return {
            id: p.id as string,
            full_name: (p.full_name as string | null) ?? null,
            email: (p.email as string | null) ?? null,
            status,
            is_active: isActive,
            primary_role: roleByUser.get(p.id)?.[0] ?? null,
          };
        })
        .filter((u) => {
          // Exclude external-only users (no non-external role AND not force-included)
          if (!roleByUser.has(u.id) && !includeSet.has(u.id)) return false;
          if (activeOnly && !u.is_active && !includeSet.has(u.id)) return false;
          if (!q) return true;
          const hay = `${u.full_name || ''} ${u.email || ''}`.toLowerCase();
          return hay.includes(q);
        })
        .sort((a, b) =>
          (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''),
        );
    },
    staleTime: 60_000,
  });
}
