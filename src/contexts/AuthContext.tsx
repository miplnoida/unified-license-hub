import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session } from '@supabase/supabase-js';
import { PlatformUser } from '@/types/platform';
import { fetchPlatformUser } from '@/lib/authHelpers';

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
      // Keep session alive but with null user — route guards will show fallback
      setUser(null);
      setMfaStatus('not_required');
    }
  }, []);

  useEffect(() => {
    // Set up listener BEFORE getSession (per Supabase best practice)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setLoading(true);
        setSession(newSession);
        if (newSession) {
          // Defer hydration to avoid Supabase deadlock
          setTimeout(() => {
            hydrateUser(newSession).finally(() => setLoading(false));
          }, 0);
        } else {
          setUser(null);
          clear2FAState();
          setLoading(false);
        }
      }
    );

    // Initial session check
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
    if (error) return { error: error.message };
    const authUserId = data.user?.id;
    if (!authUserId) return { requires2FA: false };

    const { data: profile } = await supabase
      .from('profiles')
      .select('two_factor_enabled')
      .eq('id', authUserId)
      .maybeSingle();

    return { requires2FA: Boolean((profile as { two_factor_enabled?: boolean } | null)?.two_factor_enabled) };
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
    clear2FAState();
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, [clear2FAState]);

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
      login: async () => ({ error: 'Auth not ready' }),
      signup: async () => ({ error: 'Auth not ready' }),
      logout: async () => {},
    } as AuthContextType;
  }
  return context;
}
