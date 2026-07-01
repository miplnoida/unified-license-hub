import { describe, it, expect } from 'vitest';
import {
  computeAnalysis,
  computeCategoryScore,
  computeHealthScore,
  deriveEarlyWarnings,
  pickRecommendations,
  peerPercentile,
  type BreachInput,
  type RatioInput,
  type TrendPoint,
} from '@/lib/consolidatedAnalysis';

const R = (over: Partial<RatioInput>): RatioInput => ({
  ratio_key: over.ratio_key ?? 'car',
  label: over.label ?? 'Capital Adequacy',
  category: over.category ?? 'capital',
  value: 'value' in over ? (over.value as number | null) : 15,
  display_format: over.display_format ?? 'percent',
  null_reason: over.null_reason ?? null,
  unit: over.unit ?? null,
  recommendation_template: over.recommendation_template ?? null,
});

const B = (over: Partial<BreachInput>): BreachInput => ({
  metric_key: over.metric_key ?? 'car',
  risk_level: over.risk_level ?? 'amber',
  level: over.level ?? 'warn',
  value: over.value ?? 8,
  threshold_value: over.threshold_value ?? 10,
  comparator: over.comparator ?? '<',
});

describe('consolidatedAnalysis', () => {
  it('scores an all-green category as 100', () => {
    const ratios = [R({ ratio_key: 'a' }), R({ ratio_key: 'b' })];
    expect(computeCategoryScore(ratios, new Map())).toBe(100);
  });

  it('penalises red > amber > null > green in category score', () => {
    const ratios = [
      R({ ratio_key: 'a' }),
      R({ ratio_key: 'b' }),
      R({ ratio_key: 'c', value: null, null_reason: 'division_by_zero' }),
      R({ ratio_key: 'd' }),
    ];
    const breaches = new Map([
      ['a', B({ metric_key: 'a', risk_level: 'red' })],
      ['b', B({ metric_key: 'b', risk_level: 'amber' })],
    ]);
    // 20 + 60 + 50 + 100 = 230 / 4 = 57.5
    expect(computeCategoryScore(ratios, breaches)).toBe(57.5);
  });

  it('computeHealthScore averages only core categories, ignoring missing', () => {
    expect(computeHealthScore({ capital: 80, liquidity: 60, asset_quality: 100, profitability: 40 })).toBe(70);
    expect(computeHealthScore({ capital: 80, liquidity: 60 })).toBe(70);
    expect(computeHealthScore({})).toBe(0);
  });

  it('flags null_reason clusters as early warnings', () => {
    const ratios: RatioInput[] = ['a','b','c','d'].map((k) =>
      R({ ratio_key: k, value: null, null_reason: 'division_by_zero' }),
    );
    const warnings = deriveEarlyWarnings(ratios, [], []);
    expect(warnings.some((w) => w.reason === 'null_reason_cluster')).toBe(true);
  });

  it('flags trend deterioration when change ≥ 20%', () => {
    const ratios = [R({ ratio_key: 'car' })];
    const trend: TrendPoint[] = [
      { return_id: '1', period_end: '2025-01-01', ratios: { car: 20 } },
      { return_id: '2', period_end: '2025-04-01', ratios: { car: 18 } },
      { return_id: '3', period_end: '2025-07-01', ratios: { car: 10 } },
    ];
    const warnings = deriveEarlyWarnings(ratios, [], trend);
    expect(warnings.some((w) => w.reason === 'trend_deterioration' && w.metric_key === 'car')).toBe(true);
  });

  it('does NOT invent recommendations without a template', () => {
    const ratios = [R({ ratio_key: 'car', recommendation_template: null })];
    const breachByKey = new Map([['car', B({ risk_level: 'red' })]]);
    expect(pickRecommendations(ratios, breachByKey)).toEqual([]);
  });

  it('substitutes tokens in configured recommendation templates', () => {
    const ratios = [R({
      ratio_key: 'car', value: 6,
      recommendation_template: 'Increase {label} — currently {value}% vs floor {threshold}%.',
    })];
    const breachByKey = new Map([['car', B({ risk_level: 'red', threshold_value: 10 })]]);
    const recs = pickRecommendations(ratios, breachByKey);
    expect(recs).toHaveLength(1);
    expect(recs[0].text).toContain('Capital Adequacy');
    expect(recs[0].text).toContain('6');
    expect(recs[0].text).toContain('10');
  });

  it('peerPercentile places value against distribution', () => {
    expect(peerPercentile(50, [10, 20, 30, 40, 50, 60, 70])).toBe(Math.round(5 / 7 * 10000) / 100);
    expect(peerPercentile(100, [])).toBe(50);
  });

  it('computeAnalysis produces heatmap and health_score in [0,100]', () => {
    const ratios: RatioInput[] = [
      R({ ratio_key: 'car', category: 'capital' }),
      R({ ratio_key: 'lcr', category: 'liquidity' }),
      R({ ratio_key: 'npl', category: 'asset_quality' }),
      R({ ratio_key: 'roa', category: 'profitability' }),
    ];
    const breaches: BreachInput[] = [B({ metric_key: 'car', risk_level: 'red' })];
    const out = computeAnalysis(ratios, breaches);
    expect(out.health_score).toBeGreaterThanOrEqual(0);
    expect(out.health_score).toBeLessThanOrEqual(100);
    expect(out.heatmap).toHaveLength(4);
    expect(out.heatmap.find((h) => h.category === 'capital')?.risk_level).toBe('red');
    expect(out.heatmap.find((h) => h.category === 'liquidity')?.risk_level).toBe('green');
  });
});
