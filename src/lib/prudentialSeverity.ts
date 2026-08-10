/**
 * Canonical breach-severity model for prudential screens.
 *
 * Threshold breaches are stored with a traffic-light `risk_level` (red / amber /
 * green) and a `level` (breach / warn). Older/related records may carry
 * critical / high / medium / low. Everything is normalised here so labels,
 * tones, ranking and filters agree across the list, profile and dashboard.
 */

export type BreachSeverity = 'breach' | 'warn' | 'ok';

const ALIASES: Record<string, BreachSeverity> = {
  red: 'breach',
  breach: 'breach',
  critical: 'breach',
  high: 'breach',
  amber: 'warn',
  warn: 'warn',
  warning: 'warn',
  medium: 'warn',
  moderate: 'warn',
  green: 'ok',
  ok: 'ok',
  low: 'ok',
  none: 'ok',
};

/** Normalises any stored severity token; returns null when unknown/absent. */
export function normalizeSeverity(value?: string | null): BreachSeverity | null {
  if (!value) return null;
  return ALIASES[String(value).trim().toLowerCase()] ?? null;
}

const RANK: Record<BreachSeverity, number> = { breach: 0, warn: 1, ok: 2 };

export const SEVERITY_LABEL: Record<BreachSeverity, string> = {
  breach: 'Breach',
  warn: 'Warning',
  ok: 'Within limits',
};

export const SEVERITY_TONE: Record<BreachSeverity, string> = {
  breach: 'bg-destructive/10 text-destructive border-destructive/30',
  warn: 'bg-amber-500/10 text-amber-700 border-amber-200',
  ok: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
};

export const SEVERITY_FILTER_OPTIONS: Array<{ value: BreachSeverity; label: string }> = [
  { value: 'breach', label: SEVERITY_LABEL.breach },
  { value: 'warn', label: SEVERITY_LABEL.warn },
  { value: 'ok', label: SEVERITY_LABEL.ok },
];

/** Human label for a raw stored token. */
export function severityLabel(value?: string | null): string {
  const s = normalizeSeverity(value);
  return s ? SEVERITY_LABEL[s] : '—';
}

/** Badge tone classes for a raw stored token. */
export function severityTone(value?: string | null): string {
  const s = normalizeSeverity(value);
  return s ? SEVERITY_TONE[s] : 'bg-muted text-muted-foreground border-border';
}

/** Worst (most severe) of the given raw tokens; null when none are known. */
export function worstSeverity(values: Array<string | null | undefined>): BreachSeverity | null {
  let worst: BreachSeverity | null = null;
  for (const v of values) {
    const s = normalizeSeverity(v);
    if (!s) continue;
    if (!worst || RANK[s] < RANK[worst]) worst = s;
  }
  return worst;
}

/** True when the severity warrants supervisory escalation (FRD: critical/high). */
export function isEscalatable(value?: string | null): boolean {
  return normalizeSeverity(value) === 'breach';
}
