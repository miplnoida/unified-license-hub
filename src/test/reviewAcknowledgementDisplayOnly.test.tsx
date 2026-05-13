import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReviewAcknowledgement } from '@/components/applications/ReviewAcknowledgement';

describe('ReviewAcknowledgement display-only fields', () => {
  it('renders heading fields without showing Not provided', () => {
    render(
      <ReviewAcknowledgement
        mode="readonly"
        onAcknowledge={() => {}}
        sections={[
          {
            title: 'Registration',
            fields: [
              {
                label: 'Physical Address',
                value: '',
                type: 'display',
                displayKind: 'heading',
              },
              {
                label: 'Company Name',
                value: '',
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText('Physical Address')).toBeInTheDocument();
    expect(screen.getByText('Company Name')).toBeInTheDocument();
    expect(screen.getAllByText('Not provided')).toHaveLength(1);
  });

  it('falls back to placeholder text for display-only headings', () => {
    render(
      <ReviewAcknowledgement
        mode="readonly"
        onAcknowledge={() => {}}
        sections={[
          {
            title: 'Registration',
            fields: [
              {
                label: '',
                placeholder: 'Mailing Address',
                value: '',
                type: 'display',
                displayKind: 'heading',
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText('Mailing Address')).toBeInTheDocument();
    expect(screen.queryByText('Not provided')).not.toBeInTheDocument();
  });
});