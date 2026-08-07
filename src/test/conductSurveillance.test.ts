import { describe, expect, it } from 'vitest';
import { deriveDispositionCounts, SETTABLE_DISPOSITIONS } from '@/hooks/useConductSurveillance';

const sig = (disposition: string) => ({ disposition } as any);

describe('surveillance disposition buckets', () => {
  it('counts each disposition bucket and the total', () => {
    const counts = deriveDispositionCounts([
      sig('NEW'), sig('NEW'), sig('UNDER_REVIEW'), sig('ESCALATED'), sig('CLOSED'),
    ]);
    expect(counts.all).toBe(5);
    expect(counts.NEW).toBe(2);
    expect(counts.UNDER_REVIEW).toBe(1);
    expect(counts.ESCALATED).toBe(1);
    expect(counts.CLOSED).toBe(1);
    expect(counts.FALSE_POSITIVE).toBe(0);
  });

  it('treats a missing disposition as NEW', () => {
    const counts = deriveDispositionCounts([{} as any]);
    expect(counts.NEW).toBe(1);
  });

  it('never offers ESCALATED as a manually settable disposition', () => {
    expect(SETTABLE_DISPOSITIONS).not.toContain('ESCALATED');
  });
});
