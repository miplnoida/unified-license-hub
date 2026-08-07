/**
 * Phase 2 — Prudential supervisory intelligence: pure client-side helpers.
 *
 * These mirror the database contracts added in the Phase 2 migration so the UI
 * can label states consistently and so the rules are unit-testable:
 *  - `public.derive_ratio_result_state`  → {@link deriveRatioResultState}
 *  - `public.peer_ratio_snapshot`        → {@link readPeerState}, {@link peerPercentileOf}
 *  - `prudential_ewi_alerts` dedup key   → {@link ewiDedupKey}
 *  - assessment finalisation guard       → {@link isAssessmentFinal}
 */

export type RatioResultState =
  | 'CALCULATED'
  | 'INSUFFICIENT_DATA'
  | 'NOT_CONFIGURED'
  | 'CALCULATION_ERROR';

const INSUFFICIENT_REASONS = ['missing_input', 'missing_ratio_dependency'];
const NOT_CONFIGURED_REASONS = ['not_configured', 'no_ratio_config'];

/** Never turns missing data into a clean zero — mirrors the DB generated column. */
export function deriveRatioResultState(
  value: number | null | undefined,
  nullReason: string | null | undefined,
): RatioResultState {
  if (value !== null && value !== undefined) return 'CALCULATED';
  if (nullReason && INSUFFICIENT_REASONS.includes(nullReason)) return 'INSUFFICIENT_DATA';
  if (nullReason && NOT_CONFIGURED_REASONS.includes(nullReason)) return 'NOT_CONFIGURED';
  if (nullReason) return 'CALCULATION_ERROR';
  return 'INSUFFICIENT_DATA';
}

export const RATIO_RESULT_STATE_LABEL: Record<RatioResultState, string> = {
  CALCULATED: 'Calculated',
  INSUFFICIENT_DATA: 'Insufficient data',
  NOT_CONFIGURED: 'Not configured',
  CALCULATION_ERROR: 'Calculation error',
};

export type PeerState = 'OK' | 'INSUFFICIENT_PEER_DATA' | 'UNAVAILABLE';

export interface PeerSnapshot {
  ratio_key?: string;
  period_end?: string;
  state?: string;
  peer_count?: number;
  count?: number;
  min_peers?: number;
  entity_value?: number | null;
  percentile?: number | null;
  median?: number | null;
  average?: number | null;
  p25?: number | null;
  p90?: number | null;
  min?: number | null;
  max?: number | null;
  peer_group?: { sector_id: string | null; category_id: string | null };
}

/** Defensive read: a snapshot without an explicit state is treated as unavailable. */
export function readPeerState(snapshot: PeerSnapshot | null | undefined): PeerState {
  if (!snapshot) return 'UNAVAILABLE';
  if (snapshot.state === 'OK') return 'OK';
  if (snapshot.state === 'INSUFFICIENT_PEER_DATA') return 'INSUFFICIENT_PEER_DATA';
  return 'UNAVAILABLE';
}

/** Percentile of `value` within `peers`; null when the sample is unusable. */
export function peerPercentileOf(value: number | null | undefined, peers: number[]): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const sample = peers.filter((p) => Number.isFinite(p));
  if (!sample.length) return null;
  const below = sample.filter((p) => p < value).length;
  return Math.round((below / sample.length) * 10000) / 100;
}

/** Matches the UNIQUE (entity_id, rule_id, period_end, metric_key) dedup constraint. */
export function ewiDedupKey(alert: {
  entity_id: string;
  rule_id: string;
  period_end?: string | null;
  metric_key?: string | null;
}): string {
  return [alert.entity_id, alert.rule_id, alert.period_end ?? '', alert.metric_key ?? ''].join('|');
}

export const FINAL_ASSESSMENT_STATUSES = ['approved', 'closed'] as const;

/** Finalised assessments are immutable in the database — the UI must match. */
export function isAssessmentFinal(status: string | null | undefined): boolean {
  return !!status && (FINAL_ASSESSMENT_STATUSES as readonly string[]).includes(status);
}

/** Editable only while drafting or awaiting/after revision. */
export function isAssessmentEditable(status: string | null | undefined): boolean {
  return ['draft', 'submitted', 'returned_for_revision'].includes(status ?? '');
}

export type GroupDataState = 'COMPLETE_GROUP_DATA' | 'PARTIAL_GROUP_DATA' | 'NO_GROUP_DATA';

export function deriveGroupDataState(membersTotal: number, membersMissing: number): GroupDataState {
  if (membersTotal === 0 || membersMissing >= membersTotal) return 'NO_GROUP_DATA';
  if (membersMissing > 0) return 'PARTIAL_GROUP_DATA';
  return 'COMPLETE_GROUP_DATA';
}

export const GROUP_DATA_STATE_LABEL: Record<GroupDataState, string> = {
  COMPLETE_GROUP_DATA: 'Complete group data',
  PARTIAL_GROUP_DATA: 'Partial group data',
  NO_GROUP_DATA: 'No group data',
};
