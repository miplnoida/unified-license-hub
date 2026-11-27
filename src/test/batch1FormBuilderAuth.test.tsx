/* eslint-disable @typescript-eslint/no-explicit-any -- loose mocks for page-level tests */
/**
 * Batch 1 closure — Form Builder save/import authorization (current rule:
 * form_management.edit is required to save or import; create alone cannot).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ perms: [] as string[], save: vi.fn(), importProps: null as any }));

vi.mock('@/hooks/useCan', () => ({ useCan: (m: string, a: string) => state.perms.includes(`${m}.${a}`) }));
vi.mock('@/components/layout/DashboardLayout', () => ({ DashboardLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/contexts/RegulatorContext', () => ({ useRegulator: () => ({ activeRegulatorId: 'r1' }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
const q = { data: [], isLoading: false, isFetched: true };
vi.mock('@/hooks/useMasterConfig', () => ({ useSectors: () => q, useSubSectors: () => q, useCategories: () => q, useServices: () => q }));
vi.mock('@/hooks/useReturnsManagement', () => ({ useReturnTypes: () => q }));
vi.mock('@/hooks/useFormTemplates', () => ({
  useFormTemplate: () => ({ data: null, isFetched: true }),
  useLatestVersion: () => ({ data: null, isFetched: true }),
  useFormVersion: () => ({ data: null, isFetched: true }),
  useFormFields: () => ({ data: [], isFetched: true }),
  useFieldConditions: () => ({ data: [], isFetched: true }),
  useSaveFormTemplate: () => ({ mutateAsync: state.save }),
  fieldRowsToSections: () => [],
}));
vi.mock('@/components/form-builder/VersionHistory', () => ({ VersionHistory: () => null }));
vi.mock('@/components/form-builder/FileImport', () => ({
  FileImportDialog: (p: any) => { state.importProps = p; return <button>Import File</button>; },
}));
vi.mock('@/components/form-builder/SectionManager', () => ({ SectionManager: () => null }));
vi.mock('@/components/form-builder/FieldProperties', () => ({ FormBuilderFieldProperties: () => null }));
vi.mock('@/components/form-renderer/FormRenderer', () => ({ FormRenderer: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import FormBuilder from '@/pages/admin/FormBuilder';

const open = () => render(<MemoryRouter initialEntries={['/admin/form-builder']}><FormBuilder /></MemoryRouter>);
const saveBtn = () => screen.getByRole('button', { name: /save form/i });

beforeEach(() => { state.perms = []; state.save = vi.fn().mockResolvedValue({}); state.importProps = null; });

describe('Form Builder save/import authorization', () => {
  it('edit permission: Save enabled and import offered as an edit action', () => {
    state.perms = ['form_management.view', 'form_management.edit'];
    open();
    expect(saveBtn()).not.toBeDisabled();
    expect(state.importProps?.writeAction).toBe('edit');
  });

  it('edit permission: Save runs the save mutation', async () => {
    state.perms = ['form_management.edit'];
    open();
    const name = screen.getAllByRole('textbox')[0];
    fireEvent.change(name, { target: { value: 'Annual Return' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
  });

  it('create-only permission: cannot save or import (backend requires edit)', () => {
    state.perms = ['form_management.view', 'form_management.create'];
    open();
    expect(saveBtn()).toBeDisabled();
    fireEvent.click(saveBtn());
    expect(state.save).not.toHaveBeenCalled();
    expect(state.importProps).toBeNull();
  });

  it('view-only permission: cannot save or import', () => {
    state.perms = ['form_management.view'];
    open();
    expect(saveBtn()).toBeDisabled();
    expect(state.importProps).toBeNull();
    expect(state.save).not.toHaveBeenCalled();
  });
});
