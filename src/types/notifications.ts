/**
 * Canonical notification model (FRD NOT-CEN-001, Phase 2).
 *
 * These types mirror `public.notifications`, `public.notification_dispatch_log`
 * and `public.notification_user_event_preferences` after the Phase 2 migration.
 * Legacy fields (`read`, `dismissed_at`) remain populated by the database so
 * older code paths keep working; prefer `status` in new code.
 */

export type NotificationSeverity = 'critical' | 'high' | 'medium' | 'low';
export type NotificationCategory = 'action_required' | 'alert' | 'system' | 'info';
export type NotificationStatus = 'unread' | 'read' | 'actioned' | 'dismissed' | 'archived';
export type NotificationDigestFrequency = 'immediate' | 'hourly' | 'daily';

export type NotificationDeliveryStatus =
  | 'queued'
  | 'processing'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'bounced'
  | 'skipped';

export interface NotificationRecord {
  id: string;
  user_id: string | null;
  recipient_role: string | null;
  recipient_group: string | null;
  title: string;
  message: string;
  preview: string | null;
  severity: NotificationSeverity;
  type: string;
  module: string | null;
  category: NotificationCategory;
  channel: string;
  status: NotificationStatus;
  action_required: boolean;
  system_required: boolean;
  entity_type: string | null;
  entity_id: string | null;
  source_reference: string | null;
  source_route: string | null;
  route_params: Record<string, unknown> | null;
  template_id: string | null;
  template_version: number | null;
  rendered_content_ref: string | null;
  event_key: string | null;
  delivery_status: string | null;
  read: boolean;
  read_at: string | null;
  actioned_at: string | null;
  dismissed_at: string | null;
  dismiss_note: string | null;
  archived_at: string | null;
  created_at: string;
  expires_at: string | null;
  metadata: Record<string, unknown> | null;
  correlation_id: string | null;
  dedupe_key: string | null;
}

export interface NotificationEventPreference {
  id: string;
  user_id: string;
  event_key: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  digest_frequency: NotificationDigestFrequency;
  muted: boolean;
  effective_from: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationDeliveryAttempt {
  id: string;
  notification_id: string | null;
  event_key: string;
  recipient_user_id: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  channel: string;
  provider: string | null;
  status: NotificationDeliveryStatus | string;
  subject: string | null;
  rendered_content: string | null;
  rendered_content_ref: string | null;
  template_id: string | null;
  template_version: number | null;
  queued_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  retry_count: number | null;
  provider_message_id: string | null;
  error: string | null;
  error_details: Record<string, unknown> | null;
  last_attempt_at: string | null;
  dedupe_key: string;
  created_at: string;
}

export const NOTIFICATION_AUDIT_ACTIONS = [
  'NOTIFICATION_CREATED',
  'NOTIFICATION_SENT',
  'NOTIFICATION_DELIVERY_FAILED',
  'NOTIFICATION_READ',
  'NOTIFICATIONS_BULK_MARKED_READ',
  'NOTIFICATION_DISMISSED',
  'NOTIFICATION_ACTIONED',
  'NOTIFICATION_ARCHIVED',
  'NOTIFICATION_FORWARDED',
  'NOTIFICATION_PREFERENCES_UPDATED',
  'NOTIFICATION_RETRIED',
  'NOTIFICATION_RESENT_BY_ADMIN',
] as const;

export type NotificationAuditAction = (typeof NOTIFICATION_AUDIT_ACTIONS)[number];

/** Derives the lifecycle status for records written before Phase 2. */
export function resolveNotificationStatus(
  n: Partial<NotificationRecord> & { read?: boolean },
): NotificationStatus {
  if (n.status) return n.status;
  if (n.archived_at) return 'archived';
  if (n.dismissed_at) return 'dismissed';
  if (n.actioned_at) return 'actioned';
  return n.read ? 'read' : 'unread';
}

/** Short preview with a fallback for legacy rows that have no stored preview. */
export function resolveNotificationPreview(
  n: Partial<NotificationRecord>,
  limit = 160,
): string {
  if (n.preview) return n.preview;
  const flat = String(n.message || '').replace(/\s+/g, ' ').trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
}

/** True when the notification is still visible in the active inbox. */
export function isActiveNotification(n: Partial<NotificationRecord>): boolean {
  const status = resolveNotificationStatus(n);
  if (status === 'dismissed' || status === 'archived') return false;
  if (n.expires_at && new Date(n.expires_at).getTime() <= Date.now()) return false;
  return true;
}
