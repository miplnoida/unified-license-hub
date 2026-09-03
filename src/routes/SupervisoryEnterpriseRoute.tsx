import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { AuthLoadingScreen } from '@/components/shared/AuthLoadingScreen';
import { AccessDenied } from '@/components/shared/AccessDenied';

/**
 * EPIC 4 / W6 — explicit authorization predicate for the ENTERPRISE supervisory
 * surfaces (`/supervision/portfolio`, `/supervision/team-performance`).
 *
 * These screens are cross-domain: they are sourced from the canonical work model
 * (`supervisory_work_queue`, `sup_team_performance`, `supervisory_portfolio`) and
 * are NOT Prudential-specific. The authority is therefore stated once, here, and
 * is testable:
 *
 *   super_admin / break-glass
 *   OR supervisory_spine.view                (enterprise supervisory read)
 *   OR at least ONE genuine domain supervisory view:
 *      prudential_supervision.view, aml_supervision.view,
 *      market_conduct.view, fit_and_proper.view
 *
 * Anything else — including `returns_management.view`, `license_management.view`
 * and plain "internal staff" identity — is denied. There is deliberately NO
 * default module fallback: a user with no supervisory authority must never be
 * silently evaluated against `prudential_supervision`.
 *
 * Domain scoping of the PAYLOAD remains the responsibility of the governed read
 * models / RPCs, which only return the domains the caller may see.
 */
export const SUPERVISORY_DOMAIN_VIEWS = [
  'prudential_supervision',
  'aml_supervision',
  'market_conduct',
  'fit_and_proper',
] as const;

export const SUPERVISORY_ENTERPRISE_VIEW = 'supervisory_spine';

export function SupervisoryEnterpriseRoute({ children }: { children: React.ReactNode }) {
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

  // Enterprise supervision is an internal-audience surface.
  if (!isInternal) return <AccessDenied />;

  const allowed =
    hasPermission(SUPERVISORY_ENTERPRISE_VIEW, 'view')
    || SUPERVISORY_DOMAIN_VIEWS.some((m) => hasPermission(m, 'view'));

  return allowed ? <>{children}</> : <AccessDenied />;
}

export default SupervisoryEnterpriseRoute;
