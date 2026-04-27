import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getModuleForPath, PermissionModule } from '@/lib/permissionModules';

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
      // Get user's system role
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id);

      if (!userRoles || userRoles.length === 0) {
        return { permissions: [], hasDynamicRole: false };
      }

      const primaryRole = userRoles[0].role;

      // Look up dynamic role(s) matching this system_role.
      // Multiple dynamic roles can share the same system_role (e.g. several
      // 'admin'-backed roles). We attempt to find the one this user is
      // explicitly assigned to via user_dynamic_roles, falling back to first.
      let dynRoleId: string | null = null;

      // Try explicit mapping first (table may not exist; ignore errors)
      const { data: explicit } = await supabase
        .from('user_dynamic_roles' as any)
        .select('role_id')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (explicit && (explicit as any).role_id) {
        dynRoleId = (explicit as any).role_id;
      } else {
        const { data: dynRoles } = await supabase
          .from('roles' as any)
          .select('id')
          .eq('system_role', primaryRole);
        const list = (dynRoles as any[]) || [];
        // If exactly one dynamic role matches, use it as the user's role.
        if (list.length === 1) dynRoleId = list[0].id;
      }

      if (!dynRoleId) {
        return { permissions: [], hasDynamicRole: false };
      }

      const { data: rp } = await supabase
        .from('role_permissions' as any)
        .select('permission_id')
        .eq('role_id', dynRoleId);

      const permIds = ((rp as any[]) || []).map(r => r.permission_id);
      if (permIds.length === 0) {
        return { permissions: [], hasDynamicRole: true };
      }

      const { data: perms } = await supabase
        .from('permissions' as any)
        .select('name, module')
        .in('id', permIds);

      return {
        permissions: ((perms || []) as unknown as { name: string; module: string }[]),
        hasDynamicRole: true,
      };
    },
    staleTime: 60_000,
  });

  const permissions = data?.permissions ?? [];
  const hasDynamicRole = data?.hasDynamicRole ?? false;

  // Bypass dynamic enforcement entirely for super_admin.
  const isSuperAdmin = user?.role === 'super_admin';

  /**
   * Should we ENFORCE dynamic permissions for this user?
   * Only when the user is mapped to a dynamic role with at least one permission.
   * Otherwise we fall back to the legacy system_role checks (full admin access).
   */
  const enforceDynamic = !isSuperAdmin && hasDynamicRole;

  const hasPermission = (module: string, action: string): boolean => {
    if (isSuperAdmin) return true;
    if (!enforceDynamic) return true; // legacy fallback
    return permissions.some(p => p.module === module && p.name === action);
  };

  const hasModuleAccess = (module: string): boolean => {
    if (isSuperAdmin) return true;
    if (!enforceDynamic) return true; // legacy fallback
    return permissions.some(p => p.module === module);
  };

  /** Check whether the current user can access a given route path. */
  const canAccessPath = (pathname: string): boolean => {
    if (isSuperAdmin) return true;
    if (!enforceDynamic) return true;
    const mod = getModuleForPath(pathname);
    if (!mod) return true; // unmapped route => not gated by dynamic perms
    return hasModuleAccess(mod);
  };

  return {
    permissions,
    hasPermission,
    hasModuleAccess,
    canAccessPath,
    enforceDynamic,
    isLoading,
  };
}

export type { PermissionModule };
