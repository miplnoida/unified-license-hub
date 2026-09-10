/**
 * UI-OUTCOME-01…25 — AML-11 governed evaluation of supervisory action outcomes.
 *
 * Payload shapes mirror `supervisory_outcome_view` exactly as the rolled-back
 * AML11CERT fixture exercises it in
 * `scripts/verify-aml-supervisory-outcome-effectiveness.sql`.
 *
 * Every gate proves the screen renders the SERVER's outcome contract and calls the
 * governed operations. No gate expects the browser to decide eligibility,
 * effectiveness, evidence sufficiency, maker-checker, approval or follow-up.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const ENTITY = 'e1100000-0000-4000-8000-000000000001';
const DEC_DONE = 'd1100000-0000-4000-8000-000000000001';
const DEC_OPEN = 'd1100000-0000-4000-8000-000000000002';
const DEC_CANCELLED = 'd1100000-0000-4000-8000-000000000003';
const DEC_LEGACY = 'd1100000-0000-4000-8000-000000000004';
const DEC_NOOBJ = 'd1100000-0000-4000-8000-000000000005';
const EVAL_PENDING = 'v1100000-0000-4000-8000-000000000001';
const EVAL_APPROVED = 'v1100000-0000-4000-8000-000000000002';
const EVAL_RETURNED = 'v1100000-0000-4000-8000-000000000003';

type Mode =
  | 'default'
  | 'read_only'
  | 'reviewer'
  | 'self_prepared'
  | 'approved_ineffective'
  | 'returned'
  | 'restricted_evidence'
  | 'no_actions';

let mode: Mode = 'default';
let rpcError: string | null = null;
let rpcResult: Record<string, unknown> = { evaluation_id: EVAL_PENDING, idempotent: false };
const calls: Array<{ fn: string; args: any }> = [];

const action = (
  decision_id: string,
  over: Record<string, unknown> = {},
) => ({
  decision_id,
  entity_id: ENTITY,
  domain_code: 'AML_CFT',
  action_type: 'OPEN_EXAMINATION',
  linkage_mode: 'CREATE',
  consequence_status: 'RECORDED',
  target_kind: 'EXAMINATION',
  target_id: 't1100000-0000-4000-8000-000000000001',
  target_reference: 'EXAM-2026-0011',
  target: { status: 'CLOSED' },
  action_status: 'CLOSED',
  action_completed: true,
  action_cancelled: false,
  action_completed_at: '2026-08-01T10:00:00Z',
  action_objective: 'Verify remediation of customer due diligence gaps.',
  source_kind: 'PUBLICATION',
  publication_id: 'p1100000-0000-4000-8000-000000000001',
  risk_state_id: 'r1100000-0000-4000-8000-000000000001',
  assessment_id: 'a1100000-0000-4000-8000-000000000001',
  source_rating: 'MEDIUM_HIGH',
  rating_provenance: 'COMPUTED',
  legacy_lineage: false,
  evaluable: true,
  reason_code: 'OK',
  reason: 'This action may be evaluated.',
  active_evaluation: null,
  lineage: {},
  ...over,
});

const evaluation = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  consequence_decision_id: DEC_DONE,
  action_type: 'OPEN_EXAMINATION',
  target_kind: 'EXAMINATION',
  target_id: 't1100000-0000-4000-8000-000000000001',
  target_reference: 'EXAM-2026-0011',
  action_objective: 'Verify remediation of customer due diligence gaps.',
  action_status: 'CLOSED',
  action_completed_at: '2026-08-01T10:00:00Z',
  conclusion: 'PARTIALLY_EFFECTIVE',
  rationale: 'The examination confirmed partial remediation only; two of five gaps remain open.',
  limitations: 'Two sampled files were unavailable during fieldwork.',
  recommended_next_step: 'A follow-up review of the outstanding gaps.',
  review_status: 'SUBMITTED',
  review_note: null,
  version: 1,
  supersedes_id: null,
  superseded_by_id: null,
  legacy_lineage: false,
  source_kind: 'PUBLICATION',
  publication_id: 'p1100000-0000-4000-8000-000000000001',
  assessment_id: 'a1100000-0000-4000-8000-000000000001',
  source_rating: 'MEDIUM_HIGH',
  rating_provenance: 'COMPUTED',
  prepared_by: 'u1100000-0000-4000-8000-000000000001',
  prepared_at: '2026-08-10T09:00:00Z',
  reviewed_by: null,
  reviewed_at: null,
  followups: [] as any[],
  lineage: {},
  evidence: [
    {
      evidence_id: 'ev110000-0000-4000-8000-000000000001',
      assessment_id: 'a1100000-0000-4000-8000-000000000001',
      entity_id: ENTITY,
      evidence_type: 'EXAMINATION_WORKPAPER',
      restricted: false,
      title: 'Remediation testing workpaper',
      source_reference: 'WP-2026-11',
      as_of_date: '2026-07-20',
      recorded_by: 'u1100000-0000-4000-8000-000000000001',
      origin: 'OFFICER_LINKED',
    },
  ],
  evidence_snapshot_present: false,
  may_review: false,
  self_review_blocked: false,
  follow_up_available: false,
  ...over,
});

function view() {
  const base = {
    entity_id: ENTITY,
    domain_code: 'AML_CFT',
    conclusions: ['NOT_ASSESSED', 'EFFECTIVE', 'PARTIALLY_EFFECTIVE', 'INEFFECTIVE', 'INCONCLUSIVE'],
    actions: [
      action(DEC_DONE),
      action(DEC_OPEN, {
        action_type: 'OPEN_SUPERVISORY_PLAN',
        target_kind: 'SUPERVISORY_PLAN',
        target_reference: 'PLAN-2026-0004',
        action_status: 'ACTIVE',
        action_completed: false,
        action_completed_at: null,
        evaluable: false,
        reason_code: 'ACTION_NOT_COMPLETE',
        reason:
          'The supervisory action is still open. Completion is required before effectiveness can be concluded, and closure alone never proves effectiveness.',
      }),
      action(DEC_CANCELLED, {
        action_type: 'OPEN_INTERVENTION',
        target_kind: 'SUPERVISORY_INTERVENTION',
        target_reference: 'INT-2026-0002',
        action_status: 'CANCELLED',
        action_completed: false,
        action_cancelled: true,
        evaluable: false,
        reason_code: 'ACTION_CANCELLED',
        reason:
          'The supervisory action was cancelled or withdrawn. It is identified separately and is not assessed for effectiveness.',
      }),
      action(DEC_LEGACY, {
        target_reference: 'EXAM-2019-0003',
        source_kind: 'LEGACY_RISK_RECORD',
        publication_id: null,
        rating_provenance: 'LEGACY_OFFICER_RATING',
        legacy_lineage: true,
      }),
      action(DEC_NOOBJ, {
        target_reference: 'EXAM-2026-0099',
        action_objective: null,
        evaluable: false,
        reason_code: 'OBJECTIVE_MISSING',
        reason:
          'The action records no supervisory objective, so effectiveness cannot be measured against anything.',
      }),
    ],
    evaluations: [evaluation(EVAL_PENDING)],
    follow_up_actions: [] as any[],
    viewer: { user_id: 'u1100000-0000-4000-8000-000000000009', may_prepare: true, may_review: false },
    notes: [
      'Completion is not effectiveness. A closed supervisory action is never treated as an effective one.',
      'The entity risk-of-record is never changed by an outcome evaluation.',
      'Any follow-up action must be chosen and justified by a supervisor; nothing is created automatically.',
    ],
  };

  switch (mode) {
    case 'read_only':
      return { ...base, viewer: { ...base.viewer, may_prepare: false } };
    case 'reviewer':
      return {
        ...base,
        viewer: { ...base.viewer, may_review: true },
        evaluations: [evaluation(EVAL_PENDING, { may_review: true })],
      };
    case 'self_prepared':
      return {
        ...base,
        viewer: { ...base.viewer, may_review: true },
        evaluations: [evaluation(EVAL_PENDING, { may_review: false, self_review_blocked: true })],
      };
    case 'approved_ineffective':
      return {
        ...base,
        evaluations: [
          evaluation(EVAL_APPROVED, {
            conclusion: 'INEFFECTIVE',
            review_status: 'APPROVED',
            reviewed_by: 'u1100000-0000-4000-8000-000000000002',
            reviewed_at: '2026-08-12T11:00:00Z',
            review_note: 'The conclusion is supported by the workpapers.',
            evidence_snapshot_present: true,
            follow_up_available: true,
            followups: [
              {
                decision_id: 'd1100000-0000-4000-8000-000000000099',
                action_type: 'REQUIRE_REASSESSMENT',
                rationale: 'Residual gaps require a fresh AML/CFT assessment.',
              },
            ],
          }),
        ],
        follow_up_actions: [
          { action: 'REQUIRE_REASSESSMENT', label: 'Require a reassessment', available: true, reason: 'Available' },
          {
            action: 'REFER_TO_ENFORCEMENT',
            label: 'Refer to enforcement',
            available: false,
            reason: 'A prerequisite supervisory record is missing',
          },
        ],
      };
    case 'returned':
      return {
        ...base,
        evaluations: [
          evaluation(EVAL_RETURNED, {
            review_status: 'RETURNED',
            reviewed_by: 'u1100000-0000-4000-8000-000000000002',
            reviewed_at: '2026-08-11T11:00:00Z',
            review_note: 'Cite the remediation testing evidence before resubmitting.',
          }),
          evaluation(EVAL_PENDING, { version: 2, supersedes_id: EVAL_RETURNED }),
        ],
      };
    case 'restricted_evidence':
      return {
        ...base,
        evaluations: [
          evaluation(EVAL_PENDING, {
            evidence: [
              {
                evidence_id: 'ev110000-0000-4000-8000-000000000002',
                assessment_id: 'a1100000-0000-4000-8000-000000000001',
                entity_id: ENTITY,
                evidence_type: 'SUPERVISORY_CORRESPONDENCE',
                restricted: true,
                title: null,
                source_reference: null,
                as_of_date: null,
                recorded_by: null,
                origin: 'OFFICER_LINKED',
              },
            ],
          }),
        ],
      };
    case 'no_actions':
      return { ...base, actions: [], evaluations: [] };
    default:
      return base;
  }
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: async (fn: string, args: any) => {
      calls.push({ fn, args });
      if (fn === 'supervisory_outcome_view') return { data: view(), error: null };
      if (rpcError) return { data: null, error: { message: rpcError } };
      return { data: rpcResult, error: null };
    },
    from: (table: string) => {
      throw new Error(`UI-OUTCOME: the outcome surface must not read ${table} directly`);
    },
  },
}));

vi.mock('@/hooks/useDmsDocuments', () => ({
  useDmsRegister: () => ({ data: { rows: [] }, isLoading: false }),
}));

const toastCalls: Array<[string, string]> = [];
vi.mock('sonner', () => ({
  toast: {
    success: (m: string) => toastCalls.push(['success', String(m)]),
    error: (m: string) => toastCalls.push(['error', String(m)]),
    info: (m: string) => toastCalls.push(['info', String(m)]),
  },
}));

import { AmlOutcomeEffectivenessPanel } from '@/components/supervision/aml/AmlOutcomeEffectivenessPanel';

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <AmlOutcomeEffectivenessPanel entityId={ENTITY} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function ready() {
  renderPanel();
  await waitFor(() => expect(screen.getByTestId('outcome-panel')).toBeInTheDocument());
}

beforeEach(() => {
  const proto = window.HTMLElement.prototype as any;
  proto.hasPointerCapture = () => false;
  proto.setPointerCapture = () => {};
  proto.releasePointerCapture = () => {};
  proto.scrollIntoView = () => {};
  cleanup();
  mode = 'default';
  rpcError = null;
  rpcResult = { evaluation_id: EVAL_PENDING, idempotent: false };
  calls.length = 0;
  toastCalls.length = 0;
});

describe('AML-11 outcome and effectiveness surface', () => {
  it('UI-OUTCOME-01 reads the outcome picture from the governed server view', async () => {
    await ready();
    expect(calls.map((c) => c.fn)).toContain('supervisory_outcome_view');
    expect(calls[0].args).toMatchObject({ _entity_id: ENTITY, _domain_code: 'AML_CFT' });
  });

  it('UI-OUTCOME-02 states that completion is not effectiveness', async () => {
    await ready();
    expect(screen.getByText(/Completion is not effectiveness/i)).toBeInTheDocument();
  });

  it('UI-OUTCOME-03 states that the risk-of-record is never changed', async () => {
    await ready();
    expect(screen.getByText(/risk-of-record is never changed/i)).toBeInTheDocument();
  });

  it('UI-OUTCOME-04 lists each linked supervisory action with its objective', async () => {
    await ready();
    expect(screen.getByTestId(`outcome-action-${DEC_DONE}`)).toBeInTheDocument();
    expect(
      screen.getAllByText('Verify remediation of customer due diligence gaps.').length,
    ).toBeGreaterThan(0);
  });

  it('UI-OUTCOME-05 shows the server verdict that an open action cannot be evaluated', async () => {
    await ready();
    const row = screen.getByTestId(`outcome-action-${DEC_OPEN}`);
    expect(row).toHaveTextContent('The action is still open');
    expect(row).toHaveTextContent(/closure alone never proves effectiveness/i);
  });

  it('UI-OUTCOME-06 identifies a cancelled action separately', async () => {
    await ready();
    expect(screen.getByTestId(`outcome-action-${DEC_CANCELLED}`)).toHaveTextContent(
      'The action was cancelled or withdrawn',
    );
  });

  it('UI-OUTCOME-07 flags a legacy action honestly', async () => {
    await ready();
    expect(screen.getByTestId(`outcome-legacy-${DEC_LEGACY}`)).toHaveTextContent('Legacy lineage');
  });

  it('UI-OUTCOME-08 shows the server reason when an action records no objective', async () => {
    await ready();
    expect(screen.getByTestId(`outcome-action-${DEC_NOOBJ}`)).toHaveTextContent(
      'The action records no supervisory objective',
    );
  });

  it('UI-OUTCOME-09 shows a completed but unassessed action as not yet assessed', async () => {
    await ready();
    expect(screen.getByTestId(`outcome-action-${DEC_LEGACY}`)).toHaveTextContent('Not yet assessed');
  });

  it('UI-OUTCOME-10 offers only the conclusions the server governs', async () => {
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Effectiveness conclusion'));
    for (const label of ['Not assessed', 'Effective', 'Partially effective', 'Ineffective', 'Inconclusive']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('UI-OUTCOME-11 records an evaluation only through the governed operation', async () => {
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Supervisory action'));
    await user.click(screen.getByRole('option', { name: /EXAM-2026-0011/i }));
    await user.click(screen.getByLabelText('Effectiveness conclusion'));
    await user.click(screen.getByRole('option', { name: 'Partially effective' }));
    await user.type(
      screen.getByLabelText('Written supervisory judgment'),
      'Only partial remediation was demonstrated against the recorded objective.',
    );
    await user.click(screen.getByTestId('outcome-submit'));
    await waitFor(() => expect(calls.map((c) => c.fn)).toContain('supervisory_outcome_evaluate'));
    const sent = calls.find((c) => c.fn === 'supervisory_outcome_evaluate')!.args._payload;
    expect(sent).toMatchObject({ consequence_decision_id: DEC_DONE, conclusion: 'PARTIALLY_EFFECTIVE' });
  });

  it('UI-OUTCOME-12 never enables an action the server refused', async () => {
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Supervisory action'));
    expect(screen.getByRole('option', { name: /PLAN-2026-0004/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('UI-OUTCOME-13 surfaces a server refusal verbatim', async () => {
    rpcError = 'not_evaluable: The supervisory action is still open. (ACTION_NOT_COMPLETE)';
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Supervisory action'));
    await user.click(screen.getByRole('option', { name: /EXAM-2026-0011/i }));
    await user.click(screen.getByLabelText('Effectiveness conclusion'));
    await user.click(screen.getByRole('option', { name: 'Ineffective' }));
    await user.type(screen.getByLabelText('Written supervisory judgment'), 'A written judgment of sufficient length.');
    await user.click(screen.getByTestId('outcome-submit'));
    await waitFor(() => expect(toastCalls.some(([k, m]) => k === 'error' && /not_evaluable/.test(m))).toBe(true));
  });

  it('UI-OUTCOME-14 reports a duplicate evaluation as the server describes it', async () => {
    rpcResult = {
      evaluation_id: EVAL_PENDING,
      duplicate: true,
      reason: 'An evaluation of this action is already awaiting review.',
    };
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Supervisory action'));
    await user.click(screen.getByRole('option', { name: /EXAM-2026-0011/i }));
    await user.click(screen.getByLabelText('Effectiveness conclusion'));
    await user.click(screen.getByRole('option', { name: 'Ineffective' }));
    await user.type(screen.getByLabelText('Written supervisory judgment'), 'A written judgment of sufficient length.');
    await user.click(screen.getByTestId('outcome-submit'));
    await waitFor(() =>
      expect(toastCalls.some(([k, m]) => k === 'info' && /already awaiting review/.test(m))).toBe(true),
    );
  });

  it('UI-OUTCOME-15 shows the source lineage behind the selected action', async () => {
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Supervisory action'));
    await user.click(screen.getByRole('option', { name: /EXAM-2026-0011/i }));
    const lineage = screen.getByTestId('outcome-lineage');
    expect(lineage).toHaveTextContent('PUBLICATION');
    expect(lineage).toHaveTextContent('MEDIUM_HIGH');
    expect(lineage).toHaveTextContent('COMPUTED');
  });

  it('UI-OUTCOME-16 renders the conclusion, judgment and limitations of each evaluation', async () => {
    await ready();
    const card = screen.getByTestId(`outcome-eval-${EVAL_PENDING}`);
    expect(card).toHaveTextContent('Partially effective');
    expect(card).toHaveTextContent('two of five gaps remain open');
    expect(card).toHaveTextContent('Two sampled files were unavailable');
  });

  it('UI-OUTCOME-17 renders the cited evidence for an evaluation', async () => {
    await ready();
    expect(screen.getByTestId(`outcome-eval-evidence-${EVAL_PENDING}`)).toHaveTextContent(
      'Remediation testing workpaper',
    );
  });

  it('UI-OUTCOME-18 withholds restricted evidence content', async () => {
    mode = 'restricted_evidence';
    await ready();
    const list = screen.getByTestId(`outcome-eval-evidence-${EVAL_PENDING}`);
    expect(list).toHaveTextContent('Restricted supervisory evidence — withheld');
  });

  it('UI-OUTCOME-19 shows a read-only officer that they may not prepare an evaluation', async () => {
    mode = 'read_only';
    await ready();
    expect(screen.getByTestId('outcome-no-prepare')).toHaveTextContent('read this record only');
    expect(screen.queryByTestId('outcome-submit')).toBeNull();
  });

  it('UI-OUTCOME-20 blocks self-review exactly as the server decided', async () => {
    mode = 'self_prepared';
    await ready();
    expect(screen.getByTestId(`outcome-self-review-${EVAL_PENDING}`)).toHaveTextContent(
      'you cannot review it',
    );
    expect(screen.queryByTestId(`outcome-approve-${EVAL_PENDING}`)).toBeNull();
  });

  it('UI-OUTCOME-21 approves through the governed review operation only', async () => {
    mode = 'reviewer';
    await ready();
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText('Review note'),
      'The conclusion is supported by the cited workpapers.',
    );
    await user.click(screen.getByTestId(`outcome-approve-${EVAL_PENDING}`));
    await waitFor(() => expect(calls.map((c) => c.fn)).toContain('supervisory_outcome_review'));
    expect(calls.find((c) => c.fn === 'supervisory_outcome_review')!.args._payload).toMatchObject({
      evaluation_id: EVAL_PENDING,
      decision: 'APPROVE',
    });
  });

  it('UI-OUTCOME-22 returns an evaluation through the governed review operation', async () => {
    mode = 'reviewer';
    await ready();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Review note'), 'Cite the remediation testing evidence.');
    await user.click(screen.getByTestId(`outcome-return-${EVAL_PENDING}`));
    await waitFor(() =>
      expect(calls.find((c) => c.fn === 'supervisory_outcome_review')!.args._payload).toMatchObject({
        decision: 'RETURN',
      }),
    );
  });

  it('UI-OUTCOME-23 preserves a returned evaluation and its later version in history', async () => {
    mode = 'returned';
    await ready();
    expect(screen.getByTestId(`outcome-eval-${EVAL_RETURNED}`)).toHaveTextContent('Returned for revision');
    expect(screen.getByTestId(`outcome-eval-${EVAL_RETURNED}`)).toHaveTextContent(
      'Cite the remediation testing evidence before resubmitting.',
    );
    expect(screen.getByTestId(`outcome-eval-${EVAL_PENDING}`)).toHaveTextContent('version 2');
  });

  it('UI-OUTCOME-24 shows an approved evaluation as frozen with its recorded follow-up', async () => {
    mode = 'approved_ineffective';
    await ready();
    const card = screen.getByTestId(`outcome-eval-${EVAL_APPROVED}`);
    expect(card).toHaveTextContent('Approved');
    expect(card).toHaveTextContent('Evidence frozen at approval');
    expect(screen.getByTestId(`outcome-eval-followups-${EVAL_APPROVED}`)).toHaveTextContent(
      'REQUIRE_REASSESSMENT',
    );
  });

  it('UI-OUTCOME-25 offers only server-supplied follow-ups and never creates one automatically', async () => {
    mode = 'approved_ineffective';
    await ready();
    expect(calls.filter((c) => c.fn !== 'supervisory_outcome_view')).toHaveLength(0);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Follow-up action'));
    expect(screen.getByRole('option', { name: /Refer to enforcement/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.click(screen.getByRole('option', { name: /Require a reassessment/i }));
    await user.click(screen.getByLabelText('Approved evaluation'));
    await user.click(screen.getByRole('option', { name: /Ineffective/i }));
    await user.type(
      screen.getByLabelText('Justification'),
      'The residual gaps require a fresh AML/CFT assessment.',
    );
    await user.click(screen.getByTestId('outcome-followup-submit'));
    await waitFor(() => expect(calls.map((c) => c.fn)).toContain('supervisory_outcome_followup'));
    expect(calls.find((c) => c.fn === 'supervisory_outcome_followup')!.args._payload).toMatchObject({
      evaluation_id: EVAL_APPROVED,
      action_type: 'REQUIRE_REASSESSMENT',
    });
  });
});
