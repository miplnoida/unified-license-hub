import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * User Manual V1 route-guard contract:
 *  - unauthenticated  → login required (never renders the manual)
 *  - authenticated pre-licensee with a pending/returned registration → manual
 *    permitted (registration-gate allowlist), while every other portal route
 *    stays blocked.
 */
const mockAuth = vi.hoisted(() => ({
  user: null as any,
  session: null as any,
  loading: false,
  isFullyAuthenticated: true,
  mfaStatus: 'not_required' as string,
}));
const mockPortal = vi.hoisted(() => ({ isPreLicensee: true, loading: false }));
const mockRegistration = vi.hoisted(() => ({
  loading: false,
  isApproved: false,
  category: 'pending' as string | null,
  registration: { id: 'reg-1' } as any,
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
vi.mock('@/hooks/useEffectivePortalContext', () => ({
  useEffectivePortalContext: () => mockPortal,
}));
vi.mock('@/hooks/useRegistrationApprovalStatus', () => ({
  useRegistrationApprovalStatus: () => mockRegistration,
}));
vi.mock('@/hooks/usePermissions', () => ({
  useUserDynamicPermissions: () => ({
    hasModuleAccess: () => false,
    hasPermission: () => false,
    isLoading: false,
  }),
}));

import { ProtectedRoute, REGISTRATION_GATE_ALLOWLIST } from '@/routes/routeHelpers';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>LOGIN</div>} />
        <Route path="/registration-status" element={<div>STATUS</div>} />
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <div>MANUAL CONTENT</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('User Manual route guard', () => {
  beforeEach(() => {
    mockAuth.loading = false;
    mockAuth.isFullyAuthenticated = true;
    mockPortal.isPreLicensee = true;
    mockPortal.loading = false;
    mockRegistration.loading = false;
    mockRegistration.isApproved = false;
    mockRegistration.category = 'pending';
  });

  it('registers /help/user-manual on the registration-gate allowlist', () => {
    expect(REGISTRATION_GATE_ALLOWLIST).toContain('/help/user-manual');
  });

  it('requires login for unauthenticated visitors', () => {
    mockAuth.session = null;
    mockAuth.user = null;
    renderAt('/help/user-manual');
    expect(screen.queryByText('MANUAL CONTENT')).toBeNull();
    expect(screen.getByText('LOGIN')).toBeTruthy();
  });

  it('permits a pending pre-licensee to read the manual', () => {
    mockAuth.session = { access_token: 't' };
    mockAuth.user = { id: 'u1', role: 'pre_licensee', forcePasswordChange: false };
    renderAt('/help/user-manual');
    expect(screen.getByText('MANUAL CONTENT')).toBeTruthy();
  });

  it('still blocks other portal routes for a pending pre-licensee', () => {
    mockAuth.session = { access_token: 't' };
    mockAuth.user = { id: 'u1', role: 'pre_licensee', forcePasswordChange: false };
    renderAt('/licensing/applications');
    expect(screen.queryByText('MANUAL CONTENT')).toBeNull();
    expect(screen.getByText('STATUS')).toBeTruthy();
  });

  it('permits an approved external user to read the manual', () => {
    mockRegistration.isApproved = true;
    mockAuth.session = { access_token: 't' };
    mockAuth.user = { id: 'u1', role: 'pre_licensee', forcePasswordChange: false };
    renderAt('/help/user-manual');
    expect(screen.getByText('MANUAL CONTENT')).toBeTruthy();
  });
});
