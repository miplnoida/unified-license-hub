/**
 * Plain-language wording for consolidated return analysis output.
 *
 * These are presentation helpers only: they turn the evidence that
 * `src/lib/consolidatedAnalysis.ts` already computed into short sentences and
 * rounded figures. No scoring, no thresholds and no new conclusions — the
 * wording states direction and magnitude, never a cause.
 */

export interface NarrativeDetail {
  label: string;
  value: string;
}

export interface EarlyWarningNarrative {
  /** Ratio label (falls back to a humanised key). */
  headline: string;
  /** Technical key, shown small and secondary. */
  metricKey: string;
  /** One readable sentence. */
  sentence: string;
  /** Supporting figures as labelled chips — never raw JSON. */
  details: NarrativeDetail[];
}

interface WarningInput {
  metric_key: string;
  reason: string;
  evidence?: Array<Record<string, unknown>> | null;
}

/** Two-decimal ratio value; `—` when unavailable. */
export function formatRatioValue(value: unknown): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

/** Signed percentage with two decimals, e.g. `-40.90%`. */
export function formatPercent(value: unknown): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

/** Turn a stored comparator into words a non-specialist reads. */
export function comparatorPhrase(comparator: unknown): string {
  switch (String(comparator ?? '')) {
    case '>':
      return 'above';
    case '>=':
      return 'at or above';
    case '<':
      return 'below';
    case '<=':
      return 'at or below';
    case '=':
    case '==':
      return 'at';
    default:
      return 'outside';
  }
}

/** `car_total` → `Car total`, used only when no configured label exists. */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/[_.-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}

const PRETTY_FIELD: Record<string, string> = {
  oldest: 'Earliest filing',
  newest: 'Latest filing',
  change_pct: 'Change',
  streak: 'Consecutive filings',
  threshold: 'Limit',
  comparator: 'Compared',
  null_reason: 'Reason given',
  ratios: 'Ratios affected',
};

function fallbackDetails(evidence: Record<string, unknown>): NarrativeDetail[] {
  return Object.entries(evidence).map(([k, v]) => ({
    label: PRETTY_FIELD[k] ?? humanizeKey(k),
    value: Array.isArray(v)
      ? v.map((i) => String(i)).join(', ')
      : typeof v === 'number'
        ? formatRatioValue(v)
        : String(v ?? '—'),
  }));
}

/**
 * Readable description of one early warning.
 *
 * `labelByKey` maps ratio keys to their configured labels so the heading is a
 * supervisory name rather than a database key.
 */
export function describeEarlyWarning(
  warning: WarningInput,
  labelByKey: Record<string, string> = {},
): EarlyWarningNarrative {
  const evidence = warning.evidence?.[0] ?? {};
  const headline = labelByKey[warning.metric_key] ?? humanizeKey(warning.metric_key);
  const base = { headline, metricKey: warning.metric_key };

  switch (warning.reason) {
    case 'trend_deterioration': {
      const oldest = evidence.oldest as number | undefined;
      const newest = evidence.newest as number | undefined;
      const changePct = evidence.change_pct as number | undefined;
      const direction = typeof changePct === 'number' && changePct > 0 ? 'rose' : 'fell';
      const magnitude =
        typeof changePct === 'number' ? `${Math.abs(changePct).toFixed(2)}%` : 'noticeably';
      return {
        ...base,
        sentence: `${headline} ${direction} ${magnitude} over the filings compared — from ${formatRatioValue(
          oldest,
        )} to ${formatRatioValue(newest)}.`,
        details: [
          { label: 'Earliest filing', value: formatRatioValue(oldest) },
          { label: 'Latest filing', value: formatRatioValue(newest) },
          { label: 'Change', value: formatPercent(changePct) },
        ],
      };
    }

    case 'consecutive_amber': {
      const streak = Number(evidence.streak ?? 0);
      const threshold = evidence.threshold as number | undefined;
      const phrase = comparatorPhrase(evidence.comparator);
      const count = streak > 0 ? `${streak} consecutive filings` : 'consecutive filings';
      return {
        ...base,
        sentence: `Warning level reached in ${count} — the value stayed ${phrase} the ${formatRatioValue(
          threshold,
        )} limit.`,
        details: [
          { label: 'Consecutive filings', value: streak > 0 ? String(streak) : '—' },
          { label: 'Limit', value: formatRatioValue(threshold) },
          { label: 'Value stayed', value: phrase },
        ],
      };
    }

    case 'null_reason_cluster': {
      const ratios = Array.isArray(evidence.ratios) ? (evidence.ratios as unknown[]) : [];
      const reason = String(evidence.null_reason ?? 'no reason recorded');
      const names = ratios.map((k) => labelByKey[String(k)] ?? humanizeKey(String(k)));
      return {
        ...base,
        sentence: `${ratios.length || 'Several'} ratios could not be calculated for the same reason: ${reason}.`,
        details: names.length ? [{ label: 'Ratios affected', value: names.join(', ') }] : [],
      };
    }

    default:
      return {
        ...base,
        sentence: `${humanizeKey(warning.reason)} flagged for ${headline}.`,
        details: fallbackDetails(evidence),
      };
  }
}

export interface PeerPosition {
  /** Plain-language position relative to the peer median. */
  label: string;
  /** Rounded absolute gap to the median, or null when not comparable. */
  gap: string | null;
}

/**
 * Where this entity sits against the peer median. Purely descriptive — being
 * above or below the median is not asserted to be good or bad.
 */
export function peerPosition(myValue: unknown, median: unknown): PeerPosition | null {
  const mine = typeof myValue === 'string' ? Number(myValue) : myValue;
  const mid = typeof median === 'string' ? Number(median) : median;
  if (typeof mine !== 'number' || !Number.isFinite(mine)) return null;
  if (typeof mid !== 'number' || !Number.isFinite(mid)) return null;
  const diff = mine - mid;
  // Anything that rounds to the same two decimals reads as "in line".
  if (Math.abs(diff) < 0.005) return { label: 'In line with peers', gap: null };
  return {
    label: diff > 0 ? 'Above the peer median' : 'Below the peer median',
    gap: Math.abs(diff).toFixed(2),
  };
}
