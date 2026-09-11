/**
 * PCOMP-R2A-C — assessment Evidence Policy panel and rule authoring.
 *
 * These gates prove the browser only displays and requests. Every decision,
 * reason, count and capability comes from the server; an approved exception is
 * never presented as satisfied evidence; and no evidence rule is evaluated,
 * scored or satisfied in React.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const baseDecision = {
  rule_code: 'EV-CDD-01',
  rule_label: 'Customer due diligence evidence',
  scope_type: 'QUESTION',
  scope_reference: 'Q-CDD-1',
  target_code: 'Q-CDD-1',
  question_id: 'q-1',
  question_code: 'Q-CDD-1',
  dimension_id: null,
  dimension_code: null,
  decision: 'UNSATISFIED',
  blocking: true,
  required_items: 2,
  qualifying_items: 1,
  stale_items: 1,
  distinct_sources: 1,
  permitted_source_kinds: ['ENTERPRISE_DOCUMENT', 'REGULATORY_RETURN'],
  required_source_kinds: ['ENTERPRISE_DOCUMENT'],
  maximum_age_days: 365,
  independent_sources_required: 2,
  rationale_required: true,
  evidence_requirement: 'MANDATORY',
  exception_allowed: true,
  exception_id: null,
  exception_status: null,
  reasons: [{ code: 'MINIMUM_EVIDENCE_NOT_MET', message: '2 items are required and 1 qualifies.' }],
};

const evaluated = (decisions: any[], extra: Record<string, unknown> = {}) => ({
  assessment_id: 'a-1',
  status: 'EVALUATED',
  reason_code: 'EVALUATED',
  reason: 'Evidence sufficiency decided by the platform from the evidence policy pinned to this assessment.',
  policy_profile_code: 'AML-CFT-POLICY',
  policy_profile_version: '2.0',
  policy_component_id: 'cp-1',
  policy_component_code: 'AML-EVIDENCE',
  policy_component_version: '1.3',
  policy_content_hash: 'hash-ev',
  reference_date: '2026-09-01',
  rule_count: decisions.length,
  decision_count: decisions.length,
  satisfied_count: decisions.filter((d) => d.decision === 'SATISFIED').length,
  exception_approved_count: decisions.filter((d) => d.decision === 'EXCEPTION_APPROVED').length,
  blocking_count: decisions.filter((d) => d.blocking).length,
  decisions,
  evaluated_at: '2026-09-02T09:00:00Z',
  ...extra,
});

let view: any;
let fail: string | null = null;
const calls: Array<{ fn: string; args: any }> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: any) => {
      calls.push({ fn, args });
      if (fail) return Promise.resolve({ data: null, error: { message: fail } });
      if (fn === 'supervisory_assessment_evidence_exception_request') {
        return Promise.resolve({ data: { exception_id: 'x-9', status: 'REQUESTED' }, error: null });
      }
      if (fn === 'supervisory_assessment_evidence_exception_decide') {
        return Promise.resolve({ data: { exception_id: 'x-1', status: 'APPROVED' }, error: null });
      }
      if (fn === 'supervisory_evidence_policy_authoring_options') {
        return Promise.resolve({ data: OPTIONS, error: null });
      }
      return Promise.resolve({ data: view, error: null });
    },
    from: () => {
      throw new Error('PCOMP-R2A-C: evidence policy screens must not read policy tables directly');
    },
  },
}));

const OPTIONS = {
  component_id: 'cp-1',
  component_code: 'AML-EVIDENCE',
  component_version: '1.3',
  scope_types: ['ASSESSMENT', 'DIMENSION', 'QUESTION'],
  evidence_requirements: ['MANDATORY', 'OPTIONAL', 'NOT_REQUIRED'],
  evidence_kinds: [
    { code: 'ENTERPRISE_DOCUMENT', label: 'Enterprise document', requires_source_object: true },
    { code: 'REGULATORY_RETURN', label: 'Regulatory return', requires_source_object: true },
  ],
  methodology_id: 'm-1',
  methodology_code: 'AML-CFT-RBA',
  methodology_version: '1.0',
  methodology_source: 'PROFILE_BINDING',
  dimensions: [{ code: 'INH-1', label: 'Customer risk' }],
  questions: [{ code: 'Q-CDD-1', label: 'CDD coverage', dimension_code: 'INH-1', dimension_label: 'Customer risk', requires_evidence: true }],
  warnings: [],
};

import { AmlEvidencePolicyPanel } from '@/components/supervision/aml/AmlEvidencePolicyPanel';
import { EvidencePolicyRuleEditor } from '@/components/admin/supervisory-policy-profile/EvidencePolicyRuleEditor';

function wrap(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const panel = () => wrap(<AmlEvidencePolicyPanel assessmentId="a-1" />);

beforeEach(() => {
  fail = null;
  calls.length = 0;
  view = {
    assessment_id: 'a-1',
    evaluation: evaluated([baseDecision]),
    exceptions: [],
    capabilities: { can_request_exception: true, can_decide_exception: false },
    viewer_id: 'u-1',
  };
});
afterEach(() => cleanup());

const PANEL_SOURCE = readFileSync('src/components/supervision/aml/AmlEvidencePolicyPanel.tsx', 'utf8');
const HOOK_SOURCE = readFileSync('src/hooks/useAssessmentEvidencePolicy.ts', 'utf8');
const LIB_SOURCE = readFileSync('src/lib/evidencePolicyPresentation.ts', 'utf8');
const EDITOR_SOURCE = readFileSync('src/components/admin/supervisory-policy-profile/EvidencePolicyRuleEditor.tsx', 'utf8');

describe('PCOMP-R2A-C1 the governing evidence policy version is visible', () => {
  it('shows the pinned policy code, version and policy basis', async () => {
    panel();
    expect(await screen.findByTestId('evidence-policy-code')).toHaveTextContent('AML-EVIDENCE');
    expect(screen.getByTestId('evidence-policy-code')).toHaveTextContent('v1.3');
    expect(screen.getByTestId('evidence-policy-basis')).toHaveTextContent('AML-CFT-POLICY v2.0');
  });
});

describe('PCOMP-R2A-C2 each applicable rule shows its requirement and current position', () => {
  it('renders scope, minimum, kinds, freshness, independence and rationale', async () => {
    panel();
    await screen.findByTestId('evidence-policy-rule-EV-CDD-01-Q-CDD-1');
    const card = screen.getByTestId('evidence-policy-rule-EV-CDD-01-Q-CDD-1');
    expect(card).toHaveTextContent('Question Q-CDD-1');
    expect(card).toHaveTextContent('Enterprise Document, Regulatory Return');
    expect(card).toHaveTextContent('No older than 365 days');
    expect(card).toHaveTextContent('2 required');
    expect(card).toHaveTextContent('Required');
    expect(screen.getByTestId('evidence-policy-qualifying-EV-CDD-01')).toHaveTextContent('1 qualifying item');
  });
});

describe('PCOMP-R2A-C3 outstanding requirements are stated in the platform’s own words', () => {
  it('renders the server reason verbatim and no client-computed shortfall', async () => {
    panel();
    expect(await screen.findByTestId('evidence-policy-outstanding-EV-CDD-01'))
      .toHaveTextContent('2 items are required and 1 qualifies.');
    expect(PANEL_SOURCE).not.toMatch(/required_items\s*[-<>]\s*qualifying_items/);
  });
});

describe('PCOMP-R2A-C4 status headline reflects only server decisions', () => {
  it('shows UNSATISFIED while the server reports a blocking decision', async () => {
    panel();
    expect(await screen.findByTestId('evidence-policy-status')).toHaveTextContent('UNSATISFIED');
    expect(screen.getByTestId('evidence-policy-outstanding-count')).toHaveTextContent('1');
  });

  it('shows SATISFIED only when the server reports no blocking decision', async () => {
    view.evaluation = evaluated([{ ...baseDecision, decision: 'SATISFIED', blocking: false, reasons: [] }]);
    panel();
    expect(await screen.findByTestId('evidence-policy-status')).toHaveTextContent('SATISFIED');
  });
});

describe('PCOMP-R2A-C5 an assessment with no evidence policy says so plainly', () => {
  it('shows the not-governed state and invents no requirement', async () => {
    view.evaluation = {
      assessment_id: 'a-2', status: 'NOT_GOVERNED', reason_code: 'NO_POLICY_BASIS',
      reason: 'This assessment has no policy basis, so no evidence policy governs it.',
      blocking_count: 0, decisions: [], evaluated_at: '2026-09-02T09:00:00Z',
    };
    panel();
    expect(await screen.findByTestId('evidence-policy-status')).toHaveTextContent('NOT GOVERNED');
    expect(screen.getByTestId('evidence-policy-not-governed')).toHaveTextContent('no policy basis');
    expect(screen.queryByTestId('evidence-policy-rule-EV-CDD-01-Q-CDD-1')).toBeNull();
  });
});

describe('PCOMP-R2A-C6 exception requests are only offered where the platform allows one', () => {
  it('offers the request only for an EXCEPTION_REQUIRED deficiency and to a permitted user', async () => {
    panel();
    await screen.findByTestId('evidence-policy-status');
    expect(screen.queryByTestId('evidence-policy-request-EV-CDD-01')).toBeNull();

    cleanup();
    view.evaluation = evaluated([{ ...baseDecision, decision: 'EXCEPTION_REQUIRED' }]);
    panel();
    expect(await screen.findByTestId('evidence-policy-request-EV-CDD-01')).toBeInTheDocument();

    cleanup();
    view.capabilities = { can_request_exception: false, can_decide_exception: false };
    panel();
    await screen.findByTestId('evidence-policy-status');
    expect(screen.queryByTestId('evidence-policy-request-EV-CDD-01')).toBeNull();
  });
});

describe('PCOMP-R2A-C7 a request carries the deficiency, the policy version and a justification', () => {
  it('requires a rationale and sends only the governed request payload', async () => {
    view.evaluation = evaluated([{ ...baseDecision, decision: 'EXCEPTION_REQUIRED' }]);
    panel();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('evidence-policy-request-EV-CDD-01'));
    const dialog = await screen.findByTestId('evidence-exception-request-dialog');
    expect(dialog).toHaveTextContent('2 items are required and 1 qualifies.');
    expect(dialog).toHaveTextContent('v1.3');

    const submit = screen.getByTestId('evidence-exception-request-submit');
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Written justification'),
      'The originating bank cannot reissue the record for this period.');
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => {
      const call = calls.find((c) => c.fn === 'supervisory_assessment_evidence_exception_request');
      expect(call).toBeTruthy();
      expect(call!.args._payload.rule_code).toBe('EV-CDD-01');
      expect(call!.args._payload.question_id).toBe('q-1');
      expect(call!.args._payload.rationale.length).toBeGreaterThanOrEqual(20);
    });
  });
});

describe('PCOMP-R2A-C8 a pending exception does not clear the deficiency', () => {
  it('shows EXCEPTION PENDING and hides the request action', async () => {
    view.evaluation = evaluated([
      { ...baseDecision, decision: 'EXCEPTION_REQUIRED', exception_id: 'x-1', exception_status: 'REQUESTED' },
    ]);
    view.exceptions = [{
      id: 'x-1', rule_code: 'EV-CDD-01', scope_type: 'QUESTION', scope_reference: 'Q-CDD-1',
      question_id: 'q-1', question_code: 'Q-CDD-1', dimension_id: null, dimension_code: null,
      status: 'REQUESTED', rationale: 'Record cannot be reissued for this period.',
      deficiency: { reasons: [{ code: 'MINIMUM_EVIDENCE_NOT_MET', message: '2 items are required and 1 qualifies.' }] },
      policy_component_version: '1.3', requested_by: 'u-2', requested_by_name: 'A Officer',
      requested_at: '2026-09-02T08:00:00Z', decided_by: null, decided_by_name: null,
      decided_at: null, decision_rationale: null, is_own_request: false,
    }];
    panel();
    expect(await screen.findByTestId('evidence-policy-status')).toHaveTextContent('EXCEPTION PENDING');
    expect(screen.getByTestId('evidence-policy-exception-pending-EV-CDD-01')).toHaveTextContent('A Officer');
    expect(screen.queryByTestId('evidence-policy-request-EV-CDD-01')).toBeNull();
    expect(screen.getByTestId('evidence-policy-outstanding-EV-CDD-01')).toBeInTheDocument();
  });
});

describe('PCOMP-R2A-C9 only an independent officer sees the decision controls', () => {
  it('offers approve/reject to a checker and never to the requester', async () => {
    const exception = {
      id: 'x-1', rule_code: 'EV-CDD-01', scope_type: 'QUESTION', scope_reference: 'Q-CDD-1',
      question_id: 'q-1', question_code: 'Q-CDD-1', dimension_id: null, dimension_code: null,
      status: 'REQUESTED', rationale: 'Record cannot be reissued for this period.',
      deficiency: { reasons: [{ message: '2 items are required and 1 qualifies.' }] },
      policy_component_version: '1.3', requested_by: 'u-2', requested_by_name: 'A Officer',
      requested_at: '2026-09-02T08:00:00Z', decided_by: null, decided_by_name: null,
      decided_at: null, decision_rationale: null, is_own_request: true,
    };
    view.evaluation = evaluated([
      { ...baseDecision, decision: 'EXCEPTION_REQUIRED', exception_id: 'x-1', exception_status: 'REQUESTED' },
    ]);
    view.exceptions = [exception];
    view.capabilities = { can_request_exception: true, can_decide_exception: true };
    panel();
    await screen.findByTestId('evidence-policy-status');
    expect(screen.queryByTestId('evidence-policy-approve-EV-CDD-01')).toBeNull();

    cleanup();
    view.exceptions = [{ ...exception, is_own_request: false }];
    panel();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('evidence-policy-approve-EV-CDD-01'));
    const dialog = await screen.findByTestId('evidence-exception-decision-dialog');
    expect(dialog).toHaveTextContent('Approving does not record evidence');
    const submit = screen.getByTestId('evidence-exception-decision-submit');
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Decision rationale'),
      'Alternative supervisory testing accepted for this period.');
    await user.click(submit);
    await waitFor(() => {
      const call = calls.find((c) => c.fn === 'supervisory_assessment_evidence_exception_decide');
      expect(call!.args).toMatchObject({ _exception_id: 'x-1', _decision: 'APPROVED' });
    });
  });
});

describe('PCOMP-R2A-C10 an approved exception is never shown as satisfied evidence', () => {
  it('keeps the deficiency visible beside the approval', async () => {
    view.evaluation = evaluated([
      { ...baseDecision, decision: 'EXCEPTION_APPROVED', blocking: false, exception_id: 'x-1', exception_status: 'APPROVED' },
    ]);
    panel();
    expect(await screen.findByTestId('evidence-policy-status')).toHaveTextContent('EXCEPTION APPROVED');
    expect(screen.getByTestId('evidence-policy-exception-approved-EV-CDD-01'))
      .toHaveTextContent('Evidence requirement not satisfied');
    expect(screen.getByTestId('evidence-policy-decision-EV-CDD-01')).not.toHaveTextContent('SATISFIED EVIDENCE');
    expect(screen.getByTestId('evidence-policy-outstanding-EV-CDD-01')).toBeInTheDocument();
  });
});

describe('PCOMP-R2A-C11 the browser never evaluates or satisfies evidence', () => {
  it('reads one governed read model and holds no sufficiency logic', async () => {
    panel();
    await screen.findByTestId('evidence-policy-status');
    expect(new Set(calls.map((c) => c.fn))).toEqual(new Set(['supervisory_assessment_evidence_policy_view']));
    [PANEL_SOURCE, HOOK_SOURCE, LIB_SOURCE, EDITOR_SOURCE].forEach((src) => {
      expect(src).not.toMatch(/\.from\(/);
      expect(src).not.toMatch(/evidence_policy_internal/);
    });
    expect(PANEL_SOURCE).not.toMatch(/qualifying_items\s*>=\s*required_items/);
    expect(LIB_SOURCE).not.toMatch(/qualifying_items\s*>=/);
  });
});

describe('PCOMP-R2A-C12 a refused or failed read discloses nothing', () => {
  it('shows the safe unavailable state without any requirement', async () => {
    fail = 'not_authorized: assessment outside supervisory scope';
    panel();
    expect(await screen.findByTestId('evidence-policy-status')).toHaveTextContent('EVIDENCE POLICY UNAVAILABLE');
    expect(screen.getByTestId('evidence-policy-error')).toHaveTextContent('rather than an assumed position');
    expect(screen.queryByTestId('evidence-policy-code')).toBeNull();
  });
});

describe('PCOMP-R2A-C13 rules are composed from the platform’s own vocabulary', () => {
  it('offers server scopes, requirements, kinds and methodology references only', async () => {
    wrap(
      <EvidencePolicyRuleEditor
        componentId="cp-1"
        editable
        items={[{ rule_code: 'EV-CDD-01', scope_type: 'QUESTION', evidence_requirement: 'MANDATORY', minimum_items: 2 }]}
        onChange={() => {}}
      />,
    );
    await screen.findByTestId('evidence-policy-rule-editor');
    expect(screen.getByTestId('evidence-policy-methodology')).toHaveTextContent('AML-CFT-RBA');
    expect(screen.getByLabelText('Applies to 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Question 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Enterprise document', { selector: 'button' })).toBeInTheDocument();
    // Free-typed evidence kinds are impossible: the kinds are checkboxes.
    expect(EDITOR_SOURCE).not.toMatch(/comma separated/);
  });
});

describe('PCOMP-R2A-C14 the recorded rule is restated in plain language', () => {
  it('previews scope, minimum, kinds, freshness and exception availability', async () => {
    wrap(
      <EvidencePolicyRuleEditor
        componentId="cp-1"
        editable
        items={[{
          rule_code: 'EV-CDD-01', scope_type: 'QUESTION', scope_reference: 'Q-CDD-1',
          evidence_requirement: 'MANDATORY', minimum_items: 2, maximum_age_days: 365,
          permitted_source_kinds: ['ENTERPRISE_DOCUMENT'], required_source_kinds: ['REGULATORY_RETURN'],
          independent_sources_required: 2, rationale_required: true, exception_allowed: true,
        }]}
        onChange={() => {}}
      />,
    );
    const preview = await screen.findByTestId('evidence-policy-preview-0');
    expect(preview).toHaveTextContent('When answering question Q-CDD-1');
    expect(preview).toHaveTextContent('at least 2 items of evidence are required');
    expect(preview).toHaveTextContent('Regulatory Return');
    expect(preview).toHaveTextContent('no older than 365 days');
    expect(preview).toHaveTextContent('2 independent sources');
    expect(preview).toHaveTextContent('subject to independent approval');
  });

  it('states plainly when a rule requires no evidence', async () => {
    wrap(
      <EvidencePolicyRuleEditor componentId="cp-1" editable onChange={() => {}}
        items={[{ rule_code: 'EV-NA', scope_type: 'DIMENSION', evidence_requirement: 'NOT_REQUIRED' }]} />,
    );
    expect(await screen.findByTestId('evidence-policy-preview-0'))
      .toHaveTextContent('no evidence is required by this policy');
  });
});

describe('PCOMP-R2A-C15 an approved evidence policy cannot be edited in place', () => {
  it('disables every control when the server withholds edit authority', async () => {
    wrap(
      <EvidencePolicyRuleEditor componentId="cp-1" editable={false} onChange={() => {}}
        items={[{ rule_code: 'EV-CDD-01', scope_type: 'QUESTION', evidence_requirement: 'MANDATORY' }]} />,
    );
    await screen.findByTestId('evidence-policy-rule-editor');
    expect(screen.getByLabelText('Applies to 1')).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Rule code *' }) as HTMLInputElement).toBeDisabled();
    expect(screen.queryByLabelText('Remove rule 1')).toBeNull();
  });
});
