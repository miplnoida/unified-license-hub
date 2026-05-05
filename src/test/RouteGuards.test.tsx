import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock useAuth for different states
const mockAuth = vi.hoisted(() => ({
  user: null as any,
  session: null as any,
  loading: true,
  isAuthenticated: false,
  mfaStatus: 'not_required' as const,
  requires2FA: false,
  isFullyAuthenticated: false,
  mark2FAVerified: vi.fn(),
  clear2FAState: vi.fn(),
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

import { RoleGuard, AdminRoute } from '@/components/auth/RouteGuards';

describe('RouteGuards', () => {
  it('shows loading skeleton when auth is loading', () => {
    mockAuth.loading = true;
    mockAuth.session = null;
    mockAuth.user = null;
    mockAuth.isFullyAuthenticated = false;

    const { container } = render(
      <MemoryRouter>
        <RoleGuard allowedRoles={['admin']}>
          <div>Protected Content</div>
        </RoleGuard>
      </MemoryRouter>
    );

    // Should show skeleton, not content
    expect(screen.queryByText('Protected Content')).toBeNull();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('redirects to / when no session', () => {
    mockAuth.loading = false;
    mockAuth.session = null;
    mockAuth.user = null;
    mockAuth.isFullyAuthenticated = false;

    render(
      <MemoryRouter>
        <RoleGuard allowedRoles={['admin']}>
          <div>Protected Content</div>
        </RoleGuard>
      </MemoryRouter>
    );

    expect(screen.queryByText('Protected Content')).toBeNull();
  });

  it('shows content when user has allowed role', () => {
    mockAuth.loading = false;
    mockAuth.session = { user: { id: '1' } };
    mockAuth.user = { id: '1', role: 'admin', fullName: 'Admin', email: 'a@b.com', status: 'active', isPreLicensee: false };
    mockAuth.isAuthenticated = true;
    mockAuth.isFullyAuthenticated = true;
    mockAuth.mfaStatus = 'verified';

    render(
      <MemoryRouter>
        <RoleGuard allowedRoles={['admin', 'super_admin']}>
          <div>Protected Content</div>
        </RoleGuard>
      </MemoryRouter>
    );

    expect(screen.getByText('Protected Content')).toBeTruthy();
  });

  it('redirects when user role is not allowed', () => {
    mockAuth.loading = false;
    mockAuth.session = { user: { id: '1' } };
    mockAuth.user = { id: '1', role: 'applicant', fullName: 'User', email: 'u@b.com', status: 'active', isPreLicensee: false };
    mockAuth.isAuthenticated = true;
    mockAuth.isFullyAuthenticated = true;
    mockAuth.mfaStatus = 'verified';

    render(
      <MemoryRouter>
        <AdminRoute>
          <div>Admin Content</div>
        </AdminRoute>
      </MemoryRouter>
    );

    expect(screen.queryByText('Admin Content')).toBeNull();
  });
});
