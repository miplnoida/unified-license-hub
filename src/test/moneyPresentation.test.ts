import { beforeEach, describe, expect, it } from 'vitest';
import {
  MONEY_UNAVAILABLE,
  formatMoney,
  isAuthoritativeMoney,
  primeCurrencyRegistry,
  resetCurrencyRegistry,
} from '@/lib/money';

describe('F6-X money presentation', () => {
  beforeEach(() => resetCurrencyRegistry());

  it('never assumes a currency when none is recorded', () => {
    expect(formatMoney(1500, null)).toBe(MONEY_UNAVAILABLE);
    expect(formatMoney(1500, '')).toBe(MONEY_UNAVAILABLE);
    expect(formatMoney(1500, 'US')).toBe(MONEY_UNAVAILABLE);
    expect(isAuthoritativeMoney(1500, undefined)).toBe(false);
  });

  it('renders the ISO code so an ambiguous symbol cannot be misread', () => {
    primeCurrencyRegistry([{ code: 'XCD', display_symbol: 'EC$', decimal_precision: 2 }]);
    expect(formatMoney(1500, 'XCD')).toBe('EC$ 1,500.00 (XCD)');
  });

  it('falls back to the ISO code when the master has no symbol', () => {
    expect(formatMoney(1500, 'jmd')).toBe('JMD 1,500.00');
  });

  it('honours the decimal precision held in the currency master', () => {
    primeCurrencyRegistry([{ code: 'JPY', display_symbol: '¥', decimal_precision: 0 }]);
    expect(formatMoney(1500, 'JPY')).toBe('¥ 1,500 (JPY)');
  });

  it('treats a non-numeric amount as unavailable', () => {
    expect(formatMoney('abc', 'USD')).toBe(MONEY_UNAVAILABLE);
    expect(formatMoney(null, 'USD')).toBe(MONEY_UNAVAILABLE);
  });
});
