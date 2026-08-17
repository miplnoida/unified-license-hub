/**
 * Canonical Fit & Proper assessment status model.
 *
 * Mirrors the shape of src/lib/complaintStatus.ts. The database enforces the
 * actual transitions via the fp_check_assessment_transition() trigger
 * (supabase/migrations/20260711100000_..., tightened further by
 * 20260812090000_fp_determination_committee_override.sql) — this map
 * documents that same state machine in one reusable place for the UI
 * (Process List filters/badges, row actions) rather than re-deriving it
 * per screen.
 */

export type FpAssessmentStatus =
  | 'draft'
  | 'submitted'
  | 'screening'
  | 'awaiting_committee'
  | 'determined'
  | 'closed'
  | 'withdrawn';

export const FP_ASSESSMENT_STATUSES: FpAssessmentStatus[] = [
  'draft',
  'submitted',
  'screening',
  'awaiting_committee',
  'determined',
  'closed',
  'withdrawn',
];

export const FP_STATUS_LABELS: Record<FpAssessmentStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  screening: 'Screening',
  awaiting_committee: 'Awaiting Committee',
  determined: 'Determined',
  closed: 'Closed',
  withdrawn: 'Withdrawn',
};

export const FP_STATUS_VARIANTS: Record<
  FpAssessmentStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  draft: 'secondary',
  submitted: 'default',
  screening: 'outline',
  awaiting_committee: 'outline',
  determined: 'default',
  closed: 'secondary',
  withdrawn: 'destructive',
};

export function fpStatusLabel(s: string | null | undefined): string {
  if (!s) return '—';
  return FP_STATUS_LABELS[s as FpAssessmentStatus] ?? s;
}

export function fpStatusVariant(
  s: string | null | undefined,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!s) return 'outline';
  return FP_STATUS_VARIANTS[s as FpAssessmentStatus] ?? 'outline';
}

/** "In progress" bucket — the Process List defaults to exactly this set. */
export function isOpenFpAssessment(status: string | null | undefined): boolean {
  return status === 'draft' || status === 'submitted' || status === 'screening' || status === 'awaiting_committee';
}

/** Allowed next statuses per current status, as actually enforced by fp_check_assessment_transition(). */
export const FP_TRANSITIONS: Record<FpAssessmentStatus, FpAssessmentStatus[]> = {
  draft: ['submitted'],
  submitted: ['screening', 'awaiting_committee', 'determined'],
  screening: ['awaiting_committee', 'determined'],
  awaiting_committee: ['determined'],
  determined: ['closed'],
  closed: [],
  withdrawn: [],
};

export function canTransitionFp(
  from: string | null | undefined,
  to: FpAssessmentStatus,
): boolean {
  if (!from) return false;
  const allowed = FP_TRANSITIONS[from as FpAssessmentStatus];
  return !!allowed && allowed.includes(to);
}

/** The "current step" label the Process List shows — a coarser, more meaningful
 *  read than the raw status for someone scanning a list of cases. */
export function fpProcessStepLabel(status: string | null | undefined): string {
  switch (status) {
    case 'draft': return 'Awaiting declaration';
    case 'submitted': return 'Declaration received';
    case 'screening': return 'Screening in progress';
    case 'awaiting_committee': return 'Awaiting committee vote';
    case 'determined': return 'Determined — conditions/monitoring';
    case 'closed': return 'Closed';
    case 'withdrawn': return 'Withdrawn';
    default: return status ?? '—';
  }
}
