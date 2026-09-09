/**
 * METH-STUDIO-UI-01…06 — Supervisory Methodology Studio authoring surface.
 *
 * The screen never decides authority: whether an authoring control exists is
 * driven only by `supervisory_methodology_studio_capabilities`, and every write
 * must reach a governed `supervisory_methodology_*` operation.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

const FIX = JSON.parse(readFileSync('src/test/fixtures/methodologyReadModels.json', 'utf8'));
const METH = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const calls: Array<{ fn: string; args: any }> = [];
let authoring = true;

/**
 * A genuine structural error blocks the lifecycle; an unapproved materiality
 * value is a later policy decision and stays advisory.
 */
const VALIDATION = {
  methodology_id: METH,
  status: 'DRAFT',
  origin: 'REGULATOR_ADOPTED',
  generated_at: new Date().toISOString(),
  blocking_count: 1,
  advisory_count: 2,
  findings: [
    { code: 'QUESTION_WITHOUT_SEMANTICS', severity: 'BLOCKING', object: 'QUESTION', subject: 'Q_TEST_01', count: 1,
      message: '1 question has no response-semantic profile.' },
    { code: 'PARAMETER_UNAPPROVED', severity: 'ADVISORY', object: 'PARAMETER', subject: null, count: 8,
      message: '8 parameter(s) are not approved supervisory policy values.' },
    { code: 'FACT_DEFINITION_INCOMPLETE', severity: 'ADVISORY', object: 'FACT', subject: null, count: 87,
      message: '87 fact requirement(s) have incomplete attribute definitions.' },
  ],
  note: 'Blocking findings refuse submission for review and approval.',
};

function capability(allowed: boolean) {
  return {
    allowed,
    reason: allowed ? null : 'A MIPL reference template may only be authored by a platform administrator.',
  };
}

function respond(fn: string) {
  switch (fn) {
    case 'supervisory_methodology_dimension_list': return FIX.dimensions;
    case 'supervisory_methodology_question_register': return FIX.questions;
    case 'supervisory_methodology_question_detail': return FIX.question_detail;
    case 'supervisory_methodology_validate': return VALIDATION;
    case 'supervisory_methodology_action_capabilities': return FIX.capabilities;
    case 'supervisory_methodology_studio_capabilities':
      return {
        ...FIX.capabilities,
        can_author: capability(authoring),
        can_author_questions: capability(authoring),
        can_author_dimensions: capability(authoring),
        can_author_semantics: capability(authoring),
        can_author_facts: capability(authoring),
        can_author_parameters: capability(authoring),
        can_author_reference_decisions: capability(authoring),
        can_edit_metadata: capability(authoring),
        requires_retirement_rationale: true,
      };
    case 'supervisory_methodology_question_save': return METH;
    case 'supervisory_methodology_question_retire': return METH;
    case 'supervisory_methodology_dimension_save': return METH;
    case 'supervisory_methodology_dimension_retire': return 'REFUSE';
    case 'supervisory_methodology_metadata_save': return METH;
    default: return null;
  }
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: any) => {
      calls.push({ fn, args });
      const data = respond(fn);
      // The server refuses some operations; the screen must show its wording.
      if (data === 'REFUSE') {
        return Promise.resolve({
          data: null,
          error: { message: '6 active question(s) still belong to this dimension' },
        });
      }
      return Promise.resolve({ data, error: null });
    },
    from: () => {
      throw new Error('METH-STUDIO: the studio must not read or write tables directly');
    },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { QuestionsTab } = await import('@/components/admin/supervisory-methodology/tabs/QuestionsTab');
const { ValidationTab } = await import('@/components/admin/supervisory-methodology/tabs/ValidationTab');

function mount(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>);
}

afterEach(() => { calls.length = 0; authoring = true; cleanup(); });

