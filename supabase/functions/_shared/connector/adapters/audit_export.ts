/**
 * Audit export API — streams immutable audit records to the external archive.
 */
import { apiKeyHeader, standardParseError } from '../auth.ts';
import { ConnectorAdapter, ConnectorRequest } from '../types.ts';

export type Op = 'export_batch' | 'fetch_batch' | 'health';

export const auditExportAdapter: ConnectorAdapter<Op> = {
  key: 'audit_export',
  operations: ['export_batch', 'fetch_batch', 'health'],
  authenticate: apiKeyHeader('X-Api-Key'),

  buildRequest(operation, input): ConnectorRequest {
    switch (operation) {
      case 'export_batch':
        return {
          method: 'POST',
          path: 'audit/batches',
          body: {
            batch_reference: input.batchReference,
            period_start: input.periodStart ?? null,
            period_end: input.periodEnd ?? null,
            record_count: Array.isArray(input.records) ? input.records.length : 0,
            records: input.records ?? [],
            checksum: input.checksum ?? null,
          },
        };
      case 'fetch_batch':
        return { method: 'GET', path: `audit/batches/${String(input.batchId)}` };
      case 'health':
        return { method: 'GET', path: 'health' };
    }
  },

  parseResponse(operation, _status, body) {
    const b = (body ?? {}) as Record<string, unknown>;
    if (operation === 'health') return { healthy: true };
    return {
      batchId: b.batch_id ?? b.id ?? null,
      status: b.status ?? 'accepted',
      storedCount: b.stored === undefined ? null : Number(b.stored),
      checksumVerified: b.checksum_verified === undefined ? null : Boolean(b.checksum_verified),
    };
  },

  parseError: standardParseError,
  healthRequest: () => ({ method: 'GET', path: 'health' }),
};
