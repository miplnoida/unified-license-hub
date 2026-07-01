// Prudential ratio evaluator + threshold breach detection.
// Ratio formulas use the same `formId.fieldKey` token grammar as validation rules.
// Persistence happens server-side via record_return_ratio / record_return_breach RPCs.

import { safeEvaluate } from '@/lib/safeEval';

function safeEval(expr: string): number {
  const { value, error } = safeEvaluate(expr);
  if (error) throw new Error(error);
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error('Non-numeric ratio');
  return n;
}
import type { ReturnFormData } from '@/lib/returnsValidation';

export type RatioDisplayFormat = 'decimal' | 'percent' | 'currency' | 'ratio';

export interface PrudentialRatio {
  id: string;
  return_config_id: string;
  ratio_key: string;
  label: string;
  formula: string;
  display_format: RatioDisplayFormat;
  metric_key: string | null;
  is_active: boolean;
}

export interface PrudentialThreshold {
  id: string;
  return_config_id: string;
  metric_key: string;
  label: string;
  comparator: '>=' | '<=' | 'between';
  warn_value: number | null;
  breach_value: number | null;
  upper_value: number | null;
  unit: string | null;
  is_active: boolean;
}

export interface ComputedRatio {
  ratio_key: string;
  label: string;
  value: number | null;
  display_format: RatioDisplayFormat;
  metric_key: string | null;
  error?: string;
}

export interface DetectedBreach {
  metric_key: string;
  level: 'warn' | 'breach';
  value: number;
  threshold_value: number;
  comparator: PrudentialThreshold['comparator'];
}

function resolveTokens(expr: string, data: ReturnFormData): string {
  return expr.replace(/([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/g, (_m, fid: string, key: string) => {
    const v = data[fid]?.[key];
    if (v === undefined || v === null || v === '') return '0';
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : '0';
  });
}

export function computeRatio(ratio: PrudentialRatio, data: ReturnFormData): ComputedRatio {
  try {
    const value = safeEval(resolveTokens(ratio.formula, data));
    return {
      ratio_key: ratio.ratio_key,
      label: ratio.label,
      value: Number.isFinite(value) ? value : null,
      display_format: ratio.display_format,
      metric_key: ratio.metric_key,
    };
  } catch (e) {
    return {
      ratio_key: ratio.ratio_key,
      label: ratio.label,
      value: null,
      display_format: ratio.display_format,
      metric_key: ratio.metric_key,
      error: e instanceof Error ? e.message : 'Formula error',
    };
  }
}

export function computeAllRatios(ratios: PrudentialRatio[], data: ReturnFormData): ComputedRatio[] {
  return ratios.filter((r) => r.is_active).map((r) => computeRatio(r, data));
}

/** Detect breaches by matching ratio.metric_key to threshold.metric_key. */
export function detectBreaches(
  computed: ComputedRatio[],
  thresholds: PrudentialThreshold[],
): DetectedBreach[] {
  const byKey = new Map(thresholds.filter((t) => t.is_active).map((t) => [t.metric_key, t]));
  const out: DetectedBreach[] = [];
  for (const c of computed) {
    if (c.value == null) continue;
    const key = c.metric_key || c.ratio_key;
    const t = byKey.get(key);
    if (!t) continue;
    const v = c.value;

    const check = (level: 'warn' | 'breach', limit: number | null): boolean => {
      if (limit == null) return false;
      if (t.comparator === '>=') return v < limit;
      if (t.comparator === '<=') return v > limit;
      if (t.comparator === 'between') {
        if (t.upper_value == null) return false;
        return v < limit || v > t.upper_value;
      }
      return false;
    };

    if (check('breach', t.breach_value)) {
      out.push({ metric_key: key, level: 'breach', value: v, threshold_value: t.breach_value!, comparator: t.comparator });
    } else if (check('warn', t.warn_value)) {
      out.push({ metric_key: key, level: 'warn', value: v, threshold_value: t.warn_value!, comparator: t.comparator });
    }
  }
  return out;
}

export function formatRatioValue(value: number | null, fmt: RatioDisplayFormat): string {
  if (value == null || !Number.isFinite(value)) return '—';
  switch (fmt) {
    case 'percent': return `${(value * 100).toFixed(2)}%`;
    case 'currency': return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    case 'ratio': return value.toFixed(4);
    case 'decimal':
    default: return value.toFixed(4);
  }
}
