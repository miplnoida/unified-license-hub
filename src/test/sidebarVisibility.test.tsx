/**
 * Persona-driven sidebar visibility audit.
 *
 * For each canonical persona, mounts <Sidebar /> with a mocked auth +
 * permission surface and asserts:
 *   (a) expected menu labels are visible,
 *   (b) forbidden labels are NOT visible,
 *   (c) no parent group renders with zero visible children (checked
 *       implicitly — parents whose children are all hidden are removed
 *       by the sidebar itself; asserting the parent label absent covers it).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type { AppRole } from '@/types/platform';

// ─── Hoisted mock state ────────────────────────────────────────────────
const state = vi.hoisted(() => ({
  user: null as null | { id: string; role: AppRole },
  permsByModule: {} as Record<string, string[]>, // module -> [actions]
  isBypass: false,
  hasAssignment: false,
  portal: { loading: false, isLicensee: false, isPreLicensee: false, isInternal: false },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: state.user }),
}));

vi.mock('@/contexts/SiteSettingsContext', () => ({
  useSiteSettings: () => ({ branding: { site_name: 'Test', logo_url: '' } }),
}));

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

vi.mock('@/hooks/useEffectivePortalContext', () => ({
  useEffectivePortalContext: () => state.portal,
}));

vi.mock('@/hooks/usePermissions', () => {
  const hasPermission = (mod: string, action: string) => {
    if (state.isBypass) return true;
    return state.permsByModule[mod]?.includes(action) ?? false;
  };
  const hasModuleAccess = (mod: string) => {
    if (state.isBypass) return true;
    return hasPermission(mod, 'view');
  };
  const hasAnyModuleAccess = () => {
    if (state.isBypass) return true;
    return Object.values(state.permsByModule).some((a) => a.includes('view'));
  };
  const isAssignmentAllowedReturnsPath = (p: string) => {
    if (!state.hasAssignment) return false;
    if (p === '/admin/returns' || p === '/admin/returns/queue') return true;
    if (p.startsWith('/admin/returns/queue/')) return true;
    return false;
  };
  return {
    useUserDynamicPermissions: () => ({
      hasPermission,
      hasModuleAccess,
      hasAnyModuleAccess,
      enforceDynamic: !state.isBypass,
      isBypassRole: state.isBypass,
      hasAssignmentReturnQueueAccess: state.hasAssignment,
      isAssignmentAllowedReturnsPath,
      canAccessPath: () => true,
      hasAnyEntityAssignment: state.hasAssignment,
      canViewAssignedReturn: () => false,
      isLoading: false,
    }),
  };
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Sidebar } from '@/components/layout/Sidebar';

/**
 * The Sidebar consumes TanStack Query (navigation sections + security
 * context), exactly as the runtime app does under `App.tsx`'s provider.
 * Each persona gets a fresh, isolated client with retries disabled so no
 * cache state leaks between personas.
 */
function renderSidebar() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function labels(): string[] {
  // Every nav-item — link or collapsible parent — renders its label as text
  // inside the <aside>. Read all rendered text nodes at the .nav-item level
  // plus child links (rendered inside a bordered container).
  const aside = document.querySelector('aside');
  if (!aside) return [];
  const nodes = aside.querySelectorAll('a, button');
  const out: string[] = [];
  nodes.forEach((n) => {
    const t = (n.textContent || '').trim();
    if (t) out.push(t);
  });
  return out;
}

function has(label: string): boolean {
  return labels().some((l) => l === label || l.startsWith(label));
}

// Modules the "Legacy Admin" persona holds .view on (matches the migrated role)
const ALL_KNOWN_VIEW: Record<string, string[]> = {};
for (const m of [
  'application_management', 'license_management', 'registration_management',
  'returns_management', 'complaint_management', 'complaint_type',
  'user_management', 'role_management', 'report_management', 'fee_management',
  'form_management', 'workflow_management', 'settings',
  'fit_and_proper', 'fit_and_proper_screening', 'fit_and_proper_committee',
  'market_conduct', 'coordination', 'prudential_supervision',
  'notification_management',
]) {
  ALL_KNOWN_VIEW[m] = ['view'];
}

beforeEach(() => {
  state.user = null;
  state.permsByModule = {};
  state.isBypass = false;
  state.hasAssignment = false;
  state.portal = { loading: false, isLicensee: false, isPreLicensee: false, isInternal: false };
});

