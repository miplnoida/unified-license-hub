/**
 * AML / adverse-media screening. Used by fit-and-proper assessment.
 */
import { bearer, standardParseError } from '../auth.ts';
import { ConnectorAdapter, ConnectorRequest } from '../types.ts';

export type Op = 'screen_individual' | 'screen_entity' | 'fetch_result' | 'health';

function band(score: number): 'low' | 'medium' | 'high' {
  if (score >= 75) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

export const amlScreeningAdapter: ConnectorAdapter<Op> = {
  key: 'aml_screening',
  operations: ['screen_individual', 'screen_entity', 'fetch_result', 'health'],
  authenticate: bearer,

  buildRequest(operation, input): ConnectorRequest {
    switch (operation) {
      case 'screen_individual':
        return {
          method: 'POST',
          path: 'screen/individual',
          body: {
            full_name: input.fullName,
            date_of_birth: input.dateOfBirth ?? null,
            nationality: input.nationality ?? null,
            reference: input.reference ?? null,
          },
        };
      case 'screen_entity':
        return {
          method: 'POST',
          path: 'screen/entity',
          body: {
            entity_name: input.entityName,
            registration_number: input.registrationNumber ?? null,
            country: input.country ?? null,
            reference: input.reference ?? null,
          },
        };
      case 'fetch_result':
        return { method: 'GET', path: `screen/${String(input.screeningId)}` };
      case 'health':
        return { method: 'GET', path: 'health' };
    }
  },

  parseResponse(operation, _status, body) {
    const b = (body ?? {}) as Record<string, unknown>;
    if (operation === 'health') return { healthy: true };
    const matches = Array.isArray(b.matches) ? b.matches : [];
    const score = Number(b.risk_score ?? b.score ?? (matches.length ? 80 : 0));
    return {
      screeningId: b.screening_id ?? b.id ?? null,
      matchCount: matches.length,
      riskScore: score,
      riskBand: band(score),
      requiresManualReview: Boolean(b.requires_review ?? matches.length > 0),
      matches: matches.slice(0, 50),
      completedAt: b.completed_at ?? new Date().toISOString(),
    };
  },

  parseError: standardParseError,
  healthRequest: () => ({ method: 'GET', path: 'health' }),
};
