import { describe, it, expect } from 'vitest';
import {
  bucketKey, bucketRange, buildMatrix, buildTrend, comparePeers, derivePatternSignals,
  entityMetrics, percentile, pickBucketing, quantile,
  type AlertRow, type ComplaintRow,
} from '@/lib/conduct/analytics';

const NOW = new Date('2026-03-15T12:00:00Z');

const C = (over: Partial<ComplaintRow>): ComplaintRow => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  created_at: over.created_at ?? '2026-03-10T00:00:00Z',
  resolved_at: over.resolved_at ?? null,
  sla_due_at: over.sla_due_at ?? null,
  severity: over.severity ?? 'medium',
  status: over.status ?? 'open',
  product_id: over.product_id ?? 'p1',
  channel_id: over.channel_id ?? 'ch1',
  conduct_risk_category_id: over.conduct_risk_category_id ?? 'cat1',
  licensee_id: over.licensee_id ?? 'L1',
  vulnerability_indicator: over.vulnerability_indicator ?? false,
  repeat_complaint_count: over.repeat_complaint_count ?? 0,
});

const labels = {
  product: (id?: string | null) => id || '—',
  channel: (id?: string | null) => id || '—',
  category: (id?: string | null) => id || '—',
  licensee: (id?: string | null) => id || '—',
};

describe('conduct analytics bucketing', () => {
  it('picks weekly for short windows and monthly for long ones', () => {
    expect(pickBucketing(30)).toBe('week');
    expect(pickBucketing(90)).toBe('week');
    expect(pickBucketing(180)).toBe('month');
  });

  it('bucket keys cross month boundaries correctly', () => {
    expect(bucketKey('2026-01-31T23:00:00', 'month')).toBe('2026-01');
    expect(bucketKey('2026-02-01T01:00:00', 'month')).toBe('2026-02');
    // weekly keys are the Sunday of that week
    expect(bucketKey('2026-03-04T10:00:00', 'week')).toBe(bucketKey('2026-03-07T10:00:00', 'week'));
    expect(bucketKey('2026-03-04T10:00:00', 'week')).not.toBe(bucketKey('2026-03-09T10:00:00', 'week'));
  });

  it('bucketRange covers the window with unique ordered keys', () => {
    const months = bucketRange(180, 'month', NOW);
    expect(months.length).toBeGreaterThanOrEqual(6);
    expect(new Set(months).size).toBe(months.length);
    expect(months[months.length - 1]).toBe('2026-03');
    const weeks = bucketRange(30, 'week', NOW);
    expect(weeks.length).toBeGreaterThanOrEqual(4);
  });

  it('buildTrend counts raised, resolved, alerts and breaches into buckets', () => {
    const complaints = [
      C({ created_at: '2026-03-10T00:00:00Z', severity: 'critical', sla_due_at: '2026-03-11T00:00:00Z' }),
      C({ created_at: '2026-03-10T00:00:00Z', severity: 'low', resolved_at: '2026-03-12T00:00:00Z' }),
    ];
    const alerts: AlertRow[] = [{ id: 'a1', created_at: '2026-03-10T00:00:00Z', status: 'open' }];
    const { points } = buildTrend(complaints, alerts, 30, NOW);
    const total = points.reduce((s, p) => s + p.raised, 0);
    expect(total).toBe(2);
    expect(points.reduce((s, p) => s + p.resolved, 0)).toBe(1);
    expect(points.reduce((s, p) => s + p.alerts, 0)).toBe(1);
    expect(points.reduce((s, p) => s + p.slaBreached, 0)).toBe(1);
    expect(points.reduce((s, p) => s + p.critical, 0)).toBe(1);
  });

  it('is safe on empty data', () => {
    const { points } = buildTrend([], [], 90, NOW);
    expect(points.every((p) => p.raised === 0)).toBe(true);
    expect(derivePatternSignals(points, [], labels)).toEqual([]);
  });
});