describe('Sidebar persona audit', () => {
  it('Super Admin — sees everything (bypass)', () => {
    state.user = { id: 'sa', role: 'super_admin' };
    state.portal.isInternal = true;
    state.isBypass = true;
    renderSidebar();
    for (const l of [
      'Dashboard', 'Admin Control Panel', 'Employee Management', 'Role Management',
      'Returns Admin', 'Returns Queue', 'Approval Workflows', 'Analytics', 'Reports',
    ]) {
      expect(has(l), `Super Admin should see "${l}"`).toBe(true);
    }
  });

  it('Legacy Admin (dynamic .view on every module) — sees everything', () => {
    state.user = { id: 'la', role: 'admin' };
    state.portal.isInternal = true;
    state.permsByModule = ALL_KNOWN_VIEW;
    renderSidebar();
    expect(has('Dashboard')).toBe(true);
    expect(has('Admin Control Panel')).toBe(true);
    expect(has('Returns Queue')).toBe(true);
    expect(has('Returns Admin')).toBe(true);
    expect(has('Analytics')).toBe(true);
    expect(has('Approval Workflows')).toBe(true);
  });

  it('Static Admin without dynamic role — no internal menus (post-hardening)', () => {
    state.user = { id: 'a1', role: 'admin' };
    state.portal.isInternal = true;
    // No perms, no bypass.
    renderSidebar();
    expect(has('Admin Control Panel')).toBe(false);
    expect(has('Returns Queue')).toBe(false);
    expect(has('Returns Admin')).toBe(false);
    expect(has('Analytics')).toBe(false);
    // Dashboard also hidden — no module.view anywhere.
    expect(has('Dashboard')).toBe(false);
  });

  it('Analyst — view-only on returns_management', () => {
    state.user = { id: 'an', role: 'analyst' };
    state.portal.isInternal = true;
    state.permsByModule = { returns_management: ['view'] };
    renderSidebar();
    expect(has('Dashboard')).toBe(true); // hasAnyModuleAccess = true
    expect(has('Returns Queue')).toBe(true);
    // No admin section, no other module menus.
    expect(has('Admin Control Panel')).toBe(false);
    expect(has('Employee Management')).toBe(false);
    expect(has('Approval Workflows')).toBe(false);
    expect(has('Complaints')).toBe(false);
    expect(has('Analytics')).toBe(false);
  });

  it('Reviewer — view-only on complaint_management', () => {
    state.user = { id: 'rv', role: 'analyst' };
    state.portal.isInternal = true;
    state.permsByModule = { complaint_management: ['view'] };
    renderSidebar();
    expect(has('Complaints')).toBe(true);
    expect(has('Returns Queue')).toBe(false);
    expect(has('Admin Control Panel')).toBe(false);
  });

  it('Supervisor — view on returns_management + market_conduct', () => {
    state.user = { id: 'sv', role: 'supervisor' };
    state.portal.isInternal = true;
    state.permsByModule = {
      returns_management: ['view'],
      market_conduct: ['view'],
    };
    renderSidebar();
    expect(has('Returns Queue')).toBe(true);
    expect(has('Conduct Dashboard')).toBe(true);
    expect(has('Admin Control Panel')).toBe(false);
    expect(has('Analytics')).toBe(false); // report_management not granted
  });

  it('Assignment-only regulator — sees ONLY Returns Queue', () => {
    state.user = { id: 'reg', role: 'analyst' };
    state.portal.isInternal = true;
    state.hasAssignment = true;
    // No dynamic permissions.
    renderSidebar();

    expect(has('Returns Queue')).toBe(true);

    // Every forbidden label per audit rule.
    const forbidden = [
      'Dashboard',
      'Admin Control Panel', 'Administration',
      'Return Types', 'Configurations', 'Cutoff Config',
      'Due Dates', 'Late Fees', 'Schedule Calendar',
      'Notif Templates', 'Notif Log', 'Notification Templates',
      'Prudential Analytics', 'Analytics',
      'Prudential Ratios', 'Prudential Thresholds',
      'Returns Admin',
      'Approval Workflows', 'Reports',
      'Employee Management', 'Role Management',
      'Complaints', 'Conduct Dashboard',
    ];
    for (const l of forbidden) {
      expect(has(l), `Assignment-only regulator MUST NOT see "${l}"`).toBe(false);
    }
  });

  it('Edit-only user (no view) — no returns menu', () => {
    state.user = { id: 'ed', role: 'analyst' };
    state.portal.isInternal = true;
    state.permsByModule = { returns_management: ['edit'] };
    renderSidebar();
    expect(has('Returns Queue')).toBe(false);
    expect(has('Returns Admin')).toBe(false);
    expect(has('Dashboard')).toBe(false); // hasAnyModuleAccess false (no .view)
  });

  it('View-only user — mirrors Analyst persona (menu visible, no actions)', () => {
    state.user = { id: 'vo', role: 'analyst' };
    state.portal.isInternal = true;
    state.permsByModule = { returns_management: ['view'] };
    renderSidebar();
    expect(has('Returns Queue')).toBe(true);
    expect(has('Admin Control Panel')).toBe(false);
  });

  it('External licensee_primary — sees licensee menus, no internal panels', () => {
    state.user = { id: 'lp', role: 'licensee_primary' };
    state.portal = { loading: false, isLicensee: true, isPreLicensee: false, isInternal: false };
    // Licensee portal users hold `.view` on their operational modules via
    // their dynamic role — mirror that so audience-scoped items resolve.
    state.permsByModule = {
      application_management: ['view'],
      complaint_management: ['view'],
    };
    renderSidebar();

    expect(has('Dashboard')).toBe(true);
    expect(has('My Licenses')).toBe(true);
    expect(has('My Returns')).toBe(true);
    expect(has('Payment History')).toBe(true);

    // No admin/internal items.
    for (const l of [
      'Admin Control Panel', 'Employee Management', 'Role Management',
      'Returns Queue', 'Returns Admin', 'Approval Workflows',
      'Analytics', 'Reports', 'Conduct Dashboard',
    ]) {
      expect(has(l), `Licensee MUST NOT see "${l}"`).toBe(false);
    }
  });

  it('External applicant — sees My Licenses, no internal panels', () => {
    state.user = { id: 'ap', role: 'applicant' };
    state.portal = { loading: false, isLicensee: false, isPreLicensee: false, isInternal: false };
    state.permsByModule = { application_management: ['view'] };
    renderSidebar();

    expect(has('My Licenses')).toBe(true);
    expect(has('Admin Control Panel')).toBe(false);
    expect(has('Returns Queue')).toBe(false);
  });

  it('External pre_licensee — sees My Licenses', () => {
    state.user = { id: 'pl', role: 'pre_licensee' };
    state.portal = { loading: false, isLicensee: false, isPreLicensee: true, isInternal: false };
    state.permsByModule = { application_management: ['view'] };
    renderSidebar();

    expect(has('My Licenses')).toBe(true);
    expect(has('Admin Control Panel')).toBe(false);
  });
});
