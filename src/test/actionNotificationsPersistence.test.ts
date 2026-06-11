import { describe, expect, it } from 'vitest';
import {
  buildActionNotificationPayload,
  DEFAULT_EVENT_FOR_ACTION,
} from '@/hooks/useActionNotifications';

describe('action notification persistence contract', () => {
  it('builds a new row payload without relying on a conflict key that blocks multiple bindings', () => {
    const payload = buildActionNotificationPayload('step-1', {
      action_type: 'reject',
      event_key: DEFAULT_EVENT_FOR_ACTION.reject,
      recipient_type: 'applicant',
      template_id: 'tpl-1',
      is_enabled: true,
    });

    expect(payload).toEqual({
      step_id: 'step-1',
      action_type: 'reject',
      event_key: 'application.rejected',
      recipient_type: 'applicant',
      recipient_config: {},
      template_id: 'tpl-1',
      is_enabled: true,
    });
  });

  it('preserves distinct recipient config so multiple bindings can coexist for one action', () => {
    const applicantPayload = buildActionNotificationPayload('step-2', {
      action_type: 'return_for_correction',
      event_key: 'application.returned_for_correction',
      recipient_type: 'applicant',
      template_id: 'tpl-applicant',
      is_enabled: true,
    });

    const approverPayload = buildActionNotificationPayload('step-2', {
      action_type: 'return_for_correction',
      event_key: 'application.returned_for_correction',
      recipient_type: 'current_approver',
      template_id: 'tpl-approver',
      is_enabled: true,
    });

    expect(applicantPayload).not.toEqual(approverPayload);
    expect(applicantPayload.recipient_type).toBe('applicant');
    expect(approverPayload.recipient_type).toBe('current_approver');
  });

  it('requires recipient details for role and custom email rows', () => {
    expect(() => buildActionNotificationPayload('step-3', {
      action_type: 'reject',
      event_key: 'application.rejected',
      recipient_type: 'role',
      template_id: 'tpl-role',
      is_enabled: true,
    })).toThrow(/role selection/i);

    expect(() => buildActionNotificationPayload('step-3', {
      action_type: 'reject',
      event_key: 'application.rejected',
      recipient_type: 'custom_email',
      template_id: 'tpl-mail',
      is_enabled: true,
    })).toThrow(/email address/i);
  });

  it('normalizes role and email recipient details before save', () => {
    const rolePayload = buildActionNotificationPayload('step-4', {
      action_type: 'approve',
      event_key: 'application.approved_step',
      recipient_type: 'role',
      recipient_config: { role_name: ' Senior Reviewer ' },
      template_id: 'tpl-role',
      is_enabled: false,
    });

    const emailPayload = buildActionNotificationPayload('step-4', {
      action_type: 'approve',
      event_key: 'application.approved_step',
      recipient_type: 'custom_email',
      recipient_config: { email: 'TEAM@EXAMPLE.COM ' },
      template_id: 'tpl-email',
      is_enabled: true,
    });

    expect(rolePayload.recipient_config).toEqual({ role: 'Senior Reviewer', role_name: 'Senior Reviewer' });
    expect(emailPayload.recipient_config).toEqual({ email: 'team@example.com' });
  });
});