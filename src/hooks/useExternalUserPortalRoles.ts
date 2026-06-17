import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ExternalUserPortalRoleAssignment } from '@/lib/externalPortalRoles';

const KEY = ['external_user_portal_roles'];

export function useExternalUserPortalRoles() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<ExternalUserPortalRoleAssignment[]> => {
      const { data, error } = await (supabase as any)
        .from('external_user_portal_roles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ExternalUserPortalRoleAssignment[];
    },
  });

  const assign = useMutation({
    mutationFn: async (input: {
      id?: string;
      user_id: string;
      entity_id: string | null;
      external_role_id: string;
      status: 'active' | 'inactive';
      assigned_by?: string | null;
    }) => {
      if (input.id) {
        const { data, error } = await (supabase as any)
          .from('external_user_portal_roles')
          .update({
            entity_id: input.entity_id,
            external_role_id: input.external_role_id,
            status: input.status,
          })
          .eq('id', input.id).select('*').single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await (supabase as any)
        .from('external_user_portal_roles')
        .upsert({
          user_id: input.user_id,
          entity_id: input.entity_id,
          external_role_id: input.external_role_id,
          status: input.status,
          assigned_by: input.assigned_by ?? null,
        }, { onConflict: 'user_id,entity_id,external_role_id' })
        .select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const setStatus = useMutation({
    mutationFn: async (input: { id: string; status: 'active' | 'inactive' }) => {
      const { error } = await (supabase as any)
        .from('external_user_portal_roles')
        .update({ status: input.status }).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('external_user_portal_roles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return { query, assign, setStatus, remove };
}
