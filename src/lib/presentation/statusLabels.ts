/**
 * Plain-language presentation layer for canonical status codes.
 *
 * The database remains the source of truth: nothing here changes, maps or
 * re-derives business values. This module only decides how a canonical code is
 * SPOKEN to a user — its label, its badge tone and an optional one-line
 * explanation. Where the backend already supplies a `*_label` field, prefer it
 * and use this dictionary only as a fallback for stable system statuses.
 */

export type StatusTone =
  | 'neutral' | 'info' | 'progress' | 'positive' | 'warning' | 'critical' | 'muted';

export interface StatusPresentation {
  /** Human label, sentence case. */
  label: string;
  tone: StatusTone;
  /** Optional one-line explanation surfaced as a tooltip. */
  description?: string;
}

/** Sentence-case a snake_case / SCREAMING_CASE / kebab-case code. */
export function humanize(code: string): string {
  const spaced = code
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  if (!spaced) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Title Case a code — for column headers and section titles. */
export function titleCase(code: string): string {
  return humanize(code).replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

const TONE_BY_KEYWORD: Array<[RegExp, StatusTone]> = [
  [/(reject|fail|breach|critical|revok|terminat|dead_letter|overdue|severe|non_compliant)/, 'critical'],
  [/(warn|due|escalat|pending|awaiting|requested|correction|resubmit|remediat|expiring|open)/, 'warning'],
  [/(approve|accept|verified|active|complete|closed_satisfactor|resolved|compliant|passed|granted|current)/, 'positive'],
  [/(review|progress|assess|investigat|processing|validat|fieldwork|triage|draft_review)/, 'progress'],
  [/(submit|sent|issued|received|filed|new|created|scheduled|planned)/, 'info'],
  [/(draft|temp|inactive|withdrawn|cancel|archiv|superseded|closed|former|historical|not_applicable)/, 'muted'],
];

/**
 * Curated labels for stable system statuses. Anything absent falls back to a
 * humanized label plus a keyword-derived tone — never a raw code.
 */
const DICTIONARY: Record<string, StatusPresentation> = {
  // ---- returns / filing workflow -------------------------------------------
  TEMP: { label: 'Draft (not started)', tone: 'muted' },
  WIP: { label: 'In preparation', tone: 'progress' },
  SUB: { label: 'Submitted', tone: 'info' },
  VAL: { label: 'Validated', tone: 'progress' },
  TBR: { label: 'To be reviewed', tone: 'warning' },
  REJ: { label: 'Rejected', tone: 'critical' },
  draft: { label: 'Draft', tone: 'muted' },
  submitted: { label: 'Submitted', tone: 'info' },
  validated: { label: 'Validated', tone: 'progress' },
  under_review: { label: 'Under review', tone: 'progress' },
  in_review: { label: 'Under review', tone: 'progress' },
  correction_requested: { label: 'Correction requested', tone: 'warning', description: 'Returned to the filer for correction.' },
  correction_required: { label: 'Correction required', tone: 'warning' },
  resubmitted: { label: 'Resubmitted', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'positive' },
  rejected: { label: 'Rejected', tone: 'critical' },
  overdue: { label: 'Overdue', tone: 'critical' },
  not_started: { label: 'Not started', tone: 'muted' },

  // ---- entity lifecycle / identity ----------------------------------------
  pending_verification: { label: 'Pending verification', tone: 'warning' },
  verified: { label: 'Verified', tone: 'positive' },
  unverified: { label: 'Unverified', tone: 'warning' },
  provisional: { label: 'Provisional', tone: 'warning' },
  applicant: { label: 'Applicant', tone: 'info' },
  licensed: { label: 'Licensed', tone: 'positive' },
  former_licensee: { label: 'Former licensee', tone: 'muted' },
  active: { label: 'Active', tone: 'positive' },
  inactive: { label: 'Inactive', tone: 'muted' },
  suspended: { label: 'Suspended', tone: 'critical' },
  revoked: { label: 'Revoked', tone: 'critical' },
  surrendered: { label: 'Surrendered', tone: 'muted' },
  expired: { label: 'Expired', tone: 'critical' },
  merged: { label: 'Merged', tone: 'muted' },

  // ---- approval / workflow -------------------------------------------------
  pending: { label: 'Pending', tone: 'warning' },
  pending_approval: { label: 'Pending approval', tone: 'warning' },
  awaiting_approval: { label: 'Awaiting approval', tone: 'warning' },
  approved: { label: 'Approved', tone: 'positive' },
  not_required: { label: 'Not required', tone: 'muted' },
  withdrawn: { label: 'Withdrawn', tone: 'muted' },
  escalated: { label: 'Escalated', tone: 'critical' },
  completed: { label: 'Completed', tone: 'positive' },
  closed: { label: 'Closed', tone: 'muted' },
  open: { label: 'Open', tone: 'warning' },
  resolved: { label: 'Resolved', tone: 'positive' },
  acknowledged: { label: 'Acknowledged', tone: 'progress' },
  in_progress: { label: 'In progress', tone: 'progress' },

  // ---- risk / severity ----------------------------------------------------
  low: { label: 'Low', tone: 'positive' },
  medium: { label: 'Medium', tone: 'warning' },
  moderate: { label: 'Moderate', tone: 'warning' },
  high: { label: 'High', tone: 'critical' },
  critical: { label: 'Critical', tone: 'critical' },
  severe: { label: 'Severe', tone: 'critical' },

  // ---- ownership / governance --------------------------------------------
  current: { label: 'Current', tone: 'positive' },
  historical: { label: 'Historical', tone: 'muted' },
  superseded: { label: 'Superseded', tone: 'muted' },
  resigned: { label: 'Resigned', tone: 'muted' },
  terminated: { label: 'Terminated', tone: 'muted' },

  // ---- resilience / examinations -----------------------------------------
  scoping: { label: 'Scoping', tone: 'info' },
  fieldwork: { label: 'Fieldwork', tone: 'progress' },
  reporting: { label: 'Reporting', tone: 'progress' },
  remediation: { label: 'Remediation', tone: 'warning' },
  monitoring: { label: 'Monitoring', tone: 'progress' },
};

/** Resolve a canonical code into label + tone. Never returns a raw code. */
export function presentStatus(
  code: string | null | undefined,
  serverLabel?: string | null,
): StatusPresentation | null {
  if (code === null || code === undefined || code === '') {
    return serverLabel ? { label: serverLabel, tone: 'neutral' } : null;
  }
  const raw = String(code);
  const hit = DICTIONARY[raw] ?? DICTIONARY[raw.toLowerCase()];
  if (hit) return serverLabel ? { ...hit, label: serverLabel } : hit;

  const key = raw.toLowerCase();
  const tone = TONE_BY_KEYWORD.find(([re]) => re.test(key))?.[1] ?? 'neutral';
  return { label: serverLabel || humanize(raw), tone };
}

/** Badge classes per tone — semantic tokens only, no hard-coded palette. */
export const TONE_CLASS: Record<StatusTone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  muted: 'border-border bg-muted/60 text-muted-foreground',
  info: 'border-primary/30 bg-primary/10 text-primary',
  progress: 'border-accent-foreground/20 bg-accent text-accent-foreground',
  positive: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  critical: 'border-destructive/30 bg-destructive/10 text-destructive',
};
