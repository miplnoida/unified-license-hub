/**
 * Canonical supervisory activity contract (client mirror).
 *
 * The authority for this vocabulary is the database:
 *   - `examinations_engagement_type_chk` (accepted engagement values)
 *   - `supervisory_engagement_types()` (labels + onsite/offsite mode)
 *   - `supervisory_intervention_execution_contract(intervention_type)`
 *   - `supervisory_intervention_execution_capabilities(intervention_id)`
 *
 * This module exists so no screen invents its own list and no display alias
 * (`targeted`, `full_scope`, `follow_up`, `thematic`) is ever sent to the
 * server. It maps business label → canonical value only; it never decides
 * authorisation, and every write is still gated server-side.
 */

export type EngagementMode = 'ONSITE' | 'OFFSITE' | 'MIXED';

export type CanonicalEngagementType =
  | 'FULL_SCOPE_ONSITE'
  | 'TARGETED_ONSITE'
  | 'OFFSITE_REVIEW'
  | 'FOLLOW_UP_REVIEW'
  | 'JOINT_EXAMINATION'
  | 'THEMATIC_EXAMINATION';

export interface EngagementTypeOption {
  value: CanonicalEngagementType;
  label: string;
  mode: EngagementMode;
}

/** The only engagement values the database accepts. */
export const CANONICAL_ENGAGEMENT_TYPES: readonly EngagementTypeOption[] = [
  { value: 'FULL_SCOPE_ONSITE', label: 'Full-scope onsite examination', mode: 'ONSITE' },
  { value: 'TARGETED_ONSITE', label: 'Targeted onsite examination', mode: 'ONSITE' },
  { value: 'OFFSITE_REVIEW', label: 'Offsite review', mode: 'OFFSITE' },
  { value: 'FOLLOW_UP_REVIEW', label: 'Follow-up review', mode: 'MIXED' },
  { value: 'JOINT_EXAMINATION', label: 'Joint examination', mode: 'ONSITE' },
  { value: 'THEMATIC_EXAMINATION', label: 'Thematic examination', mode: 'MIXED' },
] as const;

export const ENGAGEMENT_TYPE_VALUES: readonly string[] = CANONICAL_ENGAGEMENT_TYPES.map((e) => e.value);

export const isCanonicalEngagementType = (value: unknown): value is CanonicalEngagementType =>
  typeof value === 'string' && ENGAGEMENT_TYPE_VALUES.includes(value.toUpperCase());

/** Read-only compatibility for historical rows; never used to author an engagement. */
const LEGACY_ENGAGEMENTS: Record<string, CanonicalEngagementType> = {
  full_scope: 'FULL_SCOPE_ONSITE', targeted: 'TARGETED_ONSITE',
  follow_up: 'FOLLOW_UP_REVIEW', thematic: 'THEMATIC_EXAMINATION',
};

export function examinationTypeReadValues(value: string): string[] {
  const canonical = value.toUpperCase();
  return [canonical, ...Object.entries(LEGACY_ENGAGEMENTS)
    .filter(([, type]) => type === canonical).map(([alias]) => alias)];
}

export const engagementLabel = (value?: string | null): string => {
  if (!value) return '—';
  const canonical = LEGACY_ENGAGEMENTS[value.toLowerCase()] ?? value.toUpperCase();
  const match = CANONICAL_ENGAGEMENT_TYPES.find((e) => e.value === canonical);
  return match ? match.label : value;
};

export const engagementMode = (value?: string | null): EngagementMode => {
  const match = CANONICAL_ENGAGEMENT_TYPES.find((e) => e.value === String(value ?? '').toUpperCase());
  return match ? match.mode : 'MIXED';
};

/** True when the engagement is carried out without attending the entity's premises. */
export const isOffsiteEngagement = (value?: string | null): boolean => engagementMode(value) === 'OFFSITE';

/**
 * Engagement-aware term for the examination work itself. "Fieldwork" is
 * onsite language and is genuinely misleading for an offsite review.
 */
export const examinationWorkTerm = (engagementType?: string | null): string =>
  isOffsiteEngagement(engagementType) ? 'offsite review work' : 'fieldwork';

/** Sentence-case variant for headings and column labels. */
export const examinationWorkLabel = (engagementType?: string | null): string =>
  isOffsiteEngagement(engagementType) ? 'Review period' : 'Fieldwork';

