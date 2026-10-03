/**
 * AML/CFT authority UX — rendered proof, not source text.
 *
 * Two governed behaviours are under test at the UI boundary:
 *
 *  - the officer is never offered a methodology or version choice: the version
 *    the server resolved is shown as read-only confirmation only;
 *  - creation is refused while the server resolution is still in flight,
 *    ambiguous, or finds nothing applicable.
 *
 * These replace the earlier source-fragment assertions, which broke on the
 * AML-03 programme refactor without any behaviour changing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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

const ENTITY = 'cccc1111-2222-3333-4444-555555555555';
const METHODOLOGY = {
  id: 'meth-1',
  code: 'MIPL-AML-CFT-RBA',
  version: '1.0',
  name: 'AML/CFT risk-based methodology',
  status: 'ACTIVE',
  effective_from: '2025-01-01',
};

// The server's resolution outcome for the entity — the only source of the
// methodology version anywhere in this flow.
let resolution: { status: string; methodology: typeof METHODOLOGY | null } = {
  status: 'RESOLVED',
  methodology: METHODOLOGY,
};
let resolving = false;
let perimeter: { allowed: boolean; state: string; reason?: string } = { allowed: true, state: 'PERIMETER_ESTABLISHED' };

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useCan', () => ({ useCan: () => true }));
vi.mock('@/hooks/useAmlSupervision', () => ({
  useAmlPortfolio: () => ({ data: [{ entity_id: ENTITY, entity_name: 'Alpha Trust Ltd' }] }),
}));
vi.mock('@/hooks/useAmlLifecycle', () => ({
  useResolvedAmlMethodology: () => ({ data: resolution, isLoading: resolving }),
}));
vi.mock('@/hooks/useSupervisoryCalculationConfig', () => ({
  useCalculationReadiness: () => ({ isLoading: false, data: { ready: true, reasons: [] } }),
}));
vi.mock('@/hooks/useSupervisoryAssessmentProgrammes', () => ({
  useCreateProgrammedAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAssessmentCreationEligibility: () => ({ isLoading: false, isError: false, data: perimeter }),
  useEntityProgrammeOptions: () => ({
    isLoading: false,
    data: {
      mode: 'CONFIGURED',
      entity_id: ENTITY,
      programmes: [{
        programme_id: 'prog-1',
        programme_code: 'PERIODIC_REVIEW',
        label: 'Periodic AML/CFT review',
        description: null,
        assessment_type: 'PERIODIC',
        guidance: null,
        summary_required: true,
        question_class_scope: ['CORE'],
        requires_prior_assessment: false,
        requires_trigger_signal: false,
        prior_assessment_id: null,
        prior_assessment_reference: null,
        selectable: true,
        reason: null,
        period: {
          period_rule: 'TRAILING_DAYS', period_value: 365, end_offset_days: 1,
          suggested_period_start: '2025-01-02', suggested_period_end: '2026-01-01',
          manual_entry_required: false, allow_manual_override: false,
        },
        triggers: [{ id: 't1', trigger_code: 'SUPERVISORY_CYCLE', label: 'Supervisory cycle', is_default: true, is_active: true }],
      }],
    },
  }),
}));
vi.mock('@/components/supervision/aml/AmlActionDialog', () => ({
  AmlActionDialog: () => null,
}));

const { AmlNewAssessmentDialog } = await import('@/components/supervision/aml/AmlNewAssessmentDialog');

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AmlNewAssessmentDialog entityId={ENTITY} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openPicker() {
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  mount();
  await user.click(await screen.findByRole('button', { name: /new aml\/cft assessment/i }));
  return { user, dialog: await screen.findByRole('dialog') };
}

afterEach(() => {
  resolution = { status: 'RESOLVED', methodology: METHODOLOGY };
  resolving = false;
  perimeter = { allowed: true, state: 'PERIMETER_ESTABLISHED' };
  cleanup();
  document.body.style.pointerEvents = '';
});

describe('AUTHUX-UI the officer is never offered a methodology or version choice', () => {
  it('offers no methodology or version chooser, only the resolved version as confirmation', async () => {
    const { dialog } = await openPicker();
    const choosers = within(dialog).queryAllByRole('combobox');
    for (const c of choosers) {
      const name = (c.getAttribute('aria-label') ?? c.textContent ?? '') +
        ' ' + (dialog.querySelector(`label[for="${c.id}"]`)?.textContent ?? '');
      expect(name).not.toMatch(/methodolog|version/i);
    }
    // The resolved version is disclosed as read-only text, not as an option.
    expect(within(dialog).getByText('MIPL-AML-CFT-RBA v1.0')).toBeTruthy();
    expect(within(dialog).queryAllByRole('option', { name: /v1\.0/ })).toHaveLength(0);
  });
});

describe('AUTHUX-UI creation is blocked unless the server resolved exactly one version', () => {
  it('refuses to continue and explains the ambiguity when more than one version applies', async () => {
    resolution = { status: 'AMBIGUOUS', methodology: null };
    const { dialog } = await openPicker();
    expect(within(dialog).getByText(/ambiguous for this entity/i)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('refuses to continue when no methodology applies to the entity', async () => {
    resolution = { status: 'NONE_APPLICABLE', methodology: null };
    const { dialog } = await openPicker();
    expect(within(dialog).getByText(/no currently effective aml\/cft methodology applies/i)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('refuses to continue while the server resolution is still in flight', async () => {
    resolving = true;
    const { dialog } = await openPicker();
    expect(within(dialog).getByText(/resolving the applicable methodology/i)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('allows continuing once the server resolved a version and a programme is chosen', async () => {
    const { user, dialog } = await openPicker();
    expect(within(dialog).getByRole('button', { name: 'Continue' })).toBeDisabled();
    await user.click(within(dialog).getByLabelText('Assessment'));
    await user.click(await screen.findByRole('option', { name: /periodic aml\/cft review/i }));
    expect(within(dialog).getByRole('button', { name: 'Continue' })).toBeEnabled();
  });
});

describe('AML-CLOSE-02C supervisory perimeter', () => {
  it('offers no way to continue and explains why when applicability is not established', async () => {
    perimeter = { allowed: false, state: 'PERIMETER_NOT_ESTABLISHED',
      reason: 'AML/CFT supervisory applicability has not been established for this entity.' };
    const { dialog } = await openPicker();
    expect(within(dialog).getByTestId('aml-perimeter-refusal').textContent).toMatch(/applicability has not been established/);
    expect(within(dialog).queryByLabelText(/^Assessment$/)).toBeNull();
    expect((within(dialog).getByRole('button', { name: /continue/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
