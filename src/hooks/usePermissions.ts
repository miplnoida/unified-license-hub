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
      // 1) Collect all dynamic role IDs assigned to this user from user_dynamic_roles.
      let dynRoleIds: string[] = [];

      const { data: udr } = await supabase
        .from('user_dynamic_roles' as any)
        .select('role_id')
        .eq('user_id', user!.id);

      if (udr && (udr as any[]).length > 0) {
        dynRoleIds = (udr as any[]).map(r => r.role_id).filter(Boolean);
      } else {
        // Back-compat: derive from profiles.role_id, then from system_role mapping.
        const { data: profile } = await supabase
          .from('profiles')
          .select('role_id')
          .eq('id', user!.id)
          .maybeSingle();
        if (profile?.role_id) {
          dynRoleIds = [profile.role_id];
        } else {
          const { data: userRoles } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user!.id);
          const sysRoles = ((userRoles as any[]) || []).map(r => r.role);
          if (sysRoles.length > 0) {
            const { data: dynRoles } = await supabase
              .from('roles' as any)
              .select('id')
              .in('system_role', sysRoles);
            const list = (dynRoles as any[]) || [];
            if (list.length === 1) dynRoleIds = [list[0].id];
          }
        }
      }

      if (dynRoleIds.length === 0) {
        return { permissions: [], hasDynamicRole: false };
      }

      // 2) Fetch permission IDs across all assigned dynamic roles.
      const { data: rp } = await supabase
        .from('role_permissions' as any)
        .select('permission_id')
        .in('role_id', dynRoleIds);

      const permIds = Array.from(new Set(((rp as any[]) || []).map(r => r.permission_id)));
      if (permIds.length === 0) {
        return { permissions: [], hasDynamicRole: true };
      }

      const { data: perms } = await supabase
        .from('permissions' as any)
        .select('name, module')
        .in('id', permIds);

      // De-duplicate (module, name) pairs.
      const seen = new Set<string>();
      const unique: { name: string; module: string }[] = [];
      for (const p of (perms || []) as any[]) {
        const key = `${p.module}::${p.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push({ name: p.name, module: p.module });
        }
      }

      return { permissions: unique, hasDynamicRole: true };
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
