import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session } from '@supabase/supabase-js';
import { PlatformUser } from '@/types/platform';
import { fetchPlatformUser } from '@/lib/authHelpers';

interface AuthContextType {
  user: PlatformUser | null;
  session: Session | null;
  /** True while session or profile is still being determined */
  loading: boolean;
  /** True when a valid session exists (even if profile is still loading) */
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  signup: (email: string, password: string, fullName: string, role?: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrateUser = useCallback(async (sess: Session) => {
    try {
      const platformUser = await fetchPlatformUser(sess.user.id, sess.user.email || '');
      setUser(platformUser);
    } catch (err) {
      console.error('[Auth] Failed to hydrate user profile:', err);
      // Keep session alive but with null user — route guards will show fallback
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // Set up listener BEFORE getSession (per Supabase best practice)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        if (newSession) {
          // Defer hydration to avoid Supabase deadlock
          setTimeout(() => hydrateUser(newSession), 0);
        } else {
          setUser(null);
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

  // When user is set after initial load, mark loading as done
  useEffect(() => {
    if (user && loading) setLoading(false);
  }, [user, loading]);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
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
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAuthenticated: !!session,
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
      login: async () => ({ error: 'Auth not ready' }),
      signup: async () => ({ error: 'Auth not ready' }),
      logout: async () => {},
    } as AuthContextType;
  }
  return context;
}
