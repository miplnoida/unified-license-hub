// Deterministic scoring & derivation utilities for the Return Consolidated
// Analysis engine. Kept pure so the same logic runs in the edge function
// (Deno) and is unit-testable here.

export type Category =
  | 'capital' | 'liquidity' | 'asset_quality' | 'profitability' | 'concentration' | 'other';
export type RiskLevel = 'green' | 'amber' | 'red';

export interface RatioInput {
  ratio_key: string;
  label: string;
  category: Category;
  value: number | null;
  display_format: string;
  null_reason?: string | null;
  unit?: string | null;
  recommendation_template?: string | null;
}

export interface BreachInput {
  metric_key: string;
  risk_level: RiskLevel;   // amber | red (green means "no breach")
  level: 'warn' | 'breach';
  value: number;
  threshold_value: number;
  comparator: string;
  detected_at?: string;
}

export interface TrendPoint {
  return_id: string;
  period_end: string;
  ratios: Record<string, number | null>;
}

export interface CategoryMetric {
  key: string;
  label: string;
  value: number | null;
  unit: string | null;
  risk_level: RiskLevel;
  threshold: number | null;
  null_reason?: string | null;
}

export interface CategorySummary {
  category: Category;
  score: number;               // 0..100
  metrics: CategoryMetric[];
  commentary_facts: string[];  // raw facts, not prose
}

export interface EarlyWarning {
  metric_key: string;
  level: RiskLevel;
  reason: 'consecutive_amber' | 'trend_deterioration' | 'null_reason_cluster';
  evidence: Array<Record<string, unknown>>;
}

export interface Recommendation {
  category: Category;
  metric_key: string;
  level: RiskLevel;
  text: string;
  source_template: string;
}

const RISK_SCORE: Record<RiskLevel, number> = { green: 100, amber: 60, red: 20 };
const CORE_CATEGORIES: Category[] = ['capital', 'liquidity', 'asset_quality', 'profitability'];

/** Risk level for a single ratio given the breaches keyed by metric_key. */
export function ratioRisk(r: RatioInput, breachByKey: Map<string, BreachInput>): RiskLevel {
  const b = breachByKey.get(r.ratio_key);
  if (!b) return 'green';
  return b.risk_level;
}

/** Category score = weighted average of ratio risks (null_reason → 50). */
export function computeCategoryScore(
  ratios: RatioInput[],
  breachByKey: Map<string, BreachInput>,
): number {
  if (ratios.length === 0) return 100;
  let sum = 0;
  for (const r of ratios) {
    if (r.value === null) { sum += 50; continue; }
    sum += RISK_SCORE[ratioRisk(r, breachByKey)];
  }
  return Math.round((sum / ratios.length) * 100) / 100;
}

/** Health score = mean of the four CORE category scores (0..100). */
export function computeHealthScore(scoresByCat: Partial<Record<Category, number>>): number {
  const values = CORE_CATEGORIES.map((c) => scoresByCat[c]).filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(mean * 100) / 100;
}

/** Build a category summary from ratios + breaches. */
export function buildCategorySummary(
  category: Category,
  ratios: RatioInput[],
  breachByKey: Map<string, BreachInput>,
): CategorySummary {
  const inCat = ratios.filter((r) => r.category === category);
  const metrics: CategoryMetric[] = inCat.map((r) => {
    const b = breachByKey.get(r.ratio_key);
    return {
      key: r.ratio_key,
      label: r.label,
      value: r.value,
      unit: r.unit ?? r.display_format ?? null,
      risk_level: r.value === null ? 'amber' : (b?.risk_level ?? 'green'),
      threshold: b?.threshold_value ?? null,
      null_reason: r.null_reason ?? null,
    };
  });
  const facts: string[] = [];
  const reds = metrics.filter((m) => m.risk_level === 'red');
  const ambers = metrics.filter((m) => m.risk_level === 'amber');
  if (reds.length) facts.push(`red_breach_count=${reds.length}`);
  if (ambers.length) facts.push(`amber_breach_count=${ambers.length}`);
  const nulls = metrics.filter((m) => m.value === null);
  if (nulls.length) facts.push(`missing_ratios=${nulls.length}`);
  return {
    category,
    score: computeCategoryScore(inCat, breachByKey),
    metrics,
    commentary_facts: facts,
  };
}

/** Heatmap: worst risk level per category. */
export function buildHeatmap(summaries: CategorySummary[]): Array<{ category: Category; risk_level: RiskLevel }> {
  return summaries.map((s) => {
    const worst = s.metrics.reduce<RiskLevel>((acc, m) => {
      if (m.risk_level === 'red') return 'red';
      if (m.risk_level === 'amber' && acc !== 'red') return 'amber';
      return acc;
    }, 'green');
    return { category: s.category, risk_level: worst };
  });
}

