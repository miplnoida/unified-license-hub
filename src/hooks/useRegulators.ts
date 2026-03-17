import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Regulator } from '@/contexts/RegulatorContext';

export function useAllRegulators() {
  return useQuery({
    queryKey: ['regulators', 'all'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('regulators' as any).select('*').order('name') as any);
      if (error) throw error;
      return (data || []) as Regulator[];
    },
  });
}

export function useRegulatorMutations() {
  const qc = useQueryClient();

  const upsert = useMutation({
    mutationFn: async (row: { id?: string; name: string; code: string; description?: string; status: string }) => {
      if (row.id) {
        const { error } = await (supabase.from('regulators' as any).update({
          name: row.name, code: row.code, description: row.description || null, status: row.status,
        } as any).eq('id', row.id) as any);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('regulators' as any).insert({
          name: row.name, code: row.code, description: row.description || null, status: row.status,
        } as any) as any);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['regulators'] }); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('regulators' as any).delete().eq('id', id) as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['regulators'] }); },
  });

  return { upsert, remove };
}
