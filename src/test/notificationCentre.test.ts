import { describe, it, expect } from 'vitest';
import { ROUTE_MODULE_MAP } from '@/lib/permissionModules';
import { resolveNotificationStatus, isActiveNotification } from '@/types/notifications';
import { notificationLink } from '@/lib/notificationLinks';
import { SEVERITY_META, URGENT_SEVERITIES } from '@/components/notifications/notificationMeta';

describe('Notification Centre wiring (NOT-CEN-001)', () => {
  it('gates the admin notification history route behind notification_management', () => {
    const entry = ROUTE_MODULE_MAP.find(([path]) => path === '/admin/notification-history');
    expect(entry?.[1]).toBe('notification_management');
  });

  it('treats critical and high as urgent for the bell badge', () => {
    expect(URGENT_SEVERITIES).toEqual(['critical', 'high']);
    expect(SEVERITY_META.critical.label).toBe('Critical');
  });

  it('keeps dismissed and archived notifications out of the active inbox', () => {
    expect(isActiveNotification({ status: 'archived' })).toBe(false);
    expect(isActiveNotification({ status: 'dismissed' })).toBe(false);
    expect(isActiveNotification({ status: 'unread' })).toBe(true);
  });

  it('derives status for legacy rows without a status column', () => {
    expect(resolveNotificationStatus({ read: false })).toBe('unread');
    expect(resolveNotificationStatus({ read: true })).toBe('read');
    expect(resolveNotificationStatus({ actioned_at: '2026-01-01' })).toBe('actioned');
  });

  it('only deep links to trusted source records', () => {
    expect(notificationLink('application', 'a1b2')).toBe('/applications/a1b2');
    expect(notificationLink('unknown_entity', 'a1b2')).toBeNull();
    expect(notificationLink('application', 'bad id/../x')).toBeNull();
    expect(notificationLink(null, null, { link: '/complaints/1' })).toBe('/complaints/1');
  });
});