describe('METH-STUDIO-UI authoring surface', () => {
  it('METH-STUDIO-UI-01 asks the server which authoring actions are permitted', async () => {
    mount(<QuestionsTab methodologyId={METH} />);
    await waitFor(() => expect(calls.some((c) => c.fn === 'supervisory_methodology_studio_capabilities')).toBe(true));
    expect(calls.find((c) => c.fn === 'supervisory_methodology_studio_capabilities')?.args._methodology_id).toBe(METH);
  });

  it('METH-STUDIO-UI-02 offers authoring only when the server allows it', async () => {
    mount(<QuestionsTab methodologyId={METH} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add question' })).toBeTruthy());
  });

  it('METH-STUDIO-UI-03 shows the server refusal instead of an authoring control', async () => {
    authoring = false;
    mount(<QuestionsTab methodologyId={METH} />);
    await waitFor(() => expect(
      screen.getByText(/may only be authored by a platform administrator/i)).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Add question' })).toBeNull();
  });

  it('METH-STUDIO-UI-04 saves a new question through the governed operation', async () => {
    const user = userEvent.setup();
    mount(<QuestionsTab methodologyId={METH} />);
    await user.click(await screen.findByRole('button', { name: 'Add question' }));

    await user.type(screen.getByLabelText('Question code'), 'TEST_Q_01');
    await user.type(screen.getByLabelText('Prompt'), 'Does the entity maintain a documented risk appetite?');
    await user.click(screen.getAllByRole('button', { name: 'Add question' }).at(-1)!);

    await waitFor(() => expect(calls.some((c) => c.fn === 'supervisory_methodology_question_save')).toBe(true));
    const args = calls.find((c) => c.fn === 'supervisory_methodology_question_save')!.args;
    expect(args._methodology_id).toBe(METH);
    expect(args._payload.question_code).toBe('TEST_Q_01');
    expect(args._payload.dimension_code).toBeTruthy();
  });

  it('METH-STUDIO-UI-05 renders validation findings from the server only', async () => {
    mount(<ValidationTab methodologyId={METH} />);
    await waitFor(() => expect(screen.getByText('1 errors')).toBeTruthy());
    expect(screen.getByText(VALIDATION.findings[0].message)).toBeTruthy();
    expect(screen.getByText(VALIDATION.findings[1].message)).toBeTruthy();
  });

  it('METH-STUDIO-UI-06 separates errors from warnings and information', async () => {
    mount(<ValidationTab methodologyId={METH} />);
    await waitFor(() => expect(screen.getByText('Errors')).toBeTruthy());
    expect(screen.getByText('Warnings')).toBeTruthy();
    expect(screen.getByText(/regulator policy decision/i)).toBeTruthy();
  });

  it('METH-STUDIO-UI-07 offers governed dimension authoring', async () => {
    mount(<QuestionsTab methodologyId={METH} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add dimension' })).toBeTruthy());
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBeGreaterThan(0);
    expect(calls.some((c) => c.fn === 'supervisory_methodology_dimension_list')).toBe(true);
  });

  it('METH-STUDIO-UI-08 keeps dimension controls read only when the server refuses', async () => {
    authoring = false;
    mount(<QuestionsTab methodologyId={METH} />);
    await waitFor(() => expect(screen.getByText(/Create a new version to make changes/i)).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Add dimension' })).toBeNull();
  });

  it('METH-STUDIO-UI-09 persists a new display order through the governed operation', async () => {
    const user = userEvent.setup();
    mount(<QuestionsTab methodologyId={METH} />);
    const down = await screen.findByRole('button', { name: /Move CUSTOMER_RISK down/i });
    await user.click(down);
    await waitFor(() => expect(calls.some((c) => c.fn === 'supervisory_methodology_dimension_save')).toBe(true));
    const saved = calls.filter((c) => c.fn === 'supervisory_methodology_dimension_save');
    expect(saved.length).toBe(2);
    expect(saved[0].args._payload.sort_order).toBe(20);
  });

  it('METH-STUDIO-UI-10 shows the server reason when retirement is refused', async () => {
    const user = userEvent.setup();
    mount(<QuestionsTab methodologyId={METH} />);
    await user.click((await screen.findAllByRole('button', { name: 'Retire' }))[0]);
    await user.type(screen.getByLabelText(/Reason/i), 'Superseded by the revised control dimension set');
    await user.click(screen.getByRole('button', { name: 'Retire dimension' }));
    await waitFor(() => expect(
      screen.getByText(/active question\(s\) still belong to this dimension/i)).toBeTruthy());
  });

  it('METH-STUDIO-UI-11 offers metadata editing only on the server capability', async () => {
    mount(<MethodologyMetadataAction detail={{ ...FIX.detail, id: METH }} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Edit details/i })).toBeTruthy());
    expect(screen.getByRole('button', { name: /Edit details/i }).getAttribute('disabled')).toBeNull();
  });

  it('METH-STUDIO-UI-12 keeps Edit details visible but refused with the server reason', async () => {
    authoring = false;
    mount(<MethodologyMetadataAction detail={{ ...FIX.detail, id: METH }} />);
    const button = await screen.findByRole('button', { name: /Edit details/i });
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });

  it('METH-STUDIO-UI-13 refuses Submit for Review while blocking errors exist', async () => {
    mount(
      <MethodologyActionBar
        methodology={{ ...FIX.detail, id: METH } as any}
        capabilities={{ ...FIX.capabilities, can_submit_review: { allowed: true, reason: null } } as any}
        isLoading={false}
      />,
    );
    await waitFor(() => expect(screen.getByText(/Validation: 1 error/i)).toBeTruthy());
    const submit = screen.getByRole('button', { name: /Submit for Review/i });
    expect(submit.getAttribute('aria-disabled')).toBe('true');
  });

  it('METH-STUDIO-UI-14 refuses Approve while blocking errors exist', async () => {
    mount(
      <MethodologyActionBar
        methodology={{ ...FIX.detail, id: METH } as any}
        capabilities={{ ...FIX.capabilities, can_approve: { allowed: true, reason: null } } as any}
        isLoading={false}
      />,
    );
    const approve = await screen.findByRole('button', { name: /Approve Methodology/i });
    await waitFor(() => expect(approve.getAttribute('aria-disabled')).toBe('true'));
  });
});
