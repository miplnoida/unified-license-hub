import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { User, UserRole } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { Session } from '@supabase/supabase-js';

export type WebUserType = 'primary' | 'secondary';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  webUserType: WebUserType | null;
  login: (role: UserRole) => void;
  logout: () => void;
  switchRole: (role: UserRole) => void;
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock users for demonstration (admin panel)
const mockUsers: Record<UserRole, User> = {
  pre_licensee: {
    id: 'user-1',
    name: 'John Smith',
    email: 'john.smith@example.com',
    role: 'pre_licensee',
    organizationName: 'ABC Financial Services Ltd.',
  },
  post_licensee: {
    id: 'user-2',
    name: 'Jane Doe',
    email: 'jane.doe@example.com',
    role: 'post_licensee',
    organizationName: 'XYZ Insurance Corp.',
    licenseNumber: 'LIC-2024-001',
    isLicensee: true,
  },
  admin: {
    id: 'admin-1',
    name: 'Sarah Johnson',
    email: 'sarah.johnson@afsc.gov',
    role: 'admin',
  },
  reviewer: {
    id: 'reviewer-1',
    name: 'Michael Chen',
    email: 'michael.chen@afsc.gov',
    role: 'reviewer',
  },
  approver: {
    id: 'approver-1',
    name: 'Emily Davis',
    email: 'emily.davis@afsc.gov',
    role: 'approver',
  },
  supervisor: {
    id: 'supervisor-1',
    name: 'Robert Wilson',
    email: 'robert.wilson@afsc.gov',
    role: 'supervisor',
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [webUserType, setWebUserType] = useState<WebUserType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for auth state changes FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        if (newSession?.user) {
          // Fetch profile to get user_type
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', newSession.user.id)
            .single();

          if (profile) {
            const mappedRole: UserRole = (profile.role as UserRole) || 'post_licensee';
            setUser({
              id: newSession.user.id,
              name: profile.full_name,
              email: profile.email,
              role: mappedRole,
              organizationName: profile.entity_name || undefined,
              isLicensee: mappedRole === 'post_licensee',
            });
            setWebUserType(profile.user_type as WebUserType);
          }
        } else {
          // Only clear real auth user if no mock user is active
          if (!user || session) {
            setUser(null);
            setWebUserType(null);
          }
        }
        setLoading(false);
      }
    );

    // Then check existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (!existingSession) {
        setLoading(false);
      }
      // onAuthStateChange will handle the rest
    });

    return () => subscription.unsubscribe();
  }, []);

  // Mock login for admin panel demo
  const login = useCallback((role: UserRole) => {
    setUser(mockUsers[role]);
    setWebUserType(null); // mock users don't have web user type
  }, []);

  const logout = useCallback(async () => {
    if (session) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setSession(null);
    setWebUserType(null);
  }, [session]);

  const switchRole = useCallback((role: UserRole) => {
    setUser(mockUsers[role]);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        webUserType,
        login,
        logout,
        switchRole,
        session,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
