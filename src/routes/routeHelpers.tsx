import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { isPreLicenseeAllowedRoute } from '@/hooks/useUserPermissions';
import { AuthLoadingScreen } from '@/components/shared/AuthLoadingScreen';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Protected route wrapper that:
 * - Shows a skeleton during auth resolution (no blank screen)
 * - Redirects unauthenticated users to /
 * - Enforces force-password-change redirect
 * - Enforces 2FA verification gate
 * - Restricts pre-licensee to allowed routes
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, session, loading } = useAuth();
  const location = useLocation();
  const [mfaCheck, setMfaCheck] = useState<'checking' | 'ok' | 'required'>('checking');

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!user) { setMfaCheck('checking'); return; }
      const verifiedFor = sessionStorage.getItem('two_factor_verified_user_id');
      if (verifiedFor === user.id) { setMfaCheck('ok'); return; }
      // Look up server-side 2FA flag
      const { data } = await supabase
        .from('profiles')
        .select('two_factor_enabled')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if ((data as any)?.two_factor_enabled) {
        sessionStorage.setItem('pending_2fa_user_id', user.id);
        setMfaCheck('required');
      } else {
        sessionStorage.setItem('two_factor_verified_user_id', user.id);
        setMfaCheck('ok');
      }
    }
    check();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (loading) return <AuthLoadingScreen />;

  // No session = not logged in
  if (!session) return <Navigate to="/" replace />;

  // Session exists but user profile not yet hydrated — keep showing skeleton
  if (!user) return <AuthLoadingScreen />;

  if (user.forcePasswordChange && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (mfaCheck === 'checking') return <AuthLoadingScreen />;
  if (mfaCheck === 'required') return <Navigate to="/?mfa=required" replace />;

  if (user.isPreLicensee && !isPreLicenseeAllowedRoute(location.pathname)) {
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
