/**
 * MC-07.5 — Business language for governed AI advisory content.
 *
 * The advisory UI never shows a raw code, enum value, identifier or server
 * function name. Everything a supervisor reads comes through this module.
 */

export const ADVISORY_USE_CASES = [
  'SUPERVISORY_SUMMARY',
  'MATERIAL_CHANGE_EXPLANATION',
  'RECORDS_TO_REVIEW',
  'SUPERVISORY_QUESTIONS',
  'RISK_HYPOTHESIS',
] as const;

export type AdvisoryUseCase = (typeof ADVISORY_USE_CASES)[number];

interface UseCaseMeta {
  label: string;
  purpose: string;
  /** Standing caveat shown with every item of this type. */
  caveat: string;
}

export const USE_CASE_META: Record<AdvisoryUseCase, UseCaseMeta> = {
  SUPERVISORY_SUMMARY: {
    label: 'Supervisory summary',
    purpose: 'A narrative summary of the conduct position already recorded for this window.',
    caveat: 'Summary of recorded facts only. It is not an assessment, finding or decision.',
  },
  MATERIAL_CHANGE_EXPLANATION: {
    label: 'Material change explanation',
    purpose: 'What moved against the previous window, and which records the movement sits in.',
    caveat: 'Describes movement in the records. Causation is not established.',
  },
  RECORDS_TO_REVIEW: {
    label: 'Records to review',
    purpose: 'Suggested records a supervisor may want to open first.',
    caveat: 'Suggestions for supervisory attention only. No record is changed by this advice.',
  },
  SUPERVISORY_QUESTIONS: {
    label: 'Supervisory questions',
    purpose: 'Draft questions a supervisor may consider putting to the entity.',
    caveat: 'Working material only. No information request or correspondence is issued from here.',
  },
  RISK_HYPOTHESIS: {
    label: 'Risk hypothesis',
    purpose: 'Possible explanations a supervisor could test against the entity’s records.',
    caveat: 'Hypothesis — not a risk rating or finding.',
  },
};

export const ADVISORY_LABEL = 'AI suggestion — requires human review';

export type ReviewState = 'NOT_REVIEWED' | 'ACCEPTED' | 'MODIFIED' | 'REJECTED' | 'SUPERSEDED';

export const REVIEW_STATE_META: Record<ReviewState, { label: string; tone: 'muted' | 'success' | 'warning' | 'danger' }> = {
  NOT_REVIEWED: { label: 'Awaiting human review', tone: 'warning' },
  ACCEPTED: { label: 'Accepted by supervisor', tone: 'success' },
  MODIFIED: { label: 'Modified by supervisor', tone: 'success' },
  REJECTED: { label: 'Rejected by supervisor', tone: 'danger' },
  SUPERSEDED: { label: 'Superseded', tone: 'muted' },
};

export const reviewStateLabel = (value?: string | null): string =>
  REVIEW_STATE_META[(value ?? 'NOT_REVIEWED') as ReviewState]?.label ?? 'Awaiting human review';

export type ReviewAction = 'accept' | 'modify' | 'reject' | 'supersede';

export const REVIEW_ACTION_META: Record<ReviewAction, { label: string; description: string; rationaleRequired: boolean; textRequired: boolean }> = {
  accept: {
    label: 'Accept',
    description: 'Record that you, as the supervisor, accept this advisory wording as useful working material.',
    rationaleRequired: false,
    textRequired: false,
  },
  modify: {
    label: 'Modify',
    description: 'Keep the original suggestion on record and add your own approved wording.',
    rationaleRequired: true,
    textRequired: true,
  },
  reject: {
    label: 'Reject',
    description: 'Record that this advisory should not be relied on, with your reason.',
    rationaleRequired: true,
    textRequired: false,
  },
  supersede: {
    label: 'Supersede',
    description: 'Close this advisory off because it has been replaced by newer assistance.',
    rationaleRequired: false,
    textRequired: false,
  },
};

export const STALENESS_META = {
  CURRENT: {
    label: 'Current',
    description: 'The regulatory facts behind this advisory have not changed since it was prepared.',
  },
  STALE: {
    label: 'Stale',
    description: 'Underlying facts have changed',
  },
} as const;

export type StalenessState = keyof typeof STALENESS_META;

export const stalenessLabel = (value?: string | null): string =>
  STALENESS_META[(value ?? 'CURRENT') as StalenessState]?.label ?? 'Current';

/** Plain wording for a 0–1 model confidence value. Never shown as a bare number alone. */
export function confidenceLabel(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'Not stated';
  const v = Number(value);
  const band = v >= 0.85 ? 'High' : v >= 0.6 ? 'Moderate' : v >= 0.35 ? 'Low' : 'Very low';
  return `${band} (${Math.round(v * 100)}%)`;
}

/** Business label for the fact section a citation came from. */
const SECTION_LABELS: Record<string, string> = {
  entity: 'Entity record',
  posture: 'Conduct posture',
  complaints: 'Complaint',
  redress: 'Redress',
  signals: 'Conduct signal',
  patterns: 'Detected pattern',
  alerts: 'Conduct alert',
  risk_indicators: 'Finding',
  findings: 'Finding',
  open_items: 'Open supervisory item',
  recent_activity: 'Recorded activity',
  outcomes: 'Complaint outcome',
  product_channel: 'Product and channel',
  trends: 'Movement measure',
};

export const citationSectionLabel = (section?: string | null): string => {
  if (!section) return 'Regulatory record';
  return SECTION_LABELS[section] ?? section.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

/** Derives a record type from the reference prefix, falling back to the section. */
export const referenceTypeLabel = (reference: string, section?: string | null): string => {
  const prefix = reference.split('-')[0]?.toUpperCase();
  const byPrefix: Record<string, string> = {
    CMP: 'Complaint',
    SIG: 'Conduct signal',
    PAT: 'Detected pattern',
    ALT: 'Conduct alert',
    FND: 'Finding',
    RED: 'Redress',
    OUT: 'Complaint outcome',
  };
  return (prefix && byPrefix[prefix]) || citationSectionLabel(section);
};
