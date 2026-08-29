/**
 * Payment gateway — application/licence fee authorisation and capture.
 * Exactly-once is enforced by the runtime idempotency key.
 */
import { bearer, need, standardParseError } from '../auth.ts';
import { ConnectorAdapter, ConnectorRequest } from '../types.ts';

export type Op = 'create_payment' | 'capture_payment' | 'fetch_payment' | 'refund' | 'health';

/**
 * F6-X — the currency of a money movement is never defaulted. It arrives from
 * the governed assessment/payment contract, and the provider must confirm it.
 */
export function requireCurrency(value: unknown, field: string): string {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new Error(`PAYMENT_CURRENCY_MISSING: "${field}" must carry an ISO 4217 currency`);
  }
  return code;
}

/** Provider currency must match the currency the platform authorised. */
export function assertProviderCurrency(expected: unknown, actual: unknown): string {
  const want = requireCurrency(expected, 'expected currency');
  const got = requireCurrency(actual, 'provider currency');
  if (want !== got) {
    throw new Error(`PAYMENT_CURRENCY_MISMATCH: provider returned ${got}, expected ${want}`);
  }
  return got;
}

export const paymentGatewayAdapter: ConnectorAdapter<Op> = {
  key: 'payment_gateway',
  operations: ['create_payment', 'capture_payment', 'fetch_payment', 'refund', 'health'],
  authenticate: bearer,

  buildRequest(operation, input): ConnectorRequest {
    switch (operation) {
      case 'create_payment':
        return {
          method: 'POST',
          path: 'payments',
          body: {
            amount: input.amount,
            currency: requireCurrency(input.currency, 'currency'),
            reference: input.reference,
            description: input.description ?? null,
            payer_email: input.payerEmail ?? null,
            return_url: input.returnUrl ?? null,
          },
        };
      case 'capture_payment':
        return {
          method: 'POST',
          path: `payments/${String(input.paymentId)}/capture`,
          body: {
            amount: input.amount ?? null,
            // No independent currency default: a capture either restates the
            // authorised currency or states none at all.
            currency: input.currency === undefined || input.currency === null
              ? null
              : requireCurrency(input.currency, 'currency'),
          },
        };
      case 'fetch_payment':
        return { method: 'GET', path: `payments/${String(input.paymentId)}` };
      case 'refund':
        return {
          method: 'POST',
          path: `payments/${String(input.paymentId)}/refunds`,
          body: {
            amount: input.amount,
            // A refund is a money movement: it carries the currency it reverses.
            currency: requireCurrency(input.currency, 'currency'),
            reason: input.reason ?? null,
          },
        };
      case 'health':
        return { method: 'GET', path: 'health' };
    }
  },

  parseResponse(operation, _status, body) {
    const b = (body ?? {}) as Record<string, unknown>;
    if (operation === 'health') return { healthy: true };
    if (operation === 'refund') {
      return {
        refundId: b.refund_id ?? b.id ?? null,
        status: b.status ?? 'pending',
        amount: b.amount === undefined ? null : Number(b.amount),
        currency: requireCurrency(b.currency, 'currency'),
      };
    }
    const status = String(need(b.status ?? 'pending', 'status')).toLowerCase();
    return {
      paymentId: need(b.payment_id ?? b.id, 'payment_id'),
      status, // pending | authorised | captured | failed | cancelled
      settled: status === 'captured' || status === 'succeeded' || status === 'paid',
      amount: b.amount === undefined ? null : Number(b.amount),
      currency: requireCurrency(b.currency, 'currency'),
      providerReference: b.provider_reference ?? b.reference ?? null,
      redirectUrl: b.redirect_url ?? b.checkout_url ?? null,
      processedAt: b.processed_at ?? new Date().toISOString(),
    };
  },

  parseError: standardParseError,
  // Never blind-retry a money movement on a provider rejection.
  isRetryable(status, category) {
    return category === 'timeout' || category === 'network' ||
      (status !== null && status >= 500);
  },
  healthRequest: () => ({ method: 'GET', path: 'health' }),
};
