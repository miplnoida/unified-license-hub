import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ role: 'licensee_primary', internal: false, loading: false }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({
  user: { id: 'test-user', role: state.role }, session: { user: { id: 'test-user' } },
  loading: false, isFullyAuthenticated: true, mfaStatus: 'not_required',
}) }));
vi.mock('@/hooks/usePermissions', () => ({ useUserDynamicPermissions: () => ({
  hasPermission: () => true, enforceDynamic: false, isLoading: state.loading, isInternal: state.internal,
}) }));
vi.mock('@/contexts/PpocContext', () => ({ usePpoc: () => ({ isPpoc: false, loading: false }) }));
vi.mock('@/components/shared/AccessDenied', () => ({ AccessDenied: () => null }));
vi.mock('@/components/shared/AuthLoadingScreen', () => ({ AuthLoadingScreen: () => null }));
vi.mock('@/components/layout/DashboardLayout', () => ({ DashboardLayout: ({ children }: { children: React.ReactNode }) => children }));

import { PortalRoute } from '@/components/auth/PortalRoute';

describe('complaint workspace audience authorization', () => {
  beforeEach(() => { state.role = 'licensee_primary'; state.internal = false; state.loading = false; });

  it.each(['licensee_primary', 'licensee_secondary', 'applicant', 'pre_licensee'])('refuses %s despite submit permissions', (role) => {
    state.role = role;
    const protectedPage = vi.fn(() => null);
    const Page = protectedPage;
    render(<MemoryRouter initialEntries={['/complaints']}><PortalRoute area="complaints" capability={['can_submit_complaints', 'can_view_status']}><Page /></PortalRoute></MemoryRouter>);
    expect(protectedPage).not.toHaveBeenCalled();
  });

  it('refuses read-only tracking for institutional users', () => {
    const Page = vi.fn(() => null);
    render(<MemoryRouter initialEntries={['/complaints/track/reference']}><PortalRoute area="complaints" capability="can_view_status"><Page /></PortalRoute></MemoryRouter>);
    expect(Page).not.toHaveBeenCalled();
  });

  it('preserves internal complaint access', () => {
    state.role = 'supervisor'; state.internal = true;
    const Page = vi.fn(() => null);
    render(<MemoryRouter><PortalRoute area="complaints" capability="can_view_status"><Page /></PortalRoute></MemoryRouter>);
    expect(Page).toHaveBeenCalled();
  });

  it('waits for canonical audience rather than trusting a legacy staff role', () => {
    state.role = 'admin'; state.loading = true;
    const Page = vi.fn(() => null);
    render(<MemoryRouter><PortalRoute area="complaints" capability="can_view_status"><Page /></PortalRoute></MemoryRouter>);
    expect(Page).not.toHaveBeenCalled();
  });
});