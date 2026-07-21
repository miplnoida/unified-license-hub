/**
 * RBAC unit tests for the unified permission hook.
 * Covers: super_admin bypass, legacy admin bypass, unmapped internal deny,
 * edit-without-view deny, view grants menu, unknown protected route deny,
 * assignment-only Return Queue exception (allowed + blocked config paths).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockAuthUser = vi.hoisted(() => ({ current: null as any }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockAuthUser.current }),
}));

const supabaseState = vi.hoisted(() => ({
  udr: [] as Array<{ role_id: string }>,
  rp: [] as Array<{ permission_id: string }>,
  perms: [] as Array<{ id: string; module: string; name: string }>,
  licensees: [] as Array<{ id: string }>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const fromMock = (table: string) => {
    if (table === 'user_dynamic_roles') {
      return { select: () => ({ eq: async () => ({ data: supabaseState.udr }) }) };
    }
    if (table === 'role_permissions') {
      return { select: () => ({ in: async () => ({ data: supabaseState.rp }) }) };
    }
    if (table === 'permissions') {
      return { select: () => ({ in: async () => ({ data: supabaseState.perms }) }) };
    }
    if (table === 'licensees') {
      return { select: () => ({ or: async () => ({ data: supabaseState.licensees }) }) };
    }
    return { select: () => ({}) };
  };
  return { supabase: { from: fromMock } };
});

import { useUserDynamicPermissions } from '@/hooks/usePermissions';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function renderPerms() {
  const hook = renderHook(() => useUserDynamicPermissions(), { wrapper });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

beforeEach(() => {
  supabaseState.udr = [];
  supabaseState.rp = [];
  supabaseState.perms = [];
  supabaseState.licensees = [];
  mockAuthUser.current = null;
});

describe('RBAC — unified permission hook', () => {
  it('super_admin bypasses every check', async () => {
    mockAuthUser.current = { id: 'sa', role: 'super_admin' };
    const { result } = await renderPerms();
    expect(result.current.hasPermission('anything', 'delete')).toBe(true);
    expect(result.current.hasModuleAccess('any_module')).toBe(true);
    expect(result.current.canAccessPath('/admin/does-not-exist')).toBe(true);
  });

  it('static admin without a dynamic role is denied by default (bypass removed)', async () => {
    mockAuthUser.current = { id: 'a1', role: 'admin' };
    const { result } = await renderPerms();
    // Post-hardening: only super_admin bypasses. Existing admins are
    // migrated to a "Legacy Admin" dynamic role via migration; the frontend
    // no longer treats the static admin role as an implicit bypass.
    expect(result.current.hasPermission('returns_management', 'export')).toBe(false);
    expect(result.current.hasModuleAccess('license_management')).toBe(false);
    expect(result.current.canAccessPath('/admin/licensees')).toBe(false);
  });

  it('unmapped internal user (analyst) is denied by default', async () => {
    mockAuthUser.current = { id: 'u1', role: 'license_analyst' };
    const { result } = await renderPerms();
    expect(result.current.hasModuleAccess('returns_management')).toBe(false);
    expect(result.current.hasPermission('returns_management', 'view')).toBe(false);
    expect(result.current.canAccessPath('/admin/returns')).toBe(false);
    expect(result.current.hasAnyModuleAccess()).toBe(false);
  });

  it('user with only `edit` does NOT see menu or open route', async () => {
    mockAuthUser.current = { id: 'u2', role: 'reviewer' };
    supabaseState.udr = [{ role_id: 'r1' }];
    supabaseState.rp = [{ permission_id: 'p1' }];
    supabaseState.perms = [{ id: 'p1', module: 'returns_management', name: 'edit' }];
    const { result } = await renderPerms();
    expect(result.current.hasPermission('returns_management', 'edit')).toBe(true);
    expect(result.current.hasPermission('returns_management', 'view')).toBe(false);
    expect(result.current.hasModuleAccess('returns_management')).toBe(false); // view-gated
    expect(result.current.canAccessPath('/admin/returns')).toBe(false);
  });

  it('user with `view` sees menu and route; action buttons still gated', async () => {
    mockAuthUser.current = { id: 'u3', role: 'reviewer' };
    supabaseState.udr = [{ role_id: 'r1' }];
    supabaseState.rp = [{ permission_id: 'p1' }];
    supabaseState.perms = [{ id: 'p1', module: 'returns_management', name: 'view' }];
    const { result } = await renderPerms();
    expect(result.current.hasModuleAccess('returns_management')).toBe(true);
    expect(result.current.canAccessPath('/admin/returns')).toBe(true);
    expect(result.current.hasPermission('returns_management', 'export')).toBe(false);
    expect(result.current.hasPermission('returns_management', 'approve')).toBe(false);
  });

  it('unknown protected /admin/* path is denied when no module maps to it', async () => {
    mockAuthUser.current = { id: 'u4', role: 'reviewer' };
    supabaseState.udr = [{ role_id: 'r1' }];
    supabaseState.rp = [{ permission_id: 'p1' }];
    supabaseState.perms = [{ id: 'p1', module: 'returns_management', name: 'view' }];
    const { result } = await renderPerms();
    expect(result.current.canAccessPath('/admin/some-unknown-page')).toBe(false);
    expect(result.current.canAccessPath('/prudential/unmapped')).toBe(false);
    // Non-protected unmapped path (e.g. /profile) remains accessible.
    expect(result.current.canAccessPath('/profile')).toBe(true);
  });

  describe('assignment-only regulator exception (separate capability)', () => {
    beforeEach(() => {
      mockAuthUser.current = { id: 'reg1', role: 'license_analyst' };
      supabaseState.licensees = [{ id: 'lic-1' }];
    });

    it('exposes a dedicated capability flag; does NOT synthesize hasPermission/hasModuleAccess', async () => {
      const { result } = await renderPerms();
      expect(result.current.hasAnyEntityAssignment).toBe(true);
      expect(result.current.hasAssignmentReturnQueueAccess).toBe(true);
      // Critical: assignment must NOT masquerade as returns_management.view.
      expect(result.current.hasPermission('returns_management', 'view')).toBe(false);
      expect(result.current.hasModuleAccess('returns_management')).toBe(false);
    });

    it('canAccessPath unlocks Return Queue paths via the assignment exception', async () => {
      const { result } = await renderPerms();
      expect(result.current.canAccessPath('/admin/returns')).toBe(true);
      expect(result.current.canAccessPath('/admin/returns/queue')).toBe(true);
      expect(result.current.canAccessPath('/admin/returns/queue/abc-123')).toBe(true);
    });

    it('blocks Returns admin/config pages', async () => {
      const { result } = await renderPerms();
      const denied = [
        '/admin/returns/config',
        '/admin/return-config',
        '/admin/returns/types',
        '/admin/returns/cutoff',
        '/admin/returns/due-dates',
        '/admin/returns/late-fees',
        '/admin/returns/notifications',
        '/admin/returns/schedule',
        '/admin/returns/validations',
        '/admin/returns/thresholds',
        '/admin/returns/ratios',
        '/admin/returns/analytics',
        '/admin/returns/dashboard',
      ];
      for (const p of denied) {
        expect(result.current.canAccessPath(p)).toBe(false);
      }
    });

    it('does NOT grant export / edit / approve / configure implicitly', async () => {
      const { result } = await renderPerms();
      expect(result.current.hasPermission('returns_management', 'export')).toBe(false);
      expect(result.current.hasPermission('returns_management', 'edit')).toBe(false);
      expect(result.current.hasPermission('returns_management', 'approve')).toBe(false);
      expect(result.current.hasPermission('returns_management', 'download')).toBe(false);
      expect(result.current.hasPermission('returns_management', 'configure')).toBe(false);
    });

    it('canViewAssignedReturn requires mapped licensee AND submitted lifecycle', async () => {
      const { result } = await renderPerms();
      expect(result.current.canViewAssignedReturn({ licenseeId: 'lic-1', status: 'submitted' })).toBe(true);
      expect(result.current.canViewAssignedReturn({ licenseeId: 'lic-1', status: 'under_review' })).toBe(true);
      // Pre-submission statuses denied.
      expect(result.current.canViewAssignedReturn({ licenseeId: 'lic-1', status: 'draft' })).toBe(false);
      expect(result.current.canViewAssignedReturn({ licenseeId: 'lic-1', status: 'wip' })).toBe(false);
      expect(result.current.canViewAssignedReturn({ licenseeId: 'lic-1', status: 'temp' })).toBe(false);
      expect(result.current.canViewAssignedReturn({ licenseeId: 'lic-1', status: null })).toBe(false);
      // Unmapped licensee denied even when status is submitted.
      expect(result.current.canViewAssignedReturn({ licenseeId: 'other-lic', status: 'submitted' })).toBe(false);
    });

    it('does not unlock any other module', async () => {
      const { result } = await renderPerms();
      expect(result.current.hasModuleAccess('license_management')).toBe(false);
      expect(result.current.hasModuleAccess('report_management')).toBe(false);
      expect(result.current.canAccessPath('/admin/licensees')).toBe(false);
    });
  });
});
