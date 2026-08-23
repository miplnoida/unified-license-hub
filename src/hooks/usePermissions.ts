import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getModuleForPath, isProtectedInternalPath, PermissionModule } from '@/lib/permissionModules';
import { INTERNAL_ROLES } from '@/types/platform';
import { isSubmittedLifecycle } from '@/lib/returnLifecycle';
import { useSecurityContext } from '@/hooks/useSecurityContext';
import { toUserPermissions, matchRoute, resolveAudience } from '@/lib/rbac/securityContext';
import {
  authorize,
  authorizeModule,
  authorizeAnyView,
  normalizeModule,
  normalizeAction,
  type AuthorizationContext,
  type UserPermission,
} from '@/lib/rbac/authorize';


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

  // Canonical source of truth: the database security context. Legacy tables
  // are no longer read from the client.
  const { context, isLoading: contextLoading } = useSecurityContext();

  const data = {
    roleIds: (context?.roles ?? []).map((r) => r.id),
    permissions: toUserPermissions(context),
    hasDynamicRole: (context?.roles ?? []).length > 0,
  };
  const isLoading = contextLoading;


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
  // Bypass is super_admin (or a break-glass role flagged in the catalogue)
  // only. Static `admin` carries no implicit bypass.
  const isBypassRole = isSuperAdmin || !!context?.is_bypass;
  const isInternal = !!user && INTERNAL_ROLES.includes(user.role);
  // Legacy flag kept for callers that still branch on it; always true when
  // the user is not a bypass role since dynamic perms are the source of truth.
  const enforceDynamic = !isBypassRole;

  // Assignment computed below; declared early so the shared authorization
  // context can reference it. See the block after `hasAnyModuleAccess`.
  const hasAssignmentReturnQueueAccess: boolean = hasAnyEntityAssignment;
  const isAssignmentOnlyRegulator: boolean =
    !isBypassRole && !hasDynamicRole && hasAnyEntityAssignment;

  /**
   * Shared authorization context passed into every decision. Consumers must
   * NOT re-implement the array scan — call `authorize()` (or the hook
   * helpers below) so the CI guard in `verify-authz-centralized.mjs` keeps
   * holding.
   *
   * Note: `hasPermission` / `hasModuleAccess` intentionally do NOT set
   * `isAssignmentOnly` here — those are the raw decisions used by
   * downstream consumers (e.g. `useCan` layers the assignment-only deny on
   * top). Route access DOES apply the assignment-only branch explicitly via
   * `isAssignmentAllowedReturnsPath`.
   */
  const authzCtx: AuthorizationContext = {
    userPermissions: permissions,
    isBypass: isBypassRole,
    isLoading: !!isLoading,
  };

  const hasPermission = (module: string, action: string): boolean =>
    authorize(authzCtx, module, action).allowed;

  const hasModuleAccess = (module: string): boolean =>
    authorizeModule(authzCtx, module).allowed;

  const hasAnyModuleAccess = (): boolean => {
    if (authorizeAnyView(authzCtx).allowed) return true;
    // A pure assignment-only regulator still has *some* access surface
    // (the Return Queue) — report that here so the dashboard doesn't
    // treat them as fully locked out.
    return hasAssignmentReturnQueueAccess;
  };

  // ─── Assignment-only capability (separate from RBAC) ────────────────────
  // (declared earlier so the authorization context can reference it)


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

    // Preferred path: the database route registry.
    const route = matchRoute(context?.routes, pathname);
    if (route) {
      if (!route.is_protected) return true;
      if (route.module) {
        if (authorize(authzCtx, route.module, route.action || 'view').allowed) return true;
        if (route.module === 'returns_management' && isAssignmentAllowedReturnsPath(pathname)) return true;
        return false;
      }
    }

    // Fallback for paths not yet registered in the catalogue.
    const mod = getModuleForPath(pathname);
    if (!mod) {
      if (isProtectedInternalPath(pathname)) return false;
      return true;
    }
    if (authorizeModule(authzCtx, mod).allowed) return true;
    if (mod === 'returns_management' && isAssignmentAllowedReturnsPath(pathname)) return true;
    return false;
  };


  /**
   * True when the user has NO dynamic role permissions at all but IS mapped
   * as a regulator on at least one licensee. Such users may only view mapped
   * returns — every business action button/menu must be hidden for them.
   */
  const isAssignmentOnly: boolean = isAssignmentOnlyRegulator;


  return {
    roleIds,
    permissions,
    assignedLicenseeIds,
    hasAnyEntityAssignment,
    hasAssignmentReturnQueueAccess,
    isAssignmentOnly,
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
