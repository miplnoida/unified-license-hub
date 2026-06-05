import { drilldownTo, returnDrilldownTo } from './dashboardDrilldowns';
import { licenseeDrilldownTo } from './licenseeDashboardDrilldowns';

export type InsightAudience = 'admin' | 'licensee';

/**
 * Rule-based supervisory insights engine. Takes an arbitrary metrics object
 * and produces a sorted, deduplicated list of actionable insights.
 *
 * All rules are pure functions of the metrics — they MUST NOT call the
 * database or invent numbers. Empty metrics → empty insight list.
 */

export type InsightSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface Insight {
  id: string;
  severity: InsightSeverity;
  module: string;
  title: string;
  explanation: string;
  action?: { label: string; to: string };
}

const SEVERITY_ORDER: Record<InsightSeverity, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

export interface SupervisoryMetricsLike {
  applications?: {
    total?: number;
    draft?: number;
    submitted?: number;
    under_review?: number;
    approved?: number;
    rejected?: number;
    returned?: number;
    sla_breached?: number;
    sla_due_soon?: number;
    oldest_pending_days?: number;
  };
  licenses?: {
    total?: number;
    active?: number;
    expired?: number;
    suspended?: number;
    revoked?: number;
    expiring_30d?: number;
    expiring_90d?: number;
  };
  returns?: {
    due_soon?: number;
    overdue?: number;
    pending_review?: number;
    submitted?: number;
    repeat_late_filers?: number;
  };
  payments?: {
    pending?: number;
    overdue?: number;
    failed?: number;
    outstanding_amount?: number;
    blocked_applications?: number;
  };
  inspections?: {
    scheduled?: number;
    completed?: number;
    overdue?: number;
    high_severity_findings?: number;
  };
  enforcement?: {
    open?: number;
    new_this_month?: number;
    pending_action?: number;
    sla_breached?: number;
  };
  complaints?: {
    open?: number;
    pending_triage?: number;
    high_priority?: number;
    sla_breached?: number;
  };
  risk?: {
    high?: number;
    medium?: number;
    low?: number;
    high_risk_with_overdue_returns?: number;
  };
  workflow?: {
    bottleneck_stage?: string | null;
    bottleneck_avg_hours?: number;
  };
}

