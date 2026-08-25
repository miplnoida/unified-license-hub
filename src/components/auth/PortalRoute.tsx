import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/shared/AuthLoadingScreen';
import { AccessDenied } from '@/components/shared/AccessDenied';
import { INTERNAL_ROLES } from '@/types/platform';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { hasDefaultPortalCapability, type PortalArea, type PortalCapability } from '@/lib/portalAccess';

interface PortalRouteProps {
  children: React.ReactNode;
  area: PortalArea;
  capability: PortalCapability | PortalCapability[];
  /** Kept for API compat — RLS performs the final per-row check. */
  entityId?: string | null;
}

/**
 * Unified portal route guard. Internally uses `useUserDynamicPermissions`,
 * the same hook that gates internal modules — there is no separate external
 * permission engine on the frontend. Object-level checks (which entity a row
 * belongs to) remain RLS-enforced server-side.
 */
const AREA_MODULE: Record<PortalArea, string> = {
  licensing: 'licensing',
  returns: 'returns_management',
  complaints: 'complaint_management',
  fp_declarations: 'fit_and_proper',
};

const CAPABILITY_ACTION: Record<PortalCapability, string> = {
  can_submit: 'submit',
  can_submit_returns: 'submit',
  can_submit_complaints: 'submit',
  can_submit_fp_declarations: 'submit',
  can_upload_documents: 'upload_documents',
  can_view_status: 'view_status',
  can_respond_rfi: 'respond_rfi',
};

export function PortalRoute({ children, area, capability }: PortalRouteProps) {
  const { user, session, loading, isFullyAuthenticated, mfaStatus } = useAuth();
  const location = useLocation();
  const capabilities = Array.isArray(capability) ? capability : [capability];
  const isInternal = !!user && INTERNAL_ROLES.includes(user.role);
  const { hasPermission, enforceDynamic, isLoading: permsLoading } = useUserDynamicPermissions();

  if (loading) return <AuthLoadingScreen />;
  if (!session) return <Navigate to="/" replace state={{ from: location }} />;
  if (!user) return <AuthLoadingScreen />;
  if (!isFullyAuthenticated) {
    return mfaStatus === 'pending'
      ? <Navigate to="/login?mfa=required" replace state={{ from: location }} />
      : <AuthLoadingScreen />;
  }

  // Internal staff: their access is governed by the module-permission system,
  // not by external portal area/capability mapping.
  if (isInternal) return <>{children}</>;

  // Read-only visibility is a PORTAL-IDENTITY question, not an action
  // authority one: any fully authenticated external portal user may open the
  // area workspace. Licence eligibility and action authority are decided
  // inside the page (entitlement notices) and server-side on every write.
  const readOnly = capabilities.every((cap) => cap === 'can_view_status');
  if (readOnly) return <>{children}</>;

  if (permsLoading) return <AuthLoadingScreen />;

  const moduleKey = AREA_MODULE[area];
  const grantedByDynamic = capabilities.some((cap) => hasPermission(moduleKey, CAPABILITY_ACTION[cap]));
  const grantedByRole = capabilities.some((cap) => hasDefaultPortalCapability(user.role, area, cap));

  // External users with no dynamic role mapping fall back to legacy allow.
  if (!enforceDynamic) return <>{children}</>;

  if (!grantedByDynamic && !grantedByRole) return <AccessDenied />;
  return <>{children}</>;
}
