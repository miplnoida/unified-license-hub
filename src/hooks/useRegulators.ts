import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Regulator } from '@/contexts/RegulatorContext';
import { configRetire, configSave } from '@/lib/configWriter';

/**
 * Regulator MASTER (Administration → Regulator Management only).
 *
 * Returns every regulator row including inactive and retired ones so the master
 * and its history can be administered. Operational/configuration selectors must
 * use `useAuthorisedRegulatorOptions` instead — see `useRegulatorScope.ts`.
 */
export function useRegulatorMaster() {
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

  // GAP-F1-03: governed writer enforces `settings.edit` and audits before/after.
  const upsert = useMutation({
    mutationFn: async (row: { id?: string; name: string; code: string; description?: string; status: string }) => {
      await configSave('regulators', {
        name: row.name, code: row.code, description: row.description || null, status: row.status,
      }, { id: row.id ?? null, entityLabel: 'regulator' });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['regulators'] }); },
  });

  // Regulators are referenced by historical records — retire, never hard delete.
  const remove = useMutation({
    mutationFn: async (id: string) => { await configRetire('regulators', id, { entityLabel: 'regulator' }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['regulators'] }); },
  });

  return { upsert, remove };
}
