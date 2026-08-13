import { describe, it, expect } from 'vitest';
import {
  comparatorPhrase,
  describeEarlyWarning,
  formatPercent,
  formatRatioValue,
  peerPosition,
} from '@/lib/prudential/analysisNarrative';

describe('analysis narrative', () => {
  it('rounds ratio values to two decimals', () => {
    expect(formatRatioValue(0.4610027855153203)).toBe('0.46');
    expect(formatRatioValue(null)).toBe('—');
    expect(formatPercent(-40.9)).toBe('-40.90%');
  });

  it('describes trend deterioration in words, not JSON', () => {
    const n = describeEarlyWarning(
      {
        metric_key: 'car_total',
        reason: 'trend_deterioration',
        evidence: [{ newest: 0.4610027855153203, oldest: 0.7800226280911589, change_pct: -40.9 }],
      },
      { car_total: 'Capital adequacy ratio' },
    );
    expect(n.headline).toBe('Capital adequacy ratio');
    expect(n.sentence).toBe(
      'Capital adequacy ratio fell 40.90% over the filings compared — from 0.78 to 0.46.',
    );
    expect(n.sentence).not.toContain('{');
    expect(n.details.map((d) => d.value)).toEqual(['0.78', '0.46', '-40.90%']);
  });

  it('describes consecutive warnings with a readable comparator', () => {
    const n = describeEarlyWarning({
      metric_key: 'npl_ratio',
      reason: 'consecutive_amber',
      evidence: [{ streak: 2, comparator: '>', threshold: 0.15 }],
    });
    expect(comparatorPhrase('>')).toBe('above');
    expect(n.sentence).toContain('2 consecutive filings');
    expect(n.sentence).toContain('above the 0.15 limit');
  });

  it('lists ratio labels for a null-reason cluster', () => {
    const n = describeEarlyWarning(
      {
        metric_key: 'a',
        reason: 'null_reason_cluster',
        evidence: [{ null_reason: 'missing input line items', ratios: ['a', 'b', 'c'] }],
      },
      { a: 'Ratio A' },
    );
    expect(n.sentence).toContain('3 ratios could not be calculated');
    expect(n.details[0].value).toBe('Ratio A, B, C');
  });

  it('falls back to labelled pairs for unknown reasons', () => {
    const n = describeEarlyWarning({ metric_key: 'x', reason: 'odd_case', evidence: [{ foo: 1.234 }] });
    expect(n.details).toEqual([{ label: 'Foo', value: '1.23' }]);
  });

  it('states the peer position without judging it', () => {
    expect(peerPosition(0.5, 0.5)).toEqual({ label: 'In line with peers', gap: null });
    expect(peerPosition(0.62, 0.5)).toEqual({ label: 'Above the peer median', gap: '0.12' });
    expect(peerPosition(0.4, 0.5)).toEqual({ label: 'Below the peer median', gap: '0.10' });
    expect(peerPosition(null, 0.5)).toBeNull();
  });
});
