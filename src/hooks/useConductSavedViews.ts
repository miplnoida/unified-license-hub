import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ConductSavedView {
  id: string;
  owner_id: string;
  name: string;
  is_shared: boolean;
  is_default: boolean;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

const KEY = ['conduct_saved_views'];

export function useConductSavedViews() {
  return useQuery<ConductSavedView[]>({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conduct_saved_views')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data || []) as unknown as ConductSavedView[];
    },
  });
}

export function useSaveConductView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; name: string; is_shared: boolean; is_default: boolean; config: Record<string, any> }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error('You must be signed in to save a view.');

      if (input.is_default) {
        // one default per owner (partial unique index enforces this too)
        await supabase.from('conduct_saved_views').update({ is_default: false }).eq('owner_id', uid).eq('is_default', true);
      }

      if (input.id) {
        const { error } = await supabase.from('conduct_saved_views')
          .update({ name: input.name, is_shared: input.is_shared, is_default: input.is_default, config: input.config as any })
          .eq('id', input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase.from('conduct_saved_views')
        .insert({ owner_id: uid, name: input.name, is_shared: input.is_shared, is_default: input.is_default, config: input.config as any })
        .select('id').single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); toast.success('View saved'); },
    onError: (e: any) => toast.error(e?.message || 'Could not save view'),
  });
}

export function useDeleteConductView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('conduct_saved_views').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); toast.success('View deleted'); },
    onError: (e: any) => toast.error(e?.message || 'Could not delete view'),
  });
}
