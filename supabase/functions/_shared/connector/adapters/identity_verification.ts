/**
 * Identity verification (KYC) — document + biometric checks at registration.
 */
import { bearer, need, standardParseError } from '../auth.ts';
import { ConnectorAdapter, ConnectorRequest } from '../types.ts';

export type Op = 'verify_identity' | 'verify_document' | 'fetch_result' | 'health';

export const identityVerificationAdapter: ConnectorAdapter<Op> = {
  key: 'identity_verification',
  operations: ['verify_identity', 'verify_document', 'fetch_result', 'health'],
  authenticate: bearer,

  buildRequest(operation, input): ConnectorRequest {
    switch (operation) {
      case 'verify_identity':
        return {
          method: 'POST',
          path: 'verifications',
          body: {
            first_name: input.firstName,
            last_name: input.lastName,
            date_of_birth: input.dateOfBirth ?? null,
            national_id: input.nationalId ?? null,
            email: input.email ?? null,
            reference: input.reference ?? null,
          },
        };
      case 'verify_document':
        return {
          method: 'POST',
          path: 'verifications/document',
          body: {
            document_type: input.documentType,
            document_number: input.documentNumber,
            issuing_country: input.issuingCountry ?? 'JM',
            file_url: input.fileUrl ?? null,
            reference: input.reference ?? null,
          },
        };
      case 'fetch_result':
        return { method: 'GET', path: `verifications/${String(input.verificationId)}` };
      case 'health':
        return { method: 'GET', path: 'health' };
    }
  },

  parseResponse(operation, _status, body) {
    const b = (body ?? {}) as Record<string, unknown>;
    if (operation === 'health') return { healthy: true };
    const outcome = String(need(b.status ?? b.outcome ?? 'pending', 'status')).toLowerCase();
    return {
      verificationId: b.verification_id ?? b.id ?? null,
      outcome, // verified | rejected | pending | manual_review
      verified: outcome === 'verified' || outcome === 'approved',
      confidence: b.confidence === undefined ? null : Number(b.confidence),
      reasons: Array.isArray(b.reasons) ? b.reasons : [],
      documentValid: b.document_valid === undefined ? null : Boolean(b.document_valid),
      completedAt: b.completed_at ?? new Date().toISOString(),
    };
  },

  parseError: standardParseError,
  healthRequest: () => ({ method: 'GET', path: 'health' }),
};
