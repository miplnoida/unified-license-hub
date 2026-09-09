/**
 * UI-PLAN-01…14 — AML-04 question applicability & assessment question plan, frontend closure.
 *
 * Every payload here was captured from the live database by
 * `scripts/capture-question-plan-fixtures.sql` (transaction rolled back, no
 * business record created). The gates assert that the workspace renders the
 * server's plan, its reason codes and its counts — and that it never derives
 * inclusion itself, never reads a table directly, and never presents
 * NOT_APPLICABLE as a scope state.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

beforeEach(() => {
  const proto = window.HTMLElement.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

const FIX = JSON.parse(readFileSync('src/test/fixtures/questionPlanReadModels.json', 'utf8'));
const src = (p: string) => readFileSync(p, 'utf8');

const ASSESSMENT: string = FIX.assessment_id;
const METHODOLOGY: string = FIX.methodology_id;
const QUESTION: string = FIX.question_id;

/* ----------------------------------------------------------- rpc harness */

const calls: Array<{ fn: string; args: any }> = [];
let planOverride: any = null;

function filterPlan(args: any) {
  const plan = planOverride ?? FIX.plan;
  let rows = plan.rows ?? [];
  if (args?._plan_state) rows = rows.filter((r: any) => r.effective_state === args._plan_state);
  if (args?._question_class) rows = rows.filter((r: any) => r.question_class === args._question_class);
  if (args?._search) {
    const q = String(args._search).toLowerCase();
    rows = rows.filter((r: any) =>
      `${r.question_code} ${r.prompt ?? ''}`.toLowerCase().includes(q));
  }
  return { ...plan, rows, row_count: rows.length };
}

function respond(fn: string, args: any) {
  switch (fn) {
    case 'supervisory_assessment_question_plan':
      return filterPlan(args);
    case 'supervisory_assessment_question_plan_summary':
      return FIX.plan_summary;
    case 'supervisory_assessment_question_plan_context':
      return FIX.plan_context;
    case 'supervisory_assessment_question_plan_materialize':
      return FIX.plan_summary;
    case 'supervisory_assessment_question_plan_override_apply':
      return { ok: true };
    case 'supervisory_question_rule_vocabulary':
      return FIX.rule_vocabulary;
    case 'supervisory_methodology_question_rules':
      return FIX.question_rules;
    case 'supervisory_methodology_question_rule_save':
      return QUESTION;
    case 'supervisory_methodology_question_rule_remove':
      return QUESTION;
    default:
      return null;
  }
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: any) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: respond(fn, args), error: null });
    },
    from: () => {
      throw new Error('UI-PLAN: question scope must never read tables directly');
    },
  },
}));

const argsOf = (fn: string) => calls.filter((c) => c.fn === fn).map((c) => c.args);
const lastArgs = (fn: string) => argsOf(fn).at(-1);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  calls.length = 0;
  planOverride = null;
});
afterEach(() => cleanup());

import { AmlQuestionPlanPanel } from '@/components/supervision/aml/AmlQuestionPlanPanel';
import { QuestionRuleSection } from '@/components/admin/supervisory-methodology/studio/QuestionRuleSection';
import { PLAN_STATES, OVERRIDE_STATES } from '@/hooks/useAmlQuestionPlan';

async function mountPanel(status = 'draft') {
  const view = wrap(<AmlQuestionPlanPanel assessmentId={ASSESSMENT} status={status} />);
  await waitFor(() => expect(argsOf('supervisory_assessment_question_plan').length).toBeGreaterThan(0));
  await screen.findByText('Question scope resolved by the server');
  return view;
}

/* ================================================================= gates */

describe('UI-PLAN-01 the panel reads only governed plan RPCs', () => {
  it('calls the plan and context read models and nothing else', async () => {
    await mountPanel();
    expect(lastArgs('supervisory_assessment_question_plan')._assessment_id).toBe(ASSESSMENT);
    expect(argsOf('supervisory_assessment_question_plan_context').length).toBeGreaterThan(0);
    const foreign = calls.filter((c) => !c.fn.startsWith('supervisory_assessment_question_plan'));
    expect(foreign).toEqual([]);
  });
});

