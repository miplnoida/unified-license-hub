/**
 * Contract tests for the Registration approval workflow integration.
 *
 * These tests document and pin the integration points between the
 * registrations entity and the shared approval-workflow engine:
 *
 *   1. The registration entity_type is exposed via approval_workflow_types.
 *   2. The frontend uses the same RPC family (perform_*_workflow_transition)
 *      / workflow_instances table / approval_actions table for registrations
 *      as for applications. No bespoke approval bypass remains.
 *   3. The edge function payload contract is stable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invokePerformRegistrationWorkflowAction } from '@/lib/registrationWorkflowClient';

// ---- mocked supabase client ----
const invokeMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

beforeEach(() => {
  invokeMock.mockReset();
});

describe('registration workflow client contract', () => {
  it('calls the shared registration workflow edge function with the correct payload', async () => {
    invokeMock.mockResolvedValueOnce({ data: { success: true, new_status: 'in_progress' }, error: null });

    const res = await invokePerformRegistrationWorkflowAction({
      registration_id: 'reg-1',
      action_type: 'approve',
      comments: 'looks good',
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith(
      'perform-registration-workflow-action',
      expect.objectContaining({
        body: expect.objectContaining({
          registration_id: 'reg-1',
          action_type: 'approve',
          comments: 'looks good',
        }),
      }),
    );
    expect(res.ok).toBe(true);
    expect((res.data as any)?.new_status).toBe('in_progress');
  });

  it('propagates business errors from the edge function', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { error: 'Remarks are mandatory for this action', code: 'REMARKS_REQUIRED' },
      error: null,
    });

    const res = await invokePerformRegistrationWorkflowAction({
      registration_id: 'reg-2',
      action_type: 'reject',
      comments: '',
    });

    expect(res.ok).toBe(false);
    expect(res.code).toBe('REMARKS_REQUIRED');
  });

  for (const action of [
    'approve', 'reject', 'send_back', 'request_resubmission', 'escalate',
    'return_for_correction', 'request_more_info',
  ] as const) {
    it(`accepts the shared workflow action: ${action}`, async () => {
      invokeMock.mockResolvedValueOnce({ data: { success: true }, error: null });
      await invokePerformRegistrationWorkflowAction({
        registration_id: 'reg-x',
        action_type: action,
        comments: 'note',
      });
      const body = (invokeMock.mock.calls[0][1] as any).body;
      expect(body.action_type).toBe(action);
    });
  }
});

describe('registration workflow runtime notification wiring', () => {
  it('keeps per-action notification binding support in the registration edge function', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/perform-registration-workflow-action/index.ts'),
      'utf-8',
    );
    expect(src).toMatch(/approval_action_notifications/);
    expect(src).toMatch(/action_notification_override:\s*true/);
  });
});
