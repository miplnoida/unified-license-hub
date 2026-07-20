/**
 * Internal-staff picker for "specific users" approver type and other pickers
 * that need to select internal employees.
 *
 * Returns profiles that:
 *  - have at least one row in `user_roles` (system staff), and
 *  - are NOT external portal users (pre_licensee/licensee), and
 *  - have profiles.status = 'active' (unless activeOnly=false).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface InternalUser {
  id: string;
  full_name: string | null;
  email: string | null;
  primary_role: string | null;
  status: string | null;
}

const EXTERNAL_ROLES = new Set(['pre_licensee', 'licensee']);

export function useInternalUsers(search?: string, opts?: { activeOnly?: boolean }) {
  const activeOnly = opts?.activeOnly ?? true;
  return useQuery({
    queryKey: ['internal_users', search ?? '', activeOnly],
    queryFn: async (): Promise<InternalUser[]> => {
      const { data: roleRows, error: rolesErr } = await supabase
        .from('user_roles')
        .select('user_id, role');
      if (rolesErr) throw rolesErr;

      const roleByUser = new Map<string, string[]>();
      for (const r of (roleRows ?? []) as Array<{ user_id: string; role: string }>) {
        if (EXTERNAL_ROLES.has(r.role)) continue;
        const arr = roleByUser.get(r.user_id) || [];
        arr.push(r.role);
        roleByUser.set(r.user_id, arr);
      }
      const ids = Array.from(roleByUser.keys());
      if (ids.length === 0) return [];

      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, status')
        .in('id', ids);
      if (pErr) throw pErr;

      const q = (search || '').trim().toLowerCase();
      return ((profiles ?? []) as any[])
        .map((p) => ({
          id: p.id as string,
          full_name: (p.full_name as string | null) ?? null,
          email: (p.email as string | null) ?? null,
          status: (p.status as string | null) ?? null,
          primary_role: roleByUser.get(p.id)?.[0] ?? null,
        }))
        .filter((u) => {
          if (activeOnly) {
            const s = (u.status || '').toLowerCase();
            // Treat null/empty status as active for legacy rows; only exclude
            // explicitly deactivated/inactive/suspended accounts.
            if (s && !['active', ''].includes(s)) return false;
          }
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
