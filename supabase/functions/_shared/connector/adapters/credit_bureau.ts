/**
 * Credit bureau — financial standing checks for applicants and directors.
 */
import { apiKeyHeader, standardParseError } from '../auth.ts';
import { ConnectorAdapter, ConnectorRequest } from '../types.ts';

export type Op = 'credit_report' | 'score_only' | 'health';

export const creditBureauAdapter: ConnectorAdapter<Op> = {
  key: 'credit_bureau',
  operations: ['credit_report', 'score_only', 'health'],
  authenticate: apiKeyHeader('X-Bureau-Key'),

  buildRequest(operation, input): ConnectorRequest {
    switch (operation) {
      case 'credit_report':
        return {
          method: 'POST',
          path: 'reports',
          body: {
            subject_type: input.subjectType ?? 'individual',
            full_name: input.fullName,
            national_id: input.nationalId ?? null,
            registration_number: input.registrationNumber ?? null,
            consent_reference: input.consentReference,
          },
        };
      case 'score_only':
        return {
          method: 'POST',
          path: 'scores',
          body: { full_name: input.fullName, national_id: input.nationalId ?? null },
        };
      case 'health':
        return { method: 'GET', path: 'health' };
    }
  },

  parseResponse(operation, _status, body) {
    const b = (body ?? {}) as Record<string, unknown>;
    if (operation === 'health') return { healthy: true };
    return {
      reportId: b.report_id ?? b.id ?? null,
      score: b.score === undefined ? null : Number(b.score),
      scoreBand: b.band ?? null,
      openAccounts: b.open_accounts === undefined ? null : Number(b.open_accounts),
      adverseRecords: Array.isArray(b.adverse) ? b.adverse : [],
      hasAdverse: Array.isArray(b.adverse) ? b.adverse.length > 0 : Boolean(b.has_adverse),
      generatedAt: b.generated_at ?? new Date().toISOString(),
    };
  },

  parseError: standardParseError,
  healthRequest: () => ({ method: 'GET', path: 'health' }),
};