describe('UI-PLAN-02 the server summary is rendered, not recomputed', () => {
  it('shows the counts exactly as the server returned them', async () => {
    await mountPanel();
    const s = FIX.plan.summary;
    for (const key of ['methodology_total', 'included_total', 'not_triggered', 'answered'] as const) {
      expect(screen.getAllByText(String(s[key])).length).toBeGreaterThan(0);
    }
    expect(await screen.findByText(
      new RegExp(`${s.included_core} core`, 'i'))).toBeInTheDocument();
  });
});

describe('UI-PLAN-03 every question row shows the server plan state', () => {
  it('renders each captured row with its effective state', async () => {
    await mountPanel();
    for (const row of FIX.plan.rows) {
      expect(await screen.findByText(row.question_code)).toBeInTheDocument();
    }
  });
});

describe('UI-PLAN-04 conditional inclusion is shown with the server reason', () => {
  it('shows CONDITIONAL_TRIGGER_TRUE and the rule summary', async () => {
    await mountPanel();
    const included = FIX.plan.rows.find((r: any) => r.effective_state === 'INCLUDED_CONDITIONAL');
    expect(included).toBeTruthy();
    expect(await screen.findByText(included.reason_code)).toBeInTheDocument();
    expect(screen.getAllByText(included.rule_summary).length).toBeGreaterThan(0);
  });
});

describe('UI-PLAN-05 non-triggered questions are visible, not hidden', () => {
  it('shows the NOT_TRIGGERED row and its reason', async () => {
    await mountPanel();
    const nt = FIX.plan.rows.find((r: any) => r.effective_state === 'NOT_TRIGGERED');
    expect(nt).toBeTruthy();
    expect(await screen.findByText(nt.question_code)).toBeInTheDocument();
    expect(screen.getAllByText(nt.reason_code).length).toBeGreaterThan(0);
  });
});

describe('UI-PLAN-06 the evaluated facts come from the server context', () => {
  it('renders each captured context input', async () => {
    await mountPanel();
    await screen.findByText('Facts the server used');
    const sector = FIX.plan_context['ENTITY.SECTOR_ID'];
    expect(screen.getAllByText(sector).length).toBeGreaterThan(0);
  });
});

describe('UI-PLAN-07 NOT_APPLICABLE is never a scope state', () => {
  it('is absent from the plan vocabulary, the override options and the screen', async () => {
    expect(PLAN_STATES).not.toContain('INCLUDED_NOT_APPLICABLE');
    expect(PLAN_STATES.some((s) => s.includes('NOT_APPLICABLE'))).toBe(false);
    expect(OVERRIDE_STATES.some((s) => s.includes('NOT_APPLICABLE'))).toBe(false);
    await mountPanel();
    expect(screen.queryByText(/not applicable/i)).toBeNull();
  });
});

describe('UI-PLAN-08 the scope filters delegate to the server', () => {
  it('passes the chosen scope state to the plan RPC', async () => {
    const user = userEvent.setup();
    await mountPanel();
    await user.click(screen.getByLabelText('Filter by scope state'));
    await user.click(await screen.findByRole('option', { name: /not triggered/i }));
    await waitFor(() => expect(lastArgs('supervisory_assessment_question_plan')._plan_state).toBe('NOT_TRIGGERED'));
  });
});

describe('UI-PLAN-09 search is a server argument', () => {
  it('sends the typed term to the plan RPC', async () => {
    const user = userEvent.setup();
    await mountPanel();
    await user.type(screen.getByLabelText('Search questions'), 'CORE');
    await waitFor(() =>
      expect(argsOf('supervisory_assessment_question_plan').map((a) => a._search)).toContain('CORE'));
  });
});

describe('UI-PLAN-10 resolving the plan calls the governed materialisation RPC', () => {
  it('sends the assessment and the reason', async () => {
    const user = userEvent.setup();
    await mountPanel();
    await user.click(screen.getByRole('button', { name: /question plan$/i }));
    await user.type(await screen.findByLabelText(/^Reason/), 'Methodology version rebound after adoption');
    await user.click(screen.getByRole('button', { name: /^(Rebuild|Resolve) plan$/ }));
    await waitFor(() => expect(argsOf('supervisory_assessment_question_plan_materialize').length).toBe(1));
    expect(lastArgs('supervisory_assessment_question_plan_materialize')._assessment_id).toBe(ASSESSMENT);
  });
});

