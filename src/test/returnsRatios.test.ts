import { describe, it, expect } from 'vitest';
import { computeAllRatios, detectBreaches, formatRatioValue, type PrudentialRatio, type PrudentialThreshold } from '@/lib/returnsRatios';

const ratio = (over: Partial<PrudentialRatio>): PrudentialRatio => ({
  id: 'r', return_config_id: 'c', ratio_key: 'k', label: 'L',
  formula: '', display_format: 'decimal', metric_key: null, is_active: true,
  ...over,
});
const th = (over: Partial<PrudentialThreshold>): PrudentialThreshold => ({
  id: 't', return_config_id: 'c', metric_key: 'm', label: 'L',
  comparator: '>=', warn_value: null, breach_value: null, upper_value: null, unit: null, is_active: true,
  ...over,
});

describe('prudential ratios', () => {
  const data = { balance: { assets: '200', liabilities: '100', capital: '50' } };

  it('computes ratio value', () => {
    const [c] = computeAllRatios([ratio({ formula: 'balance.assets / balance.liabilities' })], data);
    expect(c.value).toBe(2);
  });

  it('flags null on formula error', () => {
    const [c] = computeAllRatios([ratio({ formula: 'balance.assets / balance.zero' })], data);
    expect(c.value).toBe(null);
  });

  it('detects >= breach when value below limit', () => {
    const [c] = computeAllRatios([ratio({ formula: 'balance.capital', metric_key: 'car' })], data);
    const breaches = detectBreaches([c], [th({ metric_key: 'car', comparator: '>=', warn_value: 100, breach_value: 60 })]);
    expect(breaches).toHaveLength(1);
    expect(breaches[0].level).toBe('breach');
  });

  it('detects warn level between warn and breach', () => {
    const [c] = computeAllRatios([ratio({ formula: 'balance.capital', metric_key: 'car' })], data);
    const breaches = detectBreaches([c], [th({ metric_key: 'car', comparator: '>=', warn_value: 100, breach_value: 20 })]);
    expect(breaches[0].level).toBe('warn');
  });

  it('detects between-comparator breach', () => {
    const [c] = computeAllRatios([ratio({ formula: 'balance.capital', metric_key: 'car' })], data);
    const breaches = detectBreaches([c], [th({ metric_key: 'car', comparator: 'between', warn_value: 100, upper_value: 200 })]);
    expect(breaches).toHaveLength(1);
  });

  it('formats values by display format', () => {
    expect(formatRatioValue(0.1234, 'percent')).toBe('12.34%');
    expect(formatRatioValue(null, 'decimal')).toBe('—');
  });
});
