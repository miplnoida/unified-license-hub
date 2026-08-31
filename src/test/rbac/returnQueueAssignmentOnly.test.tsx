/**
 * Return Queue assignment-only regulator lockdown.
 *
 * A user with NO dynamic-role permissions but AT LEAST ONE entity assignment
 * (Lead / Officer / Alternate Regulator on a licensee) is strictly view-only
 * on their mapped Return Queue. Every action control must be hidden.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockAuthUser = vi.hoisted(() => ({ current: null as any }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockAuthUser.current }),
  AuthProvider: ({ children }: any) => <>{children}</>,
}));

const supabaseState = vi.hoisted(() => ({
  udr: [] as Array<{ role_id: string }>,
  rp: [] as Array<{ permission_id: string }>,
  perms: [] as Array<{ id: string; module: string; name: string }>,
  licensees: [{ id: 'lic-1' }] as Array<{ id: string }>,
  returns: [] as any[],
  configs: [] as any[],
  licList: [] as any[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const chain = (data: any) => {
    const p: any = Promise.resolve({ data, error: null });
    p.select = () => chain(data);
    p.eq = () => chain(data);
    p.in = () => chain(data);
    p.or = () => Promise.resolve({ data });
    p.order = () => chain(data);
    p.not = () => chain(data);
    p.gte = () => chain(data);
    p.lte = () => chain(data);
    return p;
  };
  const fromMock = (table: string) => {
    if (table === 'user_dynamic_roles') return { select: () => ({ eq: async () => ({ data: supabaseState.udr }) }) };
    if (table === 'role_permissions') return { select: () => ({ in: async () => ({ data: supabaseState.rp }) }) };
    if (table === 'permissions') return { select: () => ({ in: async () => ({ data: supabaseState.perms }) }) };
    if (table === 'licensees') return { select: () => ({ or: async () => ({ data: supabaseState.licensees }) }), then: undefined } as any;
    if (table === 'returns_filed') return chain(supabaseState.returns);
    if (table === 'return_configs') return chain(supabaseState.configs);
    return chain([]);
  };
  // DCI-01: headline totals come from the canonical returns aggregate RPC.
  return { supabase: { from: fromMock, rpc: async () => ({ data: {}, error: null }) } };

});

vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/hooks/useWorkflowTotalSla', () => ({
  useWorkflowTotalSla: () => ({ byEntityId: new Map() }),
}));

import ViewReturns from '@/pages/returns-mgmt/ViewReturns';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/returns/queue']}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  supabaseState.udr = [];
  supabaseState.rp = [];
  supabaseState.perms = [];
  supabaseState.licensees = [{ id: 'lic-1' }];
  supabaseState.returns = [];
  supabaseState.configs = [];
});

describe('Return Queue — assignment-only regulator lockdown', () => {
  it('hides Export button for an assignment-only regulator', async () => {
    mockAuthUser.current = { id: 'u1', role: 'license_analyst' };
    render(<ViewReturns />, { wrapper });
    // Wait for permissions to resolve.
    await waitFor(() => {
      expect(screen.queryByText(/Loading/i)).toBeNull();
    });
    expect(screen.queryByRole('button', { name: /export/i })).toBeNull();
  });

  it('shows Export button for a user with returns_management.export', async () => {
    mockAuthUser.current = { id: 'u2', role: 'license_analyst' };
    supabaseState.udr = [{ role_id: 'r1' }];
    supabaseState.rp = [{ permission_id: 'p1' }, { permission_id: 'p2' }];
    supabaseState.perms = [
      { id: 'p1', module: 'returns_management', name: 'view' },
      { id: 'p2', module: 'returns_management', name: 'export' },
    ];
    supabaseState.licensees = [];
    render(<ViewReturns />, { wrapper });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export/i })).toBeTruthy();
    });
  });
});
