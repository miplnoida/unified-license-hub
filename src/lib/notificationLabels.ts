/**
 * Human-friendly labels for notification event keys.
 * Keeps raw keys out of the UI for non-technical users.
 */
const LABELS: Record<string, string> = {
  prudential_stress_indicator_triggered: 'Stress indicator triggered',
  prudential_escalation_created: 'Escalation raised',
  prudential_escalation_resolved: 'Escalation resolved',
  prudential_action_assigned: 'Supervisory action assigned',
  prudential_action_overdue: 'Supervisory action overdue',
  prudential_breach_detected: 'Prudential breach detected',
  prudential_assessment_completed: 'Assessment completed',
  prudential_ewi_alert: 'Early-warning alert',
  'sla.breach': 'Deadline breached',
  'sla.warning': 'Deadline approaching',
};

/** Turns an unknown key like `prudential.some_event` into "Some event". */
export function humanizeEventKey(key?: string | null): string {
  if (!key) return 'Notification';
  if (LABELS[key]) return LABELS[key];
  const cleaned = key
    .replace(/^prudential[._]/, '')
    .replace(/[._]/g, ' ')
    .trim();
  if (!cleaned) return 'Notification';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  queued: 'Queued',
  sent: 'Sent',
  delivered: 'Delivered',
  failed: 'Failed',
  suppressed: 'Not sent',
};

export function humanizeStatus(status?: string | null): string {
  if (!status) return '—';
  return STATUS_LABELS[status] ?? humanizeEventKey(status);
}

export function humanizeChannel(channel?: string | null): string {
  if (!channel) return '—';
  if (channel === 'in_app') return 'In-app';
  if (channel === 'email') return 'Email';
  if (channel === 'sms') return 'SMS';
  return humanizeEventKey(channel);
}
