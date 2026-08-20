import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { authorizedAction } from '@/lib/rbac/authorizedAction';

export type RoleType = 'internal' | 'external';
export type DashboardTier = 'operational' | 'executive';
export type RoleStatus = 'active' | 'inactive';
export type RoleCategory =
  | 'operational' | 'reviewer' | 'approver' | 'supervisor'
  | 'administrator' | 'read_only' | 'custom';

/**
 * JSON blob persisted at roles.scope_config. Every field is authoritative:
 * the backend RLS/RPC layer reads it via public.role_scope_for(role_id, module).
 * Do not add free-text fields — everything the backend cannot enforce is
 * forbidden by design.
 */
export type RoleScopeConfig = Record<
  string,
  {
    scope?: 'all' | 'assigned' | 'team' | 'sector' | 'department' | 'institution' | 'own';
    sectors?: string[];
    licensees?: string[];
    departments?: string[];
    teams?: string[];
  }
>;

export interface DynamicRole {
  id: string;
  name: string;
  description: string | null;
  system_role: string;
  is_system: boolean;
  role_type: RoleType;
  dashboard_tier: DashboardTier;
  role_category: RoleCategory | null;
  status: RoleStatus;
  access_summary: Record<string, unknown>;
  scope_config: RoleScopeConfig;
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
      // Canonical role catalogue.
      const { data, error } = await supabase
        .from('sec_roles' as any)
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

/**
 * Transactional role writes. Delegates entirely to `public.rbac_save_role`
 * so role attributes, scope_config, and role_permissions either commit
 * together or roll back together. Server-side validators enforce name
 * required, valid scope options, and view-dependency rules — the client
 * never sees a half-saved role.
 */
async function callSaveRole(payload: Record<string, unknown>) {
  // Gate + audit permission-assignment writes centrally. Server-side RLS/RPC
  // already enforce access; this call adds the mandatory audit row for
  // role_management.assign_permissions so the catalog action is enforced.
  await authorizedAction('role_management', 'assign_permissions', {
    role_id: payload.id ?? null,
    is_new: !payload.id,
    permission_count: Array.isArray((payload as any).permission_ids)
      ? (payload as any).permission_ids.length
      : 0,
  });
  // Canonical writer: validates, persists to sec_* and mirrors the legacy
  // tables in one transaction.
  const { data, error } = await supabase.rpc('sec_save_role' as any, { _payload: payload as any });
  if (error) throw error;
  return data as { id: string };
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string; description: string; system_role: string;
      role_type: RoleType; dashboard_tier?: DashboardTier;
      role_category?: RoleCategory | null; status?: RoleStatus;
      access_summary?: Record<string, unknown>; scope_config?: RoleScopeConfig;
      permissionIds: string[];
    }) => {
      return callSaveRole({
        name: input.name,
        description: input.description,
        system_role: input.system_role,
        role_type: input.role_type,
        dashboard_tier: input.dashboard_tier ?? 'operational',
        role_category: input.role_category ?? null,
        status: input.status ?? 'active',
        access_summary: input.access_summary ?? {},
        scope_config: input.scope_config ?? {},
        permission_ids: input.permissionIds,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dynamic-roles'] });
      qc.invalidateQueries({ queryKey: ['all-role-permissions'] });
      qc.invalidateQueries({ queryKey: ['user-permissions'], refetchType: 'all' });
      qc.invalidateQueries({ queryKey: ['sec-context'], refetchType: 'all' });
      toast.success('Role created successfully');
    },

    onError: (e: any) => toast.error(e.message || 'Failed to create role'),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string; name: string; description: string; system_role: string;
      role_type: RoleType; dashboard_tier?: DashboardTier;
      role_category?: RoleCategory | null; status?: RoleStatus;
      access_summary?: Record<string, unknown>; scope_config?: RoleScopeConfig;
      permissionIds: string[];
    }) => {
      return callSaveRole({
        id: input.id,
        name: input.name,
        description: input.description,
        system_role: input.system_role,
        role_type: input.role_type,
        dashboard_tier: input.dashboard_tier ?? 'operational',
        role_category: input.role_category ?? null,
        status: input.status ?? 'active',
        access_summary: input.access_summary ?? {},
        scope_config: input.scope_config ?? {},
        permission_ids: input.permissionIds,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dynamic-roles'] });
      qc.invalidateQueries({ queryKey: ['all-role-permissions'] });
      qc.invalidateQueries({ queryKey: ['role-permissions'] });
      // Force-refetch resolved access for the signed-in session so newly
      // granted modules appear in the sidebar/routes without a hard reload.
      qc.invalidateQueries({ queryKey: ['user-permissions'], refetchType: 'all' });
      qc.invalidateQueries({ queryKey: ['sec-context'], refetchType: 'all' });
      qc.invalidateQueries({ queryKey: ['user-entity-assignments'], refetchType: 'all' });
      toast.success('Role updated successfully');
    },

    onError: (e: any) => toast.error(e.message || 'Failed to update role'),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await authorizedAction('role_management', 'delete', { role_id: id });
      const { error } = await supabase.rpc('sec_delete_role' as any, { _role_id: id });
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
      await authorizedAction('role_management', 'reset', { role_name: roleName });
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
 * Count users per role from the canonical `sec_user_roles` table. A legacy
 * `profiles.role_id` fallback is retained so historic assignments that were
 * never mirrored still show up.
 */
export function useRoleUserCounts() {
  return useQuery({
    queryKey: ['role-user-counts'],
    queryFn: async () => {
      const { data: udr } = await supabase
        .from('sec_user_roles' as any)
        .select('role_id, user_id')
        .eq('status', 'active');
      const { data: roles } = await supabase.from('sec_roles' as any).select('id');

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
