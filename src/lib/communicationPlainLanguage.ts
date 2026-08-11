/**
 * Plain-language presentation for outbound communications.
 *
 * The delivery pipeline records engineering-grade state (`SENT_TO_PROVIDER`,
 * `DEAD_LETTER`, provider ids, template versions, raw SMTP errors). Case
 * officers only need to know what was sent, to whom, and whether it arrived —
 * so these helpers map the canonical states and failure categories to business
 * wording. The technical values stay available behind a "Details" toggle.
 */

/** Business wording for a canonical communication state. Never claims delivery for provider acceptance. */
export function plainStateLabel(state: string | null | undefined): string {
  switch (String(state ?? '').toUpperCase()) {
    case 'DELIVERED':
      return 'Delivered';
    case 'SENT_TO_PROVIDER':
      return 'Sent, awaiting confirmation';
    case 'QUEUED':
      return 'Waiting to be sent';
    case 'RETRYING':
      return 'Retrying';
    case 'FAILED':
      return 'Could not be delivered';
    case 'DEAD_LETTER':
      return 'Could not be delivered after retries';
    case 'PROVIDER_NOT_CONFIGURED':
      return 'Not sent — channel not set up';
    case 'SUPPRESSED':
      return 'Not sent — recipient opted out';
    default:
      return String(state ?? '')
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/^\w/, (c) => c.toUpperCase()) || 'Unknown';
  }
}

/** Short explanation shown under the status chip. */
export function plainStateHint(state: string | null | undefined): string | null {
  switch (String(state ?? '').toUpperCase()) {
    case 'SENT_TO_PROVIDER':
      return 'Handed to the email/SMS provider; delivery not yet confirmed.';
    case 'QUEUED':
      return 'Queued for sending.';
    case 'RETRYING':
      return 'The first attempt did not go through; the system is trying again.';
    case 'DEAD_LETTER':
      return 'All automatic attempts have been used. Contact the recipient another way.';
    case 'PROVIDER_NOT_CONFIGURED':
      return 'The sending channel is not configured, so nothing left the system.';
    case 'SUPPRESSED':
      return 'The recipient is on the do-not-contact list for this channel.';
    default:
      return null;
  }
}

/** Business reason for a technical failure category / error string. */
export function plainFailureReason(
  failureCategory: string | null | undefined,
  error: string | null | undefined,
): string | null {
  const cat = String(failureCategory ?? '').toLowerCase();
  const err = String(error ?? '').toLowerCase();
  const has = (needle: string) => cat.includes(needle) || err.includes(needle);

  if (has('invalid_recipient') || has('invalid address') || has('no recipient') || has('missing_email')) {
    return 'The recipient address on file is missing or not valid.';
  }
  if (has('bounce') || has('rejected') || has('550') || has('mailbox')) {
    return 'The recipient’s mail server rejected the message.';
  }
  if (has('suppress') || has('unsubscrib') || has('opt')) {
    return 'The recipient has opted out of this type of message.';
  }
  if (has('rate') || has('quota') || has('429') || has('throttl')) {
    return 'The sending service was temporarily busy.';
  }
  if (has('timeout') || has('network') || has('connection') || has('econn')) {
    return 'The sending service could not be reached.';
  }
  if (has('auth') || has('credential') || has('401') || has('403') || has('api key')) {
    return 'The sending service refused the request — check the channel setup.';
  }
  if (has('template') || has('render')) {
    return 'The message template could not be prepared.';
  }
  if (cat || err) return 'The message could not be sent. Technical details are available below.';
  return null;
}

export function plainChannelLabel(channel: string | null | undefined): string {
  switch (String(channel ?? '').toLowerCase()) {
    case 'email':
      return 'Email';
    case 'sms':
      return 'SMS';
    case 'in_app':
    case 'inapp':
      return 'In-app message';
    case 'push':
      return 'Push notification';
    case 'letter':
    case 'post':
      return 'Letter';
    default:
      return String(channel ?? '—').replace(/_/g, ' ');
  }
}

export function plainDirectionLabel(direction: string | null | undefined): string {
  const d = String(direction ?? '').toLowerCase();
  if (d === 'outbound') return 'Sent by the regulator';
  if (d === 'inbound') return 'Received';
  return d.replace(/_/g, ' ') || '—';
}

/** Readable subject line when only an internal event key exists. */
export function plainSubject(subject: string | null | undefined, eventKey: string | null | undefined): string {
  if (subject && subject.trim()) return subject.trim();
  const key = String(eventKey ?? '').trim();
  if (!key) return 'Notification';
  const cleaned = key
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
