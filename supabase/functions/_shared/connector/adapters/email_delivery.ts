/**
 * Email delivery. Production-real: the platform's own SMTP relay is reached
 * through the existing notification dispatcher, so this adapter covers the
 * HTTP delivery API path and the health probe only.
 */
import { bearer, standardParseError } from '../auth.ts';
import { ConnectorAdapter, ConnectorRequest } from '../types.ts';

export type Op = 'send_email' | 'fetch_status' | 'health';

export const emailDeliveryAdapter: ConnectorAdapter<Op> = {
  key: 'email_smtp',
  operations: ['send_email', 'fetch_status', 'health'],
  authenticate: bearer,

  buildRequest(operation, input): ConnectorRequest {
    switch (operation) {
      case 'send_email':
        return {
          method: 'POST',
          path: 'messages',
          body: {
            to: input.to,
            subject: input.subject,
            html: input.html ?? null,
            text: input.text ?? null,
            reference: input.reference ?? null,
          },
        };
      case 'fetch_status':
        return { method: 'GET', path: `messages/${String(input.messageId)}` };
      case 'health':
        return { method: 'GET', path: 'health' };
    }
  },

  parseResponse(operation, _status, body) {
    const b = (body ?? {}) as Record<string, unknown>;
    if (operation === 'health') return { healthy: true };
    return {
      messageId: b.message_id ?? b.id ?? null,
      status: b.status ?? 'queued',
      accepted: Array.isArray(b.accepted) ? b.accepted : [],
      rejected: Array.isArray(b.rejected) ? b.rejected : [],
    };
  },

  parseError: standardParseError,
  healthRequest: () => ({ method: 'GET', path: 'health' }),
};
