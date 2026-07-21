import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getModuleForPath, isProtectedInternalPath, PermissionModule } from '@/lib/permissionModules';
import { INTERNAL_ROLES } from '@/types/platform';
import { isSubmittedLifecycle } from '@/lib/returnLifecycle';

type UserPermission = {
  id?: string;
  module: string;
  name: string;
};

const normalizeKey = (value?: string | null) => String(value || '').trim().toLowerCase();
const normalizeModule = (value?: string | null) => normalizeKey(value).replace(/\s+/g, '_');
const normalizeAction = normalizeKey;

/**
 * Unified RBAC hook.
 *
 * Enforcement model (post-hardening):
 * - `super_admin` → full bypass, and ONLY super_admin bypasses.
 * - Static `admin` role no longer implicitly bypasses. Existing admins are
 *   migrated to an explicit "Legacy Admin" dynamic role (see migration).
 * - Every other internal user must carry an explicit dynamic role.
 * - Menus / routes require the module's `view` action.
 * - Actions require their exact permission (`hasPermission(module, action)`).
 * - Unknown *protected* routes are denied by default.
 * - Assignment-only regulators (Lead / Regulator / Alternate Regulator on
 *   `licensees`) get a NARROW, separate capability — never a synthetic
 *   `returns_management.view`. Consult `hasAssignmentReturnQueueAccess`,
 *   `isAssignmentAllowedReturnsPath`, and `canViewAssignedReturn` for that
 *   path — do NOT rely on `hasPermission` / `hasModuleAccess` for it.
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
  // Bypass is now super_admin only. Static `admin` must have a dynamic role
  // (Legacy Admin) provisioned by migration — no implicit bypass.
  const isBypassRole = isSuperAdmin;
  const isInternal = !!user && INTERNAL_ROLES.includes(user.role);
  // Legacy flag kept for callers that still branch on it; always true when
  // the user is not a bypass role since dynamic perms are the source of truth.
  const enforceDynamic = !isBypassRole;

  /**
   * Strict catalog match. Assignment does NOT synthesize any permission —
   * assignment-only Return Queue access is a separate capability, see
   * `hasAssignmentReturnQueueAccess` / `canViewAssignedReturn`.
   */
  const hasPermission = (module: string, action: string): boolean => {
    if (isBypassRole) return true;
    const moduleKey = normalizeModule(module);
    const actionKey = normalizeAction(action);
    return permissions.some(p => p.module === moduleKey && p.name === actionKey);
  };

  /**
   * Module access = "can see menu / open landing route". View-gated:
   * a user with only `edit` (and no `view`) must NOT see the menu.
   * Assignment does NOT unlock module access — sidebar/route consumers that
   * need the narrow Return Queue exception must additionally consult
   * `hasAssignmentReturnQueueAccess`.
   */
  const hasModuleAccess = (module: string): boolean => {
    if (isBypassRole) return true;
    const moduleKey = normalizeModule(module);
    return permissions.some(p => p.module === moduleKey && p.name === 'view');
  };

  const hasAnyModuleAccess = (): boolean => {
    if (isBypassRole) return true;
    if (permissions.some(p => p.name === 'view')) return true;
    // A pure assignment-only regulator still has *some* access surface
    // (the Return Queue) — report that here so the dashboard doesn't
    // treat them as fully locked out.
    return hasAssignmentReturnQueueAccess;
  };

  // ─── Assignment-only capability (separate from RBAC) ────────────────────

  const hasAssignmentReturnQueueAccess: boolean =
    !!isInternal && hasAnyEntityAssignment;

  /**
   * The narrow allow-list of Returns routes an assignment-only regulator may
   * open. Explicit deny for every configuration / analytics page.
   */
  const isAssignmentAllowedReturnsPath = (pathname: string): boolean => {
    if (!hasAssignmentReturnQueueAccess) return false;
    const denyPrefixes = [
      '/admin/returns/config',
      '/admin/return-config',
      '/admin/returns/types',
      '/admin/returns/cutoff',
      '/admin/returns/due-dates',
      '/admin/returns/late-fees',
      '/admin/returns/notifications',
      '/admin/returns/schedule',
      '/admin/returns/validations',
      '/admin/returns/thresholds',
      '/admin/returns/ratios',
      '/admin/returns/analytics',
      '/admin/returns/dashboard',
    ];
    if (denyPrefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))) return false;

    if (pathname.startsWith('/entity/returns')) return true;
    if (pathname === '/admin/returns' || pathname === '/admin/returns/queue') return true;
    if (pathname.startsWith('/admin/returns/queue/')) return true;
    if (pathname.startsWith('/admin/returns/view')) return true;
    if (pathname.startsWith('/admin/returns/')) return false; // any other returns admin path
    return false;
  };

  /**
   * Row-level check for a single return. Assignment-only regulators may view
   * a return iff (a) the licensee is in their assignment set AND (b) the
   * status is on the submitted-lifecycle allow-list. Users with the base
   * `returns_management.view` permission still go through backend RLS
   * (`can_view_return_filed`) — this helper is UI-side belt-and-braces.
   */
  const canViewAssignedReturn = (input: { licenseeId?: string | null; status?: string | null }): boolean => {
    if (isBypassRole) return true;
    if (!input?.licenseeId) return false;
    if (!assignedLicenseeIds.includes(input.licenseeId)) return false;
    return isSubmittedLifecycle(input.status);
  };

  const canAccessPath = (pathname: string): boolean => {
    if (isBypassRole) return true;
    const mod = getModuleForPath(pathname);
    if (!mod) {
      if (isProtectedInternalPath(pathname)) return false;
      return true;
    }
    if (permissions.some(p => p.module === normalizeModule(mod) && p.name === 'view')) return true;
    if (mod === 'returns_management' && isAssignmentAllowedReturnsPath(pathname)) return true;
    return false;
  };

  return {
    roleIds,
    permissions,
    assignedLicenseeIds,
    hasAnyEntityAssignment,
    hasAssignmentReturnQueueAccess,
    hasPermission,
    hasModuleAccess,
    hasAnyModuleAccess,
    canAccessPath,
    canViewAssignedReturn,
    isAssignmentAllowedReturnsPath,
    enforceDynamic,
    isBypassRole,
    isInternal,
    isLoading,
  };
}

export type { PermissionModule };
