/**
 * External reporting API — submission of regulatory returns and statistics
 * to external consumers (ministry, statistical office, regional bodies).
 */
import { apiKeyHeader, need, standardParseError } from '../auth.ts';
import { ConnectorAdapter, ConnectorRequest } from '../types.ts';

export type Op = 'submit_return' | 'submit_statistics' | 'fetch_submission' | 'health';

export const externalReportingAdapter: ConnectorAdapter<Op> = {
  key: 'external_reporting',
  operations: ['submit_return', 'submit_statistics', 'fetch_submission', 'health'],
  authenticate: apiKeyHeader('X-Api-Key'),

  buildRequest(operation, input): ConnectorRequest {
    switch (operation) {
      case 'submit_return':
        return {
          method: 'POST',
          path: 'submissions/returns',
          body: {
            entity_name: input.entityName,
            licence_number: input.licenceNumber ?? null,
            return_code: input.returnCode,
            period_start: input.periodStart,
            period_end: input.periodEnd,
            payload: input.payload ?? {},
          },
        };
      case 'submit_statistics':
        return {
          method: 'POST',
          path: 'submissions/statistics',
          body: {
            dataset: input.dataset,
            period: input.period,
            rows: input.rows ?? [],
          },
        };
      case 'fetch_submission':
        return { method: 'GET', path: `submissions/${String(input.submissionId)}` };
      case 'health':
        return { method: 'GET', path: 'health' };
    }
  },

  parseResponse(operation, _status, body) {
    const b = (body ?? {}) as Record<string, unknown>;
    if (operation === 'health') return { healthy: true };
    const status = String(need(b.status ?? 'accepted', 'status')).toLowerCase();
    return {
      submissionId: b.submission_id ?? b.id ?? null,
      status, // accepted | rejected | processing
      accepted: status === 'accepted' || status === 'received',
      validationErrors: Array.isArray(b.errors) ? b.errors : [],
      receivedAt: b.received_at ?? new Date().toISOString(),
    };
  },

  parseError: standardParseError,
  healthRequest: () => ({ method: 'GET', path: 'health' }),
};
