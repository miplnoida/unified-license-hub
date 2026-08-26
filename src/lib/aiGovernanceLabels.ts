/**
 * MC-08 — business language for the AI governance area.
 *
 * The interface never shows table names, function names, prompt text or provider
 * jargon. Everything a supervisor reads is expressed in regulatory terms.
 */

export const LIFECYCLE_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  TESTING: 'In testing',
  ACTIVE: 'Approved for production',
  SUSPENDED: 'Suspended',
  RETIRED: 'Retired',
};

export const LIFECYCLE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'outline',
  TESTING: 'secondary',
  ACTIVE: 'default',
  SUSPENDED: 'destructive',
  RETIRED: 'outline',
};

export const LIFECYCLE_HELP: Record<string, string> = {
  DRAFT: 'Being prepared. Cannot be used for any AI request.',
  TESTING: 'Under evaluation. Cannot be used for a live AI request.',
  ACTIVE: 'Approved by the regulator and permitted for live use.',
  SUSPENDED: 'Stopped by the regulator. No AI request can use it until it is reinstated.',
  RETIRED: 'Withdrawn permanently. Historical records remain unchanged.',
};

/** Permitted next statuses, mirroring the server-side rule exactly. */
export const NEXT_STATES: Record<string, string[]> = {
  DRAFT: ['TESTING', 'ACTIVE', 'RETIRED'],
  TESTING: ['ACTIVE', 'DRAFT', 'RETIRED'],
  ACTIVE: ['SUSPENDED', 'RETIRED'],
  SUSPENDED: ['ACTIVE', 'RETIRED'],
  RETIRED: [],
};

export const REVIEW_STATE_LABEL: Record<string, string> = {
  NOT_REVIEWED: 'Awaiting human review',
  ACCEPTED: 'Accepted by officer',
  MODIFIED: 'Modified by officer',
  REJECTED: 'Rejected by officer',
  SUPERSEDED: 'Superseded',
  NOT_APPLICABLE: 'No output produced',
};

export const REVIEW_STATE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  NOT_REVIEWED: 'secondary',
  ACCEPTED: 'default',
  MODIFIED: 'outline',
  REJECTED: 'destructive',
  SUPERSEDED: 'outline',
  NOT_APPLICABLE: 'outline',
};

export const OUTCOME_LABEL: Record<string, string> = {
  SUCCESS: 'Assistance prepared',
  REFUSAL: 'Discarded — did not meet the grounding rules',
  SCOPE_REFUSAL: 'Refused — outside the requester\u2019s remit',
  GOVERNANCE_REFUSAL: 'Refused by AI governance',
  FAILURE: 'Failed',
  PROVIDER_ERROR: 'AI service unavailable',
};

export const OUTCOME_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  SUCCESS: 'default',
  REFUSAL: 'destructive',
  SCOPE_REFUSAL: 'destructive',
  GOVERNANCE_REFUSAL: 'secondary',
  FAILURE: 'destructive',
  PROVIDER_ERROR: 'destructive',
};

export const REASON_LABEL: Record<string, string> = {
  APPROVED: 'Approved for execution',
  AI_STOPPED: 'AI assistance stopped by the regulator',
  USE_CASE_NOT_REGISTERED: 'Capability is not on the AI register',
  USE_CASE_SUSPENDED: 'Capability is suspended',
  USE_CASE_NOT_APPROVED: 'Capability is not approved for production',
  USE_CASE_NOT_YET_EFFECTIVE: 'Capability is not yet effective',
  USE_CASE_EXPIRED: 'Capability is no longer effective',
  ROLE_NOT_PERMITTED: 'Requester\u2019s role is not permitted to use this capability',
  MODEL_NOT_APPROVED: 'No approved AI model registered',
  MODEL_SUSPENDED: 'Registered AI model is suspended',
  MODEL_NOT_PERMITTED: 'Requested AI model is not the approved model',
  PROVIDER_NOT_PERMITTED: 'AI service is not permitted for this capability',
  INSTRUCTION_NOT_REGISTERED: 'No governed instruction version registered',
  INSTRUCTION_NOT_RELEASED: 'Instruction version is not released',
  INSTRUCTION_SUSPENDED: 'Instruction version is suspended',
  MUTATION_POLICY_VIOLATION: 'Configuration falls outside the advisory boundary',
  SOURCE_POLICY_VIOLATION: 'Permitted information source does not match the register',
  EXTERNAL_DATA_NOT_SUPPORTED: 'External data access is not permitted',
  ENTITY_OUT_OF_SCOPE: 'Entity is outside the requester\u2019s supervisory remit',
  UNGROUNDED_CITATION: 'Cited records that were not supplied — output discarded',
  MISSING_CITATIONS: 'No supplied record was cited — output discarded',
  INCOMPLETE_ADVISORY: 'Required content was missing — output discarded',
  INVALID_MODEL_OUTPUT: 'Response was not usable — output discarded',
  CONTEXT_UNAVAILABLE: 'Regulatory facts could not be prepared',
  CONTEXT_INCOMPLETE: 'Regulatory facts were incomplete',
  PROVIDER_NOT_CONFIGURED: 'No AI service is configured',
  PROVIDER_UNREACHABLE: 'AI service could not be reached',
  AI_CREDITS_EXHAUSTED: 'AI service allowance exhausted',
  AI_RATE_LIMITED: 'AI service rate limit reached',
  AI_BLOCKED_BY_POLICY: 'AI service blocked by policy',
  NOT_RECORDED: 'Could not be recorded',
  GATE_UNAVAILABLE: 'AI governance gate could not be evaluated',
  INCOMPLETE_GOVERNANCE_RESOLUTION: 'Approved model or instruction version could not be resolved',
};

