/**
 * PCOMP-R2C — the response policy surface is a reader.
 *
 * These tests assert the panel renders the server's expectations verbatim and
 * never derives, softens or automates anything.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AmlResponsePolicyPanel } from '@/components/supervision/aml/AmlResponsePolicyPanel';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

const governed = {
  entity_id: 'e1', domain_code: 'AML_CFT', source: {},
  evaluation: {
    assessment_id: 'a1', source_rating: 'HIGH', status: 'EVALUATED', governed: true,
    reason_code: null, reason: null,
    policy: { component_id: 'c1', code: 'RESP-DEMO', component_version: '1.0', name: 'n', origin: 'REGULATOR_AUTHORED', status: 'ACTIVE', content_hash: 'h' },
    policy_profile: { profile_id: 'p1', code: 'PROF-1', version: '1.1', origin: 'REGULATOR_AUTHORED' },
    expectations: [
      { action: 'EXAMINATION', operational_action: 'OPEN_EXAMINATION', label: 'Examination', governed: true,
        response_level: 'REQUIRED', prohibited: false, blocked: false, rule_code: 'RESP-01',
        policy_note: 'High risk requires an examination.', rationale_required: true, deferral_allowed: false,
        advisory_timeframe_days: 30, timing_authority: 'ADVISORY_UNTIL_SLA_POLICY', prerequisite: null },
      { action: 'ENFORCEMENT_REFERRAL', operational_action: 'REFER_TO_ENFORCEMENT', label: 'Enforcement referral',
        governed: true, response_level: 'PROHIBITED', prohibited: true, blocked: true, rule_code: 'RESP-02',
        policy_note: null, rationale_required: true, deferral_allowed: false, advisory_timeframe_days: null,
        timing_authority: 'ADVISORY_UNTIL_SLA_POLICY', prerequisite: null },
    ],
    required_responses: [{ action: 'EXAMINATION', rule_code: 'RESP-01', advisory_timeframe_days: 30 }],
    timing_ownership: 'Timeframes are advisory until an SLA policy is runtime consumed.',
    automation: 'No supervisory action is created automatically from a rating.',
  },
  decisions: [{
    decision_id: 'd1', action_type: 'OPEN_EXAMINATION', status: 'RECORDED', recorded_at: '2026-09-01T00:00:00Z',
    response_policy_basis_status: 'EVALUATED', response_policy_code: 'RESP-DEMO', response_policy_version: '1.0',
    response_policy_rule_code: 'RESP-01', response_policy_level: 'REQUIRED', response_policy_advisory_timeframe_days: 30,
  }],
};

const ungoverned = {
  entity_id: 'e1', domain_code: 'AML_CFT', source: null,
  evaluation: {
    assessment_id: null, source_rating: null, status: 'NOT_GOVERNED', governed: false,
    reason_code: 'NO_POLICY_BASIS', reason: 'This assessment carries no policy basis.',
    policy: null, policy_profile: null, expectations: [], required_responses: [],
    timing_ownership: 'Timeframes are advisory.', automation: 'Nothing is automated.',
  },
  decisions: [],
};

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AmlResponsePolicyPanel entityId="e1" assessmentId="a1" />
    </QueryClientProvider>,
  );
}

describe('AmlResponsePolicyPanel', () => {
  beforeEach(() => rpc.mockReset());

  it('reads the governed evaluation from the server read model', async () => {
    rpc.mockResolvedValue({ data: governed, error: null });
    mount();
    await screen.findByTestId('aml-response-policy-panel');
    expect(rpc).toHaveBeenCalledWith('supervisory_consequence_response_policy_view', {
      _entity_id: 'e1', _domain_code: 'AML_CFT', _assessment_id: 'a1',
    });
  });

  it('shows the policy expectation, rule and advisory timeframe as returned', async () => {
    rpc.mockResolvedValue({ data: governed, error: null });
    mount();
    expect((await screen.findAllByText('Required by policy')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Prohibited by policy').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RESP-01').length).toBeGreaterThan(0);
    expect(screen.getAllByText('30 day(s) (advisory)').length).toBeGreaterThan(0);
  });

  it('shows the policy and profile version the judgment came from', async () => {
    rpc.mockResolvedValue({ data: governed, error: null });
    mount();
    const prov = await screen.findByTestId('response-policy-provenance');
    expect(prov.textContent).toContain('RESP-DEMO v1.0');
    expect(prov.textContent).toContain('PROF-1 v1.1');
  });

  it('states plainly that nothing is automated', async () => {
    rpc.mockResolvedValue({ data: governed, error: null });
    mount();
    const note = await screen.findByTestId('response-policy-automation');
    expect(note.textContent).toContain('automatically');
  });

  it('reports an ungoverned record honestly instead of inventing expectations', async () => {
    rpc.mockResolvedValue({ data: ungoverned, error: null });
    mount();
    expect((await screen.findAllByText('No supervisory response policy governs this record')).length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Required by policy')).toHaveLength(0);
  });

  it('records the policy each historical consequence was judged against', async () => {
    rpc.mockResolvedValue({ data: governed, error: null });
    mount();
    expect((await screen.findAllByText('OPEN_EXAMINATION')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('RESP-DEMO v1.0').length).toBeGreaterThan(0);
  });
});
