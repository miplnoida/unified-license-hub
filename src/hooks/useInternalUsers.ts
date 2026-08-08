/**
 * Internal-staff picker for "specific users" approver type and other pickers
 * that need to select internal employees.
 *
 * Returns profiles that:
 *  - have at least one row in `user_roles` (system staff), and
 *  - are NOT primary/secondary or other external portal users, and
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

const INTERNAL_USERS_QUERY_VERSION = 3;

export function useInternalUsers(
  search?: string,
  opts?: { activeOnly?: boolean; alwaysIncludeIds?: string[] },
) {
  const activeOnly = opts?.activeOnly ?? true;
  const alwaysIncludeIds = (opts?.alwaysIncludeIds ?? []).filter(Boolean);
  const alwaysKey = alwaysIncludeIds.slice().sort().join(',');
  return useQuery({
    queryKey: ['internal_users', INTERNAL_USERS_QUERY_VERSION, search ?? '', activeOnly, alwaysKey],
    queryFn: async (): Promise<InternalUser[]> => {
      // Server-side directory: the browser cannot read the full role table
      // (only admins may), so a security-definer function is the single
      // source of truth for "who is internal staff".
      const { data, error } = await supabase.rpc('list_internal_users', {
        _search: (search || '').trim() || null,
        _include_ids: alwaysIncludeIds.length ? alwaysIncludeIds : null,
      });
      if (error) throw error;

      const includeSet = new Set(alwaysIncludeIds);
      const rows = (data ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
        primary_role: string | null;
        status: string | null;
      }>;
      const distinct = Array.from(new Map(rows.map((r) => [r.id, r])).values());

      return distinct
        .map((r) => ({
          id: r.id,
          full_name: r.full_name ?? null,
          email: r.email ?? null,
          primary_role: r.primary_role ?? null,
          status: r.status ?? null,
          is_active: (r.status || '').toLowerCase() === 'active',
        }))
        .filter((u) => (activeOnly && !u.is_active ? includeSet.has(u.id) : true))
        .sort((a, b) =>
          (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''),
        );
    },
    staleTime: 60_000,
  });
}

