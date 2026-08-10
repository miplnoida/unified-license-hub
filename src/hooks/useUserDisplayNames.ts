import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Resolves a set of user ids to display names (full name, else email).
 *
 * Mirrors the resolution used by `useEntityAuditLog` so actor columns never
 * render raw uuids. Internal staff live in `profiles`, external/pre-license
 * identities in `pre_license_users`.
 */
export function useUserDisplayNames(userIds: Array<string | null | undefined>) {
  const ids = Array.from(new Set(userIds.filter(Boolean) as string[])).sort();

  return useQuery({
    queryKey: ['user-display-names', ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const map: Record<string, string> = {};
      const [{ data: profiles }, { data: preUsers }] = await Promise.all([
        supabase.from('profiles').select('id, email, full_name').in('id', ids),
        supabase.from('pre_license_users').select('id, email, full_name').in('id', ids),
      ]);
      preUsers?.forEach((u: any) => {
        map[u.id] = u.full_name || u.email || u.id;
      });
      profiles?.forEach((p: any) => {
        const label = p.full_name || p.email;
        if (label) map[p.id] = label;
      });
      return map;
    },
  });
}

/** Label for a single actor id given a resolved name map. */
export function actorLabel(
  userId: string | null | undefined,
  names: Record<string, string> | undefined,
): string {
  if (!userId) return 'System';
  return names?.[userId] || 'Unknown user';
}
