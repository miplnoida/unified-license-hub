import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  ExternalPortalRole,
  ExternalPortalRoleCapability,
  PortalArea,
  PortalCapability,
} from '@/lib/externalPortalRoles';

const ROLES_KEY = ['external_portal_roles'];
const CAPS_KEY = ['external_portal_role_capabilities'];

export function useExternalPortalRoles() {
  const qc = useQueryClient();

  const rolesQuery = useQuery({
    queryKey: ROLES_KEY,
    queryFn: async (): Promise<ExternalPortalRole[]> => {
      const { data, error } = await (supabase as any)
        .from('external_portal_roles')
        .select('*')
        .order('is_system', { ascending: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as ExternalPortalRole[];
    },
  });

  const capsQuery = useQuery({
    queryKey: CAPS_KEY,
    queryFn: async (): Promise<ExternalPortalRoleCapability[]> => {
      const { data, error } = await (supabase as any)
        .from('external_portal_role_capabilities')
        .select('*');
      if (error) throw error;
      return (data || []) as ExternalPortalRoleCapability[];
    },
  });

  const upsertRole = useMutation({
    mutationFn: async (input: Partial<ExternalPortalRole> & { name: string; role_key: string }) => {
      const payload: any = {
        role_key: input.role_key,
        name: input.name,
        description: input.description ?? null,
        applies_to_roles: input.applies_to_roles ?? [],
        is_active: input.is_active ?? true,
      };
      if (input.id) {
        const { data, error } = await (supabase as any)
          .from('external_portal_roles')
          .update(payload).eq('id', input.id).select('*').single();
        if (error) throw error;
        return data as ExternalPortalRole;
      }
      const { data, error } = await (supabase as any)
        .from('external_portal_roles').insert(payload).select('*').single();
      if (error) throw error;
      return data as ExternalPortalRole;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ROLES_KEY }),
  });

  const deleteRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('external_portal_roles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ROLES_KEY });
      qc.invalidateQueries({ queryKey: CAPS_KEY });
    },
  });

  const upsertCapability = useMutation({
    mutationFn: async (input: {
      external_role_id: string;
      portal_area: PortalArea;
      caps: Partial<Record<PortalCapability, boolean>>;
    }) => {
      const payload: any = {
        external_role_id: input.external_role_id,
        portal_area: input.portal_area,
        can_submit: !!input.caps.can_submit,
        can_upload_documents: !!input.caps.can_upload_documents,
        can_view_status: !!input.caps.can_view_status,
        can_respond_rfi: !!input.caps.can_respond_rfi,
        can_submit_returns: !!input.caps.can_submit_returns,
        can_submit_complaints: !!input.caps.can_submit_complaints,
        can_submit_fp_declarations: !!input.caps.can_submit_fp_declarations,
      };
      const { error } = await (supabase as any)
        .from('external_portal_role_capabilities')
        .upsert(payload, { onConflict: 'external_role_id,portal_area' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CAPS_KEY }),
  });

  return { rolesQuery, capsQuery, upsertRole, deleteRole, upsertCapability };
}
