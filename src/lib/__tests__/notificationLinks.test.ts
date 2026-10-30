import { describe, it, expect } from 'vitest';
import { audienceSafeNotificationLink, displayNotificationMessage } from '../notificationLinks';

describe('audienceSafeNotificationLink', () => {
  it('sends external users from admin registration links to Registration Status', () => {
    expect(audienceSafeNotificationLink('/admin/registrations/abc', false)).toBe('/registration-status');
  });
  it('drops other admin links for external users', () => {
    expect(audienceSafeNotificationLink('/admin/forms/1', false)).toBeNull();
  });
  it('keeps application links for external users and admin links for staff', () => {
    expect(audienceSafeNotificationLink('/applications/x', false)).toBe('/applications/x');
    expect(audienceSafeNotificationLink('/admin/registrations/abc', true)).toBe('/admin/registrations/abc');
  });
  it('fills blank outcome', () => {
    expect(displayNotificationMessage('Outcome: .')).toBe('Outcome: see the decision letter.');
  });
});
