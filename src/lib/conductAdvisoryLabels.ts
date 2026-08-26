/**
 * MC-07.5 — Business language for governed AI advisory content.
 *
 * The advisory UI never shows a raw code, enum value, identifier or server
 * function name. Everything a supervisor reads comes through this module.
 */

/** Entity-scoped advisory types (MC-07, Conduct 360). */
export const ADVISORY_USE_CASES = [
  'SUPERVISORY_SUMMARY',
  'MATERIAL_CHANGE_EXPLANATION',
  'RECORDS_TO_REVIEW',
  'SUPERVISORY_QUESTIONS',
  'RISK_HYPOTHESIS',
] as const;

/** Cross-entity advisory types for a sector theme (MC-09). */
export const THEME_ADVISORY_USE_CASES = [
  'CROSS_ENTITY_INTERPRETATION',
  'THEME_MATERIAL_CHANGE',
  'SECTOR_SUPERVISORY_QUESTIONS',
] as const;

/** Advisory types for an emerging conduct risk (MC-09). */
export const EMERGING_RISK_ADVISORY_USE_CASES = [
  'EMERGING_RISK_NARRATIVE',
  'EMERGING_RISK_HYPOTHESIS',
] as const;

/** Advisory types for a supervisory attention item (MC-10). */
export const ATTENTION_ADVISORY_USE_CASES = [
  'ATTENTION_SUMMARY',
  'PLANNING_RECORDS_TO_REVIEW',
  'PLANNING_QUESTIONS',
  'INTERVENTION_OPTIONS',
  'FOLLOWUP_CONSIDERATIONS',
] as const;

/** Advisory types for a supervisory plan (MC-10). */
export const PLAN_ADVISORY_USE_CASES = [
  'SUPERVISORY_PLAN_DRAFT',
  'PLANNING_QUESTIONS',
  'INTERVENTION_OPTIONS',
] as const;

export type EntityAdvisoryUseCase = (typeof ADVISORY_USE_CASES)[number];
export type ThemeAdvisoryUseCase = (typeof THEME_ADVISORY_USE_CASES)[number];
export type EmergingRiskAdvisoryUseCase = (typeof EMERGING_RISK_ADVISORY_USE_CASES)[number];
export type PlanningAdvisoryUseCase =
  | (typeof ATTENTION_ADVISORY_USE_CASES)[number]
  | (typeof PLAN_ADVISORY_USE_CASES)[number];
export type AdvisoryUseCase =
  | EntityAdvisoryUseCase
  | ThemeAdvisoryUseCase
  | EmergingRiskAdvisoryUseCase
  | PlanningAdvisoryUseCase;


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
  CROSS_ENTITY_INTERPRETATION: {
    label: 'Cross-entity interpretation',
    purpose: 'A narrative reading of the recorded position for this theme across the entities in scope.',
    caveat: 'Interpretation of recorded facts only. It ranks no entity and reaches no sector conclusion.',
  },
  THEME_MATERIAL_CHANGE: {
    label: 'Theme movement explanation',
    purpose: 'What moved against the preceding window of equal length, and where the movement sits.',
    caveat: 'Describes movement in recorded counts. Causation is not established.',
  },
  SECTOR_SUPERVISORY_QUESTIONS: {
    label: 'Sector supervisory questions',
    purpose: 'Draft questions a supervisor may consider putting to entities in scope of this theme.',
    caveat: 'Working material only. No information request or correspondence is issued from here.',
  },
  EMERGING_RISK_NARRATIVE: {
    label: 'Emerging risk narrative',
    purpose: 'A narrative summary of the facts and assessments already recorded against this risk.',
    caveat: 'Summary of recorded facts only. It sets no severity, status or systemic rating.',
  },
  EMERGING_RISK_HYPOTHESIS: {
    label: 'Emerging risk hypothesis',
    purpose: 'Possible explanations a supervisor could test against the linked records.',
    caveat: 'Hypothesis — not a risk rating, finding or decision.',
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
  entities: 'Entity in scope',
  linked_records: 'Linked record',
  assessments: 'Supervisory assessment',
  movement: 'Movement measure',
  emerging_risk: 'Emerging conduct risk',
  theme: 'Conduct theme',
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
