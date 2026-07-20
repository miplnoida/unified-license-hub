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

  // Entity assignments (Lead / Regulator / Alternate Regulator). A user
  // assigned to any entity gets Returns module access even without the base
  // returns_management.view permission. Backend RLS still restricts rows to
  // that entity's submitted returns only.
  const { data: assignmentData } = useQuery({
    queryKey: ['user-entity-assignments', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('licensees')
        .select('id')
        .or(
          `lead_regulator_id.eq.${user!.id},regulator_officer_id.eq.${user!.id},alternate_regulator_id.eq.${user!.id}`,
        );
      return { assignedLicenseeIds: (rows || []).map((r: any) => r.id) };
    },
    staleTime: 60_000,
  });

  const roleIds = data?.roleIds ?? [];
  const permissions = data?.permissions ?? [];
  const hasDynamicRole = data?.hasDynamicRole ?? false;
  const assignedLicenseeIds = assignmentData?.assignedLicenseeIds ?? [];
  const hasAnyEntityAssignment = assignedLicenseeIds.length > 0;

  const isSuperAdmin = user?.role === 'super_admin';
  const enforceDynamic = !isSuperAdmin && hasDynamicRole;

  // Modules a mapped regulator can reach purely via entity assignment
  // (no base permission required). Admin/config paths are NOT included.
  const isAssignmentUnlockedModule = (moduleKey: string): boolean =>
    moduleKey === 'returns_management' && hasAnyEntityAssignment;

  const hasPermission = (module: string, action: string): boolean => {
    if (isSuperAdmin) return true;
    if (!enforceDynamic) return true;
    const moduleKey = normalizeModule(module);
    const actionKey = normalizeAction(action);
    if (permissions.some(p => p.module === moduleKey && p.name === actionKey)) return true;
    // Assignment implicitly grants base "view" for returns_management so
    // the UI can mirror backend RLS.
    if (actionKey === 'view' && isAssignmentUnlockedModule(moduleKey)) return true;
    return false;
  };

  const hasModuleAccess = (module: string): boolean => {
    if (isSuperAdmin) return true;
    if (!enforceDynamic) return true;
    const moduleKey = normalizeModule(module);
    if (permissions.some(p => p.module === moduleKey)) return true;
    if (isAssignmentUnlockedModule(moduleKey)) return true;
    return false;
  };

  const hasAnyModuleAccess = (): boolean => {
    if (isSuperAdmin) return true;
    if (!enforceDynamic) return false;
    if (permissions.length > 0) return true;
    return hasAnyEntityAssignment;
  };

  // Returns routes reachable by assignment-only users. Excludes admin config
  // routes (types/configurations/cutoff/due-dates/late-fees/etc).
  const isAssignmentAllowedReturnsPath = (pathname: string): boolean => {
    if (!hasAnyEntityAssignment) return false;
    if (pathname.startsWith('/entity/returns')) return true;
    if (pathname === '/admin/returns' || pathname === '/admin/returns/queue') return true;
    if (pathname.startsWith('/admin/returns/queue/')) return true;
    if (pathname.startsWith('/admin/returns/view')) return true;
    return false;
  };

  const canAccessPath = (pathname: string): boolean => {
    if (isSuperAdmin) return true;
    if (!enforceDynamic) return true;
    const mod = getModuleForPath(pathname);
    if (!mod) return true; // unmapped route => not gated by dynamic perms
    if (permissions.some(p => p.module === normalizeModule(mod))) return true;
    if (mod === 'returns_management' && isAssignmentAllowedReturnsPath(pathname)) return true;
    return false;
  };

  return {
    roleIds,
    permissions,
    assignedLicenseeIds,
    hasAnyEntityAssignment,
    hasPermission,
    hasModuleAccess,
    hasAnyModuleAccess,
    canAccessPath,
    enforceDynamic,
    isLoading,
  };
}

export type { PermissionModule };
