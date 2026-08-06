import { describe, it, expect } from 'vitest';
import {
  buildSankeyData, interventionDelta, stageRate, sortTimeline, groupTimelineByYear,
  periodRange, fmtNum, fmtDate, buildSupervisionLoopHtml, EMPTY_SUMMARY, STAGES,
  type LoopFunnel, type TimelineEvent,
} from '@/lib/conduct/supervisionLoop';

const funnel: LoopFunnel = {
  complaints_received: 100, classified: 90, investigated: 20,
  enforcement: 8, compliance: 5, closed: 70, monitoring: 4, recurrences: 1,
};

describe('supervisionLoop funnel helpers', () => {
  it('builds one sankey link per stage transition', () => {
    const { nodes, links } = buildSankeyData(funnel);
    expect(nodes).toHaveLength(STAGES.length);
    expect(links).toHaveLength(STAGES.length - 1);
    expect(links[0]).toMatchObject({ source: 0, target: 1, value: 90 });
  });

  it('keeps zero-volume links strictly positive so the cycle still renders', () => {
    const { links } = buildSankeyData(EMPTY_SUMMARY.funnel);
    expect(links.every((l) => l.value > 0)).toBe(true);
  });

  it('computes stage conversion rates and guards divide-by-zero', () => {
    expect(stageRate(funnel, 'complaints_received', 'enforcement')).toBe(8);
    expect(stageRate(EMPTY_SUMMARY.funnel, 'complaints_received', 'enforcement')).toBeNull();
  });
});

describe('interventionDelta', () => {
  it('returns a negative percentage when complaints fall post-intervention', () => {
    const d = interventionDelta({ ...EMPTY_SUMMARY.effectiveness, pre_intervention_avg: 10, post_intervention_avg: 4 });
    expect(d).toBe(-60);
  });

  it('returns null when data is missing or the pre-period is empty', () => {
    expect(interventionDelta({ ...EMPTY_SUMMARY.effectiveness, pre_intervention_avg: 0, post_intervention_avg: 3 })).toBeNull();
    expect(interventionDelta(EMPTY_SUMMARY.effectiveness)).toBeNull();
  });
});

const events: TimelineEvent[] = [
  { kind: 'enforcement', id: 'e1', ref: 'ENF-1', label: 'Fine', severity: null, status: 'open', occurred_at: '2025-03-02T00:00:00Z', ended_at: null, href: null },
  { kind: 'complaint', id: 'c1', ref: 'C-1', label: 'Mis-selling', severity: 'high', status: 'closed', occurred_at: '2024-11-15T00:00:00Z', ended_at: null, href: null },
  { kind: 'annotation', id: 'a1', ref: 'Note', label: 'Remediation agreed', severity: null, status: null, occurred_at: '2025-03-02T00:00:00Z', ended_at: null, href: null },
];

describe('timeline merge', () => {
  it('sorts oldest first and breaks ties deterministically by kind', () => {
    const sorted = sortTimeline(events);
    expect(sorted.map((e) => e.id)).toEqual(['c1', 'a1', 'e1']);
  });

  it('groups by year, newest year first', () => {
    const grouped = groupTimelineByYear(events);
    expect(grouped.map((g) => g.year)).toEqual(['2025', '2024']);
    expect(grouped[0].events).toHaveLength(2);
  });

  it('handles empty input safely', () => {
    expect(sortTimeline([])).toEqual([]);
    expect(groupTimelineByYear([])).toEqual([]);
  });
});

describe('period + formatting', () => {
  it('derives ranges from presets', () => {
    const { from, to } = periodRange('6m', new Date('2026-08-06T00:00:00Z'));
    expect(to).toBe('2026-08-06');
    expect(from).toBe('2026-02-06');
  });

  it('formats nulls as em dashes', () => {
    expect(fmtNum(null)).toBe('—');
    expect(fmtNum(3, 'd')).toBe('3d');
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate('not-a-date')).toBe('—');
  });
});

describe('buildSupervisionLoopHtml', () => {
  it('renders every stage, escapes input, and survives empty sections', () => {
    const html = buildSupervisionLoopHtml({
      entityName: 'Acme <Bank> & Co',
      summary: { ...EMPTY_SUMMARY, funnel, period: { from: '2025-01-01', to: '2026-01-01' } },
      timeline: [],
      risks: [],
      learning: [],
    });
    for (const s of STAGES) expect(html).toContain(s.label);
    expect(html).toContain('Acme &lt;Bank&gt; &amp; Co');
    expect(html).toContain('No events in period.');
    expect(html).toContain('No unresolved risks.');
  });
});
