/**
 * UI-CONSEQ-01…25 — AML-08 post-publication supervisory consequence and action linkage.
 *
 * Payload shapes mirror `supervisory_consequence_view` exactly as the rolled-back
 * AML08CERT fixture exercises it in
 * `scripts/verify-aml-supervisory-consequence-linkage.sql`.
 *
 * Every gate proves the screen renders the SERVER's consequence contract and calls
 * the governed operations. No gate expects the browser to derive an action from a
 * risk rating, decide eligibility, decide a prerequisite, resolve a duplicate or
 * invent a rating where none can be calculated.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const ENTITY = 'e8800000-0000-4000-8000-000000000001';
const ASSESSMENT = 'a8800000-0000-4000-8000-000000000001';
const PUBLICATION = 'p8800000-0000-4000-8000-000000000001';
const PLAN = 'pl880000-0000-4000-8000-000000000001';
const FINDING = 'fd880000-0000-4000-8000-000000000001';

type Mode =
  | 'published'
  | 'legacy'
  | 'no_risk'
  | 'approved_not_published'
  | 'not_calculable'
  | 'read_only'
  | 'prereq_missing'
  | 'linked'
  | 'superseded';

let mode: Mode = 'published';
let rpcError: string | null = null;
let rpcResult: Record<string, unknown> = { decision_id: 'd8880000', idempotent: false };
const calls: Array<{ fn: string; args: any }> = [];

const act = (
  action: string,
  available: boolean,
  reason_code: string,
  required_permission: string,
  target_kind: string | null,
  modes: string[],
  prerequisite: string | null = null,
  existing: any[] = [],
) => ({
  action,
  label: action.replace(/_/g, ' ').toLowerCase(),
  target_kind,
  linkage_modes: modes,
  required_permission,
  available,
  reason_code,
  reason: reason_code === 'OK' ? 'Available' : `Server reason for ${reason_code}`,
  prerequisite,
  existing,
});

function source() {
  const base = {
    entity_id: ENTITY,
    domain_code: 'AML_CFT',
    source_kind: 'PUBLICATION',
    eligible: true,
    publication: { id: PUBLICATION, published_rating: 'MEDIUM_HIGH', published_at: '2026-04-01T09:00:00Z' },
    approval_decision: { id: 'ad880000', final_rating: 'MEDIUM_HIGH', final_rating_source: 'COMPUTED' },
    assessment: { id: ASSESSMENT, reference: 'AML-2026-0001' },
    risk_state: { id: 'rs880000', residual_rating: 'MEDIUM_HIGH' },
    calculation_run: { id: 'run880000', run_seq: 4, status: 'CALCULATED', result_hash: 'hash-run-4' },
    approved_override: null,
    calculation_availability: 'CALCULATED',
    rating_provenance: 'COMPUTED',
    current_rating: 'MEDIUM_HIGH',
    effective_from: '2026-04-01',
    approved_not_published: false,
    blockers: [] as any[],
  };

  switch (mode) {
    case 'legacy':
      return {
        ...base, source_kind: 'LEGACY_RISK_RECORD', publication: null, approval_decision: null,
        calculation_run: null, calculation_availability: 'NOT_CALCULABLE',
        rating_provenance: 'LEGACY_OFFICER_RATING', current_rating: 'MEDIUM',
        blockers: [
          { code: 'LEGACY_RISK_RECORD', blocking: false, detail: 'The current risk-of-record predates governed publication.' },
          { code: 'NOT_CALCULABLE', blocking: false, detail: 'No approved calculation policy is in force.' },
        ],
      };
    case 'no_risk':
      return {
        ...base, source_kind: 'NONE', eligible: false, publication: null, approval_decision: null,
        assessment: null, risk_state: null, calculation_run: null,
        calculation_availability: 'UNAVAILABLE', rating_provenance: 'UNAVAILABLE', current_rating: null,
        effective_from: null,
        blockers: [{ code: 'NO_RISK_OF_RECORD', blocking: true, detail: 'No current AML/CFT risk-of-record exists for this entity.' }],
      };
    case 'approved_not_published':
      return {
        ...base, source_kind: 'NONE', eligible: false, publication: null, risk_state: null,
        approved_not_published: true, current_rating: null,
        blockers: [{ code: 'SOURCE_NOT_PUBLISHED', blocking: true, detail: 'This assessment is approved but its risk-of-record has not been published yet.' }],
      };
    case 'not_calculable':
      return {
        ...base, calculation_run: null, calculation_availability: 'NOT_CALCULABLE',
        rating_provenance: 'NOT_CALCULABLE', current_rating: null,
        blockers: [{ code: 'NOT_CALCULABLE', blocking: false, detail: 'No approved calculation policy is in force, so no rating can be calculated.' }],
      };
    case 'superseded':
      return {
        ...base,
        blockers: [{ code: 'SOURCE_SUPERSEDED', blocking: false, detail: 'A later publication now drives the risk-of-record.' }],
      };
    default:
      return base;
  }
}

function actions() {
  if (mode === 'no_risk') {
    return [
      act('OPEN_SUPERVISORY_PLAN', false, 'NO_RISK_OF_RECORD', 'aml_supervision.create', 'SUPERVISORY_PLAN', ['CREATE', 'LINK']),
      act('RECORD_MONITORING', false, 'NO_RISK_OF_RECORD', 'aml_supervision.review', null, ['RECORD_ONLY']),
    ];
  }
  if (mode === 'approved_not_published') {
    return [
      act('OPEN_SUPERVISORY_PLAN', false, 'SOURCE_NOT_PUBLISHED', 'aml_supervision.create', 'SUPERVISORY_PLAN', ['CREATE', 'LINK']),
      act('RAISE_FINDING', false, 'SOURCE_NOT_PUBLISHED', 'aml_supervision.finding_manage', 'SUPERVISORY_FINDING', ['CREATE', 'LINK']),
    ];
  }
  if (mode === 'read_only') {
    return [
      act('OPEN_SUPERVISORY_PLAN', false, 'PERMISSION_MISSING', 'aml_supervision.create', 'SUPERVISORY_PLAN', ['CREATE', 'LINK']),
      act('RAISE_FINDING', false, 'PERMISSION_MISSING', 'aml_supervision.finding_manage', 'SUPERVISORY_FINDING', ['CREATE', 'LINK']),
      act('RECORD_MONITORING', false, 'PERMISSION_MISSING', 'aml_supervision.review', null, ['RECORD_ONLY']),
    ];
  }
  const prereqMissing = mode === 'prereq_missing';
  return [
    act('OPEN_SUPERVISORY_PLAN', true, 'OK', 'aml_supervision.create', 'SUPERVISORY_PLAN', ['CREATE', 'LINK'], null,
      mode === 'linked' ? [{ id: 'dec-1', target_kind: 'SUPERVISORY_PLAN', target_id: PLAN, target_reference: 'PLAN-2026-01', decided_at: '2026-04-02T09:00:00Z' }] : []),
    act('REQUIRE_REASSESSMENT', true, 'OK', 'aml_supervision.review', 'REASSESSMENT_REQUIREMENT', ['CREATE', 'LINK']),
    act('OPEN_INTERVENTION', !prereqMissing, prereqMissing ? 'PREREQUISITE_MISSING' : 'OK',
      'aml_supervision.create', 'SUPERVISORY_INTERVENTION', ['CREATE', 'LINK'], 'PLAN'),
    act('OPEN_EXAMINATION', false, 'PREREQUISITE_MISSING', 'aml_supervision.examine', 'EXAMINATION', ['CREATE', 'LINK'], 'INTERVENTION'),
    act('RAISE_FINDING', true, 'OK', 'aml_supervision.finding_manage', 'SUPERVISORY_FINDING', ['CREATE', 'LINK']),
    act('REFER_TO_ENFORCEMENT', true, 'OK', 'enforcement_management.create', 'ENFORCEMENT_ACTION', ['CREATE', 'LINK'], 'FINDING'),
    act('RECORD_MONITORING', true, 'OK', 'aml_supervision.review', null, ['RECORD_ONLY']),
    act('RECORD_DEFERRED', true, 'OK', 'aml_supervision.review', null, ['RECORD_ONLY']),
  ];
}

function view() {
  return {
    entity_id: ENTITY,
    domain_code: 'AML_CFT',
    source: source(),
    actions: actions(),
    linked_records: mode === 'linked'
      ? [{
          action_type: 'OPEN_SUPERVISORY_PLAN', decision_id: 'dec-1',
          target: {
            kind: 'SUPERVISORY_PLAN', id: PLAN, reference: 'PLAN-2026-01', title: 'AML thematic plan',
            status: 'ACTIVE', entity_id: ENTITY, domain_code: 'AML_CFT', route: `/conduct/plans/${PLAN}`,
          },
        }]
      : [],
    link_candidates: [
      { target_kind: 'SUPERVISORY_PLAN', id: PLAN, reference: 'PLAN-2026-01', title: 'AML thematic plan', status: 'ACTIVE' },
      { target_kind: 'SUPERVISORY_FINDING', id: FINDING, reference: 'FIND-2026-07', title: 'CDD refresh gap', status: 'ISSUED' },
    ],
    decisions: mode === 'linked'
      ? [{
          id: 'dec-1', action_type: 'OPEN_SUPERVISORY_PLAN', linkage_mode: 'CREATE', status: 'RECORDED',
          source_kind: 'PUBLICATION', publication_id: PUBLICATION, assessment_id: ASSESSMENT,
          source_rating: 'MEDIUM_HIGH', rating_provenance: 'COMPUTED', calculation_availability: 'CALCULATED',
          rationale: 'Targeted plan opened following the published AML risk-of-record.',
          supervisory_objective: 'Test CDD remediation', priority: 'HIGH', due_date: '2026-06-30',
          owner_id: 'officer-1', decided_by: 'officer-1', decided_at: '2026-04-02T09:00:00Z',
          withdrawal_reason: null, superseded_by_id: null,
          target_kind: 'SUPERVISORY_PLAN', target_id: PLAN, target_reference: 'PLAN-2026-01',
          target: {
            kind: 'SUPERVISORY_PLAN', id: PLAN, reference: 'PLAN-2026-01', title: 'AML thematic plan',
            status: 'ACTIVE', entity_id: ENTITY, domain_code: 'AML_CFT', route: `/conduct/plans/${PLAN}`,
          },
          lineage: { publication_id: PUBLICATION, assessment_id: ASSESSMENT, rating_provenance: 'COMPUTED' },
        }]
      : [],
    prerequisites: { plan: mode !== 'prereq_missing', intervention: false, finding: true },
    viewer: { user_id: 'officer-9' },
  };
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: async (fn: string, args: any) => {
      calls.push({ fn, args });
      if (fn === 'supervisory_consequence_view') return { data: view(), error: null };
      if (rpcError) return { data: null, error: { message: rpcError } };
      return { data: rpcResult, error: null };
    },
    from: (table: string) => {
      throw new Error(`UI-CONSEQ: the consequence surface must not read ${table} directly`);
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

import { AmlSupervisoryConsequencePanel } from '@/components/supervision/aml/AmlSupervisoryConsequencePanel';

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <AmlSupervisoryConsequencePanel entityId={ENTITY} assessmentId={ASSESSMENT} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function ready() {
  renderPanel();
  await waitFor(() => expect(screen.getByTestId('aml-consequence-panel')).toBeInTheDocument());
}

// jsdom lacks the pointer-capture APIs the Radix select primitive calls.
beforeEach(() => {
  const proto = window.HTMLElement.prototype as any;
  proto.hasPointerCapture = () => false;
  proto.setPointerCapture = () => {};
  proto.releasePointerCapture = () => {};
  proto.scrollIntoView = () => {};
  cleanup();
  mode = 'published';
  rpcError = null;
  rpcResult = { decision_id: 'd8880000', idempotent: false };
  calls.length = 0;
  toastCalls.length = 0;
});

describe('AML-08 supervisory consequence surface', () => {
  it('UI-CONSEQ-01 reads the consequence picture from the governed server view', async () => {
    await ready();
    expect(calls.map((c) => c.fn)).toContain('supervisory_consequence_view');
    expect(calls[0].args).toMatchObject({ _entity_id: ENTITY, _domain_code: 'AML_CFT', _assessment_id: ASSESSMENT });
  });

  it('UI-CONSEQ-02 shows the published risk-of-record as the source of judgment', async () => {
    await ready();
    expect(screen.getByText('Published risk-of-record')).toBeInTheDocument();
    expect(screen.getByText('Rating MEDIUM_HIGH')).toBeInTheDocument();
  });

  it('UI-CONSEQ-03 shows where the rating came from', async () => {
    await ready();
    expect(screen.getByText('Calculated result')).toBeInTheDocument();
  });

  it('UI-CONSEQ-04 states plainly that a rating is not an instruction', async () => {
    await ready();
    expect(screen.getByText(/never an instruction/i)).toBeInTheDocument();
  });

  it('UI-CONSEQ-05 renders the server action list with the permission each one needs', async () => {
    await ready();
    expect(screen.getByText('Open or link a supervisory plan')).toBeInTheDocument();
    expect(screen.getAllByText('aml_supervision.finding_manage').length).toBeGreaterThan(0);
    expect(screen.getAllByText('enforcement_management.create').length).toBeGreaterThan(0);
  });

  it('UI-CONSEQ-06 shows the server reason for every unavailable action', async () => {
    mode = 'prereq_missing';
    await ready();
    expect(screen.getAllByText('A prerequisite supervisory record is missing').length).toBeGreaterThan(0);
  });

  it('UI-CONSEQ-07 refuses to offer any action when no risk-of-record exists', async () => {
    mode = 'no_risk';
    await ready();
    expect(screen.getByText('No risk-of-record')).toBeInTheDocument();
    expect(screen.getAllByText('No current risk-of-record to act on').length).toBeGreaterThan(0);
  });

  it('UI-CONSEQ-08 refuses to offer actions on an approved but unpublished assessment', async () => {
    mode = 'approved_not_published';
    await ready();
    expect(screen.getAllByText('The approved assessment has not published its risk-of-record').length).toBeGreaterThan(0);
  });

  it('UI-CONSEQ-09 shows a legacy risk record honestly as a legacy source', async () => {
    mode = 'legacy';
    await ready();
    expect(screen.getByText('Legacy risk record (pre-publication)')).toBeInTheDocument();
    expect(screen.getByText('Legacy officer rating')).toBeInTheDocument();
  });

  it('UI-CONSEQ-10 never invents a rating when none can be calculated', async () => {
    mode = 'not_calculable';
    await ready();
    expect(screen.getByText('Not calculable — no approved calculation policy in force')).toBeInTheDocument();
    expect(screen.getByText('Rating —')).toBeInTheDocument();
  });

  it('UI-CONSEQ-11 shows a blocking condition as blocking', async () => {
    mode = 'no_risk';
    await ready();
    expect(screen.getAllByText('Blocking').length).toBeGreaterThan(0);
  });

  it('UI-CONSEQ-12 shows advisory conditions without blocking', async () => {
    mode = 'superseded';
    await ready();
    expect(screen.getByText(/A later publication now applies/)).toBeInTheDocument();
    expect(screen.queryByText('Blocking')).toBeNull();
  });

  it('UI-CONSEQ-13 keeps the record button disabled until a reason is written', async () => {
    await ready();
    const btn = screen.getByRole('button', { name: 'Record supervisory consequence' });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/at least 20 characters is required/i)).toBeInTheDocument();
  });

  it('UI-CONSEQ-14 records a consequence through the governed operation only', async () => {
    const user = userEvent.setup();
    await ready();
    await user.click(screen.getByRole('combobox', { name: 'Consequence' }));
    await user.click(screen.getByRole('option', { name: /Record monitoring/i }));
    await user.click(screen.getByRole('combobox', { name: 'How to link' }));
    await user.click(screen.getByRole('option', { name: /Record the decision only/i }));
    await user.type(screen.getByLabelText(/Supervisory reasoning/i),
      'Monitoring only: the published rating is stable and controls were tested recently.');
    await user.click(screen.getByRole('button', { name: 'Record supervisory consequence' }));
    await waitFor(() => expect(calls.some((c) => c.fn === 'supervisory_consequence_record')).toBe(true));
    const payload = calls.find((c) => c.fn === 'supervisory_consequence_record')!.args._payload;
    expect(payload).toMatchObject({
      entity_id: ENTITY, action_type: 'RECORD_MONITORING', linkage_mode: 'RECORD_ONLY', assessment_id: ASSESSMENT,
    });
  });

  it('UI-CONSEQ-15 sends no rating, band or eligibility flag of its own', async () => {
    const user = userEvent.setup();
    await ready();
    await user.click(screen.getByRole('combobox', { name: 'Consequence' }));
    await user.click(screen.getByRole('option', { name: /Record a blocked or deferred decision/i }));
    await user.click(screen.getByRole('combobox', { name: 'How to link' }));
    await user.click(screen.getByRole('option', { name: /Record the decision only/i }));
    await user.type(screen.getByLabelText(/Supervisory reasoning/i),
      'Deferred pending the outcome of the current group-wide remediation programme.');
    await user.click(screen.getByRole('button', { name: 'Record supervisory consequence' }));
    await waitFor(() => expect(calls.some((c) => c.fn === 'supervisory_consequence_record')).toBe(true));
    const payload = calls.find((c) => c.fn === 'supervisory_consequence_record')!.args._payload;
    for (const forbidden of ['rating', 'risk_band', 'eligible', 'available', 'source_kind', 'rating_provenance']) {
      expect(Object.keys(payload)).not.toContain(forbidden);
    }
  });

  it('UI-CONSEQ-16 offers only the linkage modes the server permits', async () => {
    const user = userEvent.setup();
    await ready();
    await user.click(screen.getByRole('combobox', { name: 'Consequence' }));
    await user.click(screen.getByRole('option', { name: /Record monitoring/i }));
    await user.click(screen.getByRole('combobox', { name: 'How to link' }));
    expect(screen.getByRole('option', { name: /Record the decision only/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Create a new record/i })).toBeNull();
  });

  it('UI-CONSEQ-17 links an existing canonical record instead of duplicating it', async () => {
    const user = userEvent.setup();
    await ready();
    await user.click(screen.getByRole('combobox', { name: 'Consequence' }));
    await user.click(screen.getByRole('option', { name: /Open or link a supervisory plan/i }));
    await user.click(screen.getByRole('combobox', { name: 'How to link' }));
    await user.click(screen.getByRole('option', { name: /Link an existing record/i }));
    await user.click(screen.getByRole('combobox', { name: 'Existing record' }));
    await user.click(screen.getByRole('option', { name: /PLAN-2026-01/i }));
    await user.type(screen.getByLabelText(/Supervisory reasoning/i),
      'The published risk is already addressed by the existing thematic supervisory plan.');
    await user.click(screen.getByRole('button', { name: 'Record supervisory consequence' }));
    await waitFor(() => expect(calls.some((c) => c.fn === 'supervisory_consequence_record')).toBe(true));
    const payload = calls.find((c) => c.fn === 'supervisory_consequence_record')!.args._payload;
    expect(payload).toMatchObject({ linkage_mode: 'LINK', target_id: PLAN });
  });

  it('UI-CONSEQ-18 reports the server duplicate verdict without hiding it', async () => {
    const user = userEvent.setup();
    rpcResult = { decision_id: 'dec-1', duplicate: true, reason_code: 'DUPLICATE_EXISTS', reason: 'This record is already linked to this entity for the same supervisory consequence.' };
    await ready();
    await user.click(screen.getByRole('combobox', { name: 'Consequence' }));
    await user.click(screen.getByRole('option', { name: /Record monitoring/i }));
    await user.click(screen.getByRole('combobox', { name: 'How to link' }));
    await user.click(screen.getByRole('option', { name: /Record the decision only/i }));
    await user.type(screen.getByLabelText(/Supervisory reasoning/i),
      'Monitoring recorded again after the quarterly supervisory discussion.');
    await user.click(screen.getByRole('button', { name: 'Record supervisory consequence' }));
    await waitFor(() => expect(toastCalls.some(([k, m]) => k === 'info' && /already linked/i.test(m))).toBe(true));
  });

  it('UI-CONSEQ-19 reports a repeated identical request as already recorded', async () => {
    const user = userEvent.setup();
    rpcResult = { decision_id: 'dec-1', idempotent: true };
    await ready();
    await user.click(screen.getByRole('combobox', { name: 'Consequence' }));
    await user.click(screen.getByRole('option', { name: /Record monitoring/i }));
    await user.click(screen.getByRole('combobox', { name: 'How to link' }));
    await user.click(screen.getByRole('option', { name: /Record the decision only/i }));
    await user.type(screen.getByLabelText(/Supervisory reasoning/i),
      'Monitoring decision recorded following the supervisory review meeting.');
    await user.click(screen.getByRole('button', { name: 'Record supervisory consequence' }));
    await waitFor(() => expect(toastCalls.some(([k, m]) => k === 'info' && /already recorded/i.test(m))).toBe(true));
  });

  it('UI-CONSEQ-20 shows the server refusal verbatim and records nothing locally', async () => {
    const user = userEvent.setup();
    rpcError = 'action_blocked: No current AML/CFT risk-of-record exists for this entity. (NO_RISK_OF_RECORD)';
    await ready();
    await user.click(screen.getByRole('combobox', { name: 'Consequence' }));
    await user.click(screen.getByRole('option', { name: /Record monitoring/i }));
    await user.click(screen.getByRole('combobox', { name: 'How to link' }));
    await user.click(screen.getByRole('option', { name: /Record the decision only/i }));
    await user.type(screen.getByLabelText(/Supervisory reasoning/i),
      'Attempting to record monitoring against an entity with no published risk.');
    await user.click(screen.getByRole('button', { name: 'Record supervisory consequence' }));
    await waitFor(() => expect(toastCalls.some(([k, m]) => k === 'error' && /NO_RISK_OF_RECORD/.test(m))).toBe(true));
  });

  it('UI-CONSEQ-21 shows the canonical records linked to the risk-of-record', async () => {
    mode = 'linked';
    await ready();
    expect(screen.getAllByText('Supervisory plan').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'PLAN-2026-01' }).length).toBeGreaterThan(0);
  });

  it('UI-CONSEQ-22 opens the canonical target record, not a copy of it', async () => {
    mode = 'linked';
    await ready();
    const link = screen.getAllByRole('link', { name: 'PLAN-2026-01' })[0];
    expect(link).toHaveAttribute('href', `/conduct/plans/${PLAN}`);
  });

  it('UI-CONSEQ-23 shows each decision with the exact risk source and reasoning it was taken on', async () => {
    mode = 'linked';
    await ready();
    expect(screen.getByText('Targeted plan opened following the published AML risk-of-record.')).toBeInTheDocument();
    expect(screen.getAllByText(/MEDIUM_HIGH · Calculated result/).length).toBeGreaterThan(0);
  });

  it('UI-CONSEQ-24 withdraws a decision through the governed operation with a written reason', async () => {
    const user = userEvent.setup();
    mode = 'linked';
    await ready();
    await user.click(screen.getByRole('combobox', { name: 'Withdraw a recorded decision' }));
    await user.click(screen.getByRole('option', { name: /Open or link a supervisory plan/i }));
    await user.type(screen.getByLabelText(/Withdrawal reason/i),
      'Recorded against the wrong entity during the supervisory planning session.');
    await user.click(screen.getByRole('button', { name: 'Withdraw decision' }));
    await waitFor(() => expect(calls.some((c) => c.fn === 'supervisory_consequence_withdraw')).toBe(true));
    const args = calls.find((c) => c.fn === 'supervisory_consequence_withdraw')!.args;
    expect(args._decision_id).toBe('dec-1');
    expect(String(args._rationale).length).toBeGreaterThanOrEqual(20);
  });

  it('UI-CONSEQ-25 offers a read-only officer no action at all', async () => {
    mode = 'read_only';
    await ready();
    expect(screen.getAllByText('You do not hold the required permission').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Record supervisory consequence' })).toBeDisabled();
  });
});
