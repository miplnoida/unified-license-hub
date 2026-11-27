/**
 * Security Remediation Batch 1 — frontend permission and error-state fixes.
 * Authorized and unauthorized paths, plus failed-read rendering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state = vi.hoisted(() => ({
  perms: [] as Array<[string, string]>,
  isInternal: true,
  user: { id: 'u1', role: 'licensing_officer' } as any,
}));
const allowed = (m: string, a: string) => state.perms.some(([pm, pa]) => pm === m && pa === a);

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: state.user, session: {}, loading: false, isFullyAuthenticated: true, mfaStatus: 'not_required' }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  useUserDynamicPermissions: () => ({
    isLoading: false, isAssignmentOnly: false, isInternal: state.isInternal, isBypassRole: false,
    hasPermission: (m: string, a: string) => allowed(m, a),
  }),
}));
vi.mock('@/hooks/useCan', () => ({ useCan: (m: string, a: string) => allowed(m, a) }));
vi.mock('@/components/layout/DashboardLayout', () => ({ DashboardLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/contexts/RegulatorContext', () => ({
  useRegulator: () => ({ activeRegulatorId: 'r1', activeRegulator: { id: 'r1', name: 'FSRA' }, regulators: [{ id: 'r1' }], isLoading: false, setActiveRegulator: vi.fn() }),
}));

const q = (over: any = {}) => ({ data: [], isLoading: false, error: null, isSuccess: true, refetch: vi.fn(), ...over });
const master = vi.hoisted(() => ({ sectors: null as any, upsertSector: vi.fn() }));
vi.mock('@/hooks/useMasterConfig', () => ({
  useSectors: () => master.sectors,
  useSubSectors: () => q(), useCategories: () => q(), useServices: () => q(),
  useMasterMutations: () => ({
    upsertSector: { mutateAsync: master.upsertSector }, upsertSubSector: { mutateAsync: vi.fn() },
    upsertCategory: { mutateAsync: vi.fn() }, upsertService: { mutateAsync: vi.fn() },
    deleteSector: { mutateAsync: vi.fn() }, deleteSubSector: { mutateAsync: vi.fn() },
    deleteCategory: { mutateAsync: vi.fn() }, deleteService: { mutateAsync: vi.fn() },
  }),
}));
const importSpy = vi.hoisted(() => ({ onImport: null as any }));
vi.mock('@/components/admin/MasterDataImportDialog', () => ({
  MasterDataImportDialog: (p: any) => { importSpy.onImport = p.onImport; return null; },
  downloadSampleExcel: vi.fn(),
}));

import { SettingsRoute } from '@/components/auth/RouteGuards';
import MasterConfiguration from '@/pages/admin/MasterConfiguration';

const wrap = (ui: React.ReactNode, path = '/admin/masters/sectors') => render(
  <QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></QueryClientProvider>,
);

beforeEach(() => {
  state.perms = []; state.isInternal = true; state.user = { id: 'u1', role: 'licensing_officer' };
  master.sectors = q({ data: [{ id: 's1', name: 'Banking', status: 'active' }] });
  master.upsertSector.mockReset();
});

describe('SettingsRoute', () => {
  it('admits a static admin without settings.view (existing authority kept)', () => {
    state.user = { id: 'a', role: 'admin' };
    wrap(<SettingsRoute><div>settings page</div></SettingsRoute>);
    expect(screen.getByText('settings page')).toBeInTheDocument();
  });
  it('admits internal staff holding settings.view', () => {
    state.perms = [['settings', 'view']];
    wrap(<SettingsRoute><div>settings page</div></SettingsRoute>);
    expect(screen.getByText('settings page')).toBeInTheDocument();
  });
  it('refuses internal staff without settings.view', () => {
    wrap(<SettingsRoute><div>settings page</div></SettingsRoute>);
    expect(screen.queryByText('settings page')).toBeNull();
  });
  it('refuses external users even if they hold settings.view', () => {
    state.perms = [['settings', 'view']]; state.isInternal = false;
    wrap(<SettingsRoute><div>settings page</div></SettingsRoute>);
    expect(screen.queryByText('settings page')).toBeNull();
  });
});

describe('Master Configuration', () => {
  it('view-only user sees data but no Add/Import/Edit controls', () => {
    state.perms = [['settings', 'view']];
    wrap(<MasterConfiguration />);
    expect(screen.getByText('Banking')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add Sector/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Import Excel/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.getByRole('button', { name: /Sample Excel/ })).toBeInTheDocument();
  });
  it('view-only user: direct import handler invocation writes nothing', async () => {
    state.perms = [['settings', 'view']];
    wrap(<MasterConfiguration />);
    const res = await importSpy.onImport([{ name: 'X', status: 'active', rowNumber: 2 }]);
    expect(res.success).toBe(0);
    expect(res.failed).toBe(1);
    expect(master.upsertSector).not.toHaveBeenCalled();
  });
  it('settings.edit user sees controls and import writes', async () => {
    state.perms = [['settings', 'view'], ['settings', 'edit']];
    wrap(<MasterConfiguration />);
    expect(screen.getByRole('button', { name: /Add Sector/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import Excel/ })).toBeInTheDocument();
    const res = await importSpy.onImport([{ name: 'X', status: 'active', rowNumber: 2 }]);
    expect(res.success).toBe(1);
    expect(master.upsertSector).toHaveBeenCalledTimes(1);
  });
  it('failed read shows an error with retry, not an empty table', () => {
    const refetch = vi.fn();
    master.sectors = q({ data: undefined, error: new Error('boom'), isSuccess: false, refetch });
    state.perms = [['settings', 'view']];
    wrap(<MasterConfiguration />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load sector data');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });
  it('pending read shows loading, not an empty table', () => {
    master.sectors = q({ data: undefined, isLoading: true, isSuccess: false });
    wrap(<MasterConfiguration />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading sector data');
  });
});
