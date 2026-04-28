import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getModuleForPath, PermissionModule } from '@/lib/permissionModules';

type UserPermission = {
  id?: string;
  module: string;
  name: string;
};

const normalizeKey = (value?: string | null) => String(value || '').trim().toLowerCase();
const normalizeModule = (value?: string | null) => normalizeKey(value).replace(/\s+/g, '_');
const normalizeAction = normalizeKey;

/**
 * Hook to check if the current user has a specific permission.
 * Fetches the user's role permissions from the DB and provides a check function.
 *
 * Enforcement model:
 * - super_admin always has access (bypass).
 * - If the user's `system_role` is 'admin' but they are mapped to a *dynamic role*
 *   in the `roles` table, then the dynamic role's permissions become the source
 *   of truth (sidebar + route access).
 * - Users with no dynamic role mapping (legacy admins) keep full access.
 */
export function useUserDynamicPermissions() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['user-permissions', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: udr } = await supabase
        .from('user_dynamic_roles' as any)
        .select('role_id')
        .eq('user_id', user!.id);

      const dynamicRoleIds = Array.from(
        new Set(((udr as any[]) || []).map((row) => row.role_id).filter(Boolean))
      );

      if (dynamicRoleIds.length === 0) {
        return { roleIds: [], permissions: [] as UserPermission[], hasDynamicRole: false };
      }

      const { data: rp } = await supabase
        .from('role_permissions' as any)
        .select('permission_id')
        .in('role_id', dynamicRoleIds);

      const permIds = Array.from(new Set(((rp as any[]) || []).map(r => r.permission_id)));
      if (permIds.length === 0) {
        return { roleIds: dynamicRoleIds, permissions: [] as UserPermission[], hasDynamicRole: true };
      }

      const { data: perms } = await supabase
        .from('permissions' as any)
        .select('id, module, name')
        .in('id', permIds);

      const seen = new Set<string>();
      const unique: UserPermission[] = [];
      for (const p of (perms || []) as any[]) {
        const module = normalizeModule(p.module);
        const name = normalizeAction(p.name);
        const key = `${module}::${name}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push({ id: p.id, module, name });
        }
      }

      return { roleIds: dynamicRoleIds, permissions: unique, hasDynamicRole: true };
    },
    staleTime: 60_000,
  });

  const roleIds = data?.roleIds ?? [];
  const permissions = data?.permissions ?? [];
  const hasDynamicRole = data?.hasDynamicRole ?? false;

  const isSuperAdmin = user?.role === 'super_admin';
  const enforceDynamic = !isSuperAdmin && hasDynamicRole;

  const hasPermission = (module: string, action: string): boolean => {
    if (isSuperAdmin) return true;
    if (!enforceDynamic) return true;
    const moduleKey = normalizeModule(module);
    const actionKey = normalizeAction(action);
    return permissions.some(p => p.module === moduleKey && p.name === actionKey);
  };

  const hasModuleAccess = (module: string): boolean => {
    if (isSuperAdmin) return true;
    if (!enforceDynamic) return true;
    const moduleKey = normalizeModule(module);
    return permissions.some(p => p.module === moduleKey);
  };

  const hasAnyModuleAccess = (): boolean => {
    if (isSuperAdmin) return true;
    if (!enforceDynamic) return false;
    return permissions.length > 0;
  };

  const canAccessPath = (pathname: string): boolean => {
    if (isSuperAdmin) return true;
    if (!enforceDynamic) return true;
    const mod = getModuleForPath(pathname);
    if (!mod) return true; // unmapped route => not gated by dynamic perms
    return hasModuleAccess(mod);
  };

  return {
    roleIds,
    permissions,
    hasPermission,
    hasModuleAccess,
    hasAnyModuleAccess,
    canAccessPath,
    enforceDynamic,
    isLoading,
  };
}

export type { PermissionModule };
