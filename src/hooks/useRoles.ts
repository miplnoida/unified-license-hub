import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type RoleType = 'internal' | 'external';

export interface DynamicRole {
  id: string;
  name: string;
  description: string | null;
  system_role: string;
  is_system: boolean;
  role_type: RoleType;
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
    mutationFn: async (input: { name: string; description: string; system_role: string; role_type: RoleType; permissionIds: string[] }) => {
      const { data: role, error } = await supabase
        .from('roles' as any)
        .insert({
          name: input.name, description: input.description,
          system_role: input.system_role, role_type: input.role_type, is_system: false,
        })
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
    mutationFn: async (input: { id: string; name: string; description: string; system_role: string; role_type: RoleType; permissionIds: string[] }) => {
      const { error } = await supabase
        .from('roles' as any)
        .update({
          name: input.name, description: input.description,
          system_role: input.system_role, role_type: input.role_type,
          updated_at: new Date().toISOString(),
        })
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

/**
 * Reset a system role's permissions back to the curated default matrix
 * (defined in the database via `reset_system_role_permissions`).
 */
export function useResetSystemRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (roleName: string) => {
      const { error } = await supabase.rpc('reset_system_role_permissions' as any, { p_role_name: roleName });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dynamic-roles'] });
      qc.invalidateQueries({ queryKey: ['all-role-permissions'] });
      qc.invalidateQueries({ queryKey: ['role-permissions'] });
      toast.success('Role reset to default permissions');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to reset role'),
  });
}

/**
 * Count users per dynamic role using user_dynamic_roles as source of truth.
 * Falls back to profiles.role_id (legacy) only for roles that have zero
 * dynamic-role assignments, so existing data is not lost.
 */
export function useRoleUserCounts() {
  return useQuery({
    queryKey: ['role-user-counts'],
    queryFn: async () => {
      const { data: udr } = await supabase
        .from('user_dynamic_roles' as any)
        .select('role_id, user_id');
      const { data: roles } = await supabase.from('roles' as any).select('id');

      const counts: Record<string, number> = {};
      const seenPerRole: Record<string, Set<string>> = {};
      for (const row of ((udr as any[]) || [])) {
        if (!row.role_id) continue;
        seenPerRole[row.role_id] ??= new Set();
        seenPerRole[row.role_id].add(row.user_id);
      }
      for (const r of ((roles as any[]) || [])) {
        counts[r.id] = seenPerRole[r.id]?.size ?? 0;
      }

      // Legacy fallback: include profiles.role_id assignments not yet migrated
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, role_id')
        .not('role_id', 'is', null);
      for (const p of ((profs as any[]) || [])) {
        if (!p.role_id) continue;
        if (seenPerRole[p.role_id]?.has(p.id)) continue;
        counts[p.role_id] = (counts[p.role_id] ?? 0) + 1;
        seenPerRole[p.role_id] ??= new Set();
        seenPerRole[p.role_id].add(p.id);
      }
      return counts;
    },
  });
}
