/**
 * Functional CRUD coverage for the per-action notifications editor.
 *
 * Verifies the full Admin journey inside Workflow Editor → Step → Action:
 *   1. Open an action panel
 *   2. Add multiple notification rows
 *   3. Edit an existing row
 *   4. Delete a row
 *   5. Toggle enabled/disabled
 *   6. Existing rows render when the workflow is reloaded
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ActionNotificationsEditor } from '@/components/workflows/ActionNotificationsEditor';

const existingRows = [
  {
    id: 'row-1',
    step_id: 'step-9',
    action_type: 'reject' as const,
    event_key: 'application.rejected',
    recipient_type: 'applicant' as const,
    recipient_config: {},
    template_id: 'tpl-1',
    is_enabled: true,
  },
  {
    id: 'row-2',
    step_id: 'step-9',
    action_type: 'reject' as const,
    event_key: 'application.rejected',
    recipient_type: 'current_approver' as const,
    recipient_config: {},
    template_id: 'tpl-2',
    is_enabled: false,
  },
];

const upsertMutateAsync = vi.fn(async (payload?: unknown) => payload);
const upsertMutate = vi.fn();
const deleteMutate = vi.fn();

vi.mock('@/hooks/useActionNotifications', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useActionNotifications')>(
    '@/hooks/useActionNotifications',
  );
  return {
    ...actual,
    useActionNotifications: vi.fn(() => ({ data: existingRows, isLoading: false })),
    useNotificationTemplates: vi.fn(() => ({
      data: [
        { id: 'tpl-1', name: 'Rejection Notice', event_type: 'application.rejected', channel: 'email', is_active: true },
        { id: 'tpl-2', name: 'Reviewer Note', event_type: 'application.rejected', channel: 'email', is_active: true },
      ],
    })),
    useUpsertActionNotification: vi.fn(() => ({ mutateAsync: upsertMutateAsync, mutate: upsertMutate, isPending: false })),
    useDeleteActionNotification: vi.fn(() => ({ mutate: deleteMutate })),
  };
});

vi.mock('@/hooks/useRoles', () => ({
  useRoles: vi.fn(() => ({ data: [{ id: 'role-1', name: 'Reviewer', system_role: 'reviewer' }] })),
}));

describe('ActionNotificationsEditor CRUD flows', () => {
  beforeEach(() => {
    upsertMutateAsync.mockClear();
    upsertMutate.mockClear();
    deleteMutate.mockClear();
  });

  it('loads existing rows for a step on render', () => {
    render(<ActionNotificationsEditor stepId="step-9" allowedActions={['reject']} />);
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    expect(screen.getByText('2 notifications')).toBeInTheDocument();
    expect(screen.getByText('Applicant')).toBeInTheDocument();
    expect(screen.getByText('Current Approver')).toBeInTheDocument();
    expect(screen.getByText('Rejection Notice')).toBeInTheDocument();
    expect(screen.getByText('Reviewer Note')).toBeInTheDocument();
  });

  it('lets admin add another notification row for the same action', async () => {
    render(<ActionNotificationsEditor stepId="step-9" allowedActions={['reject']} />);
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    fireEvent.click(screen.getByRole('button', { name: /add notification/i }));

    expect(screen.getByText('New notification row')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(upsertMutateAsync).toHaveBeenCalledTimes(1);
    const payload = upsertMutateAsync.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.action_type).toBe('reject');
    expect(payload.event_key).toBe('application.rejected');
    expect(payload.id).toBeUndefined();
  });

  it('edits an existing row and saves an update', async () => {
    render(<ActionNotificationsEditor stepId="step-9" allowedActions={['reject']} />);
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    fireEvent.click(editButtons[0]);

    const eventComboboxes = screen.getAllByRole('combobox');
    fireEvent.click(eventComboboxes[0]);
    fireEvent.click(screen.getByText('Application · Generic Workflow Action'));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(upsertMutateAsync).toHaveBeenCalledTimes(1);
    const payload = upsertMutateAsync.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.id).toBe('row-1');
    expect(payload.event_key).toBe('application.workflow_action_taken');
  });

  it('shows an event key selector when adding a notification row', () => {
    render(<ActionNotificationsEditor stepId="step-9" allowedActions={['reject']} />);
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    fireEvent.click(screen.getByRole('button', { name: /add notification/i }));

    const comboboxes = screen.getAllByRole('combobox');
    fireEvent.click(comboboxes[0]);

    expect(screen.getByText('Application · Rejected')).toBeInTheDocument();
    expect(screen.getByText('Application · Generic Workflow Action')).toBeInTheDocument();
  });

  it('deletes a row via the trash button', () => {
    render(<ActionNotificationsEditor stepId="step-9" allowedActions={['reject']} />);
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    const deleteButtons = screen.getAllByLabelText('Delete notification');
    fireEvent.click(deleteButtons[0]);

    expect(deleteMutate).toHaveBeenCalledWith('row-1');
  });

  it('toggles enabled/disabled state inline without entering edit mode', () => {
    render(<ActionNotificationsEditor stepId="step-9" allowedActions={['reject']} />);
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    const enabledLabel = screen.getAllByText('Enabled')[0];
    const row = enabledLabel.closest('.rounded-md');
    expect(row).not.toBeNull();
    const toggle = within(row as HTMLElement).getByRole('switch');
    fireEvent.click(toggle);

    expect(upsertMutate).toHaveBeenCalledTimes(1);
    const payload = upsertMutate.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.id).toBe('row-1');
    expect(payload.is_enabled).toBe(false);
  });
});
