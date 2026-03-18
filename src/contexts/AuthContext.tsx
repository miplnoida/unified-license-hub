import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session } from '@supabase/supabase-js';
import { AppRole, PlatformUser, ROLE_HIERARCHY } from '@/types/platform';

interface AuthContextType {
  user: PlatformUser | null;
  session: Session | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  signup: (email: string, password: string, fullName: string, role?: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = useCallback(async (userId: string, email: string) => {
    // Fetch role from user_roles
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    let userRole: AppRole = 'applicant';
    
    if (roleData && roleData.length > 0) {
      const roles = roleData.map(r => r.role as AppRole);
      for (const r of ROLE_HIERARCHY) {
        if (roles.includes(r)) {
          userRole = r;
          break;
        }
      }
    }

    const isPreLicensee = userRole === 'pre_licensee';

    if (isPreLicensee) {
      // Pre-licensee users are stored in pre_license_users table
      const { data: preLicProfile } = await supabase
        .from('pre_license_users' as any)
        .select('*')
        .eq('id', userId)
        .single();

      const profile = preLicProfile as any;
      setUser({
        id: userId,
        email,
        fullName: profile?.full_name || email,
        role: userRole,
        entityName: profile?.entity_name || undefined,
        status: profile?.status || 'active',
        isPreLicensee: true,
      });
    } else {
      // System users (admin, licensee, etc.) are stored in profiles table
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      setUser({
        id: userId,
        email,
        fullName: profile?.full_name || email,
        role: userRole,
        entityName: profile?.entity_name || undefined,
        status: profile?.status || 'active',
        licenseeId: (profile as any)?.licensee_id || undefined,
        isPreLicensee: false,
      });
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        if (newSession?.user) {
          setTimeout(() => fetchUserData(newSession.user.id, newSession.user.email || ''), 0);
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      if (!existing) setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchUserData]);

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
        isAuthenticated: !!user,
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
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