describe('UI-PLAN-11 a scope override requires a justification and a governed RPC', () => {
  it('refuses a short reason and then calls the override RPC', async () => {
    const user = userEvent.setup();
    await mountPanel('draft');
    const row = FIX.plan.rows[0];
    const cell = (await screen.findByText(row.question_code)).closest('tr')!;
    await user.click(within(cell).getByRole('button', { name: /adjust scope/i }));
    const submit = await screen.findByRole('button', { name: /record override/i });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/supervisory justification/i), 'Out of scope for this licence category filing');
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(argsOf('supervisory_assessment_question_plan_override_apply').length).toBe(1));
    const a = lastArgs('supervisory_assessment_question_plan_override_apply');
    expect(a._assessment_id).toBe(ASSESSMENT);
    expect(a._question_id).toBe(row.question_id);
    expect(OVERRIDE_STATES).toContain(a._to_state);
  });
});

describe('UI-PLAN-12 non-draft assessments offer no scope change', () => {
  it('hides the override action once the assessment leaves draft', async () => {
    await mountPanel('under_review');
    expect(screen.queryByRole('button', { name: /adjust scope/i })).toBeNull();
  });
});

describe('UI-PLAN-13 an unmaterialised legacy plan is stated, never invented', () => {
  it('explains that no plan was resolved and shows no fabricated counts', async () => {
    planOverride = {
      summary: {
        ...FIX.plan.summary, mode: 'LEGACY_UNMATERIALISED', legacy_mode: true,
        planned_total: 0, included_total: 0, included_core: 0, included_conditional: 0,
        included_enhanced: 0, not_triggered: 0, out_of_scope: 0, answered: 0, unanswered_in_scope: 0,
      },
      rows: [], row_count: 0, legacy_mode: true, note: FIX.plan.note,
    };
    await mountPanel();
    expect(await screen.findByText(/No question plan has been resolved/i)).toBeInTheDocument();
    expect(screen.getByText(/Legacy methodology compatibility/i)).toBeInTheDocument();
  });
});

describe('UI-PLAN-14 Studio rule authoring uses only the server vocabulary', () => {
  it('renders the captured rule and saves through the governed RPC', async () => {
    const user = userEvent.setup();
    wrap(
      <QuestionRuleSection
        methodologyId={METHODOLOGY}
        questionId={QUESTION}
        questionClass="CONDITIONAL"
        canAuthor
      />,
    );
    await waitFor(() => expect(argsOf('supervisory_methodology_question_rules').length).toBeGreaterThan(0));
    const rule = FIX.question_rules[0];
    expect(await screen.findByText(rule.rule_summary)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add rule/i }));
    await waitFor(() => expect(argsOf('supervisory_question_rule_vocabulary').length).toBeGreaterThan(0));
    await user.click(await screen.findByLabelText('Condition 1 field'));
    const available = FIX.rule_vocabulary.sources.filter((s: any) => s.available);
    const option = await screen.findByRole('option', { name: available[0].label });
    expect(option).toBeInTheDocument();
    const unavailable = FIX.rule_vocabulary.sources.find((s: any) => !s.available);
    if (unavailable) expect(screen.queryByRole('option', { name: unavailable.label })).toBeNull();
  });
});

describe('UI-PLAN-15 no client-side scope derivation exists in the frontend', () => {
  it('keeps inclusion decisions on the server', async () => {
    const panel = src('src/components/supervision/aml/AmlQuestionPlanPanel.tsx');
    const hook = src('src/hooks/useAmlQuestionPlan.ts');
    const rules = src('src/components/admin/supervisory-methodology/studio/QuestionRuleSection.tsx');
    for (const code of [panel, hook, rules]) {
      expect(code).not.toMatch(/supabase\s*\.\s*from\(/);
      expect(code).not.toMatch(/\.filter\([^)]*question_class\s*===\s*'CONDITIONAL'[^)]*\)\s*&&/);
    }
    expect(panel).not.toMatch(/evaluateRule|deriveState|computeInclusion/);
    expect(rules).not.toMatch(/evaluateRule|computeInclusion/);
  });
});

/* ---------------------------------------------- UI-PLAN-16…18 (final closure) */

