import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

describe('FormRenderer step persistence', () => {
  it('restores and persists the current step from sessionStorage', () => {
    const stepStorageKey = 'registrationFormCurrentStep:test';

    sessionStorage.setItem(stepStorageKey, JSON.stringify({ currentStep: 1, activeGroup: '', activeFormIdx: 0 }));

    const sections = [
      {
        id: 'sec-1',
        title: 'Entity Details',
        sortOrder: 0,
        isRepeatable: false,
        fields: [{ id: 'f-1', fieldName: 'entity_name', label: 'Entity Name', type: 'text', required: false }],
      },
      {
        id: 'sec-2',
        title: 'Review & Submit',
        sortOrder: 1,
        isRepeatable: false,
        fields: [{ id: 'f-2', fieldName: 'mailing_heading', label: 'Mailing Address', type: 'heading', required: false }],
      },
    ];

    render(
      <FormRenderer
        formName="Registration"
        sections={sections as any}
        onSaveDraft={() => {}}
        onSubmit={() => {}}
        stepStorageKey={stepStorageKey}
      />,
    );

    expect(screen.getAllByText('Review & Submit').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Entity Details').length).toBeGreaterThan(0);
    expect(screen.getByText('Mailing Address')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /previous/i }));

    const saved = JSON.parse(sessionStorage.getItem(stepStorageKey) || '{}');
    expect(saved.currentStep).toBe(0);
  });
});