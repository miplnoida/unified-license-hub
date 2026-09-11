/**
 * Presentation-only helpers for the evidence policy experience.
 *
 * These functions turn the platform's own evidence-policy contract into plain
 * language. They never decide sufficiency, never re-check a rule and never
 * change a decision: every state and reason shown here is the one returned by
 * the server. The rule preview is likewise a sentence built from stored
 * configuration values for reading only — it is not a second evaluator.
 */
import { AMBER, AMBER_STRONG, EMERALD, NEUTRAL, RED } from '@/lib/amlLabels';
import type { EvidencePolicyDecision, EvidencePolicyEvaluation } from '@/hooks/useAssessmentEvidencePolicy';

export const DECISION_LABEL: Record<string, string> = {
  SATISFIED: 'SATISFIED',
  UNSATISFIED: 'UNSATISFIED',
  NOT_REQUIRED: 'NOT REQUIRED',
  EXCEPTION_REQUIRED: 'EXCEPTION REQUIRED',
  EXCEPTION_APPROVED: 'EXCEPTION APPROVED',
};

export function decisionLabel(decision?: string | null): string {
  return DECISION_LABEL[(decision ?? '').toUpperCase()] ?? (decision ?? '—');
}

export function decisionTone(decision?: string | null): string {
  switch ((decision ?? '').toUpperCase()) {
    case 'SATISFIED':
      return EMERALD;
    case 'NOT_REQUIRED':
      return NEUTRAL;
    case 'EXCEPTION_APPROVED':
      return AMBER;
    case 'EXCEPTION_REQUIRED':
      return AMBER_STRONG;
    case 'UNSATISFIED':
      return RED;
    default:
      return NEUTRAL;
  }
}

/**
 * A pending request is one the platform still records as EXCEPTION_REQUIRED
 * while an undecided request exists against it.
 */
export function isExceptionPending(d: EvidencePolicyDecision): boolean {
  return d.decision === 'EXCEPTION_REQUIRED' && d.exception_status === 'REQUESTED';
}

/** Summary of the server's decisions — a count, not a judgement. */
export function evaluationSummary(evaluation?: EvidencePolicyEvaluation | null) {
  const decisions = evaluation?.decisions ?? [];
  const applicable = decisions.filter((d) => d.decision !== 'NOT_REQUIRED');
  return {
    applicable: applicable.length,
    satisfied: decisions.filter((d) => d.decision === 'SATISFIED').length,
    outstanding: decisions.filter((d) => d.blocking).length,
    notRequired: decisions.filter((d) => d.decision === 'NOT_REQUIRED').length,
    exceptionApproved: decisions.filter((d) => d.decision === 'EXCEPTION_APPROVED').length,
    exceptionPending: decisions.filter(isExceptionPending).length,
  };
}

/** The headline state, derived only from the states the server returned. */
export function overallStatus(evaluation?: EvidencePolicyEvaluation | null): string {
  if (!evaluation || evaluation.status !== 'EVALUATED') return 'NOT GOVERNED';
  const s = evaluationSummary(evaluation);
  if (s.exceptionPending > 0) return 'EXCEPTION PENDING';
  if (evaluation.blocking_count > 0) return 'UNSATISFIED';
  if (s.exceptionApproved > 0) return 'EXCEPTION APPROVED';
  if (s.applicable === 0) return 'NOT REQUIRED';
  return 'SATISFIED';
}

export function overallTone(status: string): string {
  switch (status) {
    case 'SATISFIED':
      return EMERALD;
    case 'UNSATISFIED':
      return RED;
    case 'EXCEPTION PENDING':
      return AMBER_STRONG;
    case 'EXCEPTION APPROVED':
      return AMBER;
    default:
      return NEUTRAL;
  }
}

export const kindLabel = (code?: string | null) =>
  (code ?? '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export function kindList(codes?: string[] | null, empty = 'Any kind held by the platform'): string {
  if (!codes || codes.length === 0) return empty;
  return codes.map(kindLabel).join(', ');
}

/** Human sentence for one recorded rule. Presentation only. */
export interface EvidenceRuleLike {
  rule_code?: string | null;
  label?: string | null;
  scope_type?: string | null;
  scope_reference?: string | null;
  evidence_requirement?: string | null;
  minimum_items?: number | string | null;
  permitted_source_kinds?: string[] | null;
  required_source_kinds?: string[] | null;
  maximum_age_days?: number | string | null;
  independent_sources_required?: number | string | null;
  rationale_required?: boolean | null;
  exception_allowed?: boolean | null;
  exception_approval_required?: boolean | null;
}

export function ruleScopeSentence(rule: EvidenceRuleLike): string {
  const scope = (rule.scope_type ?? '').toUpperCase();
  const ref = rule.scope_reference ? ` ${rule.scope_reference}` : '';
  if (scope === 'QUESTION') return ref ? `When answering question${ref}` : 'When answering any question in scope';
  if (scope === 'DIMENSION') return ref ? `When rating dimension${ref}` : 'When rating any dimension in scope';
  if (scope === 'ASSESSMENT') return 'For the assessment as a whole';
  return 'For this scope';
}

export function rulePreview(rule: EvidenceRuleLike): string {
  const requirement = (rule.evidence_requirement ?? '').toUpperCase();
  const opening = ruleScopeSentence(rule);
  if (requirement === 'NOT_REQUIRED') return `${opening}, no evidence is required by this policy.`;
  const min = Math.max(Number(rule.minimum_items ?? 1) || 1, 1);
  const parts: string[] = [];
  parts.push(
    requirement === 'OPTIONAL'
      ? `evidence is optional, and where it is cited at least ${min} item${min === 1 ? '' : 's'} should be on file`
      : `at least ${min} item${min === 1 ? '' : 's'} of evidence ${min === 1 ? 'is' : 'are'} required`,
  );
  if (rule.required_source_kinds?.length) {
    parts.push(`including ${rule.required_source_kinds.map(kindLabel).join(' and ')}`);
  }
  if (rule.permitted_source_kinds?.length) {
    parts.push(`counted only from ${rule.permitted_source_kinds.map(kindLabel).join(', ')}`);
  }
  const independent = Number(rule.independent_sources_required ?? 0) || 0;
  if (independent > 0) parts.push(`from at least ${independent} independent source${independent === 1 ? '' : 's'}`);
  const age = Number(rule.maximum_age_days ?? 0) || 0;
  if (age > 0) parts.push(`no older than ${age} day${age === 1 ? '' : 's'}`);

  let text = `${opening}, ${parts.join(', ')}.`;
  if (rule.rationale_required) text += ' A written explanation of how the evidence supports the answer is required.';
  if (rule.exception_allowed) {
    text +=
      rule.exception_approval_required === false
        ? ' An exception may be recorded where evidence is genuinely unavailable.'
        : ' An exception may be requested where evidence is genuinely unavailable, subject to independent approval.';
  } else {
    text += ' No exception is available.';
  }
  return text;
}

/** Outstanding requirement text, taken from the server's own reasons. */
export function outstandingText(d: EvidencePolicyDecision): string | null {
  if (!d.reasons?.length) return null;
  return d.reasons.map((r) => r.message).join(' ');
}
