import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/shared/AuthLoadingScreen';
import { AccessDenied } from '@/components/shared/AccessDenied';
import { INTERNAL_ROLES } from '@/types/platform';
import { useExternalPortalAccess } from '@/hooks/useExternalPortalAccess';
import type { PortalArea, PortalCapability } from '@/lib/portalAccess';

interface PortalRouteProps {
  children: React.ReactNode;
  area: PortalArea;
  capability: PortalCapability;
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
  const { rows, isLoading: accessLoading } = useExternalPortalAccess();
  const location = useLocation();

  if (loading) return <AuthLoadingScreen />;
  if (!session) return <Navigate to="/" replace state={{ from: location }} />;
  if (!user) return <AuthLoadingScreen />;
  if (!isFullyAuthenticated) {
    return mfaStatus === 'pending'
      ? <Navigate to="/login?mfa=required" replace state={{ from: location }} />
      : <AuthLoadingScreen />;
  }

  // Internal staff bypass the portal capability layer.
  if (INTERNAL_ROLES.includes(user.role)) return <>{children}</>;

  if (accessLoading) return <AuthLoadingScreen />;

  const match = rows.find(
    r => r.portal_area === area
      && r.status === 'active'
      && (entityId ? r.entity_id === entityId : true)
      && Boolean((r as any)[capability]),
  );

  if (!match) return <AccessDenied />;
  return <>{children}</>;
}