export type ExecutionKind = 'EXAMINATION' | 'INVESTIGATION' | 'LIGHTWEIGHT' | 'REFERRAL' | 'UNKNOWN';

export interface InterventionExecutionContract {
  interventionType: string;
  executionKind: ExecutionKind;
  allowedEngagementTypes: readonly CanonicalEngagementType[];
  defaultEngagementType: CanonicalEngagementType | null;
  /** Semantically ambiguous types must have the engagement chosen explicitly. */
  requiresExplicitEngagement: boolean;
}

const EXAMINATION_BACKED: Record<string, { allowed: CanonicalEngagementType[]; explicit?: boolean }> = {
  TARGETED_EXAMINATION: { allowed: ['TARGETED_ONSITE'] },
  FULL_SCOPE_EXAMINATION: { allowed: ['FULL_SCOPE_ONSITE'] },
  OFFSITE_REVIEW: { allowed: ['OFFSITE_REVIEW'] },
  FOLLOW_UP_REVIEW: { allowed: ['FOLLOW_UP_REVIEW'] },
  THEMATIC_REVIEW: { allowed: ['THEMATIC_EXAMINATION'] },
  // Ambiguous between full-scope, targeted and joint onsite work — never guessed.
  ONSITE_EXAMINATION: { allowed: ['FULL_SCOPE_ONSITE', 'TARGETED_ONSITE', 'JOINT_EXAMINATION'], explicit: true },
};

const INVESTIGATION_BACKED = new Set(['INVESTIGATION', 'FORMAL_INVESTIGATION']);

const LIGHTWEIGHT = new Set([
  'DESK_REVIEW',
  'SUPERVISORY_MEETING',
  'SUPERVISORY_ENGAGEMENT',
  'INFORMATION_REQUEST',
  'ENHANCED_MONITORING',
  'REMEDIATION_FOLLOWUP',
]);

const REFERRAL = new Set(['FORMAL_FINDING', 'ESCALATION_REFERRAL', 'ENFORCEMENT_REFERRAL']);

/** Mirrors `supervisory_intervention_execution_contract` exactly. */
export function interventionExecutionContract(interventionType?: string | null): InterventionExecutionContract {
  const type = String(interventionType ?? '').trim().toUpperCase();
  const exam = EXAMINATION_BACKED[type];
  if (exam) {
    return {
      interventionType: type,
      executionKind: 'EXAMINATION',
      allowedEngagementTypes: exam.allowed,
      defaultEngagementType: exam.allowed.length === 1 && !exam.explicit ? exam.allowed[0] : null,
      requiresExplicitEngagement: !!exam.explicit,
    };
  }
  const kind: ExecutionKind = INVESTIGATION_BACKED.has(type)
    ? 'INVESTIGATION'
    : LIGHTWEIGHT.has(type)
      ? 'LIGHTWEIGHT'
      : REFERRAL.has(type)
        ? 'REFERRAL'
        : 'UNKNOWN';
  return {
    interventionType: type,
    executionKind: kind,
    allowedEngagementTypes: [],
    defaultEngagementType: null,
    requiresExplicitEngagement: false,
  };
}

/** True only for intervention types the examination engine actually executes. */
export const isExaminationBackedIntervention = (interventionType?: string | null): boolean =>
  interventionExecutionContract(interventionType).executionKind === 'EXAMINATION';

/** Plain-language explanation for a non-examination intervention. */
export function lightweightExecutionGuidance(interventionType?: string | null): string | null {
  const { executionKind } = interventionExecutionContract(interventionType);
  if (executionKind === 'LIGHTWEIGHT')
    return 'This is a lightweight supervisory action, not a formal examination. Record its decision or outcome, request information, or escalate it to a formal offsite review or examination.';
  if (executionKind === 'INVESTIGATION') return 'This intervention is executed as an investigation, not an examination.';
  if (executionKind === 'REFERRAL') return 'This intervention is a referral and has no examination execution.';
  if (executionKind === 'UNKNOWN') return null;
  return null;
}

/**
 * Rewrites onsite-only wording for an offsite engagement. Presentation only —
 * the stage machine, data and permissions are identical for every engagement.
 */
export function engagementPhrasing(text: string, engagementType?: string | null): string {
  if (!isOffsiteEngagement(engagementType)) return text;
  return text
    .replace(/Fieldwork/g, 'Offsite review work')
    .replace(/fieldwork/g, 'offsite review work')
    .replace(/on-?site/gi, 'offsite');
}
