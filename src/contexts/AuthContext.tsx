import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session } from '@supabase/supabase-js';
import { PlatformUser } from '@/types/platform';
import { fetchPlatformUser } from '@/lib/authHelpers';

/**
 * Auth gateway failures (e.g. HTTP 504 with a plain-text body) surface from the
 * client library as an empty/structural message such as "{}". Never show that
 * to users; show a safe human-readable fallback instead.
 */
export function safeAuthErrorMessage(message: string | undefined, status?: number): string {
  const m = (message ?? '').trim();
  const meaningless = !m || /^[{}\[\]\s]*$/.test(m) || m === 'null' || m === 'undefined';
  if (meaningless || (status !== undefined && status >= 500)) {
    return 'Sign-in could not be completed. Please try again.';
  }
  return m;
}
import { logLogin, logLogout, logSecurityEvent } from '@/lib/complianceAudit';

export type MfaStatus = 'not_required' | 'pending' | 'verified';

interface AuthContextType {
  user: PlatformUser | null;
  session: Session | null;
  /** True while session or profile is still being determined */
  loading: boolean;
  /** True when a valid session exists (even if profile is still loading) */
  isAuthenticated: boolean;
  mfaStatus: MfaStatus;
  requires2FA: boolean;
  isFullyAuthenticated: boolean;
  refreshUser: () => Promise<void>;
  mark2FAVerified: (userId: string) => void;
  clear2FAState: () => void;
  login: (email: string, password: string) => Promise<{ error?: string; requires2FA?: boolean }>;
  signup: (email: string, password: string, fullName: string, role?: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaStatus, setMfaStatus] = useState<MfaStatus>('not_required');

  const clear2FAState = useCallback(() => {
    try {
      sessionStorage.removeItem('pending_2fa_user_id');
      sessionStorage.removeItem('two_factor_verified_user_id');
    } catch {
      /* ignore */
    }
    setMfaStatus('not_required');
  }, []);

  const mark2FAVerified = useCallback((userId: string) => {
    try {
      sessionStorage.removeItem('pending_2fa_user_id');
      sessionStorage.setItem('two_factor_verified_user_id', userId);
    } catch {
      /* ignore */
    }
    setMfaStatus('verified');
  }, []);

  const hydrateUser = useCallback(async (sess: Session) => {
    try {
      const platformUser = await fetchPlatformUser(sess.user.id, sess.user.email || '');
      setUser(platformUser);
      if (platformUser.twoFactorEnabled) {
        const verifiedFor = sessionStorage.getItem('two_factor_verified_user_id');
        if (verifiedFor === sess.user.id) {
          setMfaStatus('verified');
          try {
            sessionStorage.removeItem('pending_2fa_user_id');
          } catch {
            /* ignore */
          }
        } else {
          try {
            sessionStorage.setItem('pending_2fa_user_id', sess.user.id);
          } catch {
            /* ignore */
          }
          setMfaStatus('pending');
        }
      } else {
        try {
          sessionStorage.removeItem('pending_2fa_user_id');
          sessionStorage.setItem('two_factor_verified_user_id', sess.user.id);
        } catch {
          /* ignore */
        }
        setMfaStatus('not_required');
      }
    } catch (err) {
      console.error('[Auth] Failed to hydrate user profile:', err);
      // Do NOT call setUser(null) here. Clearing user on a transient network
      // error would trigger the !user guard in ProtectedRoute, unmounting the
      // current page and destroying any open dialogs / in-progress form state.
      // The existing user object remains valid — only clear it on explicit logout.
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!session) return;
    await hydrateUser(session);
  }, [hydrateUser, session]);

