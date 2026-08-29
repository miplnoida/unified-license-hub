/**
 * F6-X — payment gateway currency contract.
 *
 * Deterministic adapter-level certification evidence: the gateway never
 * defaults a currency, never accepts a provider response without one, and
 * never accepts a provider currency that differs from the authorised one.
 * Live provider execution is F20 commissioning and is NOT claimed here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  paymentGatewayAdapter,
  requireCurrency,
  assertProviderCurrency,
} from '../../supabase/functions/_shared/connector/adapters/payment_gateway.ts';

const ADAPTER_SRC = join(
  process.cwd(),
  'supabase/functions/_shared/connector/adapters/payment_gateway.ts',
);

describe('payment gateway currency contract', () => {
  it('rejects an outbound payment with no authoritative currency', () => {
    for (const bad of [undefined, null, '', '  ', 'US', 'DOLLAR', 12]) {
      expect(() =>
        paymentGatewayAdapter.buildRequest('create_payment', {
          amount: 100,
          currency: bad,
          reference: 'REF-1',
        } as Record<string, unknown>),
      ).toThrow(/PAYMENT_CURRENCY_MISSING/);
    }
  });

  it('carries the authoritative currency through unchanged (normalised to ISO)', () => {
    const req = paymentGatewayAdapter.buildRequest('create_payment', {
      amount: 100,
      currency: ' xcd ',
      reference: 'REF-2',
    } as Record<string, unknown>);
    expect((req.body as Record<string, unknown>).currency).toBe('XCD');
  });

  it('rejects a provider response that omits the currency', () => {
    expect(() =>
      paymentGatewayAdapter.parseResponse('create_payment', 200, {
        payment_id: 'p1',
        status: 'captured',
        amount: 100,
      }),
    ).toThrow(/PAYMENT_CURRENCY_MISSING/);
  });

  it('rejects a provider currency that differs from the authorised currency', () => {
    const parsed = paymentGatewayAdapter.parseResponse('create_payment', 200, {
      payment_id: 'p1',
      status: 'captured',
      amount: 100,
      currency: 'JMD',
    }) as { currency: string };
    expect(() => assertProviderCurrency('XCD', parsed.currency)).toThrow(
      /PAYMENT_CURRENCY_MISMATCH/,
    );
  });

  it('accepts a provider response whose currency matches', () => {
    const parsed = paymentGatewayAdapter.parseResponse('create_payment', 200, {
      payment_id: 'p1',
      status: 'captured',
      amount: 100,
      currency: 'xcd',
    }) as { currency: string; settled: boolean };
    expect(parsed.currency).toBe('XCD');
    expect(assertProviderCurrency('XCD', parsed.currency)).toBe('XCD');
    expect(parsed.settled).toBe(true);
  });

  it('refund and capture introduce no independent currency fallback', () => {
    expect(() =>
      paymentGatewayAdapter.buildRequest('refund', {
        paymentId: 'p1',
        amount: 10,
      } as Record<string, unknown>),
    ).toThrow(/PAYMENT_CURRENCY_MISSING/);

    const refund = paymentGatewayAdapter.buildRequest('refund', {
      paymentId: 'p1',
      amount: 10,
      currency: 'XCD',
    } as Record<string, unknown>);
    expect((refund.body as Record<string, unknown>).currency).toBe('XCD');

    expect(() =>
      paymentGatewayAdapter.parseResponse('refund', 200, { refund_id: 'r1', amount: 10 }),
    ).toThrow(/PAYMENT_CURRENCY_MISSING/);

    const capture = paymentGatewayAdapter.buildRequest('capture_payment', {
      paymentId: 'p1',
      amount: 10,
    } as Record<string, unknown>);
    expect((capture.body as Record<string, unknown>).currency).toBeNull();
    expect(() =>
      paymentGatewayAdapter.buildRequest('capture_payment', {
        paymentId: 'p1',
        currency: 'nope',
      } as Record<string, unknown>),
    ).toThrow(/PAYMENT_CURRENCY_MISSING/);
  });

  it('the adapter source contains no hardcoded money default', () => {
    const src = readFileSync(ADAPTER_SRC, 'utf8');
    expect(src).not.toMatch(/\?\?\s*['"][A-Z]{3}['"]/);
    expect(src).not.toMatch(/\|\|\s*['"][A-Z]{3}['"]/);
    expect(src).not.toMatch(/currency['"]?\s*[:=]\s*['"](JMD|USD|XCD|EUR|GBP)['"]/);
  });

  it('requireCurrency is the single normalisation point', () => {
    expect(requireCurrency('usd', 'c')).toBe('USD');
    expect(() => requireCurrency('u$d', 'c')).toThrow(/PAYMENT_CURRENCY_MISSING/);
  });
});
