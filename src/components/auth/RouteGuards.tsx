import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { INTERNAL_ROLES, type AppRole } from '@/types/platform';

interface RouteGuardProps {
  children: React.ReactNode;
  allowedRoles: AppRole[];
  fallbackPath?: string;
}

/**
 * Generic role-based route guard.
 * Redirects to fallbackPath (default: /dashboard) if user's role is not in allowedRoles.
 */
export function RoleGuard({ children, allowedRoles, fallbackPath = '/dashboard' }: RouteGuardProps) {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/" replace />;

  if (user && !allowedRoles.includes(user.role)) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
}

/**
 * Admin-only route guard. Restricts to super_admin and admin.
 */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['super_admin', 'admin']}>
      {children}
    </RoleGuard>
  );
}

/**
 * Internal staff route guard. Restricts to all INTERNAL_ROLES.
 */
export function InternalRoute({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={INTERNAL_ROLES}>
      {children}
    </RoleGuard>
  );
}

/**
 * Settings route guard. Only super_admin and admin can access settings.
 */
export function SettingsRoute({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['super_admin', 'admin']}>
      {children}
    </RoleGuard>
  );
}
