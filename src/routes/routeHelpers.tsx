import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { isPreLicenseeAllowedRoute } from '@/hooks/useUserPermissions';
import { AuthLoadingScreen } from '@/components/shared/AuthLoadingScreen';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';

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
  const location = useLocation();
  const isRestrictedPreLicensee = !!user && user.role === 'pre_licensee' && !user.licenseeId;

  if (loading) return <AuthLoadingScreen />;

  // No session = not logged in
  if (!session) return <Navigate to="/" replace />;

  // Session exists but user profile not yet hydrated — keep showing skeleton
  if (!user) return <AuthLoadingScreen />;

  if (!isFullyAuthenticated) {
    if (mfaStatus === 'pending') return <Navigate to="/login?mfa=required" replace />;
    return <AuthLoadingScreen />;
  }

  if (user.forcePasswordChange && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (isRestrictedPreLicensee && !isPreLicenseeAllowedRoute(location.pathname)) {
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
