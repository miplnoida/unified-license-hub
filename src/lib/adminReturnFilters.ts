export const ADMIN_RETURN_HIDDEN_STATUSES = ['draft', 'pending', 'not_submitted', 'in_progress'] as const;

export const ADMIN_RETURN_VISIBLE_STORED_STATUSES = [
  'submitted',
  'accepted',
  'rejected',
  'resubmission_requested',
] as const;

export const ADMIN_RETURN_STATUS_FILTERS = [
  'all',
  'submitted',
  'accepted',
  'rejected',
  'resubmission_requested',
  'overdue',
] as const;

export type AdminReturnStoredStatus = typeof ADMIN_RETURN_VISIBLE_STORED_STATUSES[number];
export type AdminReturnStatusFilter = typeof ADMIN_RETURN_STATUS_FILTERS[number];
export type AdminReturnDisplayStatus = Exclude<AdminReturnStatusFilter, 'all'>;

export interface AdminReturnLike {
  status: string | null;
  due_date?: string | null;
  reviewed_at?: string | null;
}

export interface AdminReturnDrilldown {
  id: string;
  label: string;
  targetPath: string;
  query: Record<string, string>;
  filter: AdminReturnStatusFilter;
  description?: string;
}

const RETURNS_MANAGEMENT_PATH = '/returns-management';

const HIDDEN_STATUSES_SQL = `(${ADMIN_RETURN_HIDDEN_STATUSES.map((status) => `"${status}"`).join(',')})`;

export const ADMIN_RETURN_DRILLDOWNS = {
  all: {
    id: 'returns.all',
    label: 'Submitted Returns',
    targetPath: RETURNS_MANAGEMENT_PATH,
    query: {},
    filter: 'all',
    description: 'All admin-visible submitted and finalized returns.',
  },
  overdue: {
    id: 'returns.overdue',
    label: 'Overdue Returns',
    targetPath: RETURNS_MANAGEMENT_PATH,
    query: { status: 'overdue' },
    filter: 'overdue',
    description: 'Submitted returns that are past due and still awaiting review.',
  },
  pendingReview: {
    id: 'returns.pendingReview',
    label: 'Pending Review',
    targetPath: RETURNS_MANAGEMENT_PATH,
    query: { status: 'submitted' },
    filter: 'submitted',
    description: 'Submitted returns awaiting review and not yet overdue.',
  },
  accepted: {
    id: 'returns.accepted',
    label: 'Accepted Returns',
    targetPath: RETURNS_MANAGEMENT_PATH,
    query: { status: 'accepted' },
    filter: 'accepted',
  },
  rejected: {
    id: 'returns.rejected',
    label: 'Rejected Returns',
    targetPath: RETURNS_MANAGEMENT_PATH,
    query: { status: 'rejected' },
    filter: 'rejected',
  },
  resubmissionRequested: {
    id: 'returns.resubmissionRequested',
    label: 'Returns To Be Resubmitted',
    targetPath: RETURNS_MANAGEMENT_PATH,
    query: { status: 'resubmission_requested' },
    filter: 'resubmission_requested',
  },
} as const satisfies Record<string, AdminReturnDrilldown>;

export type AdminReturnDrilldownKey = keyof typeof ADMIN_RETURN_DRILLDOWNS;

export function todayDateIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function normalizeAdminReturnStatusFilter(value: string | null | undefined): AdminReturnStatusFilter {
  return (ADMIN_RETURN_STATUS_FILTERS as readonly string[]).includes(value ?? '')
    ? (value as AdminReturnStatusFilter)
    : 'all';
}

export function isAdminVisibleReturnStatus(status: string | null | undefined): status is AdminReturnStoredStatus {
  return !!status && !(ADMIN_RETURN_HIDDEN_STATUSES as readonly string[]).includes(status);
}

export function isAdminReturnOverdue(row: AdminReturnLike, today = todayDateIso()): boolean {
  return row.status === 'submitted' && !!row.due_date && row.due_date < today && !row.reviewed_at;
}

export function getAdminReturnDisplayStatus(
  row: AdminReturnLike,
  today = todayDateIso(),
): AdminReturnDisplayStatus | null {
  if (!isAdminVisibleReturnStatus(row.status)) return null;
  if (isAdminReturnOverdue(row, today)) return 'overdue';
  return row.status;
}

export function matchesAdminReturnFilter(
  row: AdminReturnLike,
  filter: AdminReturnStatusFilter,
  today = todayDateIso(),
): boolean {
  const derivedStatus = getAdminReturnDisplayStatus(row, today);
  if (!derivedStatus) return false;
  return filter === 'all' ? true : derivedStatus === filter;
}

export function applyAdminReturnServerFilter(query: any, filter: AdminReturnStatusFilter, today = todayDateIso()) {
  const baseQuery = query.not('status', 'in', HIDDEN_STATUSES_SQL);

  switch (filter) {
    case 'overdue':
      return baseQuery.eq('status', 'submitted').lt('due_date', today).is('reviewed_at', null);
    case 'submitted':
      return baseQuery.eq('status', 'submitted').or(`due_date.gte.${today},due_date.is.null`);
    case 'accepted':
      return baseQuery.eq('status', 'accepted');
    case 'rejected':
      return baseQuery.eq('status', 'rejected');
    case 'resubmission_requested':
      return baseQuery.eq('status', 'resubmission_requested');
    case 'all':
    default:
      return baseQuery;
  }
}

export function adminReturnDrilldownTo(key: AdminReturnDrilldownKey): string {
  const def = ADMIN_RETURN_DRILLDOWNS[key];
  const qs = new URLSearchParams(def.query).toString();
  return qs ? `${def.targetPath}?${qs}` : def.targetPath;
}
