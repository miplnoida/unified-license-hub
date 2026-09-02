/**
 * Presentation-only labels and tones for the AML/CFT supervision workspace.
 * No business logic: every value shown is derived from the canonical
 * supervisory spine read models.
 */
export const NEUTRAL = 'bg-muted text-muted-foreground border-border';
export const EMERALD = 'bg-emerald-500/10 text-emerald-700 border-emerald-200';
export const AMBER = 'bg-amber-500/10 text-amber-700 border-amber-200';
export const AMBER_STRONG = 'bg-amber-500/20 text-amber-800 border-amber-300';
export const RED = 'bg-destructive/10 text-destructive border-destructive/30';
export const BLUE = 'bg-blue-500/10 text-blue-700 border-blue-200';

export function ratingTone(value?: string | null) {
  const s = (value ?? '').toLowerCase();
  if (!s) return NEUTRAL;
  if (s.includes('critical') || s.includes('very_high') || s.includes('very high')) return RED;
  if (s.includes('high') || s.includes('weak')) return AMBER_STRONG;
  if (s.includes('medium') || s.includes('moderate') || s.includes('partial')) return AMBER;
  if (s.includes('low') || s.includes('strong') || s.includes('effective')) return EMERALD;
  return NEUTRAL;
}

export function statusTone(value?: string | null) {
  const s = (value ?? '').toUpperCase();
  if (['APPROVED', 'CLOSED', 'COMPLETED', 'ACCEPTED', 'VALIDATED'].includes(s)) return EMERALD;
  if (['OVERDUE', 'REJECTED', 'BREACH', 'ESCALATED'].includes(s)) return RED;
  if (['SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'FIELDWORK', 'PENDING_APPROVAL'].includes(s)) return BLUE;
  if (['DRAFT', 'PLANNED', 'SCOPING'].includes(s)) return NEUTRAL;
  return AMBER;
}

export function trendTone(trend?: string | null) {
  const s = (trend ?? '').toUpperCase();
  if (s.includes('DETERIOR') || s.includes('WORSEN') || s === 'UP') return RED;
  if (s.includes('IMPROV') || s === 'DOWN') return EMERALD;
  return NEUTRAL;
}

export const titleCase = (v?: string | null) =>
  (v ?? '—')
    .toString()
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) : '—';

export const WORK_QUEUE_KIND_LABEL: Record<string, string> = {
  ASSESSMENT: 'Assessment',
  ASSESSMENT_APPROVAL: 'Assessment approval',
  ATTENTION: 'Supervisory attention',
  PLAN: 'Supervisory plan',
  PLAN_APPROVAL: 'Plan approval',
  EXAMINATION: 'Examination',
  FINDING: 'Finding',
  MANAGEMENT_RESPONSE: 'Management response',
  REMEDIATION: 'Remediation action',
  REASSESSMENT: 'Reassessment required',
  VALIDATION: 'Effectiveness validation',
};
