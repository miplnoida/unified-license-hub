/**
 * PCOMP-R2D — the supervisory deadline surface is a reader.
 *
 * These tests assert the panel renders the server's deadline expectations and
 * live clocks verbatim, and never calculates a deadline, decides on-time or
 * late, or automates a supervisory action.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AmlResponseSlaPanel } from '@/components/supervision/aml/AmlResponseSlaPanel';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

const policy = {
  component_id: 'c1', code: 'SLA-DEMO', component_version: '1.0', name: 'n',
  origin: 'REGULATOR_AUTHORED', status: 'ACTIVE', content_hash: 'h',
};
const profile = { profile_id: 'p1', code: 'PROF-1', version: '1.1', origin: 'REGULATOR_AUTHORED' };

const governed = {
  entity_id: 'e1', domain_code: 'AML_CFT', assessment_id: 'a1', source_rating: 'HIGH',
  expectations: [
    {
      action: 'EXAMINATION', label: 'Examination', status: 'EVALUATED', governed: true,
      reason_code: null, reason: null, rule_code: 'SLA-01', stage: 'Open examination',
      duration_days: 30, calendar_mode: 'BUSINESS_DAYS', pause_permitted: true,
      pause_reasons: ['AWAITING INFORMATION'], warning_percentage: 80,
      escalation_tier_profile: 'aml_supervisory_response', breach_severity: 'CRITICAL',
      policy_note: 'High risk examinations are time critical.', policy, policy_profile: profile,
    },
    {
      action: 'MONITORING', label: 'Continued monitoring', status: 'NOT_GOVERNED', governed: false,
      reason_code: 'NO_MATCHING_SLA_RULE', reason: 'No deadline is stated for this response.',
      rule_code: null, stage: null, duration_days: null, calendar_mode: null,
      pause_permitted: false, pause_reasons: [], warning_percentage: null,
      escalation_tier_profile: null, breach_severity: null, policy_note: null,
      policy, policy_profile: profile,
    },
  ],
  obligations: [{
    obligation_id: 'o1', decision_id: 'd1', action_type: 'OPEN_EXAMINATION',
    stage_name: 'Open examination', sla_policy_basis_status: 'EVALUATED',
    sla_policy_reason_code: null, sla_policy_code: 'SLA-DEMO', sla_policy_version: '1.0',
    sla_policy_rule_code: 'SLA-01', sla_duration_days: 30, sla_calendar_mode: 'BUSINESS_DAYS',
    calendar_resolution: 'BUSINESS_CALENDAR', pause_permitted: true,
    pause_reasons: ['AWAITING INFORMATION'], breach_severity: 'CRITICAL',
    escalation_tier_profile: 'aml_supervisory_response',
    due_at: '2026-10-01T00:00:00Z', outcome: 'LATE', closed_at: '2026-10-05T00:00:00Z',
    recorded_at: '2026-09-01T00:00:00Z',
    stage: {
      stage_instance_id: 's1', state: 'breached', started_at: '2026-09-01T00:00:00Z',
      due_at: '2026-10-01T00:00:00Z', paused_at: null, pause_seconds: 3600,
      breached_at: '2026-10-02T00:00:00Z', completed_at: '2026-10-05T00:00:00Z',
      sla_hours: 720, sla_source: 'policy', first_breach_notified_at: '2026-10-02T01:00:00Z',
    },
    escalations: [{ tier: 1, dispatched_at: '2026-10-02T01:00:00Z', recipients: 'x@example.test' }],
  }],
  timing_authority: 'SLA_POLICY',
  engine: 'PLATFORM_SLA_STAGE_ENGINE',
  automation: 'Deadlines, holds, breaches and escalation are recorded by the platform SLA engine. No supervisory action is ever created or closed automatically.',
};

const ungoverned = {
  entity_id: 'e1', domain_code: 'AML_CFT', assessment_id: null, source_rating: null,
  expectations: [{
    action: 'EXAMINATION', label: 'Examination', status: 'NOT_GOVERNED', governed: false,
    reason_code: 'NO_POLICY_BASIS', reason: 'This assessment carries no policy basis.',
    rule_code: null, stage: null, duration_days: null, calendar_mode: null,
    pause_permitted: false, pause_reasons: [], warning_percentage: null,
    escalation_tier_profile: null, breach_severity: null, policy_note: null,
    policy: null, policy_profile: null,
  }],
  obligations: [],
  timing_authority: 'SLA_POLICY',
  engine: 'PLATFORM_SLA_STAGE_ENGINE',
  automation: 'Nothing is created or closed automatically.',
};

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AmlResponseSlaPanel entityId="e1" assessmentId="a1" />
    </QueryClientProvider>,
  );
}

describe('AmlResponseSlaPanel', () => {
  beforeEach(() => rpc.mockReset());

  it('reads the governed deadline model from the server', async () => {
    rpc.mockResolvedValue({ data: governed, error: null });
    mount();
    await screen.findByTestId('aml-response-sla-panel');
    expect(rpc).toHaveBeenCalledWith('supervisory_response_sla_view', {
      _entity_id: 'e1', _domain_code: 'AML_CFT', _assessment_id: 'a1',
    });
  });

  it('shows the time allowed and day basis exactly as stated by policy', async () => {
    rpc.mockResolvedValue({ data: governed, error: null });
    mount();
    expect((await screen.findAllByText('30 business days')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('warning at 80%').length).toBeGreaterThan(0);
  });

  it('shows whether the clock may be held and for which reasons', async () => {
    rpc.mockResolvedValue({ data: governed, error: null });
    mount();
    expect((await screen.findAllByText('Permitted')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('AWAITING INFORMATION').length).toBeGreaterThan(0);
  });

  it('shows the SLA policy and profile version the deadline came from', async () => {
    rpc.mockResolvedValue({ data: governed, error: null });
    mount();
    const prov = await screen.findByTestId('sla-policy-provenance');
    expect(prov.textContent).toContain('SLA-DEMO v1.0');
    expect(prov.textContent).toContain('PROF-1 v1.1');
  });

  it('reports the live clock, escalation and the server-decided outcome', async () => {
    rpc.mockResolvedValue({ data: governed, error: null });
    mount();
    expect((await screen.findAllByText('Overdue')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Completed late').length).toBeGreaterThan(0);
    expect(screen.getAllByText('escalated to tier 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('60 min on hold').length).toBeGreaterThan(0);
  });

  it('does not invent a deadline for a response the policy does not time', async () => {
    rpc.mockResolvedValue({ data: governed, error: null });
    mount();
    await screen.findByTestId('aml-response-sla-panel');
    expect(screen.queryAllByText('Continued monitoring')).toHaveLength(0);
  });

  it('reports an ungoverned record honestly instead of inventing a deadline', async () => {
    rpc.mockResolvedValue({ data: ungoverned, error: null });
    mount();
    expect((await screen.findAllByText('No SLA policy governs the timing of this response')).length)
      .toBeGreaterThan(0);
    expect(screen.queryAllByText('Permitted')).toHaveLength(0);
  });

  it('states plainly that nothing is automated', async () => {
    rpc.mockResolvedValue({ data: governed, error: null });
    mount();
    const note = await screen.findByTestId('sla-policy-automation');
    expect(note.textContent).toContain('automatically');
  });
});

describe('AmlResponseSlaPanel — AML-CLOSE-08 deadline controls', () => {
  beforeEach(() => rpc.mockReset());
  const open = {
    ...governed,
    obligations: [{ ...governed.obligations[0], outcome: 'PENDING', closed_at: null,
      stage: { ...governed.obligations[0].stage, state: 'active', completed_at: null, breached_at: null } }],
  };

  it('offers hold and close only when the server says the viewer may manage deadlines', async () => {
    rpc.mockResolvedValue({ data: { ...open, viewer_can_manage: true }, error: null });
    mount();
    expect(await screen.findByRole('button', { name: 'Put deadline on hold' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close response' })).toBeInTheDocument();
  });

  it('shows no controls to a viewer without deadline authority', async () => {
    rpc.mockResolvedValue({ data: { ...open, viewer_can_manage: false }, error: null });
    mount();
    await screen.findByTestId('aml-response-sla-panel');
    expect(screen.queryByRole('button', { name: 'Close response' })).toBeNull();
  });

  it('shows no controls once the server has closed the response', async () => {
    rpc.mockResolvedValue({ data: { ...governed, viewer_can_manage: true }, error: null });
    mount();
    await screen.findByTestId('aml-response-sla-panel');
    expect(screen.queryByRole('button', { name: 'Close response' })).toBeNull();
  });
});
