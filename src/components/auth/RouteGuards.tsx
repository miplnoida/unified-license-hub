import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { INTERNAL_ROLES, type AppRole } from '@/types/platform';
import { AuthLoadingScreen } from '@/components/shared/AuthLoadingScreen';

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
  const { user, session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLoadingScreen />;
  if (!session) return <Navigate to="/" replace />;
  if (!user) return <AuthLoadingScreen />;

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={fallbackPath} replace />;
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
