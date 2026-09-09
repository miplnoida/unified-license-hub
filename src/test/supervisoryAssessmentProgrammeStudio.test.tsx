/**
 * PROG-UI-01…16 — Supervisory Assessment Programme Studio and runtime.
 *
 * Two invariants are under test. The Studio never decides authority or
 * vocabulary: authoring controls exist only where the server's capability
 * contract permits, every vocabulary shown comes from the server's catalogue,
 * and every write reaches a governed `supervisory_assessment_programme_*`
 * operation. The runtime never carries assessment policy: the New AML/CFT
 * Assessment flow holds no assessment-type list, no trigger list and no
 * 365-day default.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

beforeEach(() => {
  const proto = window.HTMLElement.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

const SET = '11111111-2222-3333-4444-555555555555';
const BASELINE = '11111111-2222-3333-4444-555555555556';
const PROG = 'aaaa1111-2222-3333-4444-555555555555';
const TRIG = 'bbbb1111-2222-3333-4444-555555555555';
const REG = '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3';
const ENTITY = 'cccc1111-2222-3333-4444-555555555555';

const calls: Array<{ fn: string; args: any }> = [];
let editable = true;
let canCreate = true;
let manualOverride = true;
let selectable = true;

const REGULATOR_SCOPE = {
  regulators: [{ id: REG, code: 'FSRA', name: 'Financial Services Regulatory Authority', status: 'active' }],
  selectable_regulator_count: 1,
  cross_regulator_allowed: false,
  active_regulator: { id: REG, code: 'FSRA', name: 'Financial Services Regulatory Authority' },
  regulator_scope_reason: null,
};

const OPTIONS = {
  domains: ['AML_CFT', 'PRUDENTIAL'],
  origins: ['MIPL_REFERENCE', 'REGULATOR_ADOPTED', 'REGULATOR_AUTHORED'],
  statuses: ['DRAFT', 'REVIEW', 'APPROVED', 'ACTIVE'],
  period_rules: [
    { code: 'TRAILING_DAYS', label: 'Trailing days', description: 'A trailing window of days.', requires_value: true },
    { code: 'MANUAL_REQUIRED', label: 'Entered by the officer', requires_value: false },
  ],
  question_classes: [
    { code: 'CORE', label: 'Core' },
    { code: 'CONDITIONAL', label: 'Conditional' },
    { code: 'ENHANCED', label: 'Enhanced' },
  ],
  assessment_types: [
    { code: 'PERIODIC', label: 'Periodic' },
    { code: 'FOLLOW_UP', label: 'Follow up' },
  ],
  trigger_codes: [
    { code: 'SUPERVISORY_CYCLE', label: 'Supervisory cycle' },
    { code: 'ADVERSE_EVENT', label: 'Adverse event' },
  ],
  ...REGULATOR_SCOPE,
};

const PROGRAMME = {
  id: PROG,
  programme_code: 'PERIODIC_REVIEW',
  label: 'Periodic AML/CFT review',
  description: 'The scheduled review.',
  assessment_type: 'PERIODIC',
  recurrence_months: 12,
  period_rule: 'TRAILING_DAYS',
  period_value: 365,
  end_offset_days: 1,
  allow_manual_override: true,
  requires_prior_assessment: false,
  requires_trigger_signal: false,
  summary_required: true,
  question_class_scope: ['CORE', 'CONDITIONAL'],
  included_dimension_codes: null,
  excluded_dimension_codes: null,
  guidance: 'Use for the scheduled cycle.',
  is_active: true,
  retired_at: null,
  sort_order: 10,
  triggers: [
    { id: TRIG, trigger_code: 'SUPERVISORY_CYCLE', label: 'Supervisory cycle', is_default: true, is_active: true,
      requires_signal: false, requires_prior_assessment: false, sort_order: 10 },
  ],
};

const DETAIL = {
  set: {
    id: SET, code: 'FSRA-AML-PROGRAMMES', set_version: '1.0', name: 'FSRA AML/CFT assessment programmes',
    description: null, domain_code: 'AML_CFT', regulator_id: REG, regulator_code: 'FSRA',
    regulator_name: 'Financial Services Regulatory Authority', origin: 'REGULATOR_AUTHORED', status: 'DRAFT',
    effective_from: '2026-01-01', effective_to: null, programme_count: 1, active_programme_count: 1,
    profile_binding_count: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
    notes: null, adopted_from: null, supersedes: null,
  },
  programmes: [PROGRAMME],
  profile_bindings: [{
    profile_id: 'dddd1111-2222-3333-4444-555555555555', profile_code: 'FSRA-AML-CFT-POLICY',
    profile_version: '1.0', profile_status: 'ACTIVE', profile_origin: 'REGULATOR_AUTHORED', bound_version: '1.0',
  }],
  versions: [
    { id: SET, set_version: '1.0', status: 'DRAFT', origin: 'REGULATOR_AUTHORED' },
    { id: BASELINE, set_version: '0.9', status: 'SUPERSEDED', origin: 'REGULATOR_AUTHORED' },
  ],
  validation: {
    error_count: 1,
    warning_count: 1,
    ready_for_review: false,
    errors: [{ area: 'TRIGGER', code: 'NO_DEFAULT_TRIGGER', message: 'No default trigger is configured.', programme_code: 'PERIODIC_REVIEW' }],
    warnings: [{ area: 'PERIOD', code: 'LONG_PERIOD', message: 'The review period exceeds two years.', programme_code: 'PERIODIC_REVIEW' }],
  },
};

const runtimeProgramme = () => ({
  programme_id: PROG,
  programme_code: 'PERIODIC_REVIEW',
  label: 'Periodic AML/CFT review',
  description: null,
  assessment_type: 'PERIODIC',
  guidance: null,
  summary_required: true,
  question_class_scope: ['CORE'],
  requires_prior_assessment: true,
  requires_trigger_signal: true,
  prior_assessment_id: 'eeee1111-2222-3333-4444-555555555555',
  prior_assessment_reference: 'AML-2025-014',
  selectable,
  reason: selectable ? null : 'The triggering signal has not been recorded for this entity.',
  period: {
    period_rule: 'TRAILING_DAYS', period_value: 365, end_offset_days: 1,
    suggested_period_start: '2025-01-02', suggested_period_end: '2026-01-01',
    manual_entry_required: false, allow_manual_override: manualOverride,
  },
  triggers: [
    { id: TRIG, trigger_code: 'SUPERVISORY_CYCLE', label: 'Supervisory cycle', is_default: true, is_active: true },
  ],
});

function respond(fn: string) {
  switch (fn) {
    case 'supervisory_assessment_programme_register_options': return OPTIONS;
    case 'supervisory_assessment_programme_create_options':
      return {
        can_create: canCreate,
        reason: canCreate ? null : 'You are not authorised to create programme packages in any supervisory domain.',
        domains: ['AML_CFT'], origin: 'REGULATOR_AUTHORED', status: 'DRAFT', ...REGULATOR_SCOPE,
      };
    case 'supervisory_assessment_programme_register': return { rows: [DETAIL.set], total: 1 };
    case 'supervisory_assessment_programme_detail': return DETAIL;
    case 'supervisory_assessment_programme_action_capabilities':
      return {
        programme_set_id: SET, status: 'DRAFT', origin: 'REGULATOR_AUTHORED',
        editable, can_manage: editable, can_submit: editable, can_return: false,
        can_approve: false, can_activate: false, can_retire: false,
        can_new_version: true, can_adopt: false,
        maker_checker_block: null, validation: DETAIL.validation,
        reason: editable ? null : 'An active package can only be changed through a new version.',
      };
    case 'supervisory_assessment_programme_event_register': return { rows: [], total: 0 };
    case 'supervisory_assessment_programme_compare':
      return { changes: [{ change_type: 'PROGRAMME_FIELD_CHANGED', programme_code: 'PERIODIC_REVIEW',
        field: 'period_value', baseline_value: '180', current_value: '365' }] };
    case 'supervisory_assessment_programme_set_create': return SET;
    case 'supervisory_assessment_programme_set_save': return SET;
    case 'supervisory_assessment_programme_upsert': return PROG;
    case 'supervisory_assessment_programme_retire': return PROG;
    case 'supervisory_assessment_programme_trigger_upsert': return TRIG;
    case 'supervisory_assessment_programme_trigger_remove': return 'REFUSE';
    case 'supervisory_assessment_programme_set_lifecycle': return SET;
    case 'supervisory_assessment_programme_set_new_version': return SET;
    case 'supervisory_assessment_programme_options_for_entity':
      return {
        mode: 'CONFIGURED', entity_id: ENTITY, domain_code: 'AML_CFT', as_of: '2026-01-02',
        prior_assessment_id: 'eeee1111-2222-3333-4444-555555555555',
        programme_set: { id: SET, code: 'FSRA-AML-PROGRAMMES', set_version: '1.0', name: 'FSRA programmes',
          origin: 'REGULATOR_AUTHORED', status: 'ACTIVE' },
        programmes: [runtimeProgramme()],
      };
    case 'supervisory_assessment_create_programmed': return { id: 'ffff1111-2222-3333-4444-555555555555' };
    case 'aml_entity_resolved_methodology':
      return { status: 'RESOLVED', methodology: { id: 'meth', code: 'MIPL-AML-CFT-RBA', version: '1.0',
        name: 'AML/CFT risk-based methodology', status: 'ACTIVE', effective_from: '2025-01-01' } };
    default: return null;
  }
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: any) => {
      calls.push({ fn, args });
      const data = respond(fn);
      if (data === 'REFUSE') {
        return Promise.resolve({ data: null, error: { message: 'the default trigger cannot be removed' } });
      }
      return Promise.resolve({ data, error: null });
    },
    from: () => {
      throw new Error('PROG-UI: the Studio must not read or write tables directly');
    },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useCan', () => ({ useCan: () => true }));
vi.mock('@/hooks/useAmlSupervision', () => ({
  useAmlPortfolio: () => ({ data: [{ entity_id: ENTITY, entity_name: 'Alpha Trust Ltd' }] }),
}));
vi.mock('@/hooks/useAmlLifecycle', () => ({
  useResolvedAmlMethodology: () => ({
    data: { status: 'RESOLVED', methodology: { id: 'meth', code: 'MIPL-AML-CFT-RBA', version: '1.0',
      name: 'AML/CFT risk-based methodology', status: 'ACTIVE', effective_from: '2025-01-01' } },
    isLoading: false,
  }),
}));
vi.mock('@/hooks/useSupervisoryCalculationConfig', () => ({
  useCalculationReadiness: () => ({ isLoading: false, data: { ready: true, reasons: [] } }),
}));

const Register = (await import('@/pages/admin/SupervisoryAssessmentProgrammeRegister')).default;
const Detail = (await import('@/pages/admin/SupervisoryAssessmentProgrammeDetail')).default;
const { AmlNewAssessmentDialog } = await import('@/components/supervision/aml/AmlNewAssessmentDialog');

function mount(node: React.ReactNode, path = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const mountDetail = () => mount(
  <Routes><Route path="/admin/supervisory-assessment-programmes/:programmeSetId" element={<Detail />} /></Routes>,
  `/admin/supervisory-assessment-programmes/${SET}`,
);

afterEach(() => {
  calls.length = 0; editable = true; canCreate = true; manualOverride = true; selectable = true;
  cleanup();
  // Radix locks the body while a dialog is open; clear it between cases.
  document.body.style.pointerEvents = '';
});

describe('PROG-UI register and creation', () => {
  it('PROG-UI-01 asks the server whether a package may be created and for which regulator', async () => {
    mount(<Register />);
    await waitFor(() => expect(
      calls.some((c) => c.fn === 'supervisory_assessment_programme_create_options')).toBe(true));
    expect(await screen.findByRole('button', { name: 'Create programme package' })).toBeTruthy();
  });

  it('PROG-UI-02 shows the server refusal instead of a create control', async () => {
    canCreate = false;
    mount(<Register />);
    await waitFor(() => expect(screen.getByTestId('programme-create-refused')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Create programme package' })).toBeNull();
  });

  it('PROG-UI-03 resolves the sole active regulator and offers no cross-regulator scope', async () => {
    const user = userEvent.setup();
    mount(<Register />);
    await user.click(await screen.findByRole('button', { name: 'Create programme package' }));
    expect(await screen.findByTestId('programme-create-regulator')).toBeTruthy();
    expect(screen.queryByText('All regulators')).toBeNull();
  });

  it('PROG-UI-04 creates a package through the governed operation only', async () => {
    const user = userEvent.setup();
    mount(<Register />);
    await user.click(await screen.findByRole('button', { name: 'Create programme package' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Package code'), 'FSRA-AML-PROGRAMMES');
    await user.type(within(dialog).getByLabelText('Name'), 'FSRA AML/CFT assessment programmes');
    await user.click(within(dialog).getByLabelText('Supervisory domain'));
    await user.click(await screen.findByRole('option', { name: /aml.?cft/i }));
    await user.click(within(dialog).getByRole('button', { name: 'Create package' }));
    await waitFor(() => expect(
      calls.some((c) => c.fn === 'supervisory_assessment_programme_set_create')).toBe(true));
    const payload = calls.find((c) => c.fn === 'supervisory_assessment_programme_set_create')!.args._payload;
    expect(payload.code).toBe('FSRA-AML-PROGRAMMES');
    expect(payload.regulator_id).toBe(REG);
    // Origin and lifecycle status are never sent from the browser.
    expect(payload.origin).toBeUndefined();
    expect(payload.status).toBeUndefined();
  });
});

describe('PROG-UI programme and trigger authoring', () => {
  it('PROG-UI-05 offers authoring only where the server says the package is editable', async () => {
    mountDetail();
    expect(await screen.findByRole('button', { name: 'Add programme' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit details' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit programme' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add trigger' })).toBeTruthy();
  });

  it('PROG-UI-06 hides authoring and states the reason when the server refuses it', async () => {
    editable = false;
    mountDetail();
    await waitFor(() => expect(screen.getByTestId('programme-capability-reason')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Add programme' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit programme' })).toBeNull();
  });

  it('PROG-UI-07 builds the programme form from the server vocabulary only', async () => {
    const user = userEvent.setup();
    mountDetail();
    await user.click(await screen.findByRole('button', { name: 'Add programme' }));
    await user.click(await screen.findByLabelText('Assessment type'));
    expect(await screen.findByRole('option', { name: 'Periodic' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Follow up' })).toBeTruthy();
    // No assessment type outside the server catalogue is offered.
    expect(screen.queryByRole('option', { name: /Initial/i })).toBeNull();
  });

  it('PROG-UI-08 saves a programme through the governed operation with the chosen scope', async () => {
    const user = userEvent.setup();
    mountDetail();
    await user.click(await screen.findByRole('button', { name: 'Edit programme' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Enhanced' }));
    await user.click(screen.getByRole('button', { name: 'Save programme' }));
    await waitFor(() => expect(
      calls.some((c) => c.fn === 'supervisory_assessment_programme_upsert')).toBe(true));
    const payload = calls.find((c) => c.fn === 'supervisory_assessment_programme_upsert')!.args._payload;
    expect(payload.question_class_scope).toEqual(['CORE', 'CONDITIONAL', 'ENHANCED']);
    expect(payload.id).toBe(PROG);
  });

  it('PROG-UI-09 adapts the period fields to the chosen period rule', async () => {
    const user = userEvent.setup();
    mountDetail();
    await user.click(await screen.findByRole('button', { name: 'Add programme' }));
    expect(await screen.findByLabelText('Number of days')).toBeTruthy();
    await user.click(screen.getByLabelText('Period rule'));
    await user.click(await screen.findByRole('option', { name: 'Entered by the officer' }));
    await waitFor(() => expect(screen.queryByLabelText('Number of days')).toBeNull());
    expect(screen.getByTestId('pg-manual-note')).toBeTruthy();
  });

  it('PROG-UI-10 retires a programme with a reason and keeps its history', async () => {
    const user = userEvent.setup();
    mountDetail();
    await user.click(await screen.findByRole('button', { name: 'Retire' }));
    await user.type(screen.getByLabelText('Reason'), 'Superseded by the revised cycle programme.');
    await user.click(screen.getByRole('button', { name: 'Retire programme' }));
    await waitFor(() => expect(
      calls.some((c) => c.fn === 'supervisory_assessment_programme_retire')).toBe(true));
    expect(calls.find((c) => c.fn === 'supervisory_assessment_programme_retire')!.args._programme_id).toBe(PROG);
  });

  it('PROG-UI-11 saves a trigger through the governed operation', async () => {
    const user = userEvent.setup();
    mountDetail();
    await user.click(await screen.findByRole('button', { name: 'Add trigger' }));
    await user.click(await screen.findByLabelText('Trigger'));
    await user.click(await screen.findByRole('option', { name: 'Adverse event' }));
    await user.click(screen.getByRole('button', { name: 'Add trigger' }));
    await waitFor(() => expect(
      calls.some((c) => c.fn === 'supervisory_assessment_programme_trigger_upsert')).toBe(true));
    const c = calls.find((x) => x.fn === 'supervisory_assessment_programme_trigger_upsert')!;
    expect(c.args._programme_id).toBe(PROG);
    expect(c.args._payload.trigger_code).toBe('ADVERSE_EVENT');
  });

  it('PROG-UI-12 shows the server refusal when a trigger cannot be removed', async () => {
    const user = userEvent.setup();
    mountDetail();
    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    await user.type(screen.getByLabelText('Reason'), 'No longer an accepted trigger.');
    await user.click(screen.getByRole('button', { name: 'Remove trigger' }));
    expect(await screen.findByText(/the default trigger cannot be removed/i)).toBeTruthy();
  });
});

describe('PROG-UI governance surfaces', () => {
  it('PROG-UI-13 reports the server validation findings and states that review stays blocked', async () => {
    const user = userEvent.setup();
    mountDetail();
    await user.click(await screen.findByRole('tab', { name: 'Validation' }));
    expect(await screen.findByText('No default trigger is configured.')).toBeTruthy();
    expect(screen.getByText('The review period exceeds two years.')).toBeTruthy();
    expect(screen.getByText('Not ready for review')).toBeTruthy();
  });

  it('PROG-UI-14 shows the exact policy profile binding and the server comparison', async () => {
    const user = userEvent.setup();
    mountDetail();
    await user.click(await screen.findByRole('tab', { name: 'Policy profiles' }));
    expect(await screen.findByText(/FSRA-AML-CFT-POLICY/)).toBeTruthy();
    expect(screen.getByText(/Bound version 1\.0/)).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: 'Compare' }));
    await user.click(screen.getByLabelText('Baseline version'));
    await user.click(await screen.findByRole('option', { name: /0\.9/ }));
    await waitFor(() => expect(
      calls.some((c) => c.fn === 'supervisory_assessment_programme_compare')).toBe(true));
    expect(await screen.findByText(/180 → 365/)).toBeTruthy();
  });

  it('PROG-UI-15 creates a new version with a rationale through the governed operation', async () => {
    const user = userEvent.setup();
    mountDetail();
    await user.click(await screen.findByRole('button', { name: 'New version' }));
    await user.type(screen.getByLabelText('New version number'), '1.1');
    await user.type(screen.getByLabelText('Reason'), 'Annual policy refresh of the assessment programmes.');
    await user.click(screen.getByRole('button', { name: 'Create version' }));
    await waitFor(() => expect(
      calls.some((c) => c.fn === 'supervisory_assessment_programme_set_new_version')).toBe(true));
    expect(calls.find((c) => c.fn === 'supervisory_assessment_programme_set_new_version')!.args._new_version).toBe('1.1');
  });

  it('PROG-UI-16 records a lifecycle decision as a target status with a rationale', async () => {
    const user = userEvent.setup();
    mountDetail();
    await user.click(await screen.findByRole('button', { name: 'Submit for review' }));
    await user.type(screen.getByLabelText('Reason'), 'Ready for supervisory review by the AML lead.');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(
      calls.some((c) => c.fn === 'supervisory_assessment_programme_set_lifecycle')).toBe(true));
    expect(calls.find((c) => c.fn === 'supervisory_assessment_programme_set_lifecycle')!.args._to_status).toBe('REVIEW');
  });
});

describe('PROG-UI runtime convergence', () => {
  it('PROG-UI-17 carries no assessment-type, trigger or 365-day policy in the runtime source', () => {
    const src = readFileSync('src/components/supervision/aml/AmlNewAssessmentDialog.tsx', 'utf8');
    for (const forbidden of ['INITIAL_BASELINE', 'EVENT_DRIVEN', 'isoDaysAgo', '365']) {
      expect(src.includes(forbidden)).toBe(false);
    }
  });

  it('PROG-UI-18 resolves the assessment choices, prior assessment and signal need from the server', async () => {
    const user = userEvent.setup();
    mount(<AmlNewAssessmentDialog entityId={ENTITY} />);
    await user.click(screen.getByRole('button', { name: /New AML\/CFT assessment/i }));
    await waitFor(() => expect(
      calls.some((c) => c.fn === 'supervisory_assessment_programme_options_for_entity')).toBe(true));
    await user.click(await screen.findByLabelText('Assessment'));
    await user.click(await screen.findByRole('option', { name: /Periodic AML\/CFT review/ }));
    expect(await screen.findByTestId('aml-prior-assessment')).toBeTruthy();
    expect(screen.getByTestId('aml-signal-required')).toBeTruthy();
  });

  it('PROG-UI-19 refuses an unselectable programme with the server reason', async () => {
    selectable = false;
    const user = userEvent.setup();
    mount(<AmlNewAssessmentDialog entityId={ENTITY} />);
    await user.click(screen.getByRole('button', { name: /New AML\/CFT assessment/i }));
    await user.click(await screen.findByLabelText('Assessment'));
    const refused = await screen.findByRole('option', { name: /Periodic AML\/CFT review — not available/ });
    expect(refused.getAttribute('aria-disabled')).toBe('true');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(
      (screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true));
  });

  it('PROG-UI-20 does not offer editable dates when the programme fixes the review period', async () => {
    manualOverride = false;
    const user = userEvent.setup();
    mount(<AmlNewAssessmentDialog entityId={ENTITY} />);
    await user.click(screen.getByRole('button', { name: /New AML\/CFT assessment/i }));
    await user.click(await screen.findByLabelText('Assessment'));
    await user.click(await screen.findByRole('option', { name: /Periodic AML\/CFT review/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByText(/The review period is set by the approved programme/)).toBeTruthy());
    expect(screen.queryByLabelText('Review period from')).toBeNull();
  });

  it('PROG-UI-21 creates the assessment through the programmed server operation', async () => {
    const user = userEvent.setup();
    mount(<AmlNewAssessmentDialog entityId={ENTITY} />);
    await user.click(screen.getByRole('button', { name: /New AML\/CFT assessment/i }));
    await user.click(await screen.findByLabelText('Assessment'));
    await user.click(await screen.findByRole('option', { name: /Periodic AML\/CFT review/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    const action = await screen.findByText('Start an AML/CFT risk assessment');
    const dialog = action.closest('[role="dialog"]') as HTMLElement;
    await user.type(within(dialog).getByLabelText(/Scope and summary/), 'Scheduled cycle review of the entity.');
    await user.click(within(dialog).getByRole('button', { name: 'Create assessment' }));
    await waitFor(() => expect(
      calls.some((c) => c.fn === 'supervisory_assessment_create_programmed')).toBe(true));
    expect(calls.find((c) => c.fn === 'supervisory_assessment_create_programmed')!.args._programme_id).toBe(PROG);
  });
});
