/**
 * Sanctions / PEP / watchlist screening.
 */
import { bearer, need, standardParseError } from '../auth.ts';
import { ConnectorAdapter, ConnectorRequest } from '../types.ts';

export type Op = 'screen' | 'fetch_result' | 'health';

export const sanctionsScreeningAdapter: ConnectorAdapter<Op> = {
  key: 'sanctions_screening',
  operations: ['screen', 'fetch_result', 'health'],
  authenticate: bearer,

  buildRequest(operation, input): ConnectorRequest {
    switch (operation) {
      case 'screen':
        return {
          method: 'POST',
          path: 'sanctions/search',
          body: {
            name: input.name,
            type: input.subjectType ?? 'individual',
            date_of_birth: input.dateOfBirth ?? null,
            country: input.country ?? null,
            lists: input.lists ?? ['UN', 'OFAC', 'EU', 'UK_HMT'],
            threshold: input.threshold ?? 0.85,
          },
        };
      case 'fetch_result':
        return { method: 'GET', path: `sanctions/${String(input.searchId)}` };
      case 'health':
        return { method: 'GET', path: 'health' };
    }
  },

  parseResponse(operation, _status, body) {
    const b = (body ?? {}) as Record<string, unknown>;
    if (operation === 'health') return { healthy: true };
    const hits = Array.isArray(b.results ?? b.hits) ? (b.results ?? b.hits) as unknown[] : [];
    return {
      searchId: need(b.search_id ?? b.id ?? 'unknown', 'search_id'),
      hitCount: hits.length,
      isPep: Boolean(b.pep ?? false),
      isSanctioned: hits.length > 0,
      listsMatched: Array.isArray(b.lists_matched) ? b.lists_matched : [],
      hits: hits.slice(0, 50),
      screenedAt: b.screened_at ?? new Date().toISOString(),
    };
  },

  parseError: standardParseError,
  healthRequest: () => ({ method: 'GET', path: 'health' }),
};
