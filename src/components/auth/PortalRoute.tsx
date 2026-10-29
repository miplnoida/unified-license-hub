import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AuthLoadingScreen } from '@/components/shared/AuthLoadingScreen';
import { AccessDenied } from '@/components/shared/AccessDenied';
import { INTERNAL_ROLES } from '@/types/platform';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { hasDefaultPortalCapability, type PortalArea, type PortalCapability } from '@/lib/portalAccess';
import { usePpoc } from '@/contexts/PpocContext';
import { canUsePostLicenceServices } from '@/lib/postLicenceAccess';
import { resolvePortalReturnsRedirect } from '@/lib/returnsAudienceRoute';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

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
  const { isPpoc, loading: ppocLoading } = usePpoc();

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
  if (isInternal) {
    // Staff never file returns: send them to the regulator returns workspace.
    const target = area === 'returns' ? resolvePortalReturnsRedirect(location.pathname) : null;
    if (target) return <Navigate to={target} replace />;
    return <>{children}</>;
  }

  // Returns filing is a licensed-institution service; applicant-only accounts
  // (even when linked to the licence their application produced) are refused.
  if (area === 'returns') {
    if (ppocLoading) return <AuthLoadingScreen />;
    const allowed = canUsePostLicenceServices({
      role: user.role, userType: user.userType, licenseeId: user.licenseeId, isPpoc,
    });
    if (!allowed) return <LicensedInstitutionOnly />;
  }

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

function LicensedInstitutionOnly() {
  return (
    <DashboardLayout>
      <Card className="mx-auto mt-10 max-w-xl">
        <CardContent className="space-y-3 p-8 text-center">
          <h2 className="text-lg font-semibold">Available to licensed institutions</h2>
          <p className="text-sm text-muted-foreground">
            Regulatory returns are filed by the licensed institution's portal users (Primary or Secondary User).
            Your account is used for the pre-licence application journey.
          </p>
          <Button asChild variant="outline"><Link to="/dashboard">Back to dashboard</Link></Button>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