export const EXCEPTION_LABEL: Record<string, string> = {
  UNREVIEWED_OVERDUE: 'Awaiting human review beyond the agreed period',
  STALE_FACTS: 'Facts changed after the assistance was prepared',
  LOW_CONFIDENCE: 'Confidence below the governance threshold',
  NO_CITATION: 'No supporting record cited',
  GOVERNANCE_REFUSAL: 'Refused by AI governance',
  SCOPE_REFUSAL: 'Refused — outside remit',
  MODEL_REFUSAL: 'Output discarded by the grounding controls',
  GENERATION_FAILURE: 'AI service failure',
};

export const EVENT_LABEL: Record<string, string> = {
  CREATED: 'Created',
  UPDATED: 'Updated',
  REGISTERED_UNDER_GOVERNANCE: 'Brought under AI governance',
  APPROVED_FOR_PRODUCTION: 'Approved for production',
  REACTIVATED: 'Reinstated',
  SUSPENDED: 'Suspended',
  RETIRED: 'Retired',
  STATE_CHANGED: 'Status changed',
  CONFIGURATION_BOUND: 'Model and instruction version bound',
  KILL_SWITCH_ENGAGED: 'AI stop control engaged',
  KILL_SWITCH_RELEASED: 'AI stop control released',
  ASSURANCE_REVIEW_CREATED: 'Assurance review opened',
  ASSURANCE_FINDING_RECORDED: 'Assurance finding recorded',
  ASSURANCE_REVIEW_CLOSED: 'Assurance review concluded',
  REMEDIATION_STATUS_CHANGED: 'Remediation updated',
};

export const OBJECT_LABEL: Record<string, string> = {
  USE_CASE: 'AI capability',
  MODEL: 'AI model',
  INSTRUCTION: 'Instruction version',
  THRESHOLDS: 'Governance thresholds',
  KILL_SWITCH: 'AI stop control',
  ASSURANCE_REVIEW: 'Assurance review',
};

export const RISK_LABEL: Record<string, string> = {
  LOW: 'Low regulatory risk',
  MEDIUM: 'Medium regulatory risk',
  HIGH: 'High regulatory risk',
};

export const ADVISORY_CLASS_LABEL: Record<string, string> = {
  ADVISORY_NARRATIVE: 'Narrative assistance',
  ADVISORY_EXPLANATION: 'Change explanation',
  ADVISORY_SUGGESTION: 'Suggested records',
  ADVISORY_QUESTION: 'Proposed questions',
  ADVISORY_HYPOTHESIS: 'Hypothesis to test',
};

export const ASSESSMENT_LABEL: Record<string, string> = {
  SATISFACTORY: 'Satisfactory',
  OBSERVATION: 'Observation',
  IMPROVEMENT_REQUIRED: 'Improvement required',
  CONTROL_FAILURE: 'Control failure',
  NOT_APPLICABLE: 'Not applicable',
};

export const ASSESSMENT_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  SATISFACTORY: 'default',
  OBSERVATION: 'secondary',
  IMPROVEMENT_REQUIRED: 'outline',
  CONTROL_FAILURE: 'destructive',
  NOT_APPLICABLE: 'outline',
};

export const REMEDIATION_LABEL: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  NOT_REQUIRED: 'Not required',
};

/** The assurance criteria a supervisory reviewer works through. */
export const ASSURANCE_CRITERIA: Array<{ code: string; label: string; help: string }> = [
  { code: 'GROUNDED_IN_RECORD', label: 'Grounded in the regulatory record', help: 'Every statement traces to a record that was supplied to the model.' },
  { code: 'NO_DECISION_LANGUAGE', label: 'Contains no decision or rating', help: 'The wording advises; it does not decide, rate, confirm or dismiss.' },
  { code: 'UNCERTAINTY_STATED', label: 'Uncertainty and limitations stated', help: 'Confidence, uncertainty and limitations are stated plainly.' },
  { code: 'HUMAN_REVIEW_EVIDENT', label: 'Human review is evident and reasoned', help: 'An officer reviewed the assistance and recorded a rationale.' },
  { code: 'PROVENANCE_COMPLETE', label: 'Provenance is complete', help: 'Model version, instruction version, facts window and references are all recorded.' },
  { code: 'FAIR_TREATMENT', label: 'Fair and proportionate wording', help: 'No allegation, no statement about individuals, no unfair characterisation of the entity.' },
  { code: 'DECISION_INDEPENDENCE', label: 'Regulatory decision stands independently', help: 'Any supervisory action taken rests on the record and rules, not on the AI wording.' },
];

export const label = (map: Record<string, string>, key?: string | null, fallback = 'Not recorded') =>
  (key && map[key]) || key || fallback;