/** Early-warning derivation from ratios + trend + breaches. */
export function deriveEarlyWarnings(
  ratios: RatioInput[],
  breaches: BreachInput[],
  trend: TrendPoint[],
): EarlyWarning[] {
  const out: EarlyWarning[] = [];

  // (a) Two consecutive amber breaches on same metric across trend history.
  //     We approximate "consecutive amber" as: the metric has ≥2 samples in
  //     trend where the value is on the wrong side of the current threshold.
  const breachByKey = new Map(breaches.map((b) => [b.metric_key, b] as const));
  for (const [key, b] of breachByKey) {
    if (b.risk_level !== 'amber') continue;
    const series = trend
      .map((t) => t.ratios[key])
      .filter((v): v is number => typeof v === 'number');
    let streak = 0;
    for (const v of series) {
      const bad =
        b.comparator === '>' || b.comparator === '>=' ? v >= b.threshold_value :
        b.comparator === '<' || b.comparator === '<=' ? v <= b.threshold_value :
        false;
      streak = bad ? streak + 1 : 0;
      if (streak >= 2) {
        out.push({
          metric_key: key, level: 'amber', reason: 'consecutive_amber',
          evidence: [{ streak, comparator: b.comparator, threshold: b.threshold_value }],
        });
        break;
      }
    }
  }

  // (b) Trend deterioration > 20% between oldest and newest sample.
  const keys = new Set<string>(); ratios.forEach((r) => keys.add(r.ratio_key));
  for (const key of keys) {
    const series = trend
      .map((t) => t.ratios[key])
      .filter((v): v is number => typeof v === 'number');
    if (series.length < 2) continue;
    const oldest = series[0], newest = series[series.length - 1];
    if (oldest === 0) continue;
    const change = (newest - oldest) / Math.abs(oldest);
    if (Math.abs(change) >= 0.2) {
      out.push({
        metric_key: key,
        level: Math.abs(change) >= 0.5 ? 'red' : 'amber',
        reason: 'trend_deterioration',
        evidence: [{ oldest, newest, change_pct: Math.round(change * 10000) / 100 }],
      });
    }
  }

  // (c) null_reason clusters — 3+ ratios with the same null_reason in one filing.
  const clusters: Record<string, string[]> = {};
  for (const r of ratios) {
    if (r.value === null && r.null_reason) {
      (clusters[r.null_reason] ??= []).push(r.ratio_key);
    }
  }
  for (const [reason, keys] of Object.entries(clusters)) {
    if (keys.length >= 3) {
      out.push({
        metric_key: keys[0], level: 'amber', reason: 'null_reason_cluster',
        evidence: [{ null_reason: reason, ratios: keys }],
      });
    }
  }
  return out;
}

/** Recommendations pulled ONLY from configured templates — never fabricated. */
export function pickRecommendations(
  ratios: RatioInput[],
  breachByKey: Map<string, BreachInput>,
): Recommendation[] {
  const out: Recommendation[] = [];
  for (const r of ratios) {
    const b = breachByKey.get(r.ratio_key);
    if (!b) continue;
    if (!r.recommendation_template || !r.recommendation_template.trim()) continue;
    const text = r.recommendation_template
      .replace(/\{value\}/g, r.value == null ? '—' : String(r.value))
      .replace(/\{threshold\}/g, String(b.threshold_value))
      .replace(/\{label\}/g, r.label);
    out.push({
      category: r.category,
      metric_key: r.ratio_key,
      level: b.risk_level,
      text,
      source_template: r.recommendation_template,
    });
  }
  return out;
}

/** Peer percentile placement in [0,100] given a metric value and the peer distribution. */
export function peerPercentile(value: number, peers: number[]): number {
  if (peers.length === 0) return 50;
  const sorted = peers.slice().sort((a, b) => a - b);
  let below = 0;
  for (const p of sorted) { if (p < value) below++; }
  return Math.round((below / sorted.length) * 10000) / 100;
}

/** Aggregate everything except the AI summary. */
export interface AnalysisComputation {
  health_score: number;
  summaries: Record<'capital' | 'liquidity' | 'asset_quality' | 'profitability', CategorySummary>;
  concentration_risks: CategoryMetric[];
  heatmap: Array<{ category: Category; risk_level: RiskLevel }>;
  early_warnings: EarlyWarning[];
  recommendations: Recommendation[];
}

export function computeAnalysis(
  ratios: RatioInput[],
  breaches: BreachInput[],
  trend: TrendPoint[] = [],
): AnalysisComputation {
  const breachByKey = new Map(breaches.map((b) => [b.metric_key, b] as const));
  const summaries = {
    capital:        buildCategorySummary('capital',        ratios, breachByKey),
    liquidity:      buildCategorySummary('liquidity',      ratios, breachByKey),
    asset_quality:  buildCategorySummary('asset_quality',  ratios, breachByKey),
    profitability:  buildCategorySummary('profitability',  ratios, breachByKey),
  };
  const concentration_risks = buildCategorySummary('concentration', ratios, breachByKey).metrics
    .filter((m) => m.risk_level !== 'green');
  const health_score = computeHealthScore({
    capital: summaries.capital.score,
    liquidity: summaries.liquidity.score,
    asset_quality: summaries.asset_quality.score,
    profitability: summaries.profitability.score,
  });
  const heatmap = buildHeatmap([
    summaries.capital, summaries.liquidity, summaries.asset_quality, summaries.profitability,
  ]);
  const early_warnings = deriveEarlyWarnings(ratios, breaches, trend);
  const recommendations = pickRecommendations(ratios, breachByKey);
  return { health_score, summaries, concentration_risks, heatmap, early_warnings, recommendations };
}
