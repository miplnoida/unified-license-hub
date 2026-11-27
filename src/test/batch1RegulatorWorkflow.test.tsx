/** Security Remediation Batch 1 — Regulator Management error states and Workflow Designer guards. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state = vi.hoisted(() => ({ perms: [] as Array<[string, string]> }));
const allowed = (m: string, a: string) => state.perms.some(([pm, pa]) => pm === m && pa === a);
vi.mock('@/hooks/usePermissions', () => ({
  useUserDynamicPermissions: () => ({ isLoading: false, isAssignmentOnly: false, isInternal: true, hasPermission: allowed }),
}));
vi.mock('@/hooks/useCan', () => ({ useCan: (m: string, a: string) => allowed(m, a) }));
vi.mock('@/components/layout/DashboardLayout', () => ({ DashboardLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('@/contexts/RegulatorContext', () => ({
  useRegulator: () => ({ activeRegulatorId: 'r1', activeRegulator: { id: 'r1', name: 'FSRA' }, regulators: [{ id: 'r1' }], isLoading: false, setActiveRegulator: vi.fn() }),
}));
const chain: any = new Proxy({}, { get: (_t, k) => (k === 'then' ? (r: any) => r({ data: [], error: null }) : () => chain) });
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => chain, rpc: vi.fn(async () => ({ data: null, error: null })) } }));

const q = (over: any = {}) => ({ data: [], isLoading: false, error: null, isSuccess: true, refetch: vi.fn(), ...over });
const h = vi.hoisted(() => ({ regs: null as any, workflows: null as any, steps: null as any, createStep: vi.fn(), updateStep: vi.fn() }));
vi.mock('@/hooks/useRegulators', () => ({
  useRegulatorMaster: () => h.regs,
  useRegulatorMutations: () => ({ upsert: { mutateAsync: vi.fn() }, remove: { mutateAsync: vi.fn() } }),
}));
vi.mock('@/hooks/useMasterConfig', () => ({
  useSectors: () => q(), useSubSectors: () => q(), useCategories: () => q(), useServices: () => q(),
  useMasterMutations: () => ({}),
}));
vi.mock('@/hooks/useForms', () => ({ useForms: () => q() }));
vi.mock('@/hooks/useRoles', () => ({ useRoles: () => q({ data: [{ id: 'role1', name: 'Officer', system_role: 'licensing_officer' }] }) }));
vi.mock('@/components/workflows/WorkflowVersionPanel', () => ({ WorkflowVersionPanel: () => null }));
vi.mock('@/hooks/useWorkflowEngine', async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  const m = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
  return {
    ...actual,
    useWorkflows: () => h.workflows,
    useWorkflowSteps: () => h.steps,
    useWorkflowTypeConfigs: () => ({ data: [{ key: 'application', label: 'Application', is_active: true }], isLoading: false, isError: false, error: null }),
    useCreateWorkflow: () => m, useCreateWorkflowWithSteps: () => m, useUpdateWorkflow: () => m,
    useDeleteWorkflow: () => m, useRetireWorkflow: () => m,
    useCreateStep: () => ({ ...m, mutateAsync: h.createStep }), useUpdateStep: () => ({ ...m, mutateAsync: h.updateStep }),
    useDeleteStep: () => m, useReorderSteps: () => m,
  };
});

import RegulatorManagement from '@/pages/admin/RegulatorManagement';
import WorkflowList from '@/pages/workflows/WorkflowList';

const wrap = (ui: React.ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>,
);
const wf = { id: 'w1', name: 'Licence approval', entity_type: 'application', is_active: true, regulator_id: 'r1' };

beforeEach(() => {
  state.perms = [];
  h.regs = q({ data: [] });
  h.workflows = q({ data: [wf] });
  h.steps = q({ data: [] });
  h.createStep.mockReset();
});

describe('Regulator Management', () => {
  it('failed regulator read shows error with retry', () => {
    const refetch = vi.fn();
    h.regs = q({ data: undefined, error: new Error('x'), refetch });
    wrap(<RegulatorManagement />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load regulators');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });
  it('pending read shows loading', () => {
    h.regs = q({ data: undefined, isLoading: true });
    wrap(<RegulatorManagement />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading regulators');
  });
});

describe('Workflow Designer', () => {
  it('view-only user sees workflows but no create/edit/delete/builder-edit controls', () => {
    state.perms = [['workflow_management', 'view']];
    wrap(<WorkflowList />);
    expect(screen.getByText('Licence approval')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New Workflow/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Edit workflow/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete workflow/ })).toBeNull();
  });
  it('create-only permission does not expose workflow creation (backend needs manage_config)', () => {
    state.perms = [['workflow_management', 'view'], ['workflow_management', 'create']];
    wrap(<WorkflowList />);
    expect(screen.queryByRole('button', { name: /New Workflow/ })).toBeNull();
  });
  it('manage_config holder can create and edit workflows', () => {
    state.perms = [['workflow_management', 'view'], ['workflow_management', 'manage_config']];
    wrap(<WorkflowList />);
    expect(screen.getByRole('button', { name: /New Workflow/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Edit workflow/ })).toBeInTheDocument();
  });
  it('edit holder may edit steps; view-only cannot (builder opens read-only)', () => {
    state.perms = [['workflow_management', 'view']];
    const { unmount } = wrap(<WorkflowList />);
    fireEvent.click(screen.getByRole('button', { name: /Open workflow builder/ }));
    expect(screen.queryByRole('button', { name: /Edit Steps|Add Step/ })).toBeNull();
    unmount();
    state.perms = [['workflow_management', 'view'], ['workflow_management', 'edit']];
    wrap(<WorkflowList />);
    fireEvent.click(screen.getByRole('button', { name: /Open workflow builder/ }));
    fireEvent.click(screen.getByRole('button', { name: /Edit Steps/ }));
    expect(screen.getAllByRole("button", { name: /Add Step/ }).length).toBeGreaterThan(0);
  });
  it('failed workflow read shows error with retry, not "No workflows"', () => {
    const refetch = vi.fn();
    h.workflows = q({ data: undefined, error: new Error('x'), refetch });
    state.perms = [['workflow_management', 'view'], ['workflow_management', 'manage_config']];
    wrap(<WorkflowList />);
    expect(screen.queryByText(/No workflows for/)).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0]);
    expect(refetch).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /New Workflow/ })).toBeDisabled();
  });
  it('failed steps read blocks step editing', () => {
    h.steps = q({ data: undefined, error: new Error('x') });
    state.perms = [['workflow_management', 'view'], ['workflow_management', 'edit']];
    wrap(<WorkflowList />);
    fireEvent.click(screen.getByRole('button', { name: /Open workflow builder/ }));
    expect(screen.getByText(/Unable to load workflow steps/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add Step/ })).toBeNull();
  });
});
