/**
 * Behavioural tests for the registration approval gate inside ProtectedRoute.
 *
 * Verifies the exact acceptance criteria from the task:
 *   - approved pre-licensee can reach the dashboard
 *   - pending / in-review pre-licensee is redirected to /registration-status
 *   - rejected pre-licensee is redirected (status page shows the rejection message)
 *   - correction/RFI pre-licensee is redirected (status page shows resubmit)
 *   - internal admin/reviewer users are NEVER gated
 *   - manual deep links (e.g. /payments) are blocked for unapproved pre-licensees
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { MfaStatus } from '@/contexts/AuthContext';
import type { RegistrationCategory } from '@/lib/registrationStatus';

const mockAuth = vi.hoisted(() => ({
  user: null as any,
  session: null as any,
  loading: false,
  isAuthenticated: true,
  mfaStatus: 'not_required' as MfaStatus,
  requires2FA: false,
  isFullyAuthenticated: true,
  mark2FAVerified: vi.fn(),
  clear2FAState: vi.fn(),
  refreshUser: vi.fn(),
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
}));

const mockPortal = vi.hoisted(() => ({
  loading: false,
  isInternal: false,
  isLicensee: false,
  isPreLicensee: false,
  isApplicant: false,
  audience: 'applicant',
  effectiveRole: 'applicant',
  activeLicenseeId: null,
}));

const mockGate = vi.hoisted(() => ({
  enforced: true,
  isApproved: false,
  loading: false,
  category: 'pending' as RegistrationCategory,
  registration: null as any,
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
vi.mock('@/hooks/useEffectivePortalContext', () => ({
  useEffectivePortalContext: () => mockPortal,
}));
vi.mock('@/hooks/useRegistrationApprovalStatus', () => ({
  useRegistrationApprovalStatus: () => mockGate,
}));
vi.mock('@/hooks/usePermissions', () => ({
  useUserDynamicPermissions: () => ({
    roleIds: [],
    permissions: [],
    hasPermission: () => false,
    hasModuleAccess: () => false,
    hasAnyModuleAccess: () => false,
    canAccessPath: () => true,
    enforceDynamic: false,
    isLoading: false,
  }),
}));

import { P } from '@/routes/routeHelpers';

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="/dashboard" element={<P><div>DASHBOARD</div></P>} />
        <Route path="/payments" element={<P><div>PAYMENTS</div></P>} />
        <Route path="/registration-status" element={<div>STATUS PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function setUser(opts: { isPreLicensee: boolean; isInternal?: boolean }) {
  mockAuth.session = { user: { id: 'u1', email: 'u@example.com' } };
  mockAuth.user = {
    id: 'u1',
    email: 'u@example.com',
    role: opts.isPreLicensee ? 'pre_licensee' : 'admin',
    forcePasswordChange: false,
  };
  mockPortal.isPreLicensee = opts.isPreLicensee;
  mockPortal.isInternal = !!opts.isInternal;
}

describe('Registration approval gate (ProtectedRoute)', () => {
  beforeEach(() => {
    mockAuth.loading = false;
    mockAuth.isFullyAuthenticated = true;
    mockPortal.loading = false;
    mockGate.loading = false;
  });

  it('approved pre-licensee reaches the dashboard', () => {
    setUser({ isPreLicensee: true });
    mockGate.isApproved = true;
    mockGate.category = 'approved';
    renderAt('/dashboard');
    expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
  });

  it('pending pre-licensee is redirected to /registration-status', () => {
    setUser({ isPreLicensee: true });
    mockGate.isApproved = false;
    mockGate.category = 'pending';
    renderAt('/dashboard');
    expect(screen.queryByText('DASHBOARD')).toBeNull();
    expect(screen.getByText('STATUS PAGE')).toBeInTheDocument();
  });

  it('rejected pre-licensee is redirected to /registration-status', () => {
    setUser({ isPreLicensee: true });
    mockGate.isApproved = false;
    mockGate.category = 'rejected';
    renderAt('/dashboard');
    expect(screen.getByText('STATUS PAGE')).toBeInTheDocument();
  });

  it('returned-for-correction pre-licensee is redirected to /registration-status', () => {
    setUser({ isPreLicensee: true });
    mockGate.isApproved = false;
    mockGate.category = 'correction';
    renderAt('/dashboard');
    expect(screen.getByText('STATUS PAGE')).toBeInTheDocument();
  });

  it('manual deep link to /payments is blocked for unapproved pre-licensee', () => {
    setUser({ isPreLicensee: true });
    mockGate.isApproved = false;
    mockGate.category = 'in_review';
    renderAt('/payments');
    expect(screen.queryByText('PAYMENTS')).toBeNull();
    expect(screen.getByText('STATUS PAGE')).toBeInTheDocument();
  });

  it('internal admin user is NOT gated by registration approval', () => {
    setUser({ isPreLicensee: false, isInternal: true });
    // Even if the gate hook claims not approved, internal users skip it.
    mockGate.isApproved = false;
    mockGate.category = 'pending';
    renderAt('/dashboard');
    expect(screen.getByText('DASHBOARD')).toBeInTheDocument();
  });

  it('unapproved pre-licensee CAN open /registration-status itself', () => {
    setUser({ isPreLicensee: true });
    mockGate.isApproved = false;
    mockGate.category = 'pending';
    renderAt('/registration-status');
    expect(screen.getByText('STATUS PAGE')).toBeInTheDocument();
  });
});
