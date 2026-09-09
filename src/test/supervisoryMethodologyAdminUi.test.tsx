/**
 * UI-METH-01…24 — Supervisory Methodology Administration frontend closure.
 *
 * Every rendered gate consumes REAL governed read-model payloads captured from
 * the live database by `scripts/capture-methodology-read-model-fixtures.sql`
 * (rolled back, no business record created). No screen literal from the design
 * documents is asserted: what the server returned is what the workspace must
 * render.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/* Radix relies on pointer APIs jsdom does not implement. */
beforeEach(() => {
  const proto = window.HTMLElement.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

const FIX = JSON.parse(readFileSync('src/test/fixtures/methodologyReadModels.json', 'utf8'));
const src = (p: string) => readFileSync(p, 'utf8');

/* ----------------------------------------------------------- rpc harness */

const calls: Array<{ fn: string; args: any }> = [];
let capabilitiesOverride: any = null;

function respond(fn: string, args: any) {
  switch (fn) {
    case 'supervisory_methodology_register':
      return FIX.register;
    case 'supervisory_methodology_register_options':
      return FIX.register_options;
    case 'supervisory_methodology_detail':
      return FIX.detail;
    case 'supervisory_methodology_dimension_list':
      return FIX.dimensions;
    case 'supervisory_methodology_question_register':
      return FIX.questions;
    case 'supervisory_methodology_question_detail':
      return FIX.question_detail;
    case 'supervisory_methodology_semantic_register':
      return FIX.semantics;
    case 'supervisory_methodology_fact_register':
      return FIX.facts;
    case 'supervisory_methodology_fact_detail':
      return FIX.fact_detail;
    case 'supervisory_methodology_parameter_register':
      return FIX.parameters;
    case 'supervisory_methodology_reference_decision_register':
      return FIX.reference_decisions;
    case 'supervisory_methodology_approval_register':
      return args?._regulator_id && args._regulator_id !== FIX.adoption_targets.rows?.[0]?.id
        ? { total_count: 0, rows: [] }
        : FIX.approvals;
    case 'supervisory_methodology_audit_register':
      return FIX.audit;
    case 'supervisory_methodology_compare':
      return FIX.compare;
    case 'supervisory_methodology_review_readiness':
      return FIX.readiness;
    case 'supervisory_methodology_action_capabilities':
      return capabilitiesOverride ?? FIX.capabilities;
    case 'supervisory_methodology_adoption_targets':
      return FIX.adoption_targets;
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
      throw new Error('UI-METH: the methodology workspace must not read tables directly');
    },
  },
}));

/* One user-event session per interaction with no artificial inter-event delay:
 * the default API schedules a macrotask between keystrokes, which pushed these
 * heavy register renders past the five-second budget under full-suite load. */
const ue = () => userEvent.setup({ delay: null, pointerEventsCheck: 0 });

const argsOf = (fn: string) => calls.filter((c) => c.fn === fn).map((c) => c.args);
const lastArgs = (fn: string) => argsOf(fn).at(-1);

function wrap(ui: React.ReactNode, path = '/admin/supervisory-methodology') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

async function mountDetailTab(tab: React.ReactNode) {
  const view = wrap(tab);
  await waitFor(() => expect(calls.length).toBeGreaterThan(0));
  return view;
}

beforeEach(() => {
  calls.length = 0;
  capabilitiesOverride = null;
});
afterEach(() => cleanup());

/* ------------------------------------------------------------- component imports */

