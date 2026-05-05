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
  const { hasModuleAccess, enforceDynamic, isLoading: permsLoading } = useUserDynamicPermissions();

  if (loading) return <AuthLoadingScreen />;
  if (!session) return <Navigate to="/" replace />;
  if (!user) return <AuthLoadingScreen />;
  if (!isFullyAuthenticated) {
    return mfaStatus === 'pending'
      ? <Navigate to="/login?mfa=required" replace />
      : <AuthLoadingScreen />;
  }

  // Wait for permissions to resolve before deciding
  if (permsLoading) return <AuthLoadingScreen />;

  // Dynamic-role users: module permission is the sole source of truth.
  if (enforceDynamic) {
    if (!hasModuleAccess(module)) return <AccessDenied />;
    return <>{children}</>;
  }

  // Legacy enforcement: fall back to the static role list.
  if (!allowedRoles.includes(user.role)) {
    return <AccessDenied />;
  }

  return <>{children}</>;
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
