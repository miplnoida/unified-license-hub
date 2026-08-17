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

const STATUS_DESCRIPTIONS: Record<string, string> = {
  pending: 'Waiting in the queue to be sent.',
  queued: 'Accepted and waiting to be sent.',
  sent: 'Handed over to the delivery provider.',
  delivered: 'Confirmed as delivered to the recipient.',
  failed: 'Could not be delivered.',
  suppressed: 'Deliberately not sent (recipient preferences or duplicate).',
};

/** One-line, plain-English explanation of what a status means. */
export function describeStatus(status?: string | null): string | null {
  if (!status) return null;
  return STATUS_DESCRIPTIONS[status] ?? null;
}

/** Turns a raw delivery error into a plain-English reason where possible. */
export function humanizeFailureReason(row?: {
  error?: string | null;
  failure_category?: string | null;
  communication_state?: string | null;
} | null): string | null {
  if (!row) return null;
  const raw = `${row.error ?? ''} ${row.failure_category ?? ''}`.toLowerCase();
  if (row.communication_state === 'PROVIDER_NOT_CONFIGURED')
    return 'The email/SMS provider is not set up yet, so this message could not leave the system.';
  if (raw.includes('invalid') && raw.includes('email')) return 'The recipient email address is not valid.';
  if (raw.includes('no recipient') || raw.includes('missing recipient'))
    return 'No contact details were available for the recipient.';
  if (raw.includes('bounce')) return 'The recipient mail server rejected the message.';
  if (raw.includes('timeout') || raw.includes('timed out'))
    return 'The delivery provider did not respond in time. It will be retried.';
  if (raw.includes('rate limit')) return 'The delivery provider temporarily limited sending. It will be retried.';
  if (raw.includes('template')) return 'The message template could not be prepared.';
  if (raw.includes('unauthor') || raw.includes('forbidden') || raw.includes('401') || raw.includes('403'))
    return 'The delivery provider rejected our credentials.';
  return row.error ? 'Delivery failed. Technical details are available below.' : null;
}
