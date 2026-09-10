/**
 * UI-MON-01…20 — AML-09 risk surveillance, review-cycle status and governed
 * reassessment triggering.
 *
 * Payload shapes mirror `supervisory_risk_monitoring_view` exactly as the
 * rolled-back AML09CERT fixture exercises it in
 * `scripts/verify-aml-risk-monitoring-reassessment.sql`.
 *
 * Every gate proves the screen renders the SERVER's monitoring contract. No gate
 * expects the browser to compute a due date, choose a review interval, derive a
 * monitoring state, recognise an event, decide authority or resolve a duplicate.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const ENTITY = 'e9900000-0000-4000-8000-000000000001';
const ASSESSMENT = 'a9900000-0000-4000-8000-000000000001';
const FINDING = 'f9900000-0000-4000-8000-000000000001';
const REQ = 'r9900000-0000-4000-8000-000000000001';

type Mode =
  | 'current'
  | 'due'
  | 'overdue'
  | 'unscheduled'
  | 'event'
  | 'legacy'
  | 'not_calculable'
  | 'no_risk'
  | 'read_only'
  | 'open_reassessment'
  | 'with_history';

let mode: Mode = 'current';
let rpcError: string | null = null;
let rpcResult: Record<string, unknown> = { created: true, requirement_id: REQ };
const calls: Array<{ fn: string; args: any }> = [];

const action = (
  name: string, available: boolean, reason_code: string, permission: string | null,
) => ({
  action: name,
  label: name.replace(/_/g, ' ').toLowerCase(),
  required_permission: permission,
  available,
  reason_code,
  reason: reason_code === 'OK' ? 'Available' : `Server reason for ${reason_code}`,
});

const findingEvent = (available = true, blocker: string | null = null) => ({
  event_type: 'FINDING_RAISED',
  source_kind: 'SUPERVISORY_FINDING',
  source_id: FINDING,
  reference: 'AML-F-2026-0007',
  title: 'Customer due diligence gaps',
  severity: 'HIGH',
  status: 'ISSUED',
  event_date: '2026-08-14',
  reason: 'A high severity AML/CFT finding was raised after the current risk-of-record took effect.',
  route: `/supervision/findings/${FINDING}`,
  requires_consideration: true,
  reassessment_available: available,
  required_permission: 'aml_supervision.review',
  existing_reassessment_id: blocker === 'REASSESSMENT_ALREADY_OPEN' ? REQ : null,
  blocker,
});

function schedule() {
  const base = {
    next_review_date: '2027-03-31',
    due_date_basis: 'PROGRAMME_CYCLE',
    due_date_basis_detail: 'The bound assessment programme cycle of 12 months applies from the last completed assessment.',
    basis_source_kind: 'ASSESSMENT_PROGRAMME',
    basis_source_id: 'pg990000-0000-4000-8000-000000000001',
    last_review_date: '2026-03-31',
    risk_state_id: 'rs990000-0000-4000-8000-000000000001',
    last_completed_assessment: {
      id: ASSESSMENT, reference: 'AML-2026-0009', status: 'APPROVED',
      assessment_type: 'PERIODIC', assessment_date: '2026-03-31',
      approved_at: '2026-04-02T10:00:00Z', next_review_date: '2027-03-31',
      methodology_id: 'm990000', methodology_version: '1.0',
      route: `/supervision/aml/assessments/${ASSESSMENT}`,
    },
    programme: {
      id: 'pg990000-0000-4000-8000-000000000001', programme_code: 'AML-PERIODIC',
      label: 'Periodic AML/CFT assessment', assessment_type: 'PERIODIC',
      recurrence_months: 12, provenance: 'REGULATOR_AUTHORED',
      set_id: 'ps990000', set_code: 'AML-SET', set_version: '1.0', set_status: 'ACTIVE',
    },
  };
  if (mode === 'due') return { ...base, next_review_date: '2026-09-10' };
  if (mode === 'overdue') return { ...base, next_review_date: '2025-12-31' };
  if (mode === 'unscheduled') {
    return {
      ...base,
      next_review_date: null,
      due_date_basis: 'UNSCHEDULED',
      due_date_basis_detail: 'No canonical review schedule exists. No default review interval is assumed.',
      basis_source_kind: null, basis_source_id: null, programme: null,
      last_completed_assessment: { ...base.last_completed_assessment, next_review_date: null },
    };
  }
  if (mode === 'legacy') {
    return {
      ...base,
      due_date_basis: 'RISK_STATE_REVIEW_DATE',
      due_date_basis_detail: 'The review date held on the entity risk-of-record applies. No later canonical schedule exists.',
      basis_source_kind: 'ENTITY_RISK_STATE',
      programme: null, last_completed_assessment: null,
    };
  }
  if (mode === 'no_risk') {
    return {
      next_review_date: null, due_date_basis: 'UNSCHEDULED',
      due_date_basis_detail: 'No canonical review schedule exists. No default review interval is assumed.',
      basis_source_kind: null, basis_source_id: null, last_review_date: null,
      risk_state_id: null, last_completed_assessment: null, programme: null,
    };
  }
  return base;
}

function view() {
  const risk = {
    source_kind: 'PUBLICATION',
    current_rating: 'MEDIUM_HIGH',
    inherent_rating: 'HIGH',
    control_rating: 'MEDIUM',
    effective_from: '2026-04-02',
    rating_provenance: 'COMPUTED',
    calculation_availability: 'CALCULATED',
    publication_id: 'pb990000',
    assessment_id: ASSESSMENT,
    risk_state_id: 'rs990000-0000-4000-8000-000000000001',
  };

  const base = {
    entity: { id: ENTITY, name: 'Castries Trust Services Ltd', regulator_id: 'rg990000', sector_id: 'sc990000' },
    domain_code: 'AML_CFT',
    as_of: '2026-09-10',
    generated_at: '2026-09-10T08:00:00Z',
    risk,
    schedule: schedule(),
    monitoring_state: 'CURRENT',
    reason_code: 'REVIEW_NOT_YET_DUE',
    reason: 'The review remains current.',
    blockers: [] as any[],
    events: [] as any[],
    open_reassessment: null as any,
    permitted_actions: [
      action('REQUIRE_REASSESSMENT', true, 'OK', 'aml_supervision.review'),
      action('RESCHEDULE_REVIEW', true, 'OK', 'aml_supervision.approve'),
      action('WAIVE_REVIEW', false, 'UNSUPPORTED_NO_CANONICAL_AUTHORITY', null),
    ],
    history: [] as any[],
    lineage: {
      risk_state_id: risk.risk_state_id, publication_id: 'pb990000', assessment_id: ASSESSMENT,
      programme_code: 'AML-PERIODIC', due_date_basis: 'PROGRAMME_CYCLE',
      rating_provenance: 'COMPUTED', calculation_availability: 'CALCULATED',
    },
  };

  switch (mode) {
    case 'due':
      return { ...base, monitoring_state: 'DUE', reason_code: 'REVIEW_DUE_TODAY', reason: 'The review is due today. The current risk rating is unchanged.' };
    case 'overdue':
      return {
        ...base, monitoring_state: 'OVERDUE', reason_code: 'REVIEW_DATE_PASSED',
        reason: 'The next review date has passed. The current risk rating is unchanged: this is a workflow condition, not a new rating.',
      };
    case 'unscheduled':
      return {
        ...base, monitoring_state: 'UNSCHEDULED', reason_code: 'NO_CANONICAL_REVIEW_SCHEDULE',
        reason: 'No canonical review schedule exists for this entity. No default review interval is assumed.',
      };
    case 'event':
      return {
        ...base, monitoring_state: 'EVENT_TRIGGERED', reason_code: 'EVENT_REQUIRES_CONSIDERATION',
        reason: 'A canonical supervisory event has occurred since the current risk-of-record took effect. A supervisor must consider whether reassessment is required. Nothing is created automatically.',
        events: [findingEvent()],
      };
    case 'legacy':
      return {
        ...base,
        risk: { ...risk, source_kind: 'LEGACY_RISK_RECORD', rating_provenance: 'LEGACY_OFFICER_RATING', calculation_availability: 'NOT_CALCULABLE', publication_id: null, current_rating: 'MEDIUM' },
        monitoring_state: 'LEGACY', reason_code: 'LEGACY_RISK_RECORD',
        reason: 'The current risk-of-record predates governed publication. Its review basis is read from legacy canonical data only.',
        blockers: [{ code: 'LEGACY_RISK_RECORD', blocking: false, detail: 'The current risk-of-record predates governed publication.' }],
      };
    case 'not_calculable':
      return {
        ...base,
        risk: { ...risk, current_rating: null, rating_provenance: 'NOT_CALCULABLE', calculation_availability: 'NOT_CALCULABLE' },
        blockers: [{ code: 'NOT_CALCULABLE', blocking: false, detail: 'No approved calculation policy is in force, so no rating can be calculated.' }],
      };
    case 'no_risk':
      return {
        ...base,
        risk: { ...risk, source_kind: 'NONE', current_rating: null, rating_provenance: 'UNAVAILABLE', calculation_availability: 'UNAVAILABLE', publication_id: null, assessment_id: null, risk_state_id: null, effective_from: null },
        monitoring_state: 'BLOCKED', reason_code: 'NO_RISK_OF_RECORD',
        reason: 'No AML/CFT risk-of-record exists for this entity, so no review cycle can be established.',
        blockers: [{ code: 'NO_RISK_OF_RECORD', blocking: true, detail: 'No current AML/CFT risk-of-record exists for this entity.' }],
        permitted_actions: [
          action('REQUIRE_REASSESSMENT', false, 'NO_RISK_OF_RECORD', 'aml_supervision.review'),
          action('RESCHEDULE_REVIEW', false, 'NO_RISK_OF_RECORD', 'aml_supervision.approve'),
          action('WAIVE_REVIEW', false, 'UNSUPPORTED_NO_CANONICAL_AUTHORITY', null),
        ],
      };
    case 'read_only':
      return {
        ...base, monitoring_state: 'OVERDUE', reason_code: 'REVIEW_DATE_PASSED',
        permitted_actions: [
          action('REQUIRE_REASSESSMENT', false, 'PERMISSION_MISSING', 'aml_supervision.review'),
          action('RESCHEDULE_REVIEW', false, 'PERMISSION_MISSING', 'aml_supervision.approve'),
          action('WAIVE_REVIEW', false, 'UNSUPPORTED_NO_CANONICAL_AUTHORITY', null),
        ],
      };
    case 'open_reassessment':
      return {
        ...base,
        events: [findingEvent(false, 'REASSESSMENT_ALREADY_OPEN')],
        open_reassessment: {
          id: REQ, status: 'REQUIRED', trigger_kind: 'MATERIAL_FINDING', requested_type: 'TARGETED',
          trigger_rationale: 'Material CDD failures require a targeted reassessment of the risk-of-record.',
          due_date: '2026-11-30', created_at: '2026-08-20T09:00:00Z', previous_assessment_id: ASSESSMENT,
        },
        permitted_actions: [
          action('REQUIRE_REASSESSMENT', false, 'REASSESSMENT_ALREADY_OPEN', 'aml_supervision.review'),
          action('RESCHEDULE_REVIEW', true, 'OK', 'aml_supervision.approve'),
          action('WAIVE_REVIEW', false, 'UNSUPPORTED_NO_CANONICAL_AUTHORITY', null),
        ],
      };
    case 'with_history':
      return {
        ...base,
        schedule: {
          ...schedule(),
          next_review_date: '2027-06-30',
          due_date_basis: 'EXPLICIT_SCHEDULE_DECISION',
          due_date_basis_detail: 'An approved supervisory schedule decision fixes the next review date.',
          basis_source_kind: 'MONITORING_DECISION',
          schedule_decision: {
            id: 'md990000', disposition: 'RESCHEDULED', original_due_date: '2027-03-31',
            revised_due_date: '2027-06-30',
            rationale: 'The programme cycle date is moved to align with the group-wide examination window.',
            decided_by: 'u990000', decided_at: '2026-09-01T11:00:00Z',
          },
        },
        history: [
          {
            id: 'md990000', decision_kind: 'RESCHEDULE', monitoring_state: 'CURRENT',
            due_date_basis: 'PROGRAMME_CYCLE', original_due_date: '2027-03-31',
            revised_due_date: '2027-06-30', disposition: 'RESCHEDULED',
            event_type: null, event_source_kind: null, event_source_id: null,
            reassessment_requirement_id: null,
            rationale: 'The programme cycle date is moved to align with the group-wide examination window.',
            lineage: { programme_code: 'AML-PERIODIC' }, decided_by: 'u990000',
            decided_at: '2026-09-01T11:00:00Z',
          },
          {
            id: 'md990001', decision_kind: 'REASSESSMENT_TRIGGERED', monitoring_state: 'EVENT_TRIGGERED',
            due_date_basis: 'PROGRAMME_CYCLE', original_due_date: '2027-03-31',
            revised_due_date: null, disposition: null,
            event_type: 'FINDING_RAISED', event_source_kind: 'SUPERVISORY_FINDING', event_source_id: FINDING,
            reassessment_requirement_id: REQ,
            rationale: 'Material CDD failures require a targeted reassessment of the risk-of-record.',
            lineage: { assessment_id: ASSESSMENT }, decided_by: 'u990000',
            decided_at: '2026-08-20T09:00:00Z',
          },
        ],
      };
    default:
      return base;
  }
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: async (fn: string, args: any) => {
      calls.push({ fn, args });
      if (fn === 'supervisory_risk_monitoring_view') return { data: view(), error: null };
      if (rpcError) return { data: null, error: { message: rpcError } };
      return { data: rpcResult, error: null };
    },
    from: (table: string) => {
      throw new Error(`UI-MON: the monitoring surface must not read ${table} directly`);
    },
  },
}));

const toastCalls: Array<[string, string]> = [];
vi.mock('sonner', () => ({
  toast: {
    success: (m: string) => toastCalls.push(['success', String(m)]),
    error: (m: string) => toastCalls.push(['error', String(m)]),
    info: (m: string) => toastCalls.push(['info', String(m)]),
  },
}));

import { AmlRiskMonitoringPanel } from '@/components/supervision/aml/AmlRiskMonitoringPanel';

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <AmlRiskMonitoringPanel entityId={ENTITY} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function ready() {
  renderPanel();
  await waitFor(() => expect(screen.getByTestId('aml-monitoring-panel')).toBeInTheDocument());
}

const typeRationale = async (_label: RegExp, text: string) => {
  const user = userEvent.setup();
  await user.type(document.getElementById('mon-rationale') as HTMLElement, text);
  return user;
};

// jsdom lacks the pointer-capture APIs the Radix select primitive calls.
beforeEach(() => {
  const proto = window.HTMLElement.prototype as any;
  proto.hasPointerCapture = () => false;
  proto.setPointerCapture = () => {};
  proto.releasePointerCapture = () => {};
  proto.scrollIntoView = () => {};
  cleanup();
  mode = 'current';
  rpcError = null;
  rpcResult = { created: true, requirement_id: REQ };
  calls.length = 0;
  toastCalls.length = 0;
});

describe('AML-09 monitoring and reassessment surface', () => {
  it('UI-MON-01 reads the whole monitoring picture from the governed server view', async () => {
    await ready();
    expect(calls.map((c) => c.fn)).toContain('supervisory_risk_monitoring_view');
    expect(calls[0].args).toMatchObject({ _entity_id: ENTITY, _domain_code: 'AML_CFT' });
  });

  it('UI-MON-02 shows a current review exactly as the server states it', async () => {
    await ready();
    expect(screen.getByTestId('monitoring-state')).toHaveTextContent('Review current');
    expect(screen.getByTestId('monitoring-reason-code')).toHaveTextContent('The next review date has not been reached');
  });

  it('UI-MON-03 shows a due review from the server state, not from a local date test', async () => {
    mode = 'due';
    await ready();
    expect(screen.getByTestId('monitoring-state')).toHaveTextContent('Review due');
    expect(screen.getByTestId('monitoring-next-review')).toHaveTextContent('2026-09-10');
  });

  it('UI-MON-04 shows an overdue review and says the rating is unchanged', async () => {
    mode = 'overdue';
    await ready();
    expect(screen.getByTestId('monitoring-state')).toHaveTextContent('Review overdue');
    expect(screen.getByText(/workflow condition, not a new rating/i)).toBeInTheDocument();
  });

  it('UI-MON-05 shows an unscheduled entity without inventing an interval', async () => {
    mode = 'unscheduled';
    await ready();
    expect(screen.getByTestId('monitoring-state')).toHaveTextContent('No review scheduled');
    expect(screen.getByTestId('monitoring-next-review')).toHaveTextContent('—');
    expect(screen.getByTestId('monitoring-basis')).toHaveTextContent('no default interval is assumed');
  });

  it('UI-MON-06 shows where the next review date came from and the programme version', async () => {
    await ready();
    expect(screen.getByTestId('monitoring-basis')).toHaveTextContent('Bound assessment programme cycle');
    expect(screen.getByText(/AML-PERIODIC · 12 months · set 1\.0/)).toBeInTheDocument();
  });

  it('UI-MON-07 shows an explicit approved schedule decision as the basis when one exists', async () => {
    mode = 'with_history';
    await ready();
    expect(screen.getByTestId('monitoring-basis')).toHaveTextContent('Approved supervisory schedule decision');
    expect(screen.getByTestId('monitoring-next-review')).toHaveTextContent('2027-06-30');
  });

  it('UI-MON-08 shows when risk was last established and the driving assessment', async () => {
    await ready();
    expect(screen.getByText('AML-2026-0009')).toBeInTheDocument();
    expect(screen.getByText('2026-03-31')).toBeInTheDocument();
  });

  it('UI-MON-09 shows an event-triggered state with the canonical event behind it', async () => {
    mode = 'event';
    await ready();
    expect(screen.getByTestId('monitoring-state')).toHaveTextContent('Event requires consideration');
    expect(screen.getByText('AML-F-2026-0007')).toBeInTheDocument();
    expect(screen.getByText(/Nothing is created automatically/i)).toBeInTheDocument();
  });

  it('UI-MON-10 says plainly when the server recognises no event', async () => {
    await ready();
    expect(screen.getByTestId('monitoring-no-events')).toBeInTheDocument();
  });

  it('UI-MON-11 shows a legacy risk record honestly as legacy', async () => {
    mode = 'legacy';
    await ready();
    expect(screen.getByTestId('monitoring-state')).toHaveTextContent('Legacy risk record');
    expect(screen.getByText('Legacy officer rating')).toBeInTheDocument();
  });

  it('UI-MON-12 never invents a rating when none can be calculated', async () => {
    mode = 'not_calculable';
    await ready();
    expect(screen.getByText('Rating —')).toBeInTheDocument();
    expect(screen.getByText('Not calculable — no approved calculation policy in force')).toBeInTheDocument();
  });

  it('UI-MON-13 reports a blocked entity with no risk-of-record and offers nothing', async () => {
    mode = 'no_risk';
    await ready();
    expect(screen.getByTestId('monitoring-state')).toHaveTextContent('Cannot be scheduled');
    expect(screen.getByRole('button', { name: 'Require a reassessment' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Record schedule decision' })).toBeDisabled();
  });

  it('UI-MON-14 shows the server permission and reason for each unavailable action', async () => {
    mode = 'read_only';
    await ready();
    expect(screen.getAllByText('aml_supervision.review').length).toBeGreaterThan(0);
    expect(screen.getAllByText('You do not hold the required permission').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Require a reassessment' })).toBeDisabled();
  });

  it('UI-MON-15 never offers a waiver, because no canonical authority exists', async () => {
    await ready();
    expect(screen.getByText('Waive the review obligation')).toBeInTheDocument();
    expect(screen.getAllByText('Not supported — no canonical authority exists').length).toBeGreaterThan(0);
  });

  it('UI-MON-16 requires a written rationale before a reassessment can be required', async () => {
    await ready();
    expect(screen.getByRole('button', { name: 'Require a reassessment' })).toBeDisabled();
    await typeRationale(/Supervisory reasoning/i, 'Material control weaknesses justify an early reassessment now.');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Require a reassessment' })).toBeEnabled());
  });

  it('UI-MON-17 calls the governed reassessment operation with the officer rationale', async () => {
    await ready();
    const user = await typeRationale(/Supervisory reasoning/i, 'Material control weaknesses justify an early reassessment now.');
    await user.click(screen.getByRole('button', { name: 'Require a reassessment' }));
    await waitFor(() =>
      expect(calls.map((c) => c.fn)).toContain('supervisory_risk_monitoring_require_reassessment'));
    const call = calls.find((c) => c.fn === 'supervisory_risk_monitoring_require_reassessment');
    expect(call?.args._payload).toMatchObject({ entity_id: ENTITY, domain_code: 'AML_CFT' });
    expect(String(call?.args._payload.rationale).length).toBeGreaterThanOrEqual(20);
  });

  it('UI-MON-18 surfaces the server duplicate verdict instead of creating a second reassessment', async () => {
    rpcResult = {
      created: false, duplicate: true, reason_code: 'REASSESSMENT_ALREADY_OPEN',
      reason: 'A reassessment is already open for this entity and domain.',
      requirement_id: REQ,
    };
    await ready();
    const user = await typeRationale(/Supervisory reasoning/i, 'Material control weaknesses justify an early reassessment now.');
    await user.click(screen.getByRole('button', { name: 'Require a reassessment' }));
    await waitFor(() => expect(toastCalls.some(([k, m]) => k === 'info' && /already open/i.test(m))).toBe(true));
  });

  it('UI-MON-19 shows an existing open reassessment and refuses to offer another', async () => {
    mode = 'open_reassessment';
    await ready();
    expect(screen.getByTestId('monitoring-open-reassessment')).toBeInTheDocument();
    expect(screen.getAllByText('A reassessment is already open').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Require a reassessment' })).toBeDisabled();
  });

  it('UI-MON-20 shows the append-only decision history and the server lineage', async () => {
    mode = 'with_history';
    await ready();
    expect(screen.getByText(/Schedule — RESCHEDULED/)).toBeInTheDocument();
    expect(screen.getByText('Reassessment required')).toBeInTheDocument();
    expect(screen.getByText(/2027-03-31 → 2027-06-30/)).toBeInTheDocument();
    expect(screen.getByTestId('monitoring-lineage')).toHaveTextContent('programme_code');
  });

  it('UI-MON-21 shows the server refusal wording without softening it', async () => {
    rpcError = 'action_blocked: You do not hold aml_supervision.review. (PERMISSION_MISSING)';
    await ready();
    const user = await typeRationale(/Supervisory reasoning/i, 'Material control weaknesses justify an early reassessment now.');
    await user.click(screen.getByRole('button', { name: 'Require a reassessment' }));
    await waitFor(() => expect(toastCalls.some(([k, m]) => k === 'error' && /action_blocked/.test(m))).toBe(true));
  });

  it('UI-MON-22 refreshes from the server without a page reload', async () => {
    await ready();
    const user = userEvent.setup();
    const before = calls.filter((c) => c.fn === 'supervisory_risk_monitoring_view').length;
    await user.click(screen.getByRole('button', { name: 'Refresh monitoring record' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.fn === 'supervisory_risk_monitoring_view').length).toBeGreaterThan(before));
  });
});
