/**
 * Session 3 demo screens:
 *  - canonical supervisory plan list + plan record page (/supervision/plans[/:id])
 *  - historical examination finding fallback on /supervision/findings/:id
 *  - examination route gate accepting inspection_management.view for prudential records
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const tables: Record<string, any[]> = {};

function builder(table: string) {
  let rows = [...(tables[table] ?? [])];
  const b: any = {
    select: () => b,
    order: () => b,
    limit: () => b,
    eq: (col: string, val: any) => { rows = rows.filter(r => r[col] === val); return b; },
    in: (col: string, vals: any[]) => { rows = rows.filter(r => vals.includes(r[col])); return b; },
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (res: any, rej: any) => Promise.resolve({ data: rows, error: null }).then(res, rej),
  };
  return b;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (t: string) => builder(t), rpc: vi.fn() },
}));

let perms = new Set<string>();
vi.mock('@/hooks/usePermissions', () => ({
  useUserDynamicPermissions: () => ({ hasPermission: (m: string, a: string) => perms.has(`${m}.${a}`) }),
}));

vi.mock('@/components/layout/DashboardLayout', () => ({ DashboardLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/components/shared/PageHeader', () => ({
  PageHeader: ({ title, description }: any) => <div><h1>{title}</h1><p>{description}</p></div>,
}));

const ENTITY = 'cc331000-0000-4000-8000-000000000001';
const PLAN = {
  id: 'cd610001-0000-4000-8000-000000000001', reference: 'SP-CU-DEMO-2026-01',
  title: 'Rodney Bay CU — 2026 Prudential Supervisory Plan', status: 'DRAFT', priority: 'HIGH',
  domain_code: 'PRUDENTIAL', period_label: '2026', planning_period: 'annual',
  start_date: '2026-10-01', target_completion: '2026-12-15', entity_ids: [ENTITY],
  objective: 'Confirm capital adequacy', scope: 'Capital', factual_basis: 'New applicant',
};

function wrap(ui: React.ReactNode, path = '/', pattern = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path={pattern} element={ui} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); for (const k of Object.keys(tables)) delete tables[k]; perms = new Set(); });

describe('canonical supervisory plans', () => {
  it('lists a DRAFT canonical plan that has no plan actions', async () => {
    tables.supervisory_plan = [PLAN];
    tables.licensees = [{ id: ENTITY, name: 'Rodney Bay Community Credit Union Ltd' }];
    const { CanonicalSupervisoryPlans } = await import('@/components/supervision/CanonicalSupervisoryPlans');
    wrap(<CanonicalSupervisoryPlans />);
    expect(await screen.findByText('SP-CU-DEMO-2026-01')).toBeTruthy();
    expect(screen.getByText('Rodney Bay Community Credit Union Ltd')).toBeTruthy();
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'SP-CU-DEMO-2026-01' }).getAttribute('href'))
      .toBe(`/supervision/plans/${PLAN.id}`);
  });

  it('opens the plan record page', async () => {
    tables.supervisory_plan = [PLAN];
    tables.licensees = [{ id: ENTITY, name: 'Rodney Bay Community Credit Union Ltd' }];
    const { default: Page } = await import('@/pages/supervision/SupervisoryPlanRecord');
    wrap(<Page />, `/supervision/plans/${PLAN.id}`, '/supervision/plans/:id');
    expect(await screen.findByText(PLAN.title)).toBeTruthy();
    expect(screen.getByText('Confirm capital adequacy')).toBeTruthy();
  });

  it('reports an unreadable plan without inventing one', async () => {
    tables.supervisory_plan = [];
    const { default: Page } = await import('@/pages/supervision/SupervisoryPlanRecord');
    wrap(<Page />, '/supervision/plans/x', '/supervision/plans/:id');
    expect(await screen.findByText(/does not exist, or you are not authorised/)).toBeTruthy();
  });
});

describe('historical examination finding fallback', () => {
  it('shows a historical examination finding with its examination and corrective action', async () => {
    tables.examination_findings = [{
      id: 'f1', examination_id: 'e1', reference: 'EXM-CU-DEMO-2026-01-F1',
      title: 'Loan delinquency above internal tolerance', severity: 'high', status: 'remediation_pending',
      category: 'credit_risk', observation: '90+ days at 8.4%', remediation_action_id: 'a1',
    }];
    tables.examinations = [{ id: 'e1', reference: 'EXM-CU-DEMO-2026-01', title: 'Targeted exam', entity_id: ENTITY }];
    tables.licensees = [{ id: ENTITY, name: 'Rodney Bay Community Credit Union Ltd' }];
    tables.prudential_actions = [{ id: 'a1', title: 'Reduce 90+ day delinquency below 5%', status: 'in_progress' }];
    const { HistoricalExaminationFinding } = await import('@/components/supervision/finding/HistoricalExaminationFinding');
    wrap(<HistoricalExaminationFinding id="f1" notFoundMessage="missing" />);
    expect(await screen.findByText('Loan delinquency above internal tolerance')).toBeTruthy();
    expect(screen.getByText('Reduce 90+ day delinquency below 5%')).toBeTruthy();
    expect(screen.getByText(/Rodney Bay Community Credit Union Ltd/)).toBeTruthy();
  });

  it('keeps the not-found message when no historical finding is visible', async () => {
    tables.examination_findings = [];
    const { HistoricalExaminationFinding } = await import('@/components/supervision/finding/HistoricalExaminationFinding');
    wrap(<HistoricalExaminationFinding id="nope" notFoundMessage="This finding does not exist." />);
    expect(await screen.findByText('This finding does not exist.')).toBeTruthy();
  });
});

describe('examination route gate', () => {
  it('uses inspection_management for a prudential examination when the user lacks prudential view', async () => {
    perms = new Set(['inspection_management.view']);
    const { useExaminationGateModule } = await import('@/routes/ExaminationDomainRoute');
    const { result } = renderHook(() => useExaminationGateModule('PRUDENTIAL'));
    expect(result.current).toBe('inspection_management');
  });

  it('keeps prudential_supervision when the user holds prudential view', async () => {
    perms = new Set(['prudential_supervision.view', 'inspection_management.view']);
    const { useExaminationGateModule } = await import('@/routes/ExaminationDomainRoute');
    const { result } = renderHook(() => useExaminationGateModule('PRUDENTIAL'));
    expect(result.current).toBe('prudential_supervision');
  });

  it('never relaxes the AML/CFT gate with an inspection permission', async () => {
    perms = new Set(['inspection_management.view']);
    const { useExaminationGateModule } = await import('@/routes/ExaminationDomainRoute');
    const { result } = renderHook(() => useExaminationGateModule('AML_CFT'));
    expect(result.current).toBe('aml_supervision');
  });

  it('denies (stays prudential) when the user has neither permission', async () => {
    const { useExaminationGateModule } = await import('@/routes/ExaminationDomainRoute');
    const { result } = renderHook(() => useExaminationGateModule('PRUDENTIAL'));
    expect(result.current).toBe('prudential_supervision');
  });
});
