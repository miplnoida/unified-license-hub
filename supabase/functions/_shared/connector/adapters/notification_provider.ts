/**
 * Push / in-app notification provider used by the notification pipeline.
 */
import { apiKeyHeader, standardParseError } from '../auth.ts';
import { ConnectorAdapter, ConnectorRequest } from '../types.ts';

export type Op = 'send_notification' | 'fetch_status' | 'health';

export const notificationProviderAdapter: ConnectorAdapter<Op> = {
  key: 'notification_provider',
  operations: ['send_notification', 'fetch_status', 'health'],
  authenticate: apiKeyHeader('X-Api-Key'),

  buildRequest(operation, input): ConnectorRequest {
    switch (operation) {
      case 'send_notification':
        return {
          method: 'POST',
          path: 'notifications',
          body: {
            recipients: input.recipients ?? [],
            title: input.title,
            body: input.body,
            severity: input.severity ?? 'medium',
            deep_link: input.deepLink ?? null,
            reference: input.reference ?? null,
          },
        };
      case 'fetch_status':
        return { method: 'GET', path: `notifications/${String(input.notificationId)}` };
      case 'health':
        return { method: 'GET', path: 'health' };
    }
  },

  parseResponse(operation, _status, body) {
    const b = (body ?? {}) as Record<string, unknown>;
    if (operation === 'health') return { healthy: true };
    return {
      notificationId: b.notification_id ?? b.id ?? null,
      status: b.status ?? 'queued',
      deliveredCount: b.delivered === undefined ? null : Number(b.delivered),
      failedCount: b.failed === undefined ? null : Number(b.failed),
    };
  },

  parseError: standardParseError,
  healthRequest: () => ({ method: 'GET', path: 'health' }),
};
