import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { User, UserRole } from '@/types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (role: UserRole) => void;
  logout: () => void;
  switchRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock users for demonstration
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

  const login = useCallback((role: UserRole) => {
    setUser(mockUsers[role]);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
  }, []);

  const switchRole = useCallback((role: UserRole) => {
    setUser(mockUsers[role]);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        logout,
        switchRole,
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
