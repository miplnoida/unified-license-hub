/**
 * Centralized dashboard drill-down registry.
 *
 * Single source of truth for every clickable Admin/Supervisory Dashboard
 * application metric. Each definition declares:
 *   - id / label              → identity for UI + debugging
 *   - targetPath              → list page to open
 *   - query                   → URL search params applied on navigation
 *   - rpcParams               → canonical params passed to
 *                               get_application_list_page when computing
 *                               the count behind the link
 *   - statuses (optional)     → the exact status set the metric represents
 *
 * Both the metrics hook (useSupervisoryMetrics) and the dashboard links
 * (SupervisoryDashboard / StatusBreakdownCard) MUST read from this file.
 * The applications list page parses the same query params back into the
 * same rpcParams shape, guaranteeing dashboard count === list count.
 *
 * The wiring is asserted in:
 *   - src/test/dashboardDrilldowns.test.ts (URL/rpc round-trip)
 *   - src/test/applicationsQueueSlaWiring.test.ts (RPC ↔ SQL parity)
 */

import {
  APPLICATION_QUEUE_PENDING_STATUSES,
  APPLICATION_QUEUE_RETURNED_STATUSES,
  type ApplicationQueueSlaBucket,
  type ApplicationQueueStatusGroup,
} from './applicationQueueFilters';

export type DashboardRpcParams = {
  _status?: string | null;
  _status_group?: ApplicationQueueStatusGroup | null;
  _sla?: ApplicationQueueSlaBucket | null;
};

export interface DashboardDrilldown {
  id: string;
  label: string;
  targetPath: string;
  query: Record<string, string>;
  rpcParams: DashboardRpcParams;
  /** Optional canonical status set this drill-down represents. */
  statuses?: readonly string[];
  description?: string;
}

const APPLICATIONS_QUEUE = '/applications/queue';

export const APPLICATION_DRILLDOWNS = {
  pending: {
    id: 'applications.pending',
    label: 'Pending Applications',
    targetPath: APPLICATIONS_QUEUE,
    query: { sla: 'pending' },
    rpcParams: { _sla: 'pending' },
    statuses: APPLICATION_QUEUE_PENDING_STATUSES,
    description: 'Awaiting regulator action (submitted or in progress).',
  },
  slaBreached: {
    id: 'applications.slaBreached',
    label: 'SLA Breaches',
    targetPath: APPLICATIONS_QUEUE,
    query: { sla: 'breached' },
    rpcParams: { _sla: 'breached' },
    statuses: APPLICATION_QUEUE_PENDING_STATUSES,
    description: 'Pending applications past the SLA breach threshold.',
  },
  slaDueSoon: {
    id: 'applications.slaDueSoon',
    label: 'SLA Due Soon',
    targetPath: APPLICATIONS_QUEUE,
    query: { sla: 'due_soon' },
    rpcParams: { _sla: 'due_soon' },
    statuses: APPLICATION_QUEUE_PENDING_STATUSES,
    description: 'Pending applications approaching the SLA breach threshold.',
  },
  draft: {
    id: 'applications.draft',
    label: 'Draft',
    targetPath: APPLICATIONS_QUEUE,
    query: { status: 'draft' },
    rpcParams: { _status: 'draft' },
    statuses: ['draft'],
  },
  submitted: {
    id: 'applications.submitted',
    label: 'Submitted',
    targetPath: APPLICATIONS_QUEUE,
    query: { status: 'submitted' },
    rpcParams: { _status: 'submitted' },
    statuses: ['submitted'],
  },
  inProgress: {
    id: 'applications.inProgress',
    label: 'In Progress',
    targetPath: APPLICATIONS_QUEUE,
    query: { status: 'in_progress' },
    rpcParams: { _status: 'in_progress' },
    statuses: ['in_progress'],
  },
  approved: {
    id: 'applications.approved',
    label: 'Approved',
    targetPath: APPLICATIONS_QUEUE,
    query: { statusGroup: 'approved' },
    rpcParams: { _status_group: 'approved' },
    statuses: ['approved'],
  },
  rejected: {
    id: 'applications.rejected',
    label: 'Rejected',
    targetPath: APPLICATIONS_QUEUE,
    query: { statusGroup: 'rejected' },
    rpcParams: { _status_group: 'rejected' },
    statuses: ['rejected'],
  },
  returned: {
    id: 'applications.returned',
    label: 'Returned',
    targetPath: APPLICATIONS_QUEUE,
    query: { statusGroup: 'returned' },
    rpcParams: { _status_group: 'returned' },
    statuses: APPLICATION_QUEUE_RETURNED_STATUSES,
    description: 'Sent back to applicant (resubmission requested or query raised).',
  },
  all: {
    id: 'applications.all',
    label: 'All Applications',
    targetPath: APPLICATIONS_QUEUE,
    query: {},
    rpcParams: {},
  },
} as const satisfies Record<string, DashboardDrilldown & { rpcParams: DashboardRpcParams }>;

export type ApplicationDrilldownKey = keyof typeof APPLICATION_DRILLDOWNS;

/** Build the drill-down URL for a registered metric. */
export function drilldownTo(key: ApplicationDrilldownKey): string {
  const def = APPLICATION_DRILLDOWNS[key];
  const qs = new URLSearchParams(def.query).toString();
  return qs ? `${def.targetPath}?${qs}` : def.targetPath;
}

/** Canonical RPC params for a registered metric — use when counting. */
export function drilldownRpcParams(key: ApplicationDrilldownKey): DashboardRpcParams {
  return { ...APPLICATION_DRILLDOWNS[key].rpcParams };
}
