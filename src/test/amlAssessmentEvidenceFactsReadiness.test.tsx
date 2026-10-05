/**
 * UI-EFR-01…20 — AML-05 governed evidence basis, structured facts and
 * server-authoritative readiness, frontend closure.
 *
 * Every payload used here was captured from the live database under the
 * authenticated supervisory officer persona inside a rolled-back transaction
 * (see the `_provenance` note in the fixture). The gates assert that the
 * working file renders the platform's own evidence, fact and readiness result —
 * and never decides sufficiency, requirements, visibility or submission
 * eligibility for itself.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const FIX = JSON.parse(readFileSync('src/test/fixtures/evidenceFactReadiness.json', 'utf8'));

const ASSESSMENT: string = FIX.assessment_id;
const Q1: string = FIX.question_id;
const Q2: string = FIX.evidence_register[0].questions[1].question_id;
const UNLINKED_QUESTION = '11111111-2222-4333-8444-555555555555';

beforeEach(() => {
  const proto = window.HTMLElement.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

/* ------------------------------------------------------------ rpc harness */

type Mode = 'ready' | 'blocked' | 'loading' | 'error';

const calls: Array<{ fn: string; args: any }> = [];
let mode: Mode = 'ready';
let linkError: string | null = null;
let register: any[] = [];
let facts: any[] = [];

const never = () => new Promise<never>(() => {});

function respond(fn: string, args: any): any {
  switch (fn) {
    case 'supervisory_assessment_readiness':
      if (mode === 'loading') return never();
      if (mode === 'error') return { __error: 'readiness_unavailable: the platform could not evaluate readiness' };
      return mode === 'blocked' ? FIX.readiness_blocked : FIX.readiness_ready;
    case 'supervisory_assessment_evidence_register':
      return register;
    case 'supervisory_assessment_fact_register':
      return facts;
    case 'supervisory_assessment_question_execution':
      return FIX.question_execution;
    case 'supervisory_assessment_evidence_link':
      if (linkError) return { __error: linkError };
      return { evidence_id: FIX.evidence_register[0].id };
    case 'supervisory_assessment_evidence_unlink':
      return { links_remaining: 1 };
    case 'supervisory_assessment_fact_set':
      return { fact_id: 'fac10000-0000-4000-8000-0000000000f1' };
    case 'supervisory_assessment_fact_override':
      return { fact_id: FIX.fact_register[1].fact_id };
    case 'supervisory_assessment_configuration_authority':
      return { fact_config: { status: 'NOT_CONFIGURED' }, source_binding: { status: 'NOT_CONFIGURED' }, facts: [] };
    default:
      throw new Error(`UI-EFR: unexpected operation ${fn}`);
  }
}

/** Only the governed, read-only evidence-kind catalogue may be read as a table. */
function fromTable(table: string) {
  if (table !== 'supervisory_evidence_basis_type') {
    throw new Error(`UI-EFR: the evidence basis must never read ${table} directly`);
  }
  const builder: any = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      calls.push({ fn: 'from:supervisory_evidence_basis_type', args: { col, val } });
      return builder;
    },
    order: () => Promise.resolve({ data: FIX.evidence_types, error: null }),
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: async (fn: string, args: any) => {
      calls.push({ fn, args });
      const out: any = await respond(fn, args);
      if (out && typeof out === 'object' && '__error' in out) {
        return { data: null, error: { message: out.__error } };
      }
      return { data: out, error: null };
    },
    from: (table: string) => fromTable(table),
  },
}));

const toastCalls: Array<[string, string]> = [];
vi.mock('sonner', () => ({
  toast: {
    success: (m: string) => toastCalls.push(['success', String(m)]),
    error: (m: string) => toastCalls.push(['error', String(m)]),
  },
}));

vi.mock('@/hooks/useCan', () => ({ useCan: () => true }));

vi.mock('@/hooks/useDmsDocuments', () => ({
  useDmsRegister: () => ({ isLoading: false, data: { rows: FIX.documents, total: FIX.documents.length } }),
}));

vi.mock('@/hooks/useAmlLifecycle', () => {
  const noop = () => ({ mutateAsync: async () => ({}), isPending: false });
  return {
    useTransitionAmlAssessment: noop,
    useOpenAmlAttention: noop,
    useConfirmAmlAttentionPriority: noop,
    useOpenAmlPlan: noop,
    useAmlPlanLifecycle: noop,
    useRequireAmlReassessment: noop,
  };
});

