import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/shared/AuthLoadingScreen';
import { AccessDenied } from '@/components/shared/AccessDenied';
import { INTERNAL_ROLES } from '@/types/platform';
import { canAccessPortal, type PortalArea, type PortalCapability } from '@/lib/portalAccess';

interface PortalRouteProps {
  children: React.ReactNode;
  area: PortalArea;
  capability: PortalCapability | PortalCapability[];
  /** Optional: scope check to a specific entity (defaults to any active row). */
  entityId?: string | null;
}

/**
 * Guard for external portal routes. Distinct from AdminRoute / ModuleRoute,
 * which gate internal employee modules. Internal staff (admins, supervisors,
 * licensing officers, analysts) are always allowed through — their access is
 * governed by the module-permission system, not external portal capabilities.
 */
export function PortalRoute({ children, area, capability, entityId = null }: PortalRouteProps) {
  const { user, session, loading, isFullyAuthenticated, mfaStatus } = useAuth();
  const location = useLocation();
  const capabilities = Array.isArray(capability) ? capability : [capability];
  const isInternal = !!user && INTERNAL_ROLES.includes(user.role);

  const accessQuery = useQuery({
    queryKey: ['portal_route_access', user?.id, area, entityId, capabilities.join('|')],
    enabled: !!user?.id && !!session && isFullyAuthenticated && !isInternal,
    queryFn: async () => {
      const checks = await Promise.all(
        capabilities.map(cap => canAccessPortal(user!.id, entityId, area, cap)),
      );
      return checks.some(Boolean);
    },
  });

  if (loading) return <AuthLoadingScreen />;
  if (!session) return <Navigate to="/" replace state={{ from: location }} />;
  if (!user) return <AuthLoadingScreen />;
  if (!isFullyAuthenticated) {
    return mfaStatus === 'pending'
      ? <Navigate to="/login?mfa=required" replace state={{ from: location }} />
      : <AuthLoadingScreen />;
  }

  // Internal staff bypass the portal capability layer.
  if (isInternal) return <>{children}</>;

  if (accessQuery.isLoading) return <AuthLoadingScreen />;
  if (!accessQuery.data) return <AccessDenied />;
  return <>{children}</>;
}
