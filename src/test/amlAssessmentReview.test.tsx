/**
 * UI-REV-01…18 — AML-07 assessment review, challenge, decision and publication.
 *
 * Payload shapes mirror `supervisory_assessment_review_register` exactly as the
 * rolled-back AML07CERT fixture exercises it in
 * `scripts/verify-aml-assessment-review-risk-publication.sql`.
 *
 * Every gate proves the screen renders the SERVER's lifecycle contract and calls
 * the governed operations. No gate expects the browser to decide a transition,
 * readiness, independence, override precedence or publication eligibility.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const ASSESSMENT = 'a7700000-0000-4000-8000-000000000001';
const RUN_ID = 'r7700000-0000-4000-8000-000000000001';

type Mode =
  | 'draft'
  | 'draft_blocked'
  | 'submitted'
  | 'challenged'
  | 'returned'
  | 'approved_not_published'
  | 'published'
  | 'self_approval'
  | 'override_pending'
  | 'legacy';

let mode: Mode = 'draft';
let rpcError: string | null = null;
const calls: Array<{ fn: string; args: any }> = [];

const action = (a: string, permitted: boolean, reason: string, permission: string, maker = false) => ({
  action: a, label: a.replace(/_/g, ' ').toLowerCase(), required_permission: permission,
  permitted, reason_code: reason, maker_checker_required: maker,
});

const ROUND_1 = {
  id: 'rr770000-0000-4000-8000-000000000001',
  round_seq: 1,
  submitted_by: 'officer-1',
  submitted_at: '2026-03-01T09:00:00Z',
  submission_rationale: 'Annual assessment complete and ready for review.',
  change_summary: null,
  calculation_basis: 'CALCULATION_RUN',
  calculation_run_id: RUN_ID,
  calculation_run_seq: 4,
  calculation_result_hash: 'hash-run-4',
  computed_rating: 'MEDIUM_HIGH',
  reviewer_id: 'reviewer-9',
  outcome: 'PENDING',
  outcome_by: null, outcome_at: null, outcome_reason: null,
  readiness_snapshot: { included_questions: 42, answered: 42 },
  submission_snapshot: { responses: 42, facts: 6 },
  challenges: [] as any[],
};

const CHALLENGE = {
  id: 'ch770000-0000-4000-8000-000000000001',
  challenge_code: 'CH-EVID-001',
  category: 'EVIDENCE',
  narrative: 'The PEP screening evidence does not cover the December population.',
  question_code: 'AML-Q-014',
  dimension_code: 'CUSTOMER',
  fact_code: null,
  calculation_run_id: RUN_ID,
  status: 'OPEN',
  raised_by: 'reviewer-9',
  raised_at: '2026-03-02T09:00:00Z',
  resolved_by: null, resolved_at: null, resolution_note: null,
};

const DECISION = {
  id: 'ad770000-0000-4000-8000-000000000001',
  decision: 'APPROVED',
  round_seq: 2,
  computed_rating: 'MEDIUM_HIGH',
  override_rating: null,
  final_rating: 'MEDIUM_HIGH',
  final_rating_source: 'COMPUTED',
  calculation_basis: 'CALCULATION_RUN',
  calculation_run_id: RUN_ID,
  calculation_run_seq: 4,
  calculation_result_hash: 'hash-run-4',
  methodology_id: 'm7', methodology_version: 'AML/CFT-RBA v1.0',
  programme_id: 'p7', programme_version: '2',
  rationale: 'Reviewer challenges resolved; calculated rating adopted.',
  effective_date: '2026-03-05',
  decided_by: 'reviewer-9',
  decided_at: '2026-03-05T10:00:00Z',
  review_history: [{ round_seq: 1, outcome: 'RETURNED' }, { round_seq: 2, outcome: 'APPROVED' }],
};

const PUBLICATION = {
  id: 'rp770000-0000-4000-8000-000000000001',
  approval_decision_id: DECISION.id,
  previous_rating: 'MEDIUM',
  published_rating: 'MEDIUM_HIGH',
  effective_from: '2026-03-05',
  movement_id: 'mv770000-0000-4000-8000-000000000001',
  reason: 'Approved annual AML/CFT assessment.',
  published_by: 'reviewer-9',
  published_at: '2026-03-05T10:00:05Z',
};

const LINEAGE = {
  complete: true,
  legacy_state: null,
  risk_of_record: { published_rating: 'MEDIUM_HIGH', publication_id: PUBLICATION.id },
  approval_decision: { id: DECISION.id },
  review_round: { round_seq: 2 },
  calculation_run: { run_seq: 4, result_hash: 'hash-run-4' },
  calculation_policy: { config_version: 3 },
  methodology: { version: 'AML/CFT-RBA v1.0' },
  programme: { version: '2' },
  question_plan: { rows: 42 },
  responses: { count: 42 },
  facts: { count: 6 },
  evidence: { accessible_count: 5, items: [] },
};

function lifecycle() {
  const base = {
    assessment_id: ASSESSMENT, reference: 'AML-ASMT-0007',
    raw_status: 'draft', canonical_state: 'DRAFT',
    editing_allowed: true, calculation_allowed: true, publication_allowed: false,
    maker_checker_required: true, viewer_is_preparer: false,
    assigned_owner_id: 'officer-1', assigned_team_id: 'team-aml', assigned_reviewer_id: null,
    current_round_seq: 0, current_round_id: null,
    submitted_run_id: null, approval_decision_id: null,
    approved_rating: null, approved_rating_source: null,
    risk_publication_id: null, risk_published_at: null,
    blockers: [] as any[],
    actions: [
      action('SUBMIT_FOR_REVIEW', true, 'OK', 'aml_supervision.submit'),
      action('RAISE_CHALLENGE', false, 'STATE_NOT_ELIGIBLE', 'aml_supervision.review'),
      action('RETURN_FOR_CHANGES', false, 'STATE_NOT_ELIGIBLE', 'aml_supervision.review'),
      action('REJECT', false, 'STATE_NOT_ELIGIBLE', 'aml_supervision.approve'),
      action('APPROVE', false, 'STATE_NOT_ELIGIBLE', 'aml_supervision.approve', true),
      action('PUBLISH_RISK_OF_RECORD', false, 'NO_APPROVAL_DECISION', 'aml_supervision.approve'),
    ],
  };

  switch (mode) {
    case 'draft_blocked':
      return {
        ...base,
        blockers: [
          { code: 'CALCULATION_RUN_MISSING', label: 'x', detail: 'No successful calculation run is bound.', blocking: true, stage: 'SUBMIT' },
          { code: 'READINESS_INCOMPLETE', label: 'x', detail: '3 included questions are unanswered.', blocking: true, stage: 'SUBMIT' },
        ],
        actions: base.actions.map((a) =>
          a.action === 'SUBMIT_FOR_REVIEW' ? action('SUBMIT_FOR_REVIEW', false, 'BLOCKED', 'aml_supervision.submit') : a),
      };
    case 'submitted':
    case 'challenged':
      return {
        ...base, raw_status: 'submitted', canonical_state: 'SUBMITTED_FOR_REVIEW',
        editing_allowed: false, assigned_reviewer_id: 'reviewer-9',
        current_round_seq: 1, current_round_id: ROUND_1.id, submitted_run_id: RUN_ID,
        blockers: mode === 'challenged'
          ? [{ code: 'CHALLENGE_OPEN', label: 'x', detail: '1 challenge is unresolved.', blocking: true, stage: 'APPROVE' }]
          : [],
        actions: [
          action('SUBMIT_FOR_REVIEW', false, 'STATE_NOT_ELIGIBLE', 'aml_supervision.submit'),
          action('RAISE_CHALLENGE', true, 'OK', 'aml_supervision.review'),
          action('RETURN_FOR_CHANGES', true, 'OK', 'aml_supervision.review'),
          action('REJECT', true, 'OK', 'aml_supervision.approve'),
          action('APPROVE', mode === 'submitted', mode === 'submitted' ? 'OK' : 'BLOCKED', 'aml_supervision.approve', true),
          action('PUBLISH_RISK_OF_RECORD', false, 'NO_APPROVAL_DECISION', 'aml_supervision.approve'),
        ],
      };
    case 'self_approval':
      return {
        ...base, raw_status: 'submitted', canonical_state: 'SUBMITTED_FOR_REVIEW',
        editing_allowed: false, viewer_is_preparer: true, assigned_reviewer_id: 'reviewer-9',
        current_round_seq: 1, current_round_id: ROUND_1.id, submitted_run_id: RUN_ID,
        actions: [
          action('RAISE_CHALLENGE', false, 'MAKER_CHECKER', 'aml_supervision.review'),
          action('APPROVE', false, 'MAKER_CHECKER', 'aml_supervision.approve', true),
          action('PUBLISH_RISK_OF_RECORD', false, 'MAKER_CHECKER', 'aml_supervision.approve'),
        ],
      };
    case 'override_pending':
      return {
        ...base, raw_status: 'submitted', canonical_state: 'SUBMITTED_FOR_REVIEW',
        editing_allowed: false, current_round_seq: 1, current_round_id: ROUND_1.id, submitted_run_id: RUN_ID,
        blockers: [{ code: 'OVERRIDE_UNRESOLVED', label: 'x', detail: 'A proposed rating override is undecided.', blocking: true, stage: 'APPROVE' }],
        actions: [
          action('APPROVE', false, 'BLOCKED', 'aml_supervision.approve', true),
          action('PUBLISH_RISK_OF_RECORD', false, 'NO_APPROVAL_DECISION', 'aml_supervision.approve'),
        ],
      };
    case 'returned':
      return {
        ...base, raw_status: 'returned_for_changes', canonical_state: 'RETURNED_FOR_CHANGES',
        editing_allowed: true, current_round_seq: 1, current_round_id: ROUND_1.id,
        actions: [
          action('SUBMIT_FOR_REVIEW', true, 'OK', 'aml_supervision.submit'),
          action('PUBLISH_RISK_OF_RECORD', false, 'STATE_NOT_ELIGIBLE', 'aml_supervision.approve'),
        ],
      };
    case 'approved_not_published':
      return {
        ...base, raw_status: 'approved', canonical_state: 'APPROVED_NOT_PUBLISHED',
        editing_allowed: false, publication_allowed: true,
        current_round_seq: 2, submitted_run_id: RUN_ID,
        approval_decision_id: DECISION.id, approved_rating: 'MEDIUM_HIGH', approved_rating_source: 'COMPUTED',
        actions: [
          action('APPROVE', false, 'STATE_NOT_ELIGIBLE', 'aml_supervision.approve', true),
          action('PUBLISH_RISK_OF_RECORD', true, 'OK', 'aml_supervision.approve'),
        ],
      };
    case 'published':
      return {
        ...base, raw_status: 'approved', canonical_state: 'APPROVED',
        editing_allowed: false, publication_allowed: false,
        current_round_seq: 2, submitted_run_id: RUN_ID,
        approval_decision_id: DECISION.id, approved_rating: 'MEDIUM_HIGH', approved_rating_source: 'COMPUTED',
        risk_publication_id: PUBLICATION.id, risk_published_at: PUBLICATION.published_at,
        actions: [
          action('PUBLISH_RISK_OF_RECORD', false, 'ALREADY_PUBLISHED', 'aml_supervision.approve'),
        ],
      };
    case 'legacy':
      return {
        ...base, raw_status: 'approved', canonical_state: 'APPROVED',
        editing_allowed: false, current_round_seq: 0,
        approved_rating: 'MEDIUM', approved_rating_source: 'LEGACY_OFFICER_RATING',
        actions: [action('PUBLISH_RISK_OF_RECORD', false, 'ALREADY_PUBLISHED', 'aml_supervision.approve')],
      };
    default:
      return base;
  }
}

function register() {
  const life = lifecycle() as any;
  let rounds: any[] = [];
  if (['submitted', 'override_pending'].includes(mode)) rounds = [ROUND_1];
  if (mode === 'challenged') rounds = [{ ...ROUND_1, challenges: [CHALLENGE] }];
  if (mode === 'returned') {
    rounds = [{
      ...ROUND_1, outcome: 'RETURNED', outcome_by: 'reviewer-9', outcome_at: '2026-03-02T12:00:00Z',
      outcome_reason: 'Refresh the PEP screening evidence for December.',
      challenges: [{ ...CHALLENGE, status: 'RESOLVED', resolved_by: 'officer-1', resolved_at: '2026-03-03T09:00:00Z', resolution_note: 'December population re-screened.' }],
    }];
  }
  if (['approved_not_published', 'published'].includes(mode)) {
    rounds = [
      { ...ROUND_1, outcome: 'RETURNED', outcome_reason: 'Evidence gap.', outcome_by: 'reviewer-9' },
      {
        ...ROUND_1, id: 'rr770000-0000-4000-8000-000000000002', round_seq: 2,
        change_summary: 'December PEP screening evidence added.',
        outcome: 'APPROVED', outcome_by: 'reviewer-9', outcome_at: DECISION.decided_at, challenges: [],
      },
    ];
  }

  const decisions = ['approved_not_published', 'published'].includes(mode) ? [DECISION] : [];
  const publications = mode === 'published' ? [PUBLICATION] : [];

  return {
    lifecycle: life,
    rounds,
    decisions,
    publications,
    risk_history: { current: null, movements: [] },
    lineage: mode === 'legacy'
      ? { ...LINEAGE, complete: false, legacy_state: 'LEGACY_NO_CALCULATION_RUN', calculation_run: null, calculation_policy: null, review_round: null, approval_decision: null }
      : LINEAGE,
  };
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: async (fn: string, args: any) => {
      calls.push({ fn, args });
      if (rpcError) return { data: null, error: { message: rpcError } };
      switch (fn) {
        case 'supervisory_assessment_review_register': return { data: register(), error: null };
        case 'supervisory_assessment_lifecycle_state': return { data: lifecycle(), error: null };
        case 'supervisory_assessment_risk_lineage': return { data: LINEAGE, error: null };
        case 'supervisory_entity_risk_history': return { data: { current: null, movements: [] }, error: null };
        default: return { data: { ok: true }, error: null };
      }
    },
    from: (table: string) => {
      throw new Error(`UI-REV: the review surface must not read ${table} directly`);
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

import { AmlAssessmentReviewPanel } from '@/components/supervision/aml/AmlAssessmentReviewPanel';

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <AmlAssessmentReviewPanel assessmentId={ASSESSMENT} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  const proto = window.HTMLElement.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
  mode = 'draft';
  rpcError = null;
  calls.length = 0;
  toastCalls.length = 0;
  cleanup();
});

describe('AML-07 review, decision and publication surface', () => {
  it('UI-REV-01: renders the server lifecycle state and every permitted action with its permission', async () => {
    renderPanel();
    expect(await screen.findByText('Draft')).toBeInTheDocument();
    expect(screen.getAllByText('aml_supervision.approve').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not available in the current lifecycle state').length).toBeGreaterThan(0);
  });

  it('UI-REV-02: reads the review register from the governed server contract only', async () => {
    renderPanel();
    await screen.findByText('Draft');
    expect(calls.map((c) => c.fn)).toContain('supervisory_assessment_review_register');
  });

  it('UI-REV-03: displays server blocking conditions and disables submission when the server blocks it', async () => {
    mode = 'draft_blocked';
    renderPanel();
    expect(await screen.findByText(/No successful calculation run is bound/)).toBeInTheDocument();
    expect(screen.getByText('CALCULATION_RUN_MISSING')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit for review/i })).toBeDisabled();
  });

  it('UI-REV-04: submits through the governed operation with the bound run and rationale', async () => {
    mode = 'submitted';
    mode = 'draft';
    renderPanel();
    await screen.findByText('Draft');
    await userEvent.type(screen.getByLabelText(/Submission rationale/i), 'Annual assessment complete.');
    await userEvent.click(screen.getByRole('button', { name: /submit for review/i }));
    await waitFor(() => expect(calls.some((c) => c.fn === 'supervisory_assessment_submit_for_review')).toBe(true));
  });

  it('UI-REV-05: shows the server refusal when the screen holds an obsolete readiness result', async () => {
    renderPanel();
    await screen.findByText('Draft');
    rpcError = 'stale_readiness: the assessment changed after this screen loaded';
    await userEvent.type(screen.getByLabelText(/Submission rationale/i), 'Ready for review now.');
    await userEvent.click(screen.getByRole('button', { name: /submit for review/i }));
    await waitFor(() => expect(toastCalls.some(([k, m]) => k === 'error' && /obsolete result/i.test(m))).toBe(true));
  });

  it('UI-REV-06: shows the reviewer assignment and the preparer separately', async () => {
    mode = 'submitted';
    renderPanel();
    expect(await screen.findByText('reviewer-9')).toBeInTheDocument();
    expect(screen.getAllByText('officer-1').length).toBeGreaterThan(0);
  });

  it('UI-REV-07: displays the immutable calculation run bound to the submitted round', async () => {
    mode = 'submitted';
    renderPanel();
    await screen.findByText('Submitted for review');
    expect(screen.getAllByText(/hash-run-4/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/#4/).length).toBeGreaterThan(0);
  });

  it('UI-REV-08: refuses approval to the preparer using the server maker-checker reason', async () => {
    mode = 'self_approval';
    renderPanel();
    await screen.findByText('Submitted for review');
    expect(screen.getByText(/You prepared or submitted this assessment/)).toBeInTheDocument();
    expect(screen.getAllByText(/Independence rule/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /approve assessment/i })).toBeDisabled();
  });

  it('UI-REV-09: raises a structured challenge through the governed operation', async () => {
    mode = 'submitted';
    renderPanel();
    await screen.findByText('Submitted for review');
    await userEvent.type(screen.getByLabelText(/Challenge code/i), 'CH-EVID-001');
    await userEvent.type(screen.getByLabelText(/Referenced question code/i), 'AML-Q-014');
    await userEvent.type(screen.getByLabelText(/Challenge narrative/i), 'PEP evidence is incomplete.');
    await userEvent.click(screen.getByRole('button', { name: /raise challenge/i }));
    await waitFor(() => {
      const c = calls.find((x) => x.fn === 'supervisory_assessment_challenge_raise');
      expect(c?.args._category).toBe('EVIDENCE');
      expect(c?.args._refs).toEqual({ question_code: 'AML-Q-014' });
    });
  });

  it('UI-REV-10: renders an open challenge with its code, category and referenced records', async () => {
    mode = 'challenged';
    renderPanel();
    expect(await screen.findByText('CH-EVID-001')).toBeInTheDocument();
    expect(screen.getAllByText('EVIDENCE').length).toBeGreaterThan(0);
    expect(screen.getByText(/AML-Q-014 · CUSTOMER/)).toBeInTheDocument();
  });

  it('UI-REV-11: blocks approval while a challenge is open and shows the server blocker', async () => {
    mode = 'challenged';
    renderPanel();
    expect(await screen.findByText('CHALLENGE_OPEN')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve assessment/i })).toBeDisabled();
  });

  it('UI-REV-12: resolves a challenge through the governed operation', async () => {
    mode = 'challenged';
    renderPanel();
    await screen.findByText('CH-EVID-001');
    await userEvent.type(screen.getByLabelText(/Resolution note/i), 'December population re-screened.');
    await userEvent.click(screen.getByRole('button', { name: /resolve challenge/i }));
    await waitFor(() => expect(calls.some((c) => c.fn === 'supervisory_assessment_challenge_resolve')).toBe(true));
  });

  it('UI-REV-13: returns the assessment with a written reason', async () => {
    mode = 'submitted';
    renderPanel();
    await screen.findByText('Submitted for review');
    await userEvent.type(screen.getByLabelText(/Written reason for returning/i), 'Evidence gap in December.');
    await userEvent.click(screen.getByRole('button', { name: /return for correction/i }));
    await waitFor(() => expect(calls.some((c) => c.fn === 'supervisory_assessment_review_return')).toBe(true));
  });

  it('UI-REV-14: preserves the returned round, its reason and its resolved challenge', async () => {
    mode = 'returned';
    renderPanel();
    expect(await screen.findByText('Returned for changes')).toBeInTheDocument();
    expect(screen.getAllByText(/Refresh the PEP screening evidence/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('RESOLVED').length).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText(/Submission rationale/i), 'Evidence refreshed as requested.');
    expect(screen.getByRole('button', { name: /resubmit for review/i })).toBeEnabled();
  });

  it('UI-REV-15: shows each review round separately with what changed', async () => {
    mode = 'approved_not_published';
    renderPanel();
    await screen.findByText('Approved — not yet official risk-of-record');
    expect(screen.getAllByText('#1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('#2').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/December PEP screening evidence added/).length).toBeGreaterThan(0);
  });

  it('UI-REV-16: closes an assessment without approval through the governed operation', async () => {
    mode = 'submitted';
    renderPanel();
    await screen.findByText('Submitted for review');
    await userEvent.type(screen.getByLabelText(/Written reason for returning/i), 'Entity ceased regulated activity.');
    await userEvent.click(screen.getByRole('button', { name: /close without approval/i }));
    await waitFor(() => expect(calls.some((c) => c.fn === 'supervisory_assessment_review_reject')).toBe(true));
  });

  it('UI-REV-17: blocks approval while a rating override is undecided', async () => {
    mode = 'override_pending';
    renderPanel();
    expect(await screen.findByText('OVERRIDE_UNRESOLVED')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve assessment/i })).toBeDisabled();
  });

  it('UI-REV-18: approves through the governed operation with the decision rationale', async () => {
    mode = 'submitted';
    renderPanel();
    await screen.findByText('Submitted for review');
    await userEvent.type(screen.getByLabelText(/Decision rationale/i), 'Calculated rating adopted.');
    await userEvent.click(screen.getByRole('button', { name: /approve assessment/i }));
    await waitFor(() => {
      const c = calls.find((x) => x.fn === 'supervisory_assessment_approve');
      expect(c?.args._rationale).toMatch(/Calculated rating adopted/);
    });
  });

  it('UI-REV-19: separates the calculated result, the approved result and the published risk-of-record', async () => {
    mode = 'approved_not_published';
    renderPanel();
    await screen.findByText('CALCULATED RESULT (bound run)');
    expect(screen.getByText('APPROVED ASSESSMENT RESULT')).toBeInTheDocument();
    expect(screen.getByText('PUBLISHED RISK-OF-RECORD')).toBeInTheDocument();
    expect(screen.getByText('Not published')).toBeInTheDocument();
    expect(screen.getByText('Calculated result')).toBeInTheDocument();
  });

  it('UI-REV-20: publishes the risk-of-record only when the server permits it', async () => {
    mode = 'approved_not_published';
    renderPanel();
    await screen.findByText('Approved — not yet official risk-of-record');
    await userEvent.type(screen.getByLabelText(/Publication reason/i), 'Approved annual assessment.');
    await userEvent.click(screen.getByRole('button', { name: /publish risk-of-record/i }));
    await waitFor(() => expect(calls.some((c) => c.fn === 'supervisory_assessment_publish_risk_of_record')).toBe(true));
  });

  it('UI-REV-21: prevents a duplicate publication using the server reason', async () => {
    mode = 'published';
    renderPanel();
    await screen.findByText('Approved and published');
    expect(screen.getByRole('button', { name: /publish risk-of-record/i })).toBeDisabled();
    expect(screen.getAllByText(/Already published/).length).toBeGreaterThan(0);
  });

  it('UI-REV-22: shows the supersession of the previous rating on the publication record', async () => {
    mode = 'published';
    renderPanel();
    await screen.findByText('Approved and published');
    expect(screen.getByText('Previous (superseded) rating')).toBeInTheDocument();
    expect(screen.getAllByText('MEDIUM').length).toBeGreaterThan(0);
  });

  it('UI-REV-23: refuses publication from a draft or returned state', async () => {
    mode = 'returned';
    renderPanel();
    await screen.findByText('Returned for changes');
    expect(screen.getByRole('button', { name: /publish risk-of-record/i })).toBeDisabled();
    expect(screen.getByText(/Risk-of-record not published/)).toBeInTheDocument();
  });

  it('UI-REV-24: renders the full lineage chain from the risk-of-record to the evidence', async () => {
    mode = 'published';
    renderPanel();
    await screen.findByText('End-to-end lineage');
    for (const label of ['Approval decision', 'Review round', 'Calculation run', 'Calculation policy',
      'Methodology', 'Programme', 'Question plan rows', 'Responses', 'Facts', 'Evidence you may see']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('UI-REV-25: is honest about a legacy assessment with no governed calculation lineage', async () => {
    mode = 'legacy';
    renderPanel();
    expect(await screen.findByText('LEGACY_NO_CALCULATION_RUN')).toBeInTheDocument();
    expect(screen.getByText(/No calculation run, policy version or review round has been invented/)).toBeInTheDocument();
  });
});
