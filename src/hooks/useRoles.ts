import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DynamicRole {
  id: string;
  name: string;
  description: string | null;
  system_role: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface Permission {
  id: string;
  name: string;
  module: string;
  description: string | null;
}

export interface RolePermission {
  role_id: string;
  permission_id: string;
}

export function useRoles() {
  return useQuery({
    queryKey: ['dynamic-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles' as any)
        .select('*')
        .order('created_at');
      if (error) throw error;
      return (data || []) as unknown as DynamicRole[];
    },
  });
}

export function usePermissions() {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permissions' as any)
        .select('*')
        .order('module, name');
      if (error) throw error;
      return (data || []) as unknown as Permission[];
    },
  });
}

export function useRolePermissions(roleId?: string) {
  return useQuery({
    queryKey: ['role-permissions', roleId],
    enabled: !!roleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_permissions' as any)
        .select('permission_id')
        .eq('role_id', roleId!);
      if (error) throw error;
      return (data || []).map((d: any) => d.permission_id as string);
    },
  });
}

export function useAllRolePermissions() {
  return useQuery({
    queryKey: ['all-role-permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_permissions' as any)
        .select('role_id, permission_id');
      if (error) throw error;
      return (data || []) as unknown as RolePermission[];
    },
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description: string; system_role: string; permissionIds: string[] }) => {
      const { data: role, error } = await supabase
        .from('roles' as any)
        .insert({ name: input.name, description: input.description, system_role: input.system_role, is_system: false })
        .select()
        .single();
      if (error) throw error;

      if (input.permissionIds.length > 0) {
        const rows = input.permissionIds.map(pid => ({ role_id: (role as any).id, permission_id: pid }));
        const { error: rpErr } = await supabase.from('role_permissions' as any).insert(rows);
        if (rpErr) throw rpErr;
      }
      return role;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dynamic-roles'] });
      qc.invalidateQueries({ queryKey: ['all-role-permissions'] });
      toast.success('Role created successfully');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to create role'),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name: string; description: string; system_role: string; permissionIds: string[] }) => {
      const { error } = await supabase
        .from('roles' as any)
        .update({ name: input.name, description: input.description, system_role: input.system_role, updated_at: new Date().toISOString() })
        .eq('id', input.id);
      if (error) throw error;

      // Replace permissions
      await supabase.from('role_permissions' as any).delete().eq('role_id', input.id);
      if (input.permissionIds.length > 0) {
        const rows = input.permissionIds.map(pid => ({ role_id: input.id, permission_id: pid }));
        const { error: rpErr } = await supabase.from('role_permissions' as any).insert(rows);
        if (rpErr) throw rpErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dynamic-roles'] });
      qc.invalidateQueries({ queryKey: ['all-role-permissions'] });
      qc.invalidateQueries({ queryKey: ['role-permissions'] });
      toast.success('Role updated successfully');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to update role'),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('roles' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dynamic-roles'] });
      qc.invalidateQueries({ queryKey: ['all-role-permissions'] });
      toast.success('Role deleted');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to delete role'),
  });
}

/** Count users per role by checking user_roles + roles mapping */
export function useRoleUserCounts() {
  return useQuery({
    queryKey: ['role-user-counts'],
    queryFn: async () => {
      const { data: userRoles } = await supabase.from('user_roles').select('role');
      const { data: roles } = await supabase.from('roles' as any).select('id, system_role');
      
      const counts: Record<string, number> = {};
      for (const r of (roles || []) as any[]) {
        counts[r.id] = (userRoles || []).filter((ur: any) => ur.role === r.system_role).length;
      }
      return counts;
    },
  });
}