  useEffect(() => {
    // onAuthStateChange fires for EVERY Supabase auth event — including
    // TOKEN_REFRESHED and SIGNED_IN triggered by Supabase's own visibility
    // listener when the browser tab regains focus. If we call setLoading(true)
    // here, the route guard renders <AuthLoadingScreen />, which unmounts the
    // current page and destroys all open dialogs and in-progress form state.
    //
    // Fix: onAuthStateChange NEVER controls the loading gate. It only silently
    // updates session/user in the background. The loading gate is set once on
    // mount and cleared only after the initial getSession() resolves.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        if (newSession) {
          // Defer hydration to avoid Supabase client deadlock
          setTimeout(() => {
            hydrateUser(newSession).catch(err =>
              console.warn('[Auth] background re-hydration failed:', err)
            );
          }, 0);
        } else {
          // Genuine sign-out — clear user so route guard redirects to login
          setUser(null);
          clear2FAState();
        }
      }
    );

    // Initial session check — the ONLY place that lowers the loading gate.
    // After this resolves, loading stays false forever; tab switches, token
    // refreshes, and session revalidations all happen silently.
    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      if (existing) {
        setSession(existing);
        hydrateUser(existing).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [hydrateUser]);

  // Re-hydrate every 5 minutes so delegated permissions begin/end automatically
  // without requiring a logout/login round-trip.
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      hydrateUser(session).catch(err =>
        console.warn('[Auth] Periodic re-hydrate failed:', err)
      );
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [session, hydrateUser]);

  // When user is set after initial load, mark loading as done
  useEffect(() => {
    if (user && loading) setLoading(false);
  }, [user, loading]);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Log failed sign-in as a security event (best-effort).
      const status = (error as { status?: number }).status;
      logSecurityEvent('AUTH_FAILED', { target_resource: 'auth.session', detail: { email, message: error.message, status } }).catch(() => {});
      return { error: safeAuthErrorMessage(error.message, status) };
    }
    const authUserId = data.user?.id;
    if (!authUserId) return { requires2FA: false };

    // Fire-and-forget audit of successful login.
    logLogin(email).catch(() => {});

    const [{ data: profile }, { data: preProfile }] = await Promise.all([
      supabase.from('profiles').select('two_factor_enabled').eq('id', authUserId).maybeSingle(),
      supabase.from('pre_license_users').select('two_factor_enabled').eq('id', authUserId).maybeSingle(),
    ]);
    const enabled = Boolean(
      (profile as { two_factor_enabled?: boolean } | null)?.two_factor_enabled ||
      (preProfile as { two_factor_enabled?: boolean } | null)?.two_factor_enabled
    );
    return { requires2FA: enabled };
  }, []);

  const signup = useCallback(async (email: string, password: string, fullName: string, role?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role: role || 'pre_licensee' },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) return { error: error.message };
    return {};
  }, []);

  const logout = useCallback(async () => {
    // Log BEFORE signOut so auth.uid() is still available server-side.
    const currentUserId = session?.user?.id;
    if (currentUserId) {
      await logLogout(currentUserId).catch(() => {});
    }
    clear2FAState();
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith('registration_approval_cache:'))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, [clear2FAState, session]);


  const requires2FA = !!session && !!user?.twoFactorEnabled;
  const isFullyAuthenticated = !!session && (mfaStatus === 'not_required' || mfaStatus === 'verified');

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAuthenticated: !!session,
        mfaStatus,
        requires2FA,
        isFullyAuthenticated,
        refreshUser,
        mark2FAVerified,
        clear2FAState,
        loading,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    // Defensive fallback: avoid crashing the entire app if a component is
    // rendered outside the provider (e.g. during HMR module desync). Returns
    // a "loading, unauthenticated" stub so guards safely render a skeleton
    // rather than blanking the whole app.
    console.warn('[useAuth] called outside AuthProvider — returning safe stub');
    return {
      user: null,
      session: null,
      loading: true,
      isAuthenticated: false,
      mfaStatus: 'not_required',
      requires2FA: false,
      isFullyAuthenticated: false,
      mark2FAVerified: () => {},
      clear2FAState: () => {},
      refreshUser: async () => {},
      login: async () => ({ error: 'Auth not ready' }),
      signup: async () => ({ error: 'Auth not ready' }),
      logout: async () => {},
    } as AuthContextType;
  }
  return context;
}
