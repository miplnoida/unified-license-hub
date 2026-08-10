/**
 * Display labels for prudential supervision screens.
 *
 * The database stores machine tokens (`WIP`, `capital_plan`,
 * `senior_supervisor_review`, `prudential_assessment`, ...). Supervisory
 * screens must never render those raw — every label used by the prudential
 * module lives here so the vocabulary stays consistent across the entity
 * profile, list and dashboard.
 *
 * Severity/tone mapping lives in `prudentialSeverity.ts`; timestamps use
 * `datetime.ts`. This module only handles textual labels.
 */

/** Turns any snake_case / SCREAMING_CASE token into Sentence case. */
export function humanizeToken(value?: string | null): string {
  if (!value) return '—';
  const s = String(value).trim();
  if (!s) return '—';
  const spaced = s.replace(/[_-]+/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** `returns_filed.workflow_status` codes. */
export const RETURN_STATUS_LABEL: Record<string, string> = {
  TEMP: 'Draft (template)',
  WIP: 'Draft',
  SUB: 'Submitted',
  VAL: 'Validated',
  TBR: 'To be resubmitted',
  REJ: 'Rejected',
};

export function returnStatusLabel(value?: string | null): string {
  if (!value) return '—';
  return RETURN_STATUS_LABEL[value] ?? humanizeToken(value);
}

/** Return states that represent a filing actually received by the regulator. */
const SUBMITTED_RETURN_STATES = new Set(['SUB', 'VAL', 'TBR', 'REJ']);

export function isSubmittedReturnStatus(value?: string | null): boolean {
  return !!value && SUBMITTED_RETURN_STATES.has(value);
}

/** Assessment states that carry a supervisory-meaningful rating. */
const RATED_ASSESSMENT_STATES = new Set(['submitted', 'reviewed', 'approved', 'closed']);

export function isRatedAssessmentStatus(value?: string | null): boolean {
  return !!value && RATED_ASSESSMENT_STATES.has(String(value).toLowerCase());
}

export const ASSESSMENT_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted for review',
  reviewed: 'Reviewed',
  returned_for_revision: 'Returned for revision',
  approved: 'Approved',
  closed: 'Closed',
};

export function assessmentStatusLabel(value?: string | null): string {
  if (!value) return '—';
  return ASSESSMENT_STATUS_LABEL[String(value).toLowerCase()] ?? humanizeToken(value);
}

export const ACTION_TYPE_LABEL: Record<string, string> = {
  information_request: 'Information request',
  capital_plan: 'Capital plan',
  remediation_plan: 'Remediation plan',
  management_meeting: 'Management meeting',
  directive: 'Directive',
  restriction: 'Restriction',
  onsite_examination: 'Onsite examination',
  enforcement_referral: 'Enforcement referral',
  manual: 'Manual follow-up',
};

export function actionTypeLabel(value?: string | null): string {
  if (!value) return '—';
  return ACTION_TYPE_LABEL[String(value).toLowerCase()] ?? humanizeToken(value);
}

export const ACTION_STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  overdue: 'Overdue',
  completed: 'Completed',
  cancelled: 'Cancelled',
  waived: 'Waived',
  closed: 'Closed',
};

export function actionStatusLabel(value?: string | null): string {
  if (!value) return '—';
  return ACTION_STATUS_LABEL[String(value).toLowerCase()] ?? humanizeToken(value);
}

export const ESCALATION_TYPE_LABEL: Record<string, string> = {
  senior_supervisor_review: 'Senior supervisor review',
  immediate_risk: 'Immediate risk',
  committee_referral: 'Committee referral',
  enforcement_referral: 'Enforcement referral',
  board_notification: 'Board notification',
};

export function escalationTypeLabel(value?: string | null): string {
  if (!value) return '—';
  return ESCALATION_TYPE_LABEL[String(value).toLowerCase()] ?? humanizeToken(value);
}

export const ESCALATION_STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  under_review: 'Under review',
  resolved: 'Resolved',
  closed: 'Closed',
  withdrawn: 'Withdrawn',
};

export function escalationStatusLabel(value?: string | null): string {
  if (!value) return '—';
  return ESCALATION_STATUS_LABEL[String(value).toLowerCase()] ?? humanizeToken(value);
}