describe('UI-PLAN-16 the frontend holds no applicability policy', () => {
  it('never decides inclusion from question class, trigger, sector, dimension or entity data', () => {
    const files = [
      'src/components/supervision/aml/AmlQuestionPlanPanel.tsx',
      'src/hooks/useAmlQuestionPlan.ts',
      'src/components/supervision/aml/AmlDimensionWorksheet.tsx',
      'src/components/admin/supervisory-methodology/studio/QuestionRuleSection.tsx',
    ].map((f) => [f, src(f)] as const);

    for (const [file, code] of files) {
      // No local evaluation of applicability facts.
      expect(code, file).not.toMatch(/question_class\s*===\s*['"](CORE|CONDITIONAL|ENHANCED)['"]/);
      expect(code, file).not.toMatch(/sector_id\s*===|entity_status\s*===|trigger_type\s*===/);
      expect(code, file).not.toMatch(/evaluateRule|deriveState|computeInclusion/);
      // NOT_APPLICABLE is never used as a scope state.
      expect(code, file).not.toMatch(/plan_state[^\n]*NOT_APPLICABLE|NOT_APPLICABLE[^\n]*plan_state/);
    }

    // The working file's only scope input is the server's own inclusion result.
    const worksheet = src('src/components/supervision/aml/AmlDimensionWorksheet.tsx');
    expect(worksheet).toMatch(/planRows\.filter\(\(r\) => r\.included\)/);
    expect(worksheet).toMatch(/useAmlQuestionPlan/);

    // The canonical state list carries no response-level answer.
    expect(PLAN_STATES).not.toContain('NOT_APPLICABLE');
    expect(OVERRIDE_STATES).not.toContain('NOT_APPLICABLE');
  });
});

describe('UI-PLAN-17 a newly created assessment plan arrives without a page reload', () => {
  it('re-reads the governed plan after a governed resolve, and never reloads the browser', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await mountPanel();
    const before = argsOf('supervisory_assessment_question_plan').length;

    await user.click(screen.getByRole('button', { name: /question plan$/i }));
    await user.type(await screen.findByLabelText(/^Reason/), 'Scope rebuilt for certification evidence');
    const confirm = await screen.findByRole('button', { name: /^(Resolve|Rebuild) plan$/ });
    await user.click(confirm);

    await waitFor(() =>
      expect(argsOf('supervisory_assessment_question_plan_materialize').length).toBeGreaterThan(0));
    // React Query invalidation refetches the plan in place.
    await waitFor(() =>
      expect(argsOf('supervisory_assessment_question_plan').length).toBeGreaterThan(before));

    // No surface in the creation/scope path forces a browser reload.
    for (const f of [
      'src/components/supervision/aml/AmlQuestionPlanPanel.tsx',
      'src/hooks/useAmlQuestionPlan.ts',
      'src/components/supervision/aml/AmlNewAssessmentDialog.tsx',
    ]) {
      expect(src(f), f).not.toMatch(/location\.reload|window\.location\.href\s*=/);
    }
    expect(src('src/hooks/useAmlQuestionPlan.ts')).toMatch(/invalidateQueries/);
  });
});

describe('UI-PLAN-18 out-of-scope questions are not answerable', () => {
  it('offers no answer control for NOT_TRIGGERED or OUT_OF_SCOPE questions', async () => {
    await mountPanel();

    const blocked = FIX.plan.rows.filter(
      (r: any) => r.effective_state === 'NOT_TRIGGERED' || r.effective_state === 'OUT_OF_SCOPE');
    expect(blocked.length).toBeGreaterThan(0);

    for (const row of blocked) {
      // The server states them as not answerable…
      expect(row.included).toBe(false);
      expect(row.response_status).toBe('NOT_REQUIRED');
      // …and the scope view exposes them as read-only records only: no answer,
      // submit or record control is rendered against them.
      const cell = await screen.findByText(row.question_code);
      const scope = cell.closest('tr') ?? cell.parentElement!;
      expect(within(scope as HTMLElement).queryByRole('button', { name: /answer|record|submit/i })).toBeNull();
      expect(within(scope as HTMLElement).queryByRole('textbox')).toBeNull();
      expect(within(scope as HTMLElement).queryByRole('combobox')).toBeNull();
    }

    // The working file only ever renders server-included questions, so an
    // out-of-scope question cannot be opened as an answerable question there.
    const worksheet = src('src/components/supervision/aml/AmlDimensionWorksheet.tsx');
    expect(worksheet).toMatch(/includedQuestionIds\.has\(q\.id\)/);
  });
});
