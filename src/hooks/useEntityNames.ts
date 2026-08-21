/**
 * Batch resolver for regulated-entity display names.
 *
 * Read-only lookup used by registers that list rows keyed by entity id.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useEntityNames(entityIds: string[]) {
  const ids = Array.from(new Set(entityIds.filter(Boolean))).sort();
  return useQuery({
    queryKey: ['entity-names', ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from('licensees' as never)
        .select('id, name')
        .in('id', ids);
      if (error) throw new Error(error.message);
      const map: Record<string, string> = {};
      ((data as unknown as Array<{ id: string; name: string | null }>) ?? []).forEach((row) => {
        if (row?.id && row.name) map[row.id] = row.name;
      });
      return map;
    },
  });
}
