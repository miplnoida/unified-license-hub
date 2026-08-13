import { describe, expect, it } from 'vitest';
import {
  ATTENTION_BUCKETS,
  needsAttention,
  reportStatusChips,
  type SupervisoryAiReport,
} from '@/lib/ai/reportHub';

function make(over: Partial<SupervisoryAiReport> = {}): SupervisoryAiReport {
  return {
    id: 'r1',
    source: 'ai_insights',
    module: 'prudential',
    analysisType: 'risk_interpretation',
    title: 'Risk interpretation',
    generatedAt: '2026-08-13T10:00:00Z',
    reportState: 'available',
    freshness: 'current',
    versionKey: 'v1',
    sourceActionLabel: 'Open source record',
    ...over,
  };
}

describe('report status presentation', () => {
  it('shows Current only when nothing else applies', () => {
    expect(reportStatusChips(make()).map((c) => c.label)).toEqual(['Current']);
    expect(needsAttention(make())).toBe(false);
  });

  it('marks flagged reports as needing review and urgent', () => {
    const chips = reportStatusChips(make({ flagged: true }));
    expect(chips[0]).toMatchObject({ label: 'Needs review', tone: 'urgent' });
    expect(needsAttention(make({ flagged: true }))).toBe(true);
  });

  it('marks outdated and limited-evidence reports', () => {
    const chips = reportStatusChips(make({ freshness: 'outdated', limitedEvidence: true }));
    expect(chips.map((c) => c.label)).toEqual(['May be outdated', 'Limited evidence']);
    expect(needsAttention(make({ limitedEvidence: true }))).toBe(true);
  });

  it('treats incomplete analyses as urgent attention', () => {
    expect(reportStatusChips(make({ reportState: 'failed' })).map((c) => c.label)).toContain('Incomplete');
    expect(needsAttention(make({ reportState: 'failed' }))).toBe(true);
  });

  it('places each attention report in exactly one bucket', () => {
    const reports = [
      make({ flagged: true, freshness: 'outdated' }),
      make({ reportState: 'failed' }),
      make({ freshness: 'outdated' }),
      make({ limitedEvidence: true }),
    ];
    for (const r of reports) {
      expect(ATTENTION_BUCKETS.filter((b) => b.match(r))).toHaveLength(1);
    }
  });
});
