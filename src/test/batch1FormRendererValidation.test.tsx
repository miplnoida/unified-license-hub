import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: (...a: unknown[]) => toastError(...a), success: vi.fn(), info: vi.fn(), warning: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));

const f = (id: string, fieldName: string, label: string, type: string, extra: Record<string, unknown> = {}) => ({ id, fieldName, label, type, required: false, ...extra });

function renderForm(fields: Array<Record<string, unknown>>, initialData: Record<string, unknown> = {}) {
  const onSubmit = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <FormRenderer formName="QA" sections={[{ id: 's1', title: 'Details', sortOrder: 0, isRepeatable: false, fields }] as unknown as Parameters<typeof FormRenderer>[0]["sections"]}
        initialData={initialData} onSaveDraft={() => {}} onSubmit={onSubmit} />
    </QueryClientProvider>,
  );
  return { onSubmit, submit: () => fireEvent.click(screen.getByRole('button', { name: /submit/i })) };
}

beforeEach(() => toastError.mockReset());

describe('FormRenderer validation (Batch 1 Form Builder)', () => {
  it('blocks submission when a required field is empty', () => {
    const { onSubmit, submit } = renderForm([f('a', 'entity_name', 'Entity Name', 'text', { required: true })]);
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(toastError.mock.calls[0][1].description).toBe('Entity Name is required');
  });

  it('submits once the required field is filled', () => {
    const { onSubmit, submit } = renderForm([f('a', 'entity_name', 'Entity Name', 'text', { required: true })], { entity_name: 'Harbour Ltd' });
    submit();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ entity_name: 'Harbour Ltd' }));
  });

  it('hides a show-when field until its condition is met, and skips its required check while hidden', () => {
    const fields = [
      f('a', 'has_agent', 'Has Agent', 'text'),
      f('b', 'agent_name', 'Agent Name', 'text', { required: true, conditionalLogic: [{ fieldId: 'a', operator: 'equals', value: 'yes', action: 'show' }] }),
    ];
    const { onSubmit, submit } = renderForm(fields, { has_agent: 'no' });
    expect(screen.queryByText('Agent Name')).toBeNull();
    submit();
    expect(onSubmit).toHaveBeenCalled();
  });

  it('shows the conditional field and enforces it when the condition is met', () => {
    const fields = [
      f('a', 'has_agent', 'Has Agent', 'text'),
      f('b', 'agent_name', 'Agent Name', 'text', { required: true, conditionalLogic: [{ fieldId: 'a', operator: 'equals', value: 'yes', action: 'show' }] }),
    ];
    const { onSubmit, submit } = renderForm(fields, { has_agent: 'yes' });
    expect(screen.getByText('Agent Name')).toBeInTheDocument();
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(toastError.mock.calls[0][1].description).toBe('Agent Name is required');
  });

  it('makes a dependent field required via a require rule', () => {
    const fields = [
      f('a', 'turnover', 'Turnover', 'number'),
      f('b', 'audit_firm', 'Audit Firm', 'text', { conditionalLogic: [{ fieldId: 'a', operator: 'greater_than', value: '1000', action: 'require' }] }),
    ];
    const big = renderForm(fields, { turnover: 5000 });
    big.submit();
    expect(big.onSubmit).not.toHaveBeenCalled();
    expect(toastError.mock.calls[0][1].description).toBe('Audit Firm is required');
  });

  it('does not require the dependent field when the condition is not met', () => {
    const fields = [
      f('a', 'turnover', 'Turnover', 'number'),
      f('b', 'audit_firm', 'Audit Firm', 'text', { conditionalLogic: [{ fieldId: 'a', operator: 'greater_than', value: '1000', action: 'require' }] }),
    ];
    const small = renderForm(fields, { turnover: 500 });
    small.submit();
    expect(small.onSubmit).toHaveBeenCalled();
  });

  it.each([
    ['email', 'not-an-email', 'Invalid email address'],
    ['phone', 'abc', 'Invalid phone number'],
  ])('rejects an invalid %s value', (type, value, message) => {
    const { onSubmit, submit } = renderForm([f('a', 'contact', 'Contact', type)], { contact: value });
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(toastError.mock.calls[0][1].description).toBe(message);
  });

  it('enforces min/max and length rules', () => {
    const r1 = renderForm([f('a', 'staff', 'Staff', 'number', { validation: { min: 1, max: 10 } })], { staff: 50 });
    r1.submit();
    expect(r1.onSubmit).not.toHaveBeenCalled();
    expect(toastError.mock.calls[0][1].description).toBe('Maximum value is 10');
  });

  it('renders imported fields with row layout metadata and submits their values', () => {
    const imported = [
      f('i1', 'capital', 'Paid-up Capital', 'number', { required: true, layout: { row: 0, col: 0, width: 6 } }),
      f('i2', 'reserves', 'Reserves', 'number', { layout: { row: 0, col: 1, width: 6 } }),
    ];
    const { onSubmit, submit } = renderForm(imported, { capital: 250000, reserves: 1000 });
    expect(screen.getByText('Paid-up Capital')).toBeInTheDocument();
    expect(screen.getByText('Reserves')).toBeInTheDocument();
    submit();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ capital: 250000, reserves: 1000 }));
  });

  it('keeps legacy fields without conditional logic or validation working', () => {
    const { onSubmit, submit } = renderForm([f('l1', 'legacy_note', 'Legacy Note', 'textarea')], { legacy_note: 'Carried forward' });
    expect(screen.getByText('Legacy Note')).toBeInTheDocument();
    submit();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ legacy_note: 'Carried forward' }));
  });
});