describe('pattern signals', () => {
  it('detects a volume spike between the last two buckets', () => {
    const points = buildTrend([], [], 180, NOW).points;
    const prev = points[points.length - 2];
    const last = points[points.length - 1];
    prev.raised = 4; last.raised = 12;
    const signals = derivePatternSignals(points, [], labels);
    expect(signals.some((s) => s.kind === 'volume_spike')).toBe(true);
  });

  it('does not fire on tiny baselines', () => {
    const points = buildTrend([], [], 180, NOW).points;
    points[points.length - 2].raised = 1;
    points[points.length - 1].raised = 2;
    expect(derivePatternSignals(points, [], labels).some((s) => s.kind === 'volume_spike')).toBe(false);
  });

  it('flags repeat and vulnerable concentrations', () => {
    const complaints = [
      ...Array.from({ length: 4 }, () => C({ repeat_complaint_count: 5, vulnerability_indicator: true })),
      ...Array.from({ length: 6 }, () => C({})),
    ];
    const points = buildTrend(complaints, [], 180, NOW).points;
    const signals = derivePatternSignals(points, complaints, labels);
    expect(signals.some((s) => s.kind === 'repeat_concentration')).toBe(true);
    expect(signals.some((s) => s.kind === 'vulnerable_concentration')).toBe(true);
  });
});

describe('drill-through matrix', () => {
  it('aggregates counts, criticals and breaches per cell', () => {
    const complaints = [
      C({ product_id: 'p1', channel_id: 'ch1', severity: 'critical' }),
      C({ product_id: 'p1', channel_id: 'ch1', sla_due_at: '2026-03-01T00:00:00Z' }),
      C({ product_id: 'p2', channel_id: null }),
    ];
    const m = buildMatrix(complaints, (c) => c.product_id, (c) => c.channel_id, (k) => k, (k) => k, NOW);
    expect(m.rows.map((r) => r.key)).toEqual(['p1', 'p2']);
    expect(m.cells.get('p1|ch1')!.count).toBe(2);
    expect(m.cells.get('p1|ch1')!.critical).toBe(1);
    expect(m.cells.get('p1|ch1')!.breached).toBe(1);
    expect(m.cells.get('p2|none')!.count).toBe(1);
    expect(m.max).toBe(2);
  });
});

describe('peer comparison', () => {
  it('percentile and quantile place values in the distribution', () => {
    expect(percentile(50, [10, 20, 30, 40, 50, 60, 70])).toBe(Math.round((4 / 7) * 10000) / 100);
    expect(percentile(5, [])).toBe(50);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([], 0.5)).toBe(0);
  });

  it('entityMetrics derives shares only from that entity rows', () => {
    const complaints = [
      C({ licensee_id: 'L1', severity: 'critical', sla_due_at: '2026-03-01T00:00:00Z' }),
      C({ licensee_id: 'L1', repeat_complaint_count: 3 }),
      C({ licensee_id: 'L2', severity: 'critical' }),
    ];
    const alerts: AlertRow[] = [{ id: 'a', created_at: '2026-03-01', status: 'open', licensee_id: 'L1' }];
    const m = entityMetrics('L1', complaints, alerts, NOW);
    expect(m.complaints).toBe(2);
    expect(m.criticalShare).toBe(50);
    expect(m.slaBreachRate).toBe(50);
    expect(m.repeatRate).toBe(50);
    expect(m.openAlerts).toBe(1);
  });

  it('comparePeers returns a metric row per tracked metric', () => {
    const complaints = [C({ licensee_id: 'L1' }), C({ licensee_id: 'L2' }), C({ licensee_id: 'L2' })];
    const entity = entityMetrics('L1', complaints, [], NOW);
    const peers = [entityMetrics('L2', complaints, [], NOW)];
    const cmp = comparePeers(entity, peers);
    expect(cmp).toHaveLength(6);
    expect(cmp[0].entityValue).toBe(1);
    expect(cmp[0].median).toBe(2);
  });
});
