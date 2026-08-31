/**
 * Saint Lucia currency integrity.
 *
 * Proves the canonical contract: configured base currency for local amounts,
 * explicit record currency preserved, never locale-derived, never silently
 * mixed.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  MONEY_UNAVAILABLE,
  baseCurrency,
  formatBaseMoney,
  formatRecordMoney,
  formatReportingMoney,
  formatTotalsByCurrency,
  primeConfiguredCurrencies,
  primeCurrencyRegistry,
  resetConfiguredCurrencies,
  resetCurrencyRegistry,
} from '@/lib/money';

const master = [
  { code: 'XCD', display_symbol: 'EC$', decimal_precision: 2 },
  { code: 'USD', display_symbol: 'US$', decimal_precision: 2 },
  { code: 'GBP', display_symbol: '£', decimal_precision: 2 },
];

function primeSaintLucia() {
  primeCurrencyRegistry(master);
  primeConfiguredCurrencies({ baseCurrency: 'XCD', reportingCurrency: 'XCD' });
}

describe('Saint Lucia currency integrity', () => {
  beforeEach(() => {
    resetCurrencyRegistry();
    resetConfiguredCurrencies();
  });

  it('resolves the configured Saint Lucia base currency', () => {
    primeSaintLucia();
    expect(baseCurrency()).toBe('XCD');
  });

  it('renders a local amount unambiguously in East Caribbean Dollars', () => {
    primeSaintLucia();
    expect(formatBaseMoney(12500)).toBe('EC$ 12,500.00 (XCD)');
    expect(formatReportingMoney(12500)).toBe('EC$ 12,500.00 (XCD)');
  });

  it.each(['en-IN', 'en-US', 'en-GB'])(
    'keeps a local amount in XCD when the operator locale is %s',
    (locale) => {
      const original = Intl.NumberFormat;
      // Force every formatter to resolve as if the browser were in `locale`.
      // @ts-expect-error deliberate narrow test double
      Intl.NumberFormat = function (_l?: string, o?: Intl.NumberFormatOptions) {
        return new original(locale, o);
      } as unknown as typeof Intl.NumberFormat;
      try {
        primeSaintLucia();
        const rendered = formatBaseMoney(12500);
        expect(rendered).toContain('XCD');
        expect(rendered).not.toMatch(/INR|₹|USD\b|GBP|£/);
      } finally {
        Intl.NumberFormat = original;
      }
    },
  );

  it('preserves an explicitly foreign-denominated record', () => {
    primeSaintLucia();
    expect(formatRecordMoney(1000, 'USD')).toBe('US$ 1,000.00 (USD)');
    expect(formatRecordMoney(1000, 'GBP')).toBe('£ 1,000.00 (GBP)');
  });

  it('falls back to base currency only when the record states none', () => {
    primeSaintLucia();
    expect(formatRecordMoney(1000, null)).toBe('EC$ 1,000.00 (XCD)');
    expect(formatRecordMoney(1000, 'XX')).toBe('EC$ 1,000.00 (XCD)');
  });

  it('never guesses a currency when configuration is unknown', () => {
    primeCurrencyRegistry(master);
    expect(formatBaseMoney(1000)).toBe(MONEY_UNAVAILABLE);
  });

  it('never sums mixed currencies into a single figure', () => {
    primeSaintLucia();
    const total = formatTotalsByCurrency([
      { amount: 100, currency: 'XCD' },
      { amount: 50, currency: 'USD' },
      { amount: 25, currency: null },
    ]);
    expect(total).toBe('US$ 50.00 (USD) + EC$ 125.00 (XCD)');
  });

  it('performs no implicit FX conversion', () => {
    primeSaintLucia();
    expect(formatRecordMoney(100, 'USD')).toContain('100.00');
  });
});