export function buildInsights(m: SupervisoryMetricsLike, audience: InsightAudience = 'admin'): Insight[] {
  const out: Insight[] = [];
  const push = (i: Insight) => out.push(i);
  const isLicensee = audience === 'licensee';
  const returnsOverdueTo = isLicensee ? licenseeDrilldownTo('returnsOverdue') : returnDrilldownTo('overdue');
  const returnsPendingReviewTo = isLicensee ? licenseeDrilldownTo('returnsPendingReview') : returnDrilldownTo('pendingReview');
  const returnsSubmittedTo = isLicensee ? licenseeDrilldownTo('returnsSubmitted') : returnDrilldownTo('submitted');
  const paymentsOverdueTo = isLicensee ? licenseeDrilldownTo('paymentsPending') : '/admin/fees';


  // Applications
  if ((m.applications?.sla_breached ?? 0) > 0) {
    push({
      id: 'apps-sla-breached',
      severity: 'critical',
      module: 'Applications',
      title: `${m.applications!.sla_breached} application${m.applications!.sla_breached === 1 ? '' : 's'} breaching SLA`,
      explanation: 'Review queue and reassign or escalate to clear the backlog.',
      action: { label: 'Open review queue', to: drilldownTo('slaBreached') },
    });
  }
  if ((m.applications?.sla_due_soon ?? 0) > 0) {
    push({
      id: 'apps-sla-due-soon',
      severity: 'high',
      module: 'Applications',
      title: `${m.applications!.sla_due_soon} applications nearing SLA breach`,
      explanation: 'Action within 24–48 hours to avoid breach.',
      action: { label: 'Review now', to: drilldownTo('slaDueSoon') },
    });
  }
  if ((m.applications?.oldest_pending_days ?? 0) > 30) {
    push({
      id: 'apps-oldest-pending',
      severity: 'medium',
      module: 'Applications',
      title: `Oldest pending application is ${m.applications!.oldest_pending_days} days old`,
      explanation: 'Investigate workflow stage holding this application.',
      action: { label: 'View pending', to: drilldownTo('pending') },
    });
  }

  // Licenses
  if ((m.licenses?.expiring_30d ?? 0) > 0) {
    push({
      id: 'lic-expiring-30',
      severity: 'high',
      module: 'Licensing',
      title: `${m.licenses!.expiring_30d} licence${m.licenses!.expiring_30d === 1 ? '' : 's'} expire within 30 days`,
      explanation: 'Renewal workload incoming. Notify holders and prepare reviewers.',
      action: { label: 'View approved licensees', to: '/admin/approved-licensees' },
    });
  }
  if ((m.licenses?.expired ?? 0) > 0) {
    push({
      id: 'lic-expired',
      severity: 'medium',
      module: 'Licensing',
      title: `${m.licenses!.expired} licence${m.licenses!.expired === 1 ? '' : 's'} already expired`,
      explanation: 'These holders are operating without valid licence.',
      action: { label: 'View licences', to: '/admin/approved-licensees' },
    });
  }

  // Returns
  if ((m.returns?.overdue ?? 0) > 0) {
    push({
      id: 'ret-overdue',
      severity: 'critical',
      module: 'Returns',
      title: `${m.returns!.overdue} return${m.returns!.overdue === 1 ? '' : 's'} overdue`,
      explanation: 'Filing compliance is at risk. Trigger reminders or penalties.',
      action: { label: 'Open returns', to: returnsOverdueTo },
    });
  }
  if ((m.returns?.pending_review ?? 0) > 0) {
    push({
      id: 'ret-pending-review',
      severity: 'medium',
      module: 'Returns',
      title: `${m.returns!.pending_review} submitted returns awaiting review`,
      explanation: 'Reviewer queue is building up.',
      action: { label: 'Review returns', to: returnsPendingReviewTo },
    });
  }
  if ((m.returns?.repeat_late_filers ?? 0) > 0) {
    push({
      id: 'ret-repeat-late',
      severity: 'medium',
      module: 'Returns',
      title: `${m.returns!.repeat_late_filers} repeat late filers detected`,
      explanation: 'Consider compliance follow-up or escalation.',
      action: { label: 'View filers', to: returnsSubmittedTo },
    });
  }


  // Payments
  if ((m.payments?.blocked_applications ?? 0) > 0) {
    push({
      id: 'pay-blocking-apps',
      severity: 'high',
      module: 'Payments',
      title: `Payment backlog blocking ${m.payments!.blocked_applications} application${m.payments!.blocked_applications === 1 ? '' : 's'}`,
      explanation: 'Verify pending payments to unblock submissions.',
      action: { label: 'Verify payments', to: '/admin/fees' },
    });
  }
  if ((m.payments?.overdue ?? 0) > 0) {
    push({
      id: 'pay-overdue',
      severity: 'medium',
      module: 'Payments',
      title: `${m.payments!.overdue} overdue payment${m.payments!.overdue === 1 ? '' : 's'}`,
      explanation: 'Collections action recommended.',
      action: { label: 'View payments', to: '/admin/fees' },
    });
  }

  // Inspections
  if ((m.inspections?.overdue ?? 0) > 0) {
    push({
      id: 'insp-overdue',
      severity: 'high',
      module: 'Inspections',
      title: `${m.inspections!.overdue} inspection${m.inspections!.overdue === 1 ? '' : 's'} overdue`,
      explanation: 'Reschedule or reassign to maintain coverage.',
      action: { label: 'Inspections', to: '/admin' },
    });
  }
  if ((m.inspections?.high_severity_findings ?? 0) > 0) {
    push({
      id: 'insp-high-findings',
      severity: 'high',
      module: 'Inspections',
      title: `${m.inspections!.high_severity_findings} high-severity inspection findings`,
      explanation: 'Follow-up enforcement may be required.',
    });
  }

  // Enforcement
  if ((m.enforcement?.sla_breached ?? 0) > 0) {
    push({
      id: 'enf-sla',
      severity: 'critical',
      module: 'Enforcement',
      title: `${m.enforcement!.sla_breached} enforcement case${m.enforcement!.sla_breached === 1 ? '' : 's'} breaching SLA`,
      explanation: 'Escalate to supervisor for immediate action.',
    });
  }
  if ((m.enforcement?.open ?? 0) > 0) {
    push({
      id: 'enf-open',
      severity: 'medium',
      module: 'Enforcement',
      title: `${m.enforcement!.open} open enforcement case${m.enforcement!.open === 1 ? '' : 's'}`,
      explanation: 'Monitor progress and ensure activity within the last 14 days.',
    });
  }

  // Complaints
  if ((m.complaints?.sla_breached ?? 0) > 0) {
    push({
      id: 'cmp-sla',
      severity: 'high',
      module: 'Complaints',
      title: `${m.complaints!.sla_breached} complaints past resolution SLA`,
      explanation: 'Resolution rate is slipping — review assignments.',
      action: { label: 'Open complaints', to: '/complaints' },
    });
  }
  if ((m.complaints?.high_priority ?? 0) > 0) {
    push({
      id: 'cmp-high',
      severity: 'high',
      module: 'Complaints',
      title: `${m.complaints!.high_priority} high-priority complaints open`,
      explanation: 'Prioritise these in today’s caseload.',
      action: { label: 'Open complaints', to: '/complaints' },
    });
  }

  // Risk
  if ((m.risk?.high_risk_with_overdue_returns ?? 0) > 0) {
    push({
      id: 'risk-high-overdue',
      severity: 'critical',
      module: 'Risk',
      title: `${m.risk!.high_risk_with_overdue_returns} high-risk entities have overdue returns`,
      explanation: 'Compound risk — recommend immediate supervisory action.',
    });
  }
  if ((m.risk?.high ?? 0) > 0) {
    push({
      id: 'risk-high',
      severity: 'medium',
      module: 'Risk',
      title: `${m.risk!.high} entities rated high risk`,
      explanation: 'Ensure inspections and returns are current for these entities.',
    });
  }

  // Workflow bottleneck
  if (m.workflow?.bottleneck_stage && (m.workflow?.bottleneck_avg_hours ?? 0) > 0) {
    push({
      id: 'wf-bottleneck',
      severity: 'medium',
      module: 'Workflow',
      title: `Bottleneck at "${m.workflow.bottleneck_stage}"`,
      explanation: `Average dwell time ${Math.round(m.workflow.bottleneck_avg_hours!)}h. Consider reassignment or capacity review.`,
      action: { label: 'Open workflows', to: '/workflows' },
    });
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
