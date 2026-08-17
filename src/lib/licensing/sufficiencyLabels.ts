/**
 * Business-readable wording for the Application Sufficiency Review screen.
 *
 * Presentation only — stored status/severity/decision values are never changed.
 */

export type SufficiencyResultStatusValue = string;

const STATUS_LABELS: Record<string, string> = {
  pass: 'Passed',
  passed: 'Passed',
  warning: 'Needs attention',
  fail: 'Not satisfied',
  failed: 'Not satisfied',
  info: 'For information',
  skipped: 'Not applicable',
};

const SEVERITY_LABELS: Record<string, string> = {
  blocker: 'Blocking issue',
  warning: 'Needs attention',
  info: 'For information',
};

const DECISION_LABELS: Record<string, string> = {
  sufficient: 'Sufficient',
  insufficient: 'Insufficient',
  deferred: 'Deferred',
};

/** Title-cases an unknown backend value so it never reads like a code. */
export function humanizeValue(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function sufficiencyStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return STATUS_LABELS[status.toLowerCase()] ?? humanizeValue(status);
}

export function sufficiencySeverityLabel(severity: string | null | undefined): string {
  if (!severity) return '—';
  return SEVERITY_LABELS[severity.toLowerCase()] ?? humanizeValue(severity);
}

export function sufficiencyDecisionLabel(decision: string | null | undefined): string {
  if (!decision) return '—';
  return DECISION_LABELS[decision.toLowerCase()] ?? humanizeValue(decision);
}

/**
 * Label for a finding, taking severity into account so a failed blocker reads
 * as a blocking issue rather than merely "Not satisfied".
 */
export function findingLabel(status: string, severity: string): string {
  const s = (status || '').toLowerCase();
  if ((s === 'fail' || s === 'failed') && (severity || '').toLowerCase() === 'blocker') {
    return 'Blocking issue';
  }
  return sufficiencyStatusLabel(status);
}

export type FindingTone = 'positive' | 'attention' | 'negative' | 'neutral';

export function findingTone(status: string, severity: string): FindingTone {
  const s = (status || '').toLowerCase();
  if (s === 'pass' || s === 'passed') return 'positive';
  if (s === 'warning') return 'attention';
  if (s === 'fail' || s === 'failed') {
    return (severity || '').toLowerCase() === 'blocker' ? 'negative' : 'attention';
  }
  return 'neutral';
}

/** One-sentence explanation of the automated outcome, from the real counts. */
export function automatedOutcomeSentence(counts: {
  passed: number;
  warnings: number;
  blockers: number;
}): string {
  const { warnings, blockers } = counts;
  if (blockers > 0) {
    return `${blockers} blocking ${blockers === 1 ? 'issue' : 'issues'} must be resolved before the application can be determined sufficient.`;
  }
  if (warnings > 0) {
    return `No blocking issues were found, but ${warnings} ${warnings === 1 ? 'item requires' : 'items require'} reviewer attention.`;
  }
  return 'No blocking issues were identified by the automated checks.';
}

/**
 * Readable sentence for a finding, derived from the evaluation detail without
 * ever exposing raw JSON.
 */
export function findingDescription(
  detail: unknown,
  fallbackName?: string | null,
): string {
  const d = (detail ?? {}) as Record<string, unknown>;
  const candidates = [d.message, d.error, d.reason, d.description, d.summary];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  return fallbackName
    ? `Automated check: ${fallbackName}.`
    : 'No further detail was recorded for this check.';
}

/**
 * Business-readable reasons a "sufficient" determination was refused by the
 * server, built from the counts the RPC already returns.
 */
export function determinationBlockReasons(details: Record<string, unknown> | undefined): string[] {
  const reasons: string[] = [];
  const blockers = Number(details?.unresolved_blocker_count ?? details?.blocker_count ?? 0);
  const rfis = Number(details?.open_rfi_count ?? 0);
  if (blockers > 0) {
    reasons.push(`${blockers} blocking sufficiency ${blockers === 1 ? 'issue' : 'issues'}`);
  }
  if (rfis > 0) {
    reasons.push(`${rfis} open information ${rfis === 1 ? 'request' : 'requests'}`);
  }
  return reasons;
}

/**
 * True only when `later` is a valid timestamp strictly after a valid `earlier`.
 *
 * Used for the informational "Review recommended" notice: unparseable, null or
 * historically imported timestamps must never produce a false warning.
 */
export function isStrictlyAfter(
  later: string | null | undefined,
  earlier: string | null | undefined,
): boolean {
  if (!later || !earlier) return false;
  const a = new Date(later).getTime();
  const b = new Date(earlier).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a > b;
}

export const SUFFICIENCY_DECISION_OPTIONS: Array<{
  value: 'sufficient' | 'insufficient' | 'deferred';
  label: string;
  description: string;
}> = [
  {
    value: 'sufficient',
    label: 'Sufficient',
    description: 'The application contains enough information to proceed.',
  },
  {
    value: 'insufficient',
    label: 'Insufficient',
    description: 'The application does not currently contain enough information to proceed.',
  },
  {
    value: 'deferred',
    label: 'Deferred',
    description: 'A decision cannot yet be made because additional work or information is required.',
  },
];
