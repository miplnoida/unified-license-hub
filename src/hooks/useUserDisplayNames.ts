import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Resolves a set of user ids to display names (full name, else email).
 *
 * Resolution goes through the `resolve_user_display_names` RPC so that every
 * internal staff role can label a case actor — internal staff live in
 * `profiles`, external/pre-license identities in `pre_license_users`, and the
 * latter is not directly readable by most reviewer roles.
 */
export function useUserDisplayNames(userIds: Array<string | null | undefined>) {
  const ids = Array.from(new Set(userIds.filter(Boolean) as string[])).sort();

  return useQuery({
    queryKey: ['user-display-names', ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const map: Record<string, string> = {};
      const { data, error } = await supabase.rpc('resolve_user_display_names' as any, { _ids: ids });
      if (error) throw error;
      ((data as any[]) ?? []).forEach((row: any) => {
        const label = row.display_name || row.email;
        if (label) map[row.id] = label;
      });
      return map;
    },
  });
}

/** Resolution state so pending/failed lookups never read as "Unknown user". */
export interface NameResolutionState {
  isLoading?: boolean;
  isError?: boolean;
}

/** Label for a single actor id given a resolved name map. */
export function actorLabel(
  userId: string | null | undefined,
  names: Record<string, string> | undefined,
  state?: NameResolutionState,
): string {
  if (!userId) return 'System';
  const resolved = names?.[userId];
  if (resolved) return resolved;
  if (state?.isLoading) return '…';
  if (state?.isError) return 'Name unavailable';
  if (!names) return '…';
  return 'Unknown user';
}
