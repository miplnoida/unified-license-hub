/**
 * Document signing — electronic signature of licences and notices.
 * OAuth2 client-credentials with transparent token refresh.
 */
import { oauth2ClientCredentials, need, standardParseError } from '../auth.ts';
import { ConnectorAdapter, ConnectorRequest } from '../types.ts';

export type Op = 'create_envelope' | 'fetch_envelope' | 'download_signed' | 'void_envelope' | 'health';

export const documentSigningAdapter: ConnectorAdapter<Op> = {
  key: 'document_signing',
  operations: ['create_envelope', 'fetch_envelope', 'download_signed', 'void_envelope', 'health'],
  authenticate: oauth2ClientCredentials,

  buildRequest(operation, input): ConnectorRequest {
    switch (operation) {
      case 'create_envelope':
        return {
          method: 'POST',
          path: 'envelopes',
          body: {
            subject: input.subject,
            document_name: input.documentName,
            document_url: input.documentUrl ?? null,
            document_base64: input.documentBase64 ?? null,
            signers: input.signers ?? [],
            reference: input.reference ?? null,
          },
        };
      case 'fetch_envelope':
        return { method: 'GET', path: `envelopes/${String(input.envelopeId)}` };
      case 'download_signed':
        return { method: 'GET', path: `envelopes/${String(input.envelopeId)}/document` };
      case 'void_envelope':
        return {
          method: 'POST',
          path: `envelopes/${String(input.envelopeId)}/void`,
          body: { reason: input.reason ?? 'Voided by regulator' },
        };
      case 'health':
        return { method: 'GET', path: 'health' };
    }
  },

  parseResponse(operation, _status, body) {
    const b = (body ?? {}) as Record<string, unknown>;
    if (operation === 'health') return { healthy: true };
    if (operation === 'download_signed') {
      return { documentBase64: b.document_base64 ?? null, url: b.url ?? null };
    }
    const status = String(need(b.status ?? 'sent', 'status')).toLowerCase();
    return {
      envelopeId: need(b.envelope_id ?? b.id, 'envelope_id'),
      status, // sent | delivered | completed | declined | voided
      completed: status === 'completed' || status === 'signed',
      signingUrl: b.signing_url ?? b.url ?? null,
      signers: Array.isArray(b.signers) ? b.signers : [],
      updatedAt: b.updated_at ?? new Date().toISOString(),
    };
  },

  parseError: standardParseError,
  healthRequest: () => ({ method: 'GET', path: 'health' }),
};
