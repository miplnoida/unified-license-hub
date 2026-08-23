import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { INTERNAL_ROLES, type AppRole } from '@/types/platform';
import { AuthLoadingScreen } from '@/components/shared/AuthLoadingScreen';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { AccessDenied } from '@/components/shared/AccessDenied';
import type { PermissionModule } from '@/lib/permissionModules';

interface RouteGuardProps {
  children: React.ReactNode;
  allowedRoles: AppRole[];
  fallbackPath?: string;
}

/**
 * Generic role-based route guard.
 * Shows loading skeleton while auth resolves, then redirects if unauthorized.
 */
export function RoleGuard({ children, allowedRoles, fallbackPath = '/dashboard' }: RouteGuardProps) {
  const { user, session, loading, isFullyAuthenticated, mfaStatus } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLoadingScreen />;
  if (!session) return <Navigate to="/" replace />;
  if (!user) return <AuthLoadingScreen />;
  if (!isFullyAuthenticated) {
    return mfaStatus === 'pending'
      ? <Navigate to="/login?mfa=required" replace state={{ from: location }} />
      : <AuthLoadingScreen />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
}

/**
 * Module-based route guard. Combines role check with dynamic permission
 * enforcement. If the user is mapped to a dynamic role with explicit
 * permissions, they must have access to the specified module.
 */
export function ModuleRoute({
  children,
  module,
  allowedRoles = ['super_admin', 'admin'],
}: {
  children: React.ReactNode;
  module: PermissionModule;
  allowedRoles?: AppRole[];
}) {
  const { user, session, loading, isFullyAuthenticated, mfaStatus } = useAuth();
  const location = useLocation();
  const {
    hasPermission,
    isBypassRole,
    hasAssignmentReturnQueueAccess,
    isAssignmentAllowedReturnsPath,
    isInternal,
    isLoading: permsLoading,
  } = useUserDynamicPermissions();

  if (loading) return <AuthLoadingScreen />;
  if (!session) return <Navigate to="/" replace />;
  if (!user) return <AuthLoadingScreen />;
  if (!isFullyAuthenticated) {
    return mfaStatus === 'pending'
      ? <Navigate to="/login?mfa=required" replace />
      : <AuthLoadingScreen />;
  }
  if (permsLoading) return <AuthLoadingScreen />;

  // super_admin bypasses.
  if (isBypassRole) return <>{children}</>;

  // Internal-audience routes remain internal-only.
  const audienceIsInternalOnly = allowedRoles.length > 0
    && allowedRoles.every((r) => INTERNAL_ROLES.includes(r));
  // Audience authority is canonical (`sec_get_user_context()` role types),
  // not the legacy `app_role` projection.
  if (audienceIsInternalOnly && !isInternal) {
    return <AccessDenied />;
  }

  // Standard path: module `view` permission.
  if (hasPermission(module, 'view')) return <>{children}</>;

  // Narrow assignment-only exception — Return Queue only, gated on the
  // ACTUAL pathname (not merely module identity).
  if (
    module === 'returns_management'
    && hasAssignmentReturnQueueAccess
    && isAssignmentAllowedReturnsPath(location.pathname)
  ) {
    return <>{children}</>;
  }

  return <AccessDenied />;
}

/**
 * Exact `<module>.<action>` route guard. Use for diagnostic / non-view
 * routes (e.g. the Permission Coverage report gated on
 * `role_management.view_coverage`) so a role that can view Role Management
 * but was NOT granted the coverage diagnostic can't reach the URL directly.
 *
 * External audiences remain blocked when `allowedRoles` is internal-only.
 */
export function PermissionRoute({
  children,
  module,
  action,
  allowedRoles = INTERNAL_ROLES,
}: {
  children: React.ReactNode;
  module: PermissionModule;
  action: string;
  allowedRoles?: AppRole[];
}) {
  const { user, session, loading, isFullyAuthenticated, mfaStatus } = useAuth();
  const { hasPermission, isBypassRole, isInternal, isLoading: permsLoading } = useUserDynamicPermissions();

  if (loading) return <AuthLoadingScreen />;
  if (!session) return <Navigate to="/" replace />;
  if (!user) return <AuthLoadingScreen />;
  if (!isFullyAuthenticated) {
    return mfaStatus === 'pending'
      ? <Navigate to="/login?mfa=required" replace />
      : <AuthLoadingScreen />;
  }
  if (permsLoading) return <AuthLoadingScreen />;

  if (isBypassRole) return <>{children}</>;

  const audienceIsInternalOnly = allowedRoles.length > 0
    && allowedRoles.every((r) => INTERNAL_ROLES.includes(r));
  // Audience authority is canonical (`sec_get_user_context()` role types),
  // not the legacy `app_role` projection.
  if (audienceIsInternalOnly && !isInternal) {
    return <AccessDenied />;
  }

  if (hasPermission(module, action)) return <>{children}</>;
  return <AccessDenied />;
}

/** Admin-only route guard. Restricts to super_admin and admin. */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['super_admin', 'admin']}>
      {children}
    </RoleGuard>
  );
}

/** Internal staff route guard. Restricts to all INTERNAL_ROLES. */
export function InternalRoute({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={INTERNAL_ROLES}>
      {children}
    </RoleGuard>
  );
}

/** Settings route guard. Only super_admin and admin can access settings. */
export function SettingsRoute({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['super_admin', 'admin']}>
      {children}
    </RoleGuard>
  );
}
