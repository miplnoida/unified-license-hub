/**
 * UI-CALCADMIN-01…14 — AML-06 calculation policy administration.
 *
 * The four governed policy layers (question participation, dimension policy,
 * fact transformation, materiality) are exercised as rendered surfaces, and the
 * established scoring/band/matrix/lifecycle screen is asserted for integration.
 * No gate asserts a regulator value: they assert that the browser only collects
 * policy and hands it to a governed server operation.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const CONFIG = 'c6600000-0000-4000-8000-000000000001';
const METHODOLOGY = 'm6600000-0000-4000-8000-000000000001';
const BANDS = ['LOW', 'MEDIUM_HIGH', 'HIGH'];

const TABLES: Record<string, any[]> = {
  supervisory_methodology_question: [
    { id: 'q1', question_code: 'AML-Q-001', prompt: 'Are PEP relationships identified?', calculation_participation: 'SCORED', methodology_dimension_id: 'd1' },
    { id: 'q2', question_code: 'AML-Q-002', prompt: 'Is the risk appetite documented?', calculation_participation: null, methodology_dimension_id: 'd1' },
  ],
  supervisory_methodology_dimension: [
    { id: 'd1', dimension_code: 'CUSTOMER', label: 'Customer risk', dimension_group: 'INHERENT' },
    { id: 'd2', dimension_code: 'CONTROLS', label: 'Control environment', dimension_group: 'CONTROL' },
  ],
  supervisory_calculation_question_weight: [],
  supervisory_calculation_dimension_weight: [],
  supervisory_calculation_fact_rule: [],
  supervisory_calculation_fact_threshold: [],
  supervisory_calculation_materiality_rule: [],
};

const calls: Array<{ fn: string; args: any }> = [];
let rpcError: string | null = null;

function builder(table: string) {
  const b: any = {
    select: () => b,
    eq: () => b,
    in: () => b,
    order: () => Promise.resolve({ data: TABLES[table] ?? [], error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (res: any) => Promise.resolve({ data: TABLES[table] ?? [], error: null }).then(res),
  };
  return b;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (!(table in TABLES)) throw new Error(`UI-CALCADMIN: unexpected table read ${table}`);
      return builder(table);
    },
    rpc: async (fn: string, args: any) => {
      calls.push({ fn, args });
      if (fn === 'supervisory_methodology_fact_register') {
        return {
          data: { rows: [{ id: 'f1', fact_code: 'PEP_RATIO', label: 'PEP customer ratio', data_type: 'percentage', unit: 'PERCENT' }] },
          error: null,
        };
      }
      if (rpcError) return { data: null, error: { message: rpcError } };
      return { data: 1, error: null };
    },
  },
}));

const toastCalls: Array<[string, string]> = [];
vi.mock('sonner', () => ({
  toast: {
    success: (m: string) => toastCalls.push(['success', String(m)]),
    error: (m: string) => toastCalls.push(['error', String(m)]),
  },
}));

import { QuestionParticipationEditor } from '@/components/admin/calculation/QuestionParticipationEditor';
import { DimensionPolicyEditor } from '@/components/admin/calculation/DimensionPolicyEditor';
import { FactTransformEditor } from '@/components/admin/calculation/FactTransformEditor';
import { MaterialityEditor } from '@/components/admin/calculation/MaterialityEditor';

const configPage = readFileSync('src/pages/admin/SupervisoryCalculationConfig.tsx', 'utf8');
const approvalsPage = readFileSync('src/pages/admin/SupervisoryCalculationApprovals.tsx', 'utf8');

beforeEach(() => {
  const proto = window.HTMLElement.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
  calls.length = 0;
  toastCalls.length = 0;
  rpcError = null;
});

afterEach(cleanup);

function mount(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('AML-06 calculation policy administration', () => {
  it('UI-CALCADMIN-01 question participation lists every published question as undecided until the regulator decides', async () => {
    mount(<QuestionParticipationEditor configId={CONFIG} methodologyId={METHODOLOGY} canEdit />);
    await waitFor(() => expect(screen.getByText('AML-Q-001')).toBeInTheDocument());
    expect(screen.getByText('AML-Q-002')).toBeInTheDocument();
    expect(screen.getAllByText('Undecided').length).toBeGreaterThan(0);
  });

  it('UI-CALCADMIN-02 question participation saves through the governed operation and omits undecided questions', async () => {
    const user = userEvent.setup({ delay: null });
    mount(<QuestionParticipationEditor configId={CONFIG} methodologyId={METHODOLOGY} canEdit />);
    await waitFor(() => expect(screen.getByText('AML-Q-001')).toBeInTheDocument());
    const row = screen.getByText('AML-Q-001').closest('tr')!;
    await user.click(within(row).getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'SCORED' }));
    await user.click(screen.getByRole('button', { name: /Save question participation/ }));
    await waitFor(() => expect(calls.some((c) => c.fn === 'supervisory_calculation_question_weights_set')).toBe(true));
    const sent = calls.find((c) => c.fn === 'supervisory_calculation_question_weights_set')!.args._rows;
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ question_code: 'AML-Q-001', participation: 'SCORED' });
  });

  it('UI-CALCADMIN-03 an approved policy version is read-only in the browser', async () => {
    mount(<QuestionParticipationEditor configId={CONFIG} methodologyId={METHODOLOGY} canEdit={false} />);
    await waitFor(() => expect(screen.getByText('AML-Q-001')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Save question participation/ })).toBeDisabled();
    expect(screen.getByLabelText('Weight for AML-Q-001')).toBeDisabled();
  });

  it('UI-CALCADMIN-04 a governed refusal is shown verbatim rather than worked around', async () => {
    const user = userEvent.setup({ delay: null });
    rpcError = 'only a draft calculation policy may be edited';
    mount(<QuestionParticipationEditor configId={CONFIG} methodologyId={METHODOLOGY} canEdit />);
    await waitFor(() => expect(screen.getByText('AML-Q-001')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Save question participation/ }));
    await waitFor(() => expect(toastCalls.some(([k, m]) => k === 'error' && /draft calculation policy/.test(m))).toBe(true));
  });

  it('UI-CALCADMIN-05 dimension policy offers only the server vocabulary for the assessment side', async () => {
    const user = userEvent.setup({ delay: null });
    mount(<DimensionPolicyEditor configId={CONFIG} methodologyId={METHODOLOGY} canEdit />);
    await waitFor(() => expect(screen.getByText('CUSTOMER')).toBeInTheDocument());
    const row = screen.getByText('CUSTOMER').closest('tr')!;
    await user.click(within(row).getAllByRole('combobox')[0]);
    expect(await screen.findByRole('option', { name: 'INHERENT_RISK' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'CONTROL_EFFECTIVENESS' })).toBeInTheDocument();
  });

  it('UI-CALCADMIN-06 dimension policy saves side, weight and minimum completeness through the governed operation', async () => {
    const user = userEvent.setup({ delay: null });
    mount(<DimensionPolicyEditor configId={CONFIG} methodologyId={METHODOLOGY} canEdit />);
    await waitFor(() => expect(screen.getByText('CUSTOMER')).toBeInTheDocument());
    const row = screen.getByText('CUSTOMER').closest('tr')!;
    await user.click(within(row).getAllByRole('combobox')[0]);
    await user.click(await screen.findByRole('option', { name: 'INHERENT_RISK' }));
    await user.click(screen.getByRole('button', { name: /Save dimension policy/ }));
    await waitFor(() => expect(calls.some((c) => c.fn === 'supervisory_calculation_dimension_weights_set')).toBe(true));
    const sent = calls.find((c) => c.fn === 'supervisory_calculation_dimension_weights_set')!.args._rows;
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ dimension_code: 'CUSTOMER', contributes_to: 'INHERENT_RISK' });
  });

  it('UI-CALCADMIN-07 fact transformation lists the facts the methodology declares', async () => {
    mount(<FactTransformEditor configId={CONFIG} methodologyId={METHODOLOGY} canEdit bandCodes={BANDS} />);
    await waitFor(() => expect(screen.getByText(/Add a rule for a declared fact/)).toBeInTheDocument());
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByRole('option', { name: /PEP_RATIO/ })).toBeInTheDocument();
  });

  it('UI-CALCADMIN-08 a fact threshold band may only use a code the methodology publishes', async () => {
    const user = userEvent.setup({ delay: null });
    mount(<FactTransformEditor configId={CONFIG} methodologyId={METHODOLOGY} canEdit bandCodes={BANDS} />);
    await waitFor(() => expect(screen.getByText(/Add a rule for a declared fact/)).toBeInTheDocument());
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /PEP_RATIO/ }));
    await waitFor(() => expect(screen.getByText('PEP_RATIO')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Add (a )?band|Add threshold/i }));
    const bandSelect = screen.getAllByRole('combobox').pop()!;
    await user.click(bandSelect);
    for (const code of BANDS) {
      expect(await screen.findByRole('option', { name: code })).toBeInTheDocument();
    }
    expect(screen.queryByRole('option', { name: 'CRITICAL' })).not.toBeInTheDocument();
  });

  it('UI-CALCADMIN-09 fact rules save through the governed operation', async () => {
    const user = userEvent.setup({ delay: null });
    mount(<FactTransformEditor configId={CONFIG} methodologyId={METHODOLOGY} canEdit bandCodes={BANDS} />);
    await waitFor(() => expect(screen.getByText(/Add a rule for a declared fact/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Save fact transformation/i }));
    await waitFor(() => expect(calls.some((c) => c.fn === 'supervisory_calculation_fact_rules_set')).toBe(true));
  });

  it('UI-CALCADMIN-10 materiality rules save through the governed operation with a rationale', async () => {
    const user = userEvent.setup({ delay: null });
    mount(<MaterialityEditor configId={CONFIG} methodologyId={METHODOLOGY} canEdit bandCodes={BANDS} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Save materiality/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Save materiality/i }));
    await waitFor(() => expect(calls.some((c) => c.fn === 'supervisory_calculation_materiality_set')).toBe(true));
  });

  it('UI-CALCADMIN-11 the configuration screen mounts all four policy layers alongside scores, bands and the matrix', () => {
    for (const tab of ['Response scoring', 'Question participation', 'Dimension policy', 'Fact transformation', 'Materiality', 'Bands', 'Residual matrix', 'History']) {
      expect(configPage).toContain(tab);
    }
    for (const editor of ['QuestionParticipationEditor', 'DimensionPolicyEditor', 'FactTransformEditor', 'MaterialityEditor']) {
      expect(configPage).toContain(`<${editor}`);
    }
  });

  it('UI-CALCADMIN-12 the residual matrix uses only the methodology\'s published rating vocabulary', () => {
    expect(configPage).toContain('riskScaleCodes');
    expect(configPage).toContain('controlScaleCodes');
    expect(/const\s+(RESIDUAL|RATINGS?)\s*=\s*\[/.test(configPage)).toBe(false);
  });

  it('UI-CALCADMIN-13 draft-only editing, server validation and lifecycle submission are wired to governed operations', () => {
    expect(configPage).toContain('useValidateCalculationConfig');
    expect(configPage).toContain('useCalculationConfigLifecycle');
    expect(configPage).toMatch(/canEdit/);
    expect(configPage).toMatch(/isDraft/);
  });

  it('UI-CALCADMIN-14 approval is a separate maker-checker surface driven by the server', () => {
    expect(approvalsPage).toContain('useCalculationConfigLifecycle');
    expect(approvalsPage).toContain('data-rbac');
  });
});
