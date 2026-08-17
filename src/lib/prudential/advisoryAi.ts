/**
 * Advisory AI layer for prudential risk scoring, ratio/peer analytics and risk
 * dashboards.
 *
 * Everything here is presentation/support only:
 *  - deterministic engines calculate (risk scores, thresholds, EWI, ratios, peers)
 *  - this layer asks the AI to INTERPRET those already-calculated facts
 *  - human supervisors decide; nothing here writes to a supervisory table
 *
 * AI output is never treated as a metric, never replaces a value on screen and
 * never gates an action.
 */

export type AdvisoryAnalysisType =
  | 'risk_interpretation'
  | 'risk_changes'
  | 'ewi_priority'
  | 'trend_commentary'
  | 'peer_divergence'
  | 'portfolio_summary'
  | 'heatmap_movement';

export interface AdvisoryObservation {
  text: string;
  evidence?: string[];
}

export interface AdvisoryPayload {
  summary?: string;
  key_observations?: AdvisoryObservation[];
  deteriorating_indicators?: AdvisoryObservation[];
  improving_indicators?: AdvisoryObservation[];
  peer_observations?: AdvisoryObservation[];
  emerging_risks?: AdvisoryObservation[];
  business_impact?: AdvisoryObservation[];
  data_quality?: AdvisoryObservation[];
  suggested_focus_areas?: string[];
  confidence?: 'high' | 'moderate' | 'limited';
  limitations?: string[];
  insufficient_evidence?: boolean;
}

export interface AdvisoryInsight {
  id: string | null;
  analysis_type: AdvisoryAnalysisType;
  payload: AdvisoryPayload;
  provider_state?: string | null;
  model?: string | null;
  period_key?: string | null;
  input_fingerprint?: string | null;
  generated_at?: string | null;
  feedback?: string | null;
}

export const CONFIDENCE_LABEL: Record<string, string> = {
  high: 'High confidence',
  moderate: 'Moderate confidence',
  limited: 'Limited confidence',
};

/** Human wording for each advisory section. */
export const SECTION_LABELS: Array<{ key: keyof AdvisoryPayload; label: string }> = [
  { key: 'key_observations', label: 'What the data shows' },
  { key: 'deteriorating_indicators', label: 'Areas getting worse' },
  { key: 'improving_indicators', label: 'Areas improving' },
  { key: 'peer_observations', label: 'Compared with peers' },
  { key: 'emerging_risks', label: 'Possible emerging risks' },
  { key: 'business_impact', label: 'Business and supervisory implications' },
  { key: 'data_quality', label: 'Data quality and integrity of the figures' },
];

/** Stable JSON — key order must not change the fingerprint. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

/**
 * Fingerprint of the deterministic inputs. When the platform recalculates any
 * fact, the fingerprint changes and the cached advisory analysis is marked as
 * out of date instead of being shown as current.
 */
export function fingerprintFacts(facts: unknown): string {
  const text = stableStringify(facts);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = ((h1 ^ c) * 0x01000193) >>> 0;
    h2 = ((h2 + c) * 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}`;
}

export function hasAdvisoryContent(payload?: AdvisoryPayload | null): boolean {
  if (!payload) return false;
  if (payload.summary && payload.summary.trim().length > 0) return true;
  return SECTION_LABELS.some((s) => (payload[s.key] as AdvisoryObservation[] | undefined)?.length);
}

/** Friendly message for a provider/AI failure state — never a raw code. */
export function advisoryStateMessage(state?: string | null): string | null {
  switch (state) {
    case 'NOT_CONFIGURED':
      return 'AI-assisted analysis is not configured for this environment. All figures and indicators on this page are unaffected.';
    case 'RATE_LIMITED':
      return 'The AI service is busy right now. Please try again in a moment — the supervisory data below is unaffected.';
    case 'INSUFFICIENT_DATA':
      return 'There is not enough filed data in this period for a reliable AI interpretation.';
    case 'PROVIDER_FAILURE':
      return 'AI-assisted analysis could not be produced. All figures and indicators on this page are unaffected.';
    default:
      return null;
  }
}
