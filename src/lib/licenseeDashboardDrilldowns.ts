/**
 * Centralized Post-Licensee / Licensee Dashboard drill-down registry.
 *
 * One entry per metric card, status breakdown item, or priority-list group
 * shown on the LicenseeDashboard. Each definition declares:
 *   - id / label          → identity for UI + debugging
 *   - targetPath          → list/detail page to open
 *   - query               → URL search params applied on navigation
 *   - description         → optional human-readable note
 *
 * Use `licenseeDrilldownTo(key)` to build the URL. Target list pages
 * (ComplianceReturns, LicensesList, PaymentHistory, ApplicationsList) parse
 * the same query params back so the resulting list shows exactly the same
 * records the dashboard counted.
 *
 * For per-record drill-downs (single upcoming return → its submission flow,
 * single license → license detail, single payment → payment detail) use the
 * `recordPath(...)` helpers below.
 */

export interface LicenseeDrilldown {
  id: string;
  label: string;
  targetPath: string;
  query: Record<string, string>;
  description?: string;
}

const COMPLIANCE_RETURNS = '/compliance/returns';
const LICENSES = '/licenses';
const PAYMENTS = '/payments';
const APPLICATIONS_QUEUE = '/applications/queue';
const NOTIFICATIONS = '/notifications';

export const LICENSEE_DRILLDOWNS = {
  // Licenses
  licensesActive: {
    id: 'licensee.licenses.active',
    label: 'Active licences',
    targetPath: LICENSES,
    query: { status: 'active' },
  },
  licensesExpiring: {
    id: 'licensee.licenses.expiring',
    label: 'Expiring ≤30d',
    targetPath: LICENSES,
    query: { filter: 'expiring' },
    description: 'Active licences with valid_until within the next 30 days.',
  },
  licensesExpired: {
    id: 'licensee.licenses.expired',
    label: 'Expired',
    targetPath: LICENSES,
    query: { status: 'expired' },
  },

  // Returns
  returnsDueSoon: {
    id: 'licensee.returns.due_soon',
    label: 'Returns due',
    targetPath: COMPLIANCE_RETURNS,
    query: { filter: 'due_soon' },
    description: 'Pending/draft returns due in the next 30 days.',
  },
  returnsOverdue: {
    id: 'licensee.returns.overdue',
    label: 'Overdue returns',
    targetPath: COMPLIANCE_RETURNS,
    query: { filter: 'overdue' },
  },
  returnsSubmitted: {
    id: 'licensee.returns.submitted',
    label: 'Submitted returns',
    targetPath: COMPLIANCE_RETURNS,
    query: { status: 'submitted' },
  },
  returnsPendingReview: {
    id: 'licensee.returns.pending_review',
    label: 'Returns pending review',
    targetPath: COMPLIANCE_RETURNS,
    query: { filter: 'pending_review' },
  },
  returnsAll: {
    id: 'licensee.returns.all',
    label: 'All returns',
    targetPath: COMPLIANCE_RETURNS,
    query: {},
  },

  // Payments
  paymentsPending: {
    id: 'licensee.payments.pending',
    label: 'Outstanding fees',
    targetPath: PAYMENTS,
    query: { status: 'pending' },
  },
  paymentsPaid: {
    id: 'licensee.payments.paid',
    label: 'Paid',
    targetPath: PAYMENTS,
    query: { status: 'paid' },
  },
  paymentsAll: {
    id: 'licensee.payments.all',
    label: 'All payments',
    targetPath: PAYMENTS,
    query: {},
  },

  // Applications (licensee scope)
  appsDraft: {
    id: 'licensee.applications.draft',
    label: 'Draft applications',
    targetPath: APPLICATIONS_QUEUE,
    query: { status: 'draft' },
  },
  appsSubmitted: {
    id: 'licensee.applications.submitted',
    label: 'Submitted applications',
    targetPath: APPLICATIONS_QUEUE,
    query: { status: 'submitted' },
  },
  appsApproved: {
    id: 'licensee.applications.approved',
    label: 'Approved applications',
    targetPath: APPLICATIONS_QUEUE,
    query: { statusGroup: 'approved' },
  },
  appsRejected: {
    id: 'licensee.applications.rejected',
    label: 'Rejected applications',
    targetPath: APPLICATIONS_QUEUE,
    query: { statusGroup: 'rejected' },
  },

  // Misc
  notificationsUnread: {
    id: 'licensee.notifications.unread',
    label: 'Unread notifications',
    targetPath: NOTIFICATIONS,
    query: {},
  },
} as const satisfies Record<string, LicenseeDrilldown>;

export type LicenseeDrilldownKey = keyof typeof LICENSEE_DRILLDOWNS;

export function licenseeDrilldownTo(key: LicenseeDrilldownKey): string {
  const def = LICENSEE_DRILLDOWNS[key];
  const qs = new URLSearchParams(def.query).toString();
  return qs ? `${def.targetPath}?${qs}` : def.targetPath;
}

/** Per-record drill-down helpers — clicking a single row goes to that record. */
export const recordPath = {
  return: (returnId: string) => `/compliance/returns/submit?returnId=${encodeURIComponent(returnId)}`,
  license: (licenseId: string) => `/licenses/${encodeURIComponent(licenseId)}`,
  payment: (paymentId: string) => `/payments/${encodeURIComponent(paymentId)}`,
  application: (applicationId: string) => `/applications/${encodeURIComponent(applicationId)}`,
};

/**
 * Human-readable label shown on the target page as an "active filter" chip
 * when the user arrived via a dashboard drill-down. The target page reads
 * its own query params; this helper centralizes the wording.
 */
export function describeReturnsFilter(params: URLSearchParams): string | null {
  const filter = params.get('filter');
  const status = params.get('status');
  if (filter === 'due_soon') return 'Due soon (≤30 days)';
  if (filter === 'overdue') return 'Overdue';
  if (filter === 'pending_review') return 'Pending review';
  if (filter === 'upcoming') return 'Upcoming';
  if (status && status !== 'all') return `Status: ${status.replace(/_/g, ' ')}`;
  return null;
}

export function describeLicensesFilter(params: URLSearchParams): string | null {
  const filter = params.get('filter');
  const status = params.get('status');
  if (filter === 'expiring') return 'Expiring within 30 days';
  if (filter === 'expired') return 'Expired';
  if (status && status !== 'all') return `Status: ${status}`;
  return null;
}
