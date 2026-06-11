import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ActionNotificationsEditor } from '@/components/workflows/ActionNotificationsEditor';

const mutateAsync = vi.fn(async (payload?: unknown) => payload);
const mutate = vi.fn();

vi.mock('@/hooks/useActionNotifications', () => ({
  useActionNotifications: vi.fn(() => ({
    data: [],
    isLoading: false,
  })),
  useNotificationTemplates: vi.fn(() => ({
    data: [
      { id: 'tpl-1', name: 'Applicant Approval', event_type: 'application.approved_step', channel: 'email', is_active: true },
      { id: 'tpl-2', name: 'Correction Notice', event_type: 'application.returned_for_correction', channel: 'email', is_active: true },
    ],
  })),
  useUpsertActionNotification: vi.fn(() => ({
    mutateAsync,
    mutate,
    isPending: false,
  })),
  useDeleteActionNotification: vi.fn(() => ({
    mutate: vi.fn(),
  })),
  DEFAULT_EVENT_FOR_ACTION: {
    approve: 'application.approved_step',
    reject: 'application.rejected',
    send_back: 'application.send_back',
    escalate: 'application.escalated',
    request_resubmission: 'application.resubmission_requested',
    return_for_correction: 'application.returned_for_correction',
    request_more_info: 'application.more_info_requested',
  },
  RECIPIENT_LABELS: {
    applicant: 'Applicant',
    current_approver: 'Current Approver',
    previous_actor: 'Previous Step Actor',
    role: 'Users with Role',
    admin: 'Admin Users',
    custom_email: 'Custom Email',
  },
  normalizeRecipientConfig: vi.fn((recipientType: string, recipientConfig: Record<string, unknown> = {}) => {
    if (recipientType === 'role' && typeof recipientConfig.role === 'string') {
      return { role: recipientConfig.role, role_name: recipientConfig.role };
    }
    return recipientConfig ?? {};
  }),
}));

vi.mock('@/hooks/useRoles', () => ({
  useRoles: vi.fn(() => ({
    data: [
      { id: 'role-1', name: 'Insurance Regulator', system_role: 'admin' },
      { id: 'role-2', name: 'Super Admin', system_role: 'super_admin' },
    ],
  })),
}));

describe('ActionNotificationsEditor', () => {
  beforeEach(() => {
    mutateAsync.mockClear();
    mutate.mockClear();
  });

  it('renders per-action accordion panels with a nested notifications section', () => {
    render(
      <ActionNotificationsEditor
        stepId="step-1"
        allowedActions={['approve', 'return_for_correction']}
      />,
    );

    expect(screen.getByText('Action configuration')).toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Return for Correction')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add notification/i })).toBeInTheDocument();
    expect(screen.getByText(/no notification bindings configured for this action/i)).toBeInTheDocument();
  });

  it('opens an add-notification form inside the selected action panel', () => {
    render(
      <ActionNotificationsEditor
        stepId="step-2"
        allowedActions={['approve']}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    fireEvent.click(screen.getByRole('button', { name: /add notification/i }));

    expect(screen.getByText('New notification row')).toBeInTheDocument();
    expect(screen.getByText('Event key')).toBeInTheDocument();
    expect(screen.getByText('Recipient type')).toBeInTheDocument();
    expect(screen.getByText('Template')).toBeInTheDocument();
    expect(screen.getAllByText('Enabled').length).toBeGreaterThan(0);
  });
});