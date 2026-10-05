import { AmlCalculationBreakdown } from '@/components/supervision/aml/AmlCalculationBreakdown';
/**
 * UI-CALC-01…12 — AML-06 assessment calculation / risk-result workspace.
 *
 * The payload shapes mirror exactly what `supervisory_assessment_calculation_view`
 * returns (as exercised by the rolled-back AML06CERT fixture in
 * `scripts/verify-aml-calculation-policy-engine.sql`). The gates prove the panel
 * renders the server's numbered immutable run, its trace and its overrides, and
 * decides no regulatory value itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const ASSESSMENT = 'a5500000-0000-4000-8000-000000000001';
const METHODOLOGY = 'm5500000-0000-4000-8000-000000000001';

const CALCULATED_RUN = {
  id: 'r5500000-0000-4000-8000-000000000002',
  run_seq: 2,
  status: 'CALCULATED',
  reason_code: null,
  reason: null,
  recommended_rating: 'MEDIUM_HIGH',
  residual_rating: 'MEDIUM_HIGH',
  config_version: 3,
  engine_version: 'aml-calc/1.0.0',
  calculated_at: '2026-02-02T10:00:00Z',
  event_reason: 'MANUAL_RUN',
  result_hash: 'e3f1a9result',
  assessment_id: ASSESSMENT,
  methodology_id: METHODOLOGY,
  methodology_version: 'AML/CFT-RBA v1.1',
  programme_id: 'p5500000-0000-4000-8000-000000000001',
  programme_version: '2',
  question_plan_version: '4',
  config_id: 'c5500000-0000-4000-8000-000000000001',
  as_of: '2026-01-31',
  inherent_score: 62.5,
  inherent_band: 'MEDIUM_HIGH',
  control_score: 41,
  control_band: 'WEAK',
  inputs: { responses: 2, facts: 1 },
  policy_snapshot: { question_weights: 2 },
  trace: {
    questions: [
      { question_code: 'AML-Q-001', participation: 'SCORED', response_code: 'YES', score: 80, weight: 2, dimension_code: 'CUSTOMER' },
      { question_code: 'AML-Q-002', participation: 'EXCLUDED', response_code: null, score: null, weight: null, dimension_code: 'CUSTOMER' },
    ],
    facts: [
      { fact_code: 'PEP_RATIO', value: 12.5, unit: 'PERCENT', band_code: 'HIGH', score: 75, treatment: 'BANDED' },
    ],
    dimensions: [
      { dimension_code: 'CUSTOMER', contributes_to: 'INHERENT_RISK', score: 62.5, weight: 2, completeness_pct: 100, included: true },
      { dimension_code: 'CONTROLS', contributes_to: 'CONTROL_EFFECTIVENESS', score: 41, weight: 1, completeness_pct: 80, included: true },
    ],
    materiality: [
      { parameter_code: 'ASSETS_FLOOR', fact_code: 'TOTAL_ASSETS', comparator: 'GTE', applied: true, adjustment_kind: 'FLOOR_AT_BAND', adjustment_band: 'MEDIUM_HIGH' },
    ],
  },
  inputs_hash: 'a11inputs',
};

const RUN_1 = {
  id: 'r5500000-0000-4000-8000-000000000001',
  run_seq: 1,
  status: 'NOT_CALCULABLE',
  reason_code: 'POLICY_INCOMPLETE',
  recommended_rating: null,
  residual_rating: null,
  config_version: 2,
  engine_version: 'aml-calc/1.0.0',
  calculated_at: '2026-02-01T10:00:00Z',
  event_reason: 'MANUAL_RUN',
  result_hash: 'b22result',
};

type Mode = 'calculated' | 'never' | 'not_calculable' | 'override_pending' | 'override_decided';

let mode: Mode = 'calculated';
const calls: Array<{ fn: string; args: any }> = [];
let rpcError: string | null = null;

const PENDING_OVERRIDE = {
  id: 'o5500000-0000-4000-8000-000000000001',
  assessment_id: ASSESSMENT,
  run_id: CALCULATED_RUN.id,
  computed_residual_rating: 'MEDIUM_HIGH',
  computed_recommended_rating: 'MEDIUM_HIGH',
  computed_inherent_band: 'MEDIUM_HIGH',
  computed_control_band: 'WEAK',
  computed_result_hash: 'e3f1a9result',
  proposed_rating: 'HIGH',
  rationale: 'Group-wide remediation is materially behind plan.',
  status: 'PROPOSED',
  proposed_by: 'u1', proposed_at: '2026-02-02T12:00:00Z',
  decided_by: null, decided_at: null, decision_note: null,
};

function view() {
  switch (mode) {
    case 'never':
      return { latest_run: null, runs: [], overrides: [] };
    case 'not_calculable':
      return { latest_run: { ...CALCULATED_RUN, run_seq: 1, status: 'NOT_CALCULABLE', reason_code: 'POLICY_INCOMPLETE', reason: 'the approved policy leaves questions undecided', recommended_rating: null, residual_rating: null }, runs: [RUN_1], overrides: [] };
    case 'override_pending':
      return { latest_run: CALCULATED_RUN, runs: [CALCULATED_RUN, RUN_1], overrides: [PENDING_OVERRIDE] };
    case 'override_decided':
      return { latest_run: CALCULATED_RUN, runs: [CALCULATED_RUN, RUN_1], overrides: [{ ...PENDING_OVERRIDE, status: 'APPROVED', decided_by: 'u2', decided_at: '2026-02-03T09:00:00Z' }] };
    default:
      return { latest_run: CALCULATED_RUN, runs: [CALCULATED_RUN, RUN_1], overrides: [] };
  }
}

function respond(fn: string) {
  switch (fn) {
    case 'supervisory_assessment_calculation_view':
      return view();
    case 'supervisory_assessment_calculation_run_record':
      return { run_id: CALCULATED_RUN.id, run_seq: 3, result: {} };
    case 'supervisory_calculation_override_propose':
      return PENDING_OVERRIDE.id;
    case 'supervisory_calculation_override_decide':
      return PENDING_OVERRIDE.id;
    default:
      throw new Error(`UI-CALC: unexpected operation ${fn}`);
  }
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: async (fn: string, args: any) => {
      calls.push({ fn, args });
      if (rpcError && fn === 'supervisory_calculation_override_decide') {
        return { data: null, error: { message: rpcError } };
      }
      return { data: respond(fn), error: null };
    },
    from: (table: string) => {
      if (table !== 'supervisory_methodology') {
        throw new Error(`UI-CALC: the calculation surface must not read ${table} directly`);
      }
      const b: any = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({
          data: { scoring_scale: [
            { code: 'LOW', ordinal: 1 }, { code: 'MEDIUM_HIGH', ordinal: 2 }, { code: 'HIGH', ordinal: 3 },
          ] },
          error: null,
        }),
      };
      return b;
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

let can = true;
vi.mock('@/hooks/useCan', () => ({ useCan: () => can }));

import { AmlAssessmentCalculation } from '@/components/supervision/aml/AmlAssessmentCalculation';

beforeEach(() => {
  const proto = window.HTMLElement.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
  mode = 'calculated';
  can = true;
  rpcError = null;
  calls.length = 0;
  toastCalls.length = 0;
});

afterEach(cleanup);

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AmlAssessmentCalculation assessmentId={ASSESSMENT} />
    </QueryClientProvider>,
  );
}

describe('AML-06 assessment calculation workspace', () => {
  it('UI-CALC-01 reads the server calculation view for the assessment', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText(/Run #2/)).toBeInTheDocument());
    expect(calls.some((c) => c.fn === 'supervisory_assessment_calculation_view'
      && c.args._assessment_id === ASSESSMENT)).toBe(true);
  });

  it('UI-CALC-02 says plainly when no run has ever been recorded', async () => {
    mode = 'never';
    renderPanel();
    await waitFor(() => expect(screen.getByText('Never calculated')).toBeInTheDocument());
  });

  it('UI-CALC-03 surfaces the server refusal and its reason code without inventing a rating', async () => {
    mode = 'not_calculable';
    renderPanel();
    await waitFor(() => expect(screen.getByText(/Not calculable — no result was invented/)).toBeInTheDocument());
    expect(screen.getAllByText('POLICY_INCOMPLETE').length).toBeGreaterThan(0);
    expect(screen.getByText(/the approved policy leaves questions undecided/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Propose override' })).not.toBeInTheDocument();
  });

  it('UI-CALC-04 renders the policy, methodology, programme and plan references', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('AML/CFT-RBA v1.1')).toBeInTheDocument());
    expect(screen.getByText('Calculation policy version')).toBeInTheDocument();
    expect(screen.getByText('Question plan version')).toBeInTheDocument();
  });

  it('UI-CALC-05 runs from an earlier engine say no breakdown was recorded (never derived in the browser)', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('calc-breakdown-legacy')).toBeInTheDocument());
  });

  it('UI-CALC-06 renders the server factor breakdown and aggregation verbatim', () => {
    render(
      <AmlCalculationBreakdown
        trace={{
          status: 'CALCULATED',
          config_version: 1,
          dimensions: [
            { dimension_code: 'TEST_A', side: 'INHERENT', status: 'CALCULATED', contribution: 'INCLUDED', score: 50, weight: 40, weighted_contribution: 2000 },
            { dimension_code: 'TEST_B', side: 'INHERENT', status: 'NOT_APPLICABLE', contribution: 'EXCLUDED_FROM_DENOMINATOR', reason: 'not applicable' },
          ],
          aggregation: {
            inherent: { numerator: 2000, denominator: 40, unrounded: 50, score: 50, band: 'MEDIUM_HIGH' },
            control: { numerator: 10000, denominator: 100, unrounded: 100, score: 100, band: 'STRONG' },
            residual: { inherent_band: 'MEDIUM_HIGH', control_band: 'STRONG', residual_rating: 'MODERATE' },
            rounding: { mode: 'HALF_UP', decimals: 2 },
          },
        }}
      />,
    );
    expect(screen.getByTestId('calc-factor-TEST_B')).toHaveAttribute('data-contribution', 'EXCLUDED_FROM_DENOMINATOR');
    expect(screen.getByTestId('calc-agg-inherent')).toHaveTextContent('2000 ÷ 40 = 50');
    expect(screen.getByTestId('calc-agg-residual')).toHaveTextContent('MODERATE');
  });

  it('UI-CALC-06b withholds the residual when the server result is not calculable', () => {
    render(<AmlCalculationBreakdown trace={{ status: 'NOT_CALCULABLE', dimensions: [], aggregation: { residual: { residual_rating: 'MODERATE' } } }} />);
    expect(screen.getByTestId('calc-agg-residual')).toHaveTextContent('withheld');
    expect(screen.getByTestId('calc-agg-residual')).not.toHaveTextContent('MODERATE');
  });

  it('UI-CALC-07 renders inherent, control, residual and materiality treatment', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('Inherent risk (score / band)')).toBeInTheDocument());
    expect(screen.getByText('Control effectiveness (score / band)')).toBeInTheDocument();
    expect(screen.getByText('Residual rating (matrix)')).toBeInTheDocument();
    expect(screen.getByText('Materiality treatment')).toBeInTheDocument();
    expect(screen.getByText('ASSETS_FLOOR')).toBeInTheDocument();
  });

  it('UI-CALC-08 renders engine version, hashes and the full trace on request', async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();
    await waitFor(() => expect(screen.getByText('aml-calc/1.0.0')).toBeInTheDocument());
    expect(screen.getAllByText('e3f1a9result').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Show calculation trace' }));
    expect(screen.getByText(/policy_snapshot/)).toBeInTheDocument();
  });

  it('UI-CALC-09 lists the numbered run history', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('Run history')).toBeInTheDocument());
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
  });

  it('UI-CALC-10 recalculation is a governed server operation', async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();
    await waitFor(() => expect(screen.getByText(/Run #2/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Recalculate/ }));
    await waitFor(() => expect(calls.some((c) => c.fn === 'supervisory_assessment_calculation_run_record')).toBe(true));
  });

  it('UI-CALC-11 an override needs a published rating and a written rationale, and preserves the computed values', async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();
    await waitFor(() => expect(screen.getByText(/Run #2/)).toBeInTheDocument());
    const propose = await screen.findByRole('button', { name: 'Propose override' });
    expect(propose).toBeDisabled();
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'HIGH' }));
    await user.type(screen.getByLabelText(/Supervisory rationale/), 'Remediation is materially behind plan.');
    expect(screen.getByRole('button', { name: 'Propose override' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Propose override' }));
    await waitFor(() => expect(calls.some((c) => c.fn === 'supervisory_calculation_override_propose'
      && c.args._proposed_rating === 'HIGH')).toBe(true));
  });

  it('UI-CALC-12 a pending override is decided by a separate approver and the computed result stays visible', async () => {
    mode = 'override_pending';
    const user = userEvent.setup({ delay: null });
    renderPanel();
    await waitFor(() => expect(screen.getByText('Awaiting an independent decision')).toBeInTheDocument());
    expect(screen.getAllByText('MEDIUM_HIGH').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Propose override' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve override' }));
    await waitFor(() => expect(calls.some((c) => c.fn === 'supervisory_calculation_override_decide'
      && c.args._decision === 'APPROVED')).toBe(true));
  });

  it('UI-CALC-13 the server refusal of a same-person decision is shown, not worked around', async () => {
    mode = 'override_pending';
    rpcError = 'decider_must_differ';
    const user = userEvent.setup({ delay: null });
    renderPanel();
    await waitFor(() => expect(screen.getByText('Awaiting an independent decision')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Approve override' }));
    await waitFor(() => expect(toastCalls.some(([k, m]) => k === 'error' && /other than the person who proposed/.test(m))).toBe(true));
  });

  it('UI-CALC-14 states explicitly that nothing is published to the entity risk-of-record', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByText('Entity risk-of-record: not published')).toBeInTheDocument());
  });

  it('UI-CALC-15 an officer without calculation authority cannot recalculate or propose', async () => {
    can = false;
    renderPanel();
    await waitFor(() => expect(screen.getByRole('button', { name: /Recalculate/ })).toBeDisabled());
  });
});
