/**
 * PCOMP-R2E-T1..T8 — integrated policy trace panel.
 *
 * The panel must render the server-composed trace exactly: one row per governed
 * runtime stage with the exact policy version the server used, the rating chain
 * as the server reports it, no derivation and no writes.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const TRACE = {
  assessment_id: 'a-1',
  assessment_reference: 'AML-2026-0001',
  assessment_status: 'approved',
  entity_id: 'e-1',
  domain_code: 'AML_CFT',
  policy_basis: { status: 'SNAPSHOTTED', policy_profile_version: '1.0' },
  links: [
    {
      stage: 'EVIDENCE', component_type: 'EVIDENCE_POLICY', status: 'EVALUATED',
      reason_code: null, reason: null, policy_component_code: 'AML-EV',
      policy_component_version: '1.0', policy_content_hash: 'h1', policy_profile_version: '1.0',
      blocking_count: 0, measure: '2 requirement(s), 2 satisfied',
    },
    {
      stage: 'JUDGEMENT', component_type: 'JUDGEMENT_POLICY', status: 'EVALUATED',
      reason_code: null, reason: null, policy_component_code: 'AML-JU',
      policy_component_version: '1.1', policy_content_hash: 'h2', policy_profile_version: '1.0',
      blocking_count: 0, measure: 'departure available, at most 1 band step(s)',
    },
    {
      stage: 'RESPONSE', component_type: 'RESPONSE_POLICY', status: 'EVALUATED',
      reason_code: null, reason: null, policy_component_code: 'AML-RE',
      policy_component_version: '1.0', policy_content_hash: 'h3', policy_profile_version: '1.0',
      blocking_count: 0, measure: '8 expected response(s) at rating MEDIUM_HIGH',
    },
    {
      stage: 'SLA', component_type: 'SLA_POLICY', status: 'NOT_GOVERNED',
      reason_code: 'NO_POLICY_BASIS', reason: 'This assessment carries no policy basis.',
      policy_component_code: null, policy_component_version: null,
      policy_content_hash: null, policy_profile_version: null,
      blocking_count: 0, measure: null,
    },
  ],
  rating: {
    calculation_run_id: 'r-1', calculation_status: 'CALCULATED',
    calculated_rating: 'HIGH', calculated_at: '2026-09-10T09:00:00Z', result_hash: 'run-hash-1',
    approved_rating: 'MEDIUM_HIGH', approved_rating_source: 'OVERRIDE',
    approved_at: '2026-09-11T09:00:00Z',
    published_rating: 'MEDIUM_HIGH', published_at: '2026-09-11T10:00:00Z',
    operative_rating: 'MEDIUM_HIGH', operative_inherent_rating: 'HIGH', operative_control_rating: 'ADEQUATE',
  },
  downstream: { consequence_decisions: 3, sla_obligations: 1 },
  authority: 'Every status, version and rating in this trail is decided by the platform.',
  generated_at: '2026-09-11T11:00:00Z',
};

let trace: any = TRACE;
let fail: string | null = null;
const calls: Array<{ fn: string; args: any }> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: any) => {
      calls.push({ fn, args });
      if (fail) return Promise.resolve({ data: null, error: { message: fail } });
      return Promise.resolve({ data: trace, error: null });
    },
    from: () => {
      throw new Error('PCOMP-R2E: the policy trace panel must not read policy tables directly');
    },
  },
}));

import { AmlPolicyTracePanel } from '@/components/supervision/aml/AmlPolicyTracePanel';

function wrap(id: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AmlPolicyTracePanel assessmentId={id} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => { trace = TRACE; fail = null; calls.length = 0; });
afterEach(() => cleanup());

const SOURCE = readFileSync('src/components/supervision/aml/AmlPolicyTracePanel.tsx', 'utf8');
const HOOK = readFileSync('src/hooks/useAmlPolicyTrace.ts', 'utf8');

describe('PCOMP-R2E-T1 the trace comes from the one server read model', () => {
  it('calls supervisory_assessment_policy_trace with the assessment', async () => {
    wrap('a-1');
    await screen.findByTestId('policy-trace-links');
    expect(calls[0].fn).toBe('supervisory_assessment_policy_trace');
    expect(calls[0].args._assessment_id).toBe('a-1');
  });
});

describe('PCOMP-R2E-T2 every governed stage shows the exact policy version used', () => {
  it('renders each stage version from the server', async () => {
    wrap('a-1');
    await screen.findByTestId('policy-trace-links');
    expect(screen.getByTestId('policy-trace-version-EVIDENCE')).toHaveTextContent('v1.0');
    expect(screen.getByTestId('policy-trace-version-JUDGEMENT')).toHaveTextContent('v1.1');
    expect(screen.getByTestId('policy-trace-version-RESPONSE')).toHaveTextContent('v1.0');
  });
});

describe('PCOMP-R2E-T3 stage state is the server state', () => {
  it('shows governed and not-governed stages as the server reports them', async () => {
    wrap('a-1');
    await screen.findByTestId('policy-trace-links');
    expect(screen.getByTestId('policy-trace-state-EVIDENCE')).toHaveTextContent('Governed');
    expect(screen.getByTestId('policy-trace-state-SLA')).toHaveTextContent('Not governed');
    expect(screen.getByTestId('policy-trace-status')).toHaveTextContent('3 OF 4 STAGES GOVERNED');
  });
});

describe('PCOMP-R2E-T4 an ungoverned stage explains itself without inventing a policy', () => {
  it('shows the server reason and no version', async () => {
    wrap('a-1');
    await screen.findByTestId('policy-trace-links');
    expect(screen.getByTestId('policy-trace-measure-SLA'))
      .toHaveTextContent('This assessment carries no policy basis.');
    expect(screen.getByTestId('policy-trace-version-SLA')).toHaveTextContent('—');
  });
});

describe('PCOMP-R2E-T5 the rating chain is shown end to end', () => {
  it('renders calculated, approved, published and operative ratings', async () => {
    wrap('a-1');
    await screen.findByTestId('policy-trace-links');
    expect(screen.getByTestId('policy-trace-calculated')).toHaveTextContent('HIGH');
    expect(screen.getByTestId('policy-trace-approved')).toHaveTextContent('MEDIUM_HIGH');
    expect(screen.getByTestId('policy-trace-published')).toHaveTextContent('MEDIUM_HIGH');
    expect(screen.getByTestId('policy-trace-operative')).toHaveTextContent('MEDIUM_HIGH');
  });
});

describe('PCOMP-R2E-T6 downstream work is counted by the server', () => {
  it('renders the recorded responses and governed deadlines', async () => {
    wrap('a-1');
    await screen.findByTestId('policy-trace-links');
    expect(screen.getByTestId('policy-trace-consequences')).toHaveTextContent('3');
    expect(screen.getByTestId('policy-trace-obligations')).toHaveTextContent('1');
  });
});

describe('PCOMP-R2E-T7 a refusal shows nothing rather than an assumed chain', () => {
  it('renders the unavailable state and the server message', async () => {
    fail = 'not_authorized: aml_supervision.view required';
    wrap('a-1');
    expect(await screen.findByTestId('policy-trace-status')).toHaveTextContent('POLICY TRAIL UNAVAILABLE');
    expect(screen.getByTestId('policy-trace-error')).toHaveTextContent('not_authorized');
    expect(screen.queryByTestId('policy-trace-links')).toBeNull();
  });
});

describe('PCOMP-R2E-T8 no policy logic or writes live in the browser', () => {
  it('keeps rating, version and deadline decisions on the server', () => {
    expect(SOURCE).not.toMatch(/\.from\(/);
    expect(SOURCE).not.toMatch(/\bupdate\(|\binsert\(|\bdelete\(/);
    expect(HOOK).not.toMatch(/useMutation/);
    // no local rating order, band arithmetic or deadline maths
    expect(SOURCE).not.toMatch(/HIGH|MEDIUM_LOW|LOW['"]/);
    expect(SOURCE).not.toMatch(/addDays|Date\.now|setDate/);
  });
});
