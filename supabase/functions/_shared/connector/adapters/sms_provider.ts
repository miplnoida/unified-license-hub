/**
 * SMS provider. Framework-ready and disabled until a provider is configured;
 * the notification pipeline reports SMS as unavailable while that holds.
 */
import { bearer, standardParseError } from '../auth.ts';
import { ConnectorAdapter, ConnectorRequest } from '../types.ts';

export type Op = 'send_sms' | 'fetch_status' | 'health';

export const smsProviderAdapter: ConnectorAdapter<Op> = {
  key: 'sms_provider',
  operations: ['send_sms', 'fetch_status', 'health'],
  authenticate: bearer,

  buildRequest(operation, input): ConnectorRequest {
    switch (operation) {
      case 'send_sms':
        return {
          method: 'POST',
          path: 'messages',
          body: {
            to: input.to,
            message: input.message,
            sender: input.sender ?? null,
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
      segments: b.segments === undefined ? null : Number(b.segments),
    };
  },

  parseError: standardParseError,
  healthRequest: () => ({ method: 'GET', path: 'health' }),
};