import { AmlReadinessPanel } from '@/components/supervision/aml/AmlReadinessPanel';
import { AmlQuestionEvidencePanel } from '@/components/supervision/aml/AmlQuestionEvidencePanel';
import { AmlFactRegisterPanel } from '@/components/supervision/aml/AmlFactRegisterPanel';
import { AmlAssessmentActions } from '@/components/supervision/aml/AmlAssessmentActions';

const countOf = (fn: string) => calls.filter((c) => c.fn === fn).length;
const argsOf = (fn: string) => calls.filter((c) => c.fn === fn).map((c) => c.args);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const DISPLAY_READINESS = {
  totalDimensions: 26,
  assessedDimensions: 4,
  mandatoryTotal: 26,
  mandatoryAssessed: 4,
  inherentOutstanding: [],
  controlOutstanding: [],
  rationaleOutstanding: [],
  evidenceOutstanding: [],
  dataQualityOutstanding: [],
  overrideRationaleOutstanding: [],
  questionsTotal: 70,
  questionsAnswered: 70,
  questionGaps: [],
  checks: [],
  ready: true,
} as any;

const mountActions = () =>
  wrap(
    <AmlAssessmentActions
      assessmentId={ASSESSMENT}
      entityId="aa220000-0000-4000-8000-000000000001"
      entityName="Alpha Trust Ltd"
      status="draft"
      dimensions={[]}
      attention={[]}
      plans={[]}
      readiness={DISPLAY_READINESS}
      onChanged={() => {}}
    />,
  );

const mountEvidence = (questionId = Q1, extra: Record<string, unknown> = {}) =>
  wrap(
    <AmlQuestionEvidencePanel
      assessmentId={ASSESSMENT}
      entityId="aa220000-0000-4000-8000-000000000001"
      questionId={questionId}
      questionCode={questionId === Q1 ? 'Q1' : 'Q2'}
      permittedTypes={FIX.question_execution[0].permitted_evidence_types}
      requiredCount={1}
      editable
      {...extra}
    />,
  );

beforeEach(() => {
  calls.length = 0;
  toastCalls.length = 0;
  mode = 'ready';
  linkError = null;
  register = JSON.parse(JSON.stringify(FIX.evidence_register));
  facts = JSON.parse(JSON.stringify(FIX.fact_register));
});
afterEach(() => {
  cleanup();
  // Radix marks the body inert while a dialog is open; a torn-down dialog must
  // not leave the next gate unable to interact.
  document.body.style.pointerEvents = '';
});

/* ==================================================================== gates */

describe('UI-EFR-01 the readiness panel renders the server readiness result', () => {
  it('shows the server checks, details and plan mode without recomputing them', async () => {
    wrap(<AmlReadinessPanel assessmentId={ASSESSMENT} />);
    await screen.findByText('Ready to submit');
    expect(argsOf('supervisory_assessment_readiness')[0]).toEqual({ _assessment_id: ASSESSMENT });
    for (const c of FIX.readiness_ready.checks) {
      expect(screen.getByText(c.label)).toBeInTheDocument();
      expect(screen.getByText(c.detail)).toBeInTheDocument();
    }
    expect(screen.getByText('All mandatory questions')).toBeInTheDocument();
  });
});

describe('UI-EFR-02 server blocker codes and reasons are displayed', () => {
  it('renders each outstanding item exactly as the platform reported it', async () => {
    mode = 'blocked';
    wrap(<AmlReadinessPanel assessmentId={ASSESSMENT} />);
    expect((await screen.findAllByText('2 outstanding')).length).toBeGreaterThan(0);
    // Both the plan-mode badge and the plan check use the server's own wording.
    expect(screen.getAllByText('Governed question plan').length).toBe(2);
    expect(screen.getByText(/ALERT_INVESTIGATION Q1 — EVIDENCE BELOW MINIMUM/)).toBeInTheDocument();
    expect(screen.getByText(/ALERT_INVESTIGATION Q2 — EVIDENCE MISSING/)).toBeInTheDocument();
    expect(screen.getByText(/SAR_GOVERNANCE SAR_FILED_COUNT — FACT NOT RECORDED/)).toBeInTheDocument();
    expect(screen.getByText('Required structured facts')).toBeInTheDocument();
  });
});

describe('UI-EFR-03 submit follows the server can_submit result', () => {
  it('is enabled when the server allows submission and disabled when it does not', async () => {
    mountActions();
    const enabled = await screen.findByRole('button', { name: /Submit for supervisory review/ });
    await waitFor(() => expect(enabled).not.toBeDisabled());
    cleanup();

    calls.length = 0;
    mode = 'blocked';
    mountActions();
    const blocked = await screen.findByRole('button', { name: /Submit for supervisory review/ });
    await waitFor(() => expect(blocked).toBeDisabled());
    expect(countOf('supervisory_assessment_readiness')).toBeGreaterThan(0);
  });
});

