import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { isPreLicenseeAllowedRoute } from '@/hooks/useUserPermissions';
import { AuthLoadingScreen } from '@/components/shared/AuthLoadingScreen';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { useEffectivePortalContext } from '@/hooks/useEffectivePortalContext';
import { useRegistrationApprovalStatus } from '@/hooks/useRegistrationApprovalStatus';

/**
 * Routes a non-approved pre-licensee is still allowed to visit so they can
 * read the status page, change password, or resubmit a returned registration.
 */
const REGISTRATION_GATE_ALLOWLIST = [
  '/registration-status',
  '/change-password',
  '/register',
  '/registration/success',
  '/registration/portal',
  '/update-registration-form',
  '/registration/update',
];

function isRegistrationGateAllowed(pathname: string): boolean {
  return REGISTRATION_GATE_ALLOWLIST.some(
    (route) => pathname === route || pathname.startsWith(route + '/'),
  );
}

/**
 * Protected route wrapper that:
 * - Shows a skeleton during auth resolution (no blank screen)
 * - Redirects unauthenticated users to /
 * - Enforces force-password-change redirect
 * - Enforces 2FA verification gate
 * - Restricts pre-licensee to allowed routes
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, session, loading, isFullyAuthenticated, mfaStatus } = useAuth();
  const portalContext = useEffectivePortalContext();
  const location = useLocation();
  const isRestrictedPreLicensee = !!user && portalContext.isPreLicensee;

  if (loading) return <AuthLoadingScreen />;

  // No session = not logged in. Preserve the intended URL (including search
  // params like ?registration=&submission=) so resubmission email links survive
  // a logout/login roundtrip.
  if (!session) {
    const intended = `${location.pathname}${location.search}${location.hash}`;
    const isSafe = intended.startsWith('/') && !intended.startsWith('//');
    const redirect = isSafe && intended !== '/' ? `?redirect=${encodeURIComponent(intended)}` : '';
    return <Navigate to={`/login${redirect}`} replace state={{ from: location }} />;
  }

  // Session exists but user profile not yet hydrated — keep showing skeleton
  if (!user) return <AuthLoadingScreen />;

  if (!isFullyAuthenticated) {
    if (mfaStatus === 'pending') return <Navigate to="/login?mfa=required" replace />;
    return <AuthLoadingScreen />;
  }

  if (portalContext.loading) return <AuthLoadingScreen />;

  if (user.forcePasswordChange && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  // Registration approval gate — pre-licensee users cannot enter the portal
  // until their registration has been approved by the regulator.
  if (isRestrictedPreLicensee) {
    return (
      <RegistrationApprovalGate pathname={location.pathname}>
        {children}
      </RegistrationApprovalGate>
    );
  }
  return <>{children}</>;
}

/**
 * Gate that blocks pre-licensee dashboard access until their `registrations`
 * row reaches an approved status. Non-approved users are redirected to
 * `/registration-status` (always allowed) where they can read the message and
 * resubmit when applicable.
 */
function RegistrationApprovalGate({
  pathname,
  children,
}: {
  pathname: string;
  children: React.ReactNode;
}) {
  const { loading, isApproved } = useRegistrationApprovalStatus();

  if (loading) return <AuthLoadingScreen />;

  if (!isApproved) {
    if (isRegistrationGateAllowed(pathname)) return <>{children}</>;
    return <Navigate to="/registration-status" replace />;
  }

  // Approved → fall back to legacy pre-licensee allow-list behaviour.
  if (!isPreLicenseeAllowedRoute(pathname)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

/** Shorthand wrapper — also isolates per-route render errors. */
export function P({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary context="Route">
      <ProtectedRoute>{children}</ProtectedRoute>
    </ErrorBoundary>
  );
}