import RegisterPage from '@/pages/admin/SupervisoryMethodologyRegister';
import DetailPage from '@/pages/admin/SupervisoryMethodologyDetail';
import { QuestionsTab } from '@/components/admin/supervisory-methodology/tabs/QuestionsTab';
import { SemanticsTab } from '@/components/admin/supervisory-methodology/tabs/SemanticsTab';
import { FactsTab } from '@/components/admin/supervisory-methodology/tabs/FactsTab';
import { ParametersTab } from '@/components/admin/supervisory-methodology/tabs/ParametersTab';
import { ReferenceDecisionsTab } from '@/components/admin/supervisory-methodology/tabs/ReferenceDecisionsTab';
import { ApprovalsTab } from '@/components/admin/supervisory-methodology/tabs/ApprovalsTab';
import { AuditTab } from '@/components/admin/supervisory-methodology/tabs/AuditTab';
import { CompareTab } from '@/components/admin/supervisory-methodology/tabs/CompareTab';
import { OverviewTab } from '@/components/admin/supervisory-methodology/tabs/OverviewTab';
import { MethodologyActionBar } from '@/components/admin/supervisory-methodology/MethodologyActionBar';

const MID: string = FIX.methodology_id;

/* ================================================================= gates */

describe('UI-METH-01 register consumes the governed RPC', () => {
  it('renders the register from supervisory_methodology_register only', async () => {
    wrap(<RegisterPage />);
    await waitFor(() => expect(argsOf('supervisory_methodology_register').length).toBeGreaterThan(0));
    expect(argsOf('supervisory_methodology_register_options').length).toBeGreaterThan(0);
    await screen.findAllByText(/AML-CFT-RBA/);
    const nonGoverned = calls.filter((c) => !c.fn.startsWith('supervisory_methodology_'));
    expect(nonGoverned).toEqual([]);
  });
});