describe('UI-EFR-04 React does not independently calculate readiness', () => {
  it('reports the server decision even when it disagrees with the rendered items', async () => {
    // The server reports two blocking checks but still allows submission; the
    // screen must state the server position, not a browser recalculation.
    const contradictory = {
      ...FIX.readiness_blocked,
      can_submit: true,
      submission_gate: 'READY',
      blocking_check_count: 2,
    };
    mode = 'blocked';
    (FIX as any).readiness_blocked = contradictory;
    wrap(<AmlReadinessPanel assessmentId={ASSESSMENT} />);
    await screen.findByText('Ready to submit');
    expect(screen.getByText(/EVIDENCE BELOW MINIMUM/)).toBeInTheDocument();
    (FIX as any).readiness_blocked = JSON.parse(
      readFileSync('src/test/fixtures/evidenceFactReadiness.json', 'utf8'),
    ).readiness_blocked;
  });
});

describe('UI-EFR-05 the evidence-kind catalogue comes from server data', () => {
  it('offers only the active kinds returned by the governed catalogue', async () => {
    const user = userEvent.setup({ delay: null });
    mountEvidence();
    await user.click(await screen.findByRole('button', { name: /Link evidence/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    // The methodology permits two kinds for this question; both come from the server.
    expect(within(listbox).getByText('Registered document')).toBeInTheDocument();
    expect(within(listbox).getByText('Officer sample review')).toBeInTheDocument();
    expect(within(listbox).queryByText('Regulatory return')).not.toBeInTheDocument();
    expect(calls.some((c) => c.fn === 'from:supervisory_evidence_basis_type')).toBe(true);
  });
});

describe('UI-EFR-06 only server-returned visible sources are offered', () => {
  it('lists exactly the records the platform returned for this officer', async () => {
    const user = userEvent.setup({ delay: null });
    mountEvidence();
    await user.click(await screen.findByRole('button', { name: /Link evidence/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox'));
    await user.click(within(await screen.findByRole('listbox')).getByText('Registered document'));
    await within(dialog).findByText('AML/CFT policy manual 2026');
    expect(within(dialog).getAllByRole('button', { name: 'Link' })).toHaveLength(FIX.documents.length);
  });
});

describe('UI-EFR-07 an authorised source can be linked to an included question', () => {
  it('invokes the governed link operation with the question and the source record', async () => {
    const user = userEvent.setup({ delay: null });
    mountEvidence();
    await user.click(await screen.findByRole('button', { name: /Link evidence/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox'));
    await user.click(within(await screen.findByRole('listbox')).getByText('Registered document'));
    await user.click(await within(dialog).findByRole('button', { name: 'Link' }));

    await waitFor(() => expect(countOf('supervisory_assessment_evidence_link')).toBe(1));
    const args = argsOf('supervisory_assessment_evidence_link')[0];
    expect(args._assessment_id).toBe(ASSESSMENT);
    expect(args._payload.evidence_type).toBe('ENTERPRISE_DOCUMENT');
    expect(args._payload.methodology_question_id).toBe(Q1);
    expect(args._payload.source_object_id).toBe(FIX.documents[0].id);
  });
});

describe('UI-EFR-08 one evidence record supports multiple questions', () => {
  it('shows the same governed record on each question the platform linked it to', async () => {
    mountEvidence(Q1);
    expect(await screen.findByText('AML/CFT policy manual 2026')).toBeInTheDocument();
    cleanup();
    mountEvidence(Q2);
    expect(await screen.findByText('AML/CFT policy manual 2026')).toBeInTheDocument();
    expect(FIX.evidence_register[0].questions).toHaveLength(2);
  });
});

describe('UI-EFR-09 question and dimension evidence links stay distinguishable', () => {
  it('does not present a dimension link as a question link', async () => {
    mountEvidence(UNLINKED_QUESTION);
    await waitFor(() => expect(countOf('supervisory_assessment_evidence_register')).toBeGreaterThan(0));
    expect(await screen.findByText(/No governed evidence linked/)).toBeInTheDocument();
    // The same record still carries its dimension link in the server payload.
    expect(FIX.evidence_register[0].dimensions[0].dimension_code).toBe('ALERT_INVESTIGATION');
  });
});

describe('UI-EFR-10 a refusal is shown without leaking restricted information', () => {
  it('shows the platform refusal, and a restricted source is never described', async () => {
    const user = userEvent.setup({ delay: null });
    linkError = 'evidence_cross_assessment: this evidence belongs to another assessment';
    mountEvidence();
    expect(
      await screen.findByText('Restricted source — you are not authorised to see this record'),
    ).toBeInTheDocument();
    expect(screen.queryByText('cccc0000-0000-4000-8000-0000000000c9')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Link evidence/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox'));
    await user.click(within(await screen.findByRole('listbox')).getByText('Registered document'));
    await user.click(await within(dialog).findByRole('button', { name: 'Link' }));
    expect(await within(dialog).findByText('this evidence belongs to another assessment')).toBeInTheDocument();
  });
});

describe('UI-EFR-11 unlinking uses the governed mutation and the central permission', () => {
  it('calls the governed unlink operation from a guarded control', async () => {
    const user = userEvent.setup({ delay: null });
    mountEvidence();
    await screen.findByText('AML/CFT policy manual 2026');
    const remove = screen.getAllByRole('button').filter((b) => b.getAttribute('data-rbac') === 'aml_supervision.edit');
    expect(remove.length).toBeGreaterThan(0);
    await user.click(remove[remove.length - 1]);
    await waitFor(() => expect(countOf('supervisory_assessment_evidence_unlink')).toBe(1));
    const args = argsOf('supervisory_assessment_evidence_unlink')[0];
    expect(args._question_id).toBe(Q1);
  });
});

describe('UI-EFR-12 the facts panel shows type, value, unit, period, source and retrieval', () => {
  it('renders the typed fact exactly as the platform recorded it', async () => {
    wrap(<AmlFactRegisterPanel assessmentId={ASSESSMENT} editable />);
    await screen.findByText('Alert clearance rate');
    expect(screen.getByText('ALERT_CLEARANCE_RATE')).toBeInTheDocument();
    expect(screen.getByText('PERCENTAGE')).toBeInTheDocument();
    expect(screen.getByText('%')).toBeInTheDocument();
    expect(screen.getByText(/82\.5 \(330\/400\)/)).toBeInTheDocument();
    expect(screen.getByText(/REGULATORY_RETURN · RET-2026-Q2-0114 · as at 2026-06-30/)).toBeInTheDocument();
    expect(screen.getByText('1 of 2 recorded')).toBeInTheDocument();
  });
});

describe('UI-EFR-13 an overridden fact shows both the proposed and the current value', () => {
  it('keeps the platform proposal visible next to the officer value', async () => {
    wrap(<AmlFactRegisterPanel assessmentId={ASSESSMENT} editable />);
    await screen.findByText('Alert clearance rate');
    expect(screen.getByText(/Platform proposed: 76\.0 · officer value: 82\.5/)).toBeInTheDocument();
    expect(screen.getByText(/Change explained: Return understated closures/)).toBeInTheDocument();
    expect(screen.getByText('Officer value')).toBeInTheDocument();
  });
});

describe('UI-EFR-14 changing a proposed fact requires a written reason', () => {
  it('refuses to send the change until the officer explains it', async () => {
    const user = userEvent.setup({ delay: null });
    wrap(<AmlFactRegisterPanel assessmentId={ASSESSMENT} editable />);
    await screen.findByText('Alert clearance rate');
    await user.click(screen.getByRole('button', { name: 'Change value' }));
    await screen.findByRole('dialog');
    const dialog = await screen.findByRole('dialog', { name: /./ });
    const save = await within(dialog).findByRole('button', { name: 'Record my value' });
    expect(save).toBeDisabled();
    await user.type(
      within(dialog).getByLabelText(/Why are you changing the proposed value\?/),
      'Corrected against the sampled alert log.',
    );
    expect(save).not.toBeDisabled();
    await user.click(save);
    await waitFor(() => expect(countOf('supervisory_assessment_fact_override')).toBe(1));
    expect(argsOf('supervisory_assessment_fact_override')[0]._reason).toContain('sampled alert log');
  });
});

describe('UI-EFR-15 required-fact blockers render from the server result', () => {
  it('shows the required fact as outstanding and marks it required in the register', async () => {
    mode = 'blocked';
    wrap(<AmlReadinessPanel assessmentId={ASSESSMENT} />);
    await screen.findByText('Required structured facts');
    expect(screen.getByText(/SAR_FILED_COUNT — FACT NOT RECORDED/)).toBeInTheDocument();
    cleanup();
    wrap(<AmlFactRegisterPanel assessmentId={ASSESSMENT} editable />);
    await screen.findByText('Suspicious activity reports filed');
    expect(screen.getByText('Required')).toBeInTheDocument();
  });
});

describe('UI-EFR-16 an evidence or fact change refreshes readiness without a page reload', () => {
  it('re-reads the same readiness contract after the governed mutation', async () => {
    const user = userEvent.setup({ delay: null });
    wrap(
      <>
        <AmlReadinessPanel assessmentId={ASSESSMENT} />
        <AmlQuestionEvidencePanel
          assessmentId={ASSESSMENT}
          questionId={Q1}
          questionCode="Q1"
          editable
        />
      </>,
    );
    await screen.findByText('Ready to submit');
    await screen.findByText('AML/CFT policy manual 2026');
    const before = countOf('supervisory_assessment_readiness');
    const remove = screen.getAllByRole('button').filter((b) => b.getAttribute('data-rbac') === 'aml_supervision.edit');
    await user.click(remove[remove.length - 1]);
    await waitFor(() => expect(countOf('supervisory_assessment_readiness')).toBeGreaterThan(before));
    // The same tree is still mounted: readiness was refreshed in place, not by
    // reloading the page.
    expect(screen.getByText('Submission readiness')).toBeInTheDocument();
  });
});

describe('UI-EFR-17 a loading state never implies readiness', () => {
  it('shows no readiness verdict and keeps submission closed while readiness is unknown', async () => {
    mode = 'loading';
    wrap(<AmlReadinessPanel assessmentId={ASSESSMENT} />);
    await screen.findByText('Submission readiness');
    expect(screen.queryByText('Ready to submit')).not.toBeInTheDocument();
    cleanup();

    mountActions();
    const submit = await screen.findByRole('button', { name: /Submit for supervisory review/ });
    expect(submit).toBeDisabled();
  });
});

describe('UI-EFR-18 an error state never enables submission', () => {
  it('states that readiness could not be read and leaves submission closed', async () => {
    mode = 'error';
    wrap(<AmlReadinessPanel assessmentId={ASSESSMENT} />);
    expect(await screen.findByText(/Readiness could not be read/)).toBeInTheDocument();
    expect(screen.queryByText('Ready to submit')).not.toBeInTheDocument();
    cleanup();

    mountActions();
    const submit = await screen.findByRole('button', { name: /Submit for supervisory review/ });
    await waitFor(() => expect(submit).toBeDisabled());
  });
});

describe('UI-EFR-19 legacy evidence compatibility is displayed honestly', () => {
  it('states how many earlier references exist and that they still count', async () => {
    mountEvidence(Q1, { legacyCount: 2 });
    expect(
      await screen.findByText(/2 earlier evidence references recorded on this answer before the evidence register existed/),
    ).toBeInTheDocument();
    expect(screen.getByText(/They still count towards the methodology's requirement/)).toBeInTheDocument();
    await screen.findByText('AML/CFT policy manual 2026');
    await waitFor(() =>
      expect(
        screen.getByText((_t, el) => /minimum\s*1\s*—\s*4\s*on file/.test(el?.textContent ?? '')
          && el?.tagName === 'SPAN'),
      ).toBeInTheDocument(),
    );
  });
});

describe('UI-EFR-20 every evidence and fact mutation uses the central guarded action', () => {
  it('marks each mutating control with the canonical AML supervision action code', async () => {
    const user = userEvent.setup({ delay: null });
    const { container } = mountEvidence();
    await screen.findByText('AML/CFT policy manual 2026');
    const guarded = Array.from(container.querySelectorAll('[data-rbac]'));
    expect(guarded.length).toBeGreaterThan(0);
    for (const el of guarded) expect(el.getAttribute('data-rbac')).toBe('aml_supervision.edit');
    cleanup();

    const fact = wrap(<AmlFactRegisterPanel assessmentId={ASSESSMENT} editable />);
    await screen.findByText('Alert clearance rate');
    const factGuards = Array.from(fact.container.querySelectorAll('[data-rbac]'));
    expect(factGuards.length).toBeGreaterThan(0);
    for (const el of factGuards) expect(el.getAttribute('data-rbac')).toBe('aml_supervision.edit');
    await user.click(screen.getByRole('button', { name: 'Change value' }));
    const dialog = await screen.findByRole('dialog');
    expect((await within(dialog).findByRole('button', { name: 'Record my value' }))).toHaveAttribute(
      'data-rbac',
      'aml_supervision.edit',
    );
  });
});