export const AUDIT_OBJECT_LABEL: Record<string, string> = {
  prudential_assessment: 'Assessment',
  prudential_action: 'Supervisory action',
  prudential_escalation: 'Escalation',
  prudential_ratio: 'Ratio configuration',
  prudential_threshold: 'Threshold configuration',
  prudential_ewi_alert: 'Early warning indicator',
  return_threshold_breach: 'Threshold breach',
  returns_filed: 'Return',
};

export function auditObjectLabel(value?: string | null): string {
  if (!value) return '—';
  return AUDIT_OBJECT_LABEL[String(value).toLowerCase()] ?? humanizeToken(value);
}

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  APPROVE: 'Approved',
  REJECT: 'Rejected',
  OVERRIDE: 'Overridden',
  EXPORT: 'Exported',
  WORKFLOW_TRANSITION: 'Workflow transition',
  NOTIFICATION_SENT: 'Notification sent',
  ACCESS_DENIED: 'Access denied',
};

export function auditActionLabel(value?: string | null): string {
  if (!value) return '—';
  return AUDIT_ACTION_LABEL[String(value).toUpperCase()] ?? humanizeToken(value);
}

export const GROUP_MEMBER_ROLE_LABEL: Record<string, string> = {
  parent: 'Parent',
  holding_company: 'Holding company',
  subsidiary: 'Subsidiary',
  branch: 'Branch',
  associate: 'Associate',
  joint_venture: 'Joint venture',
  sister: 'Sister company',
};

export function groupMemberRoleLabel(value?: string | null): string {
  if (!value) return '—';
  return GROUP_MEMBER_ROLE_LABEL[String(value).toLowerCase()] ?? humanizeToken(value);
}

export const CONSOLIDATION_TREATMENT_LABEL: Record<string, string> = {
  full: 'Full consolidation',
  full_consolidation: 'Full consolidation',
  proportional: 'Proportional consolidation',
  equity_method: 'Equity method',
  deconsolidated: 'Deconsolidated',
  excluded: 'Excluded',
};

export function consolidationTreatmentLabel(value?: string | null): string {
  if (!value) return '—';
  const key = String(value).toLowerCase();
  return CONSOLIDATION_TREATMENT_LABEL[key] ?? `${humanizeToken(value)} consolidation`;
}

/**
 * Compact numeric display for supervisory observations that have no
 * configured display format (raw metric snapshots such as stress events).
 */
export function formatObservedValue(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n !== 0 && Math.abs(n) < 0.01) return n.toExponential(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/**
 * Stress-indicator severities are priority bands on an event that already
 * fired, so the "Within limits" wording used for threshold breaches would be
 * misleading here.
 */
export const STRESS_SEVERITY_LABEL: Record<string, string> = {
  red: 'Severe',
  breach: 'Severe',
  critical: 'Severe',
  high: 'Elevated',
  amber: 'Elevated',
  warn: 'Elevated',
  medium: 'Moderate',
  low: 'Low',
  green: 'Low',
};

export function stressSeverityLabel(value?: string | null): string {
  if (!value) return '—';
  return STRESS_SEVERITY_LABEL[String(value).toLowerCase()] ?? humanizeToken(value);
}

/**
 * Badge classes for supervisory severity tokens (critical / high / medium / low).
 *
 * Uses semantic tokens so the palette stays themable; a critical action must
 * never look the same as a low one.
 */
export function riskSeverityBadgeClass(value?: string | null): string {
  switch (String(value ?? '').toLowerCase()) {
    case 'critical':
    case 'severe':
      return 'bg-destructive/15 text-destructive border-destructive/30';
    case 'high':
    case 'elevated':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30';
    case 'medium':
    case 'moderate':
      return 'bg-primary/10 text-primary border-primary/30';
    case 'low':
      return 'bg-muted text-muted-foreground border-border';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

/** Badge classes for supervisory action / escalation lifecycle states. */
export function lifecycleBadgeClass(value?: string | null): string {
  switch (String(value ?? '').toLowerCase()) {
    case 'breached':
    case 'overdue':
      return 'bg-destructive/15 text-destructive border-destructive/30';
    case 'awaiting_evidence':
    case 'awaiting_review':
    case 'under_review':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30';
    case 'completed':
    case 'resolved':
    case 'closed':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

/** Review-state wording for the evidence column on supervisory actions. */
export const REVIEW_STATUS_LABEL: Record<string, string> = {
  not_required: 'Not required',
  awaiting_review: 'Awaiting review',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

export function reviewStatusLabel(value?: string | null): string {
  if (!value) return '—';
  return REVIEW_STATUS_LABEL[String(value).toLowerCase()] ?? humanizeToken(value);
}