describe('UI-METH-02 no direct governance-table reads', () => {
  it('never queries methodology tables from the client', () => {
    const files = [
      'src/pages/admin/SupervisoryMethodologyRegister.tsx',
      'src/pages/admin/SupervisoryMethodologyDetail.tsx',
      'src/hooks/useSupervisoryMethodologyAdmin.ts',
      'src/components/admin/supervisory-methodology/MethodologyActionBar.tsx',
      'src/components/admin/supervisory-methodology/tabs/QuestionsTab.tsx',
      'src/components/admin/supervisory-methodology/tabs/FactsTab.tsx',
      'src/components/admin/supervisory-methodology/tabs/ApprovalsTab.tsx',
      'src/components/admin/supervisory-methodology/tabs/AuditTab.tsx',
      'src/components/admin/supervisory-methodology/tabs/CompareTab.tsx',
      'src/components/admin/supervisory-methodology/tabs/ParametersTab.tsx',
      'src/components/admin/supervisory-methodology/tabs/SemanticsTab.tsx',
      'src/components/admin/supervisory-methodology/tabs/ReferenceDecisionsTab.tsx',
      'src/components/admin/supervisory-methodology/tabs/OverviewTab.tsx',
    ];
    for (const f of files) {
      const text = src(f);
      expect(text, `${f} must not call .from(`).not.toMatch(/\.from\(\s*['"]/);
    }
    // The hook layer is the only place that may touch supabase at all.
    expect(src('src/hooks/useSupervisoryMethodologyAdmin.ts')).toMatch(/\.rpc\(/);
  });
});

/* The question register renders a full bounded page of governed rows; each
 * interaction below re-renders it in jsdom and legitimately needs more than the
 * five-second default under full-suite load. Assertions are unchanged. */
describe('UI-METH-03 server pagination', () => {
  it('asks the server for one bounded page and moves the offset', { timeout: 20_000 }, async () => {
    await mountDetailTab(<QuestionsTab methodologyId={MID} />);
    await waitFor(() => expect(lastArgs('supervisory_methodology_question_register')).toBeTruthy());
    expect(lastArgs('supervisory_methodology_question_register')._limit).toBe(25);
    expect(lastArgs('supervisory_methodology_question_register')._offset).toBe(0);

    const next = await screen.findByRole('button', { name: /next/i });
    await ue().click(next);
    await waitFor(() =>
      expect(lastArgs('supervisory_methodology_question_register')._offset).toBe(25),
    );
    expect(FIX.register_page2.rows.length).toBeLessThanOrEqual(2);
  });
});

describe('UI-METH-04 sort cycle', () => {
  it('cycles a sortable column through the server sort contract', { timeout: 20_000 }, async () => {
    await mountDetailTab(<QuestionsTab methodologyId={MID} />);
    const header = await screen.findByRole('button', { name: /^Class:/i });
    await ue().click(header);
    await waitFor(() => {
      const a = lastArgs('supervisory_methodology_question_register');
      expect(a._sort).toBe('class');
      expect(a._dir).toBe('asc');
    });
    await ue().click(await screen.findByRole('button', { name: /^Class:/i }));
    await waitFor(
      () => expect(lastArgs('supervisory_methodology_question_register')._dir).toBe('desc'),
      { timeout: 4000 },
    );
  });
});

describe('UI-METH-05 filters and search reach the server', () => {
  it('sends search text and a filter value as RPC arguments', { timeout: 20_000 }, async () => {
    await mountDetailTab(<QuestionsTab methodologyId={MID} />);
    const search = await screen.findByPlaceholderText(/Search question code or prompt/i);
    await ue().type(search, 'IR-GEO');
    await waitFor(
      () => expect(lastArgs('supervisory_methodology_question_register')._search).toBe('IR-GEO'),
      { timeout: 4000 },
    );

    await ue().click(screen.getByLabelText('Question class'));
    await ue().click(await screen.findByRole('option', { name: 'CONDITIONAL' }));
    await waitFor(() =>
      expect(lastArgs('supervisory_methodology_question_register')._question_class).toBe('CONDITIONAL'),
    );
  });
});

describe('UI-METH-06 human origin labels', () => {
  it('shows the server origin label and never the raw enum', async () => {
    wrap(<RegisterPage />);
    await screen.findAllByText(/AML-CFT-RBA/);
    expect(await screen.findAllByText(/MIPL Reference/)).not.toHaveLength(0);
    expect(screen.queryByText('MIPL_REFERENCE')).toBeNull();
    expect(screen.queryByText('REGULATOR_AUTHORED')).toBeNull();
  });
});

describe('UI-METH-07 seventy live v1.1 questions', () => {
  it('reports the server total, not a page length', async () => {
    expect(FIX.questions.total_count).toBe(70);
    await mountDetailTab(<QuestionsTab methodologyId={MID} />);
    await waitFor(() => expect(screen.getByText(/of\s+70/)).toBeTruthy());
    expect(FIX.questions.rows.length).toBe(25);
  });
});

describe('UI-METH-08 question detail drawer', () => {
  it('opens one question from the server detail model', { timeout: 20_000 }, async () => {
    await mountDetailTab(<QuestionsTab methodologyId={MID} />);
    const view = await screen.findAllByRole('button', { name: /^View$/ });
    await ue().click(view[0]);
    await waitFor(() => expect(argsOf('supervisory_methodology_question_detail').length).toBe(1));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(FIX.question_detail.question_code)).toBeTruthy();
  });
});

describe('UI-METH-09 IR-GEO-03 semantics are rendered truthfully', () => {
  it('shows the contextual, not-scored participation the server records', async () => {
    expect(FIX.question_detail.question_code).toBe('IR-GEO-03');
    expect(FIX.question_detail.calculation_participation).toBe('CONTEXTUAL_NOT_SCORED');
    await mountDetailTab(<QuestionsTab methodologyId={MID} />);
    await ue().click((await screen.findAllByRole('button', { name: /^View$/ }))[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText(/Contextual, not scored|Contextual not scored/i).length).toBeGreaterThan(0);
    expect(within(dialog).queryByText('CONTEXTUAL_NOT_SCORED')).toBeNull();
  });
});

describe('UI-METH-10 five version-owned semantic profiles', () => {
  it('renders every profile and states version ownership', async () => {
    expect(FIX.semantics.length).toBe(5);
    await mountDetailTab(<SemanticsTab methodologyId={MID} />);
    for (const p of FIX.semantics) {
      expect(await screen.findByText(p.semantic_code)).toBeTruthy();
    }
    expect(screen.getByText(/version-owned/i)).toBeTruthy();
  });
});

describe('UI-METH-11 eighty-seven fact requirements', () => {
  it('renders the server fact total', async () => {
    expect(FIX.facts.total_count).toBe(87);
    await mountDetailTab(<FactsTab methodologyId={MID} />);
    await waitFor(() => expect(screen.getAllByText(/87/).length).toBeGreaterThan(0));
  });
});

describe('UI-METH-12 eight parameters, no approved policy value', () => {
  it('reports definition without value and offers no edit control', async () => {
    expect(FIX.parameters.total_count).toBe(8);
    expect(FIX.parameters.unapproved_count).toBe(8);
    expect(FIX.parameters.valued_count).toBe(0);
    await mountDetailTab(<ParametersTab methodologyId={MID} />);
    await waitFor(() => expect(screen.getByText(/policy value is not approved/i)).toBeTruthy());
    expect(screen.getAllByText(/Not set/).length).toBe(8);
    expect(screen.queryByRole('button', { name: /save|edit|set value|approve value/i })).toBeNull();
  });
});

describe('UI-METH-13 ten MIPL reference decisions', () => {
  it('renders each reference decision from the server register', async () => {
    expect(FIX.reference_decisions.total_count).toBe(10);
    await mountDetailTab(<ReferenceDecisionsTab methodologyId={MID} />);
    await waitFor(() => expect(argsOf('supervisory_methodology_reference_decision_register').length).toBe(1));
    for (const r of FIX.reference_decisions.rows.slice(0, 3)) {
      expect(await screen.findByText(r.decision_code ?? r.reference ?? r.title)).toBeTruthy();
    }
  });
});

describe('UI-METH-14 v1.0 → v1.1 comparison', () => {
  it('renders the server comparison, including the migration statement', async () => {
    await mountDetailTab(<CompareTab methodologyId={MID} />);
    await waitFor(() => expect(argsOf('supervisory_methodology_compare').length).toBeGreaterThan(0));
    expect(FIX.compare.note).toBeTruthy();
    await waitFor(() => expect(screen.getByText(FIX.compare.note)).toBeTruthy());
  });
});

describe('UI-METH-15 layered readiness', () => {
  it('renders each readiness layer independently, never one traffic light', async () => {
    const layers: any[] = FIX.readiness.layers;
    expect(layers.length).toBeGreaterThanOrEqual(9);
    wrap(
      <OverviewTab detail={FIX.detail} readiness={FIX.readiness} readinessLoading={false} readinessError={null} />,
    );
    for (const l of layers) expect(await screen.findByText(l.label)).toBeTruthy();
    expect(screen.getByText(FIX.readiness.note)).toBeTruthy();
    const states = new Set(layers.map((l) => l.state));
    expect(states.size).toBeGreaterThan(1);
  });
});

describe('UI-METH-16 regulator-scoped adoption targets', () => {
  it('offers only the regulators the server returned', async () => {
    wrap(<MethodologyActionBar methodology={FIX.detail} capabilities={FIX.capabilities} isLoading={false} />);
    await ue().click(await screen.findByRole('button', { name: /adopt/i }));
    await waitFor(() => expect(argsOf('supervisory_methodology_adoption_targets').length).toBe(1));
    const dialog = await screen.findByRole('dialog');
    const rows = FIX.adoption_targets.rows;
    expect(rows.length).toBe(FIX.capabilities.can_adopt.target_count);

    if (rows.length === 1) {
      // A single eligible regulator is context, not a question: it is resolved
      // automatically and no regulator selector is rendered.
      expect(within(dialog).getByTestId('adopt-sole-regulator')).toHaveTextContent(rows[0].name);
      expect(within(dialog).queryByLabelText('Regulator')).toBeNull();
    } else {
      await ue().click(within(dialog).getByLabelText('Regulator'));
      const options = await screen.findAllByRole('option');
      expect(options).toHaveLength(rows.length);
      for (const r of rows) {
        expect(options.some((o) => o.textContent?.includes(r.name))).toBe(true);
      }
    }
    expect(calls.some((c) => c.fn === 'supervisory_methodology_adopt_reference')).toBe(false);
  });
});

describe('UI-METH-17 assessment approval is not methodology approval', () => {
  it('shows the server refusal reason instead of an approval control', async () => {
    capabilitiesOverride = {
      ...FIX.capabilities,
      can_adopt: { allowed: false, reason: 'You do not hold methodology configuration authority.' },
      can_submit_review: { allowed: false, reason: 'You do not hold methodology configuration authority.' },
      can_approve: {
        allowed: false,
        reason: 'Assessment approval authority does not include methodology approval.',
        requires_rationale: true,
      },
    };
    wrap(<MethodologyActionBar methodology={FIX.detail} capabilities={capabilitiesOverride} isLoading={false} />);
    const approve = await screen.findByRole('button', { name: /approve/i });
    expect(approve).toBeDisabled();
    await ue().hover(approve.parentElement as HTMLElement);
    expect((await screen.findAllByText(capabilitiesOverride.can_approve.reason)).length).toBeGreaterThan(0);
  });
});

describe('UI-METH-18 maker/checker block reason', () => {
  it('blocks the submitting officer with the server reason', async () => {
    capabilitiesOverride = {
      ...FIX.capabilities,
      origin: 'REGULATOR_ADOPTED',
      status: 'REVIEW',
      can_approve: {
        allowed: false,
        reason: 'You prepared this version and cannot approve it.',
        requires_rationale: true,
      },
      maker_checker: { ...FIX.capabilities.maker_checker, actor_is_submitter: true },
    };
    wrap(<MethodologyActionBar methodology={FIX.detail} capabilities={capabilitiesOverride} isLoading={false} />);
    const approve = await screen.findByRole('button', { name: /approve/i });
    expect(approve).toBeDisabled();
    await ue().hover(approve.parentElement as HTMLElement);
    expect((await screen.findAllByText(capabilitiesOverride.can_approve.reason)).length).toBeGreaterThan(0);
  });
});

describe('UI-METH-19 platform administration gets no substantive approval', () => {
  it('never enables approval or activation for a super administrator', async () => {
    capabilitiesOverride = {
      ...FIX.capabilities,
      is_platform_administrator: true,
      can_approve: {
        allowed: false,
        reason: 'Platform administration cannot take a regulator approval decision.',
        requires_rationale: true,
      },
    };
    wrap(<MethodologyActionBar methodology={FIX.detail} capabilities={capabilitiesOverride} isLoading={false} />);
    const approve = await screen.findByRole('button', { name: /approve/i });
    expect(approve).toBeDisabled();
    expect(screen.queryByRole('button', { name: /activate/i })).toBeNull();
    const code = src('src/components/admin/supervisory-methodology/MethodologyActionBar.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/is_super_admin|isSuperAdmin/);
  });
});

describe('UI-METH-20 no cross-regulator approval visibility', () => {
  it('renders only the approval rows the server returns for the caller', async () => {
    await mountDetailTab(<ApprovalsTab methodologyId={MID} />);
    await waitFor(() => expect(argsOf('supervisory_methodology_approval_register').length).toBeGreaterThan(0));
    const a = lastArgs('supervisory_methodology_approval_register');
    expect(a._methodology_id).toBe(MID);
    expect(FIX.approvals.total_count).toBe(0);
    // No client-side regulator filtering exists to bypass: scope comes from the server.
    expect(src('src/components/admin/supervisory-methodology/tabs/ApprovalsTab.tsx'))
      .not.toMatch(/regulator_id\s*===|filter\(\s*\(r\)\s*=>\s*r\.regulator/);
  });
});

describe('UI-METH-21 audit history shows real events only', () => {
  it('renders the recorded events and invents none', async () => {
    await mountDetailTab(<AuditTab methodologyId={MID} />);
    await waitFor(() => expect(argsOf('supervisory_methodology_audit_register').length).toBe(1));
    expect(FIX.audit.total_count).toBe(FIX.detail.counts.events);
    for (const e of FIX.audit.rows.slice(0, 3)) {
      expect((await screen.findAllByText(new RegExp(e.event_type.replace(/_/g, '[ _]'), 'i'))).length)
        .toBeGreaterThan(0);
    }
    expect(screen.queryByText(/sample|placeholder|example event/i)).toBeNull();
  });
});

describe('UI-METH-22 zero policy writes from the workspace', () => {
  it('exposes no value, band, score or activation write path', () => {
    const dir = 'src/components/admin/supervisory-methodology';
    const files = [
      `${dir}/MethodologyActionBar.tsx`,
      `${dir}/tabs/ParametersTab.tsx`,
      `${dir}/tabs/FactsTab.tsx`,
      `${dir}/tabs/QuestionsTab.tsx`,
      'src/hooks/useSupervisoryMethodologyAdmin.ts',
    ];
    for (const f of files) {
      const t = src(f);
      expect(t, f).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
      // A read-only type declaration is allowed; an assignment payload is not.
      expect(t, f).not.toMatch(/value_numeric\s*:(?!\s*(number|string|null))/);
    }
    const hook = src('src/hooks/useSupervisoryMethodologyAdmin.ts');
    const writeRpcs = [...hook.matchAll(/rpc<[^(]*>\(\s*'(supervisory_methodology_[a-z_]+)'/g)]
      .map((m) => m[1])
      .filter((n) => /adopt_reference|lifecycle|approve|set_|update_/.test(n));
    expect([...new Set(writeRpcs)].sort()).toEqual([
      'supervisory_methodology_adopt_reference',
      'supervisory_methodology_lifecycle',
    ]);
  });
});

describe('UI-METH-23 the suite persists no adoption or approval', () => {
  it('never calls a governed write RPC while rendering', async () => {
    wrap(<RegisterPage />);
    await screen.findAllByText(/AML-CFT-RBA/);
    cleanup();
    await mountDetailTab(<ApprovalsTab methodologyId={MID} />);
    const writes = calls.filter((c) =>
      c.fn === 'supervisory_methodology_adopt_reference' || c.fn === 'supervisory_methodology_lifecycle');
    expect(writes).toEqual([]);
  });
});

describe('UI-METH-24 route, navigation, breadcrumb and RBAC coverage', () => {
  it('registers both routes with permission, navigation and breadcrumb sources', () => {
    const routes = src('src/routes/adminRoutes.tsx');
    expect(routes).toMatch(/supervisory-methodology/);
    expect(routes).toMatch(/supervisory-methodology\/:methodologyId/);

    const perms = src('src/lib/permissionModules.ts');
    expect(perms).toMatch(/supervisory-methodology/);
    expect(perms).toMatch(/aml_supervision/);

    const nav = src('src/lib/breadcrumbs/navigationSnapshot.ts');
    expect(nav).toMatch(/\/admin\/supervisory-methodology"/);
    expect(nav).toMatch(/\/admin\/supervisory-methodology\/:methodologyId"/);
  });

  it('renders the detail workspace with all nine review tabs', async () => {
    wrap(
      <Routes>
        <Route path="/admin/supervisory-methodology/:methodologyId" element={<DetailPage />} />
      </Routes>,
      `/admin/supervisory-methodology/${MID}`,
    );
    const labels = [
      'Overview', 'Dimensions & Questions', 'Response Semantics', 'Evidence & Facts',
      'Parameters', 'Reference Decisions', 'Regulator Approval', 'Audit History', 'Compare',
    ];
    for (const l of labels) expect(await screen.findByRole('tab', { name: l })).toBeTruthy();
  });
});
