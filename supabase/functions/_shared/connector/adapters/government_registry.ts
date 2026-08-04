/**
 * Government company registry — entity verification and licence publication.
 * Provider-agnostic REST adapter; sandbox until credentials are supplied.
 */
import { apiKeyHeader, need, standardParseError } from '../auth.ts';
import { ConnectorAdapter, ConnectorRequest } from '../types.ts';

export type Op = 'verify_company' | 'fetch_company' | 'publish_licence' | 'health';

export const governmentRegistryAdapter: ConnectorAdapter<Op> = {
  key: 'government_registry',
  operations: ['verify_company', 'fetch_company', 'publish_licence', 'health'],
  authenticate: apiKeyHeader('X-Api-Key'),

  buildRequest(operation, input): ConnectorRequest {
    switch (operation) {
      case 'verify_company':
        return {
          method: 'POST',
          path: 'companies/verify',
          body: {
            registration_number: input.registrationNumber,
            company_name: input.companyName,
            jurisdiction: input.jurisdiction ?? 'JM',
          },
        };
      case 'fetch_company':
        return { method: 'GET', path: `companies/${String(input.registrationNumber)}` };
      case 'publish_licence':
        return {
          method: 'POST',
          path: 'licences',
          body: {
            licence_number: input.licenceNumber,
            entity_name: input.entityName,
            registration_number: input.registrationNumber,
            licence_type: input.licenceType,
            status: input.status,
            effective_date: input.effectiveDate,
            expiry_date: input.expiryDate,
          },
        };
      case 'health':
        return { method: 'GET', path: 'health' };
    }
  },

  parseResponse(operation, _status, body) {
    const b = (body ?? {}) as Record<string, unknown>;
    if (operation === 'publish_licence') {
      return { published: true, reference: b.reference ?? b.id ?? null };
    }
    if (operation === 'health') return { healthy: true };
    return {
      verified: Boolean(b.verified ?? b.found ?? false),
      registrationNumber: b.registration_number ?? null,
      companyName: b.company_name ?? null,
      status: need(b.status ?? b.company_status ?? 'unknown', 'status'),
      incorporatedOn: b.incorporated_on ?? null,
      directors: Array.isArray(b.directors) ? b.directors : [],
    };
  },

  parseError: standardParseError,
  healthRequest: () => ({ method: 'GET', path: 'health' }),
};
