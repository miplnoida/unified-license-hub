/**
 * Canonical complaint status model.
 *
 * The database stores exactly these values (enforced by a CHECK constraint).
 * Legacy "open" rows have been migrated to "submitted"; the UI still exposes an
 * "Open" bucket in filters, but that is a read-only grouping of
 * (submitted + under_investigation), never a persisted state.
 */

export type ComplaintStatus =
  | 'submitted'
  | 'under_investigation'
  | 'resolved'
  | 'closed'
  | 'rejected'
  | 'duplicate';

export const COMPLAINT_STATUSES: ComplaintStatus[] = [
  'submitted',
  'under_investigation',
  'resolved',
  'closed',
  'rejected',
  'duplicate',
];

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  submitted: 'Submitted',
  under_investigation: 'Under Investigation',
  resolved: 'Resolved',
  closed: 'Closed',
  rejected: 'Rejected',
  duplicate: 'Duplicate',
};

export const COMPLAINT_STATUS_VARIANTS: Record<
  ComplaintStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  submitted: 'default',
  under_investigation: 'outline',
  resolved: 'default',
  closed: 'secondary',
  rejected: 'destructive',
  duplicate: 'secondary',
};

export function complaintStatusLabel(s: string | null | undefined): string {
  if (!s) return '—';
  return COMPLAINT_STATUS_LABELS[s as ComplaintStatus] ?? s;
}

export function complaintStatusVariant(
  s: string | null | undefined,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!s) return 'outline';
  return COMPLAINT_STATUS_VARIANTS[s as ComplaintStatus] ?? 'outline';
}

/** "Open" bucket = anything not yet resolved/closed/rejected/duplicate. */
export function isOpenComplaint(status: string | null | undefined): boolean {
  return status === 'submitted' || status === 'under_investigation';
}

/** Whether a workflow transition from `from` to `to` is allowed. */
export const COMPLAINT_TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  submitted: ['under_investigation', 'rejected', 'duplicate', 'resolved', 'closed'],
  under_investigation: ['resolved', 'closed', 'rejected', 'duplicate'],
  resolved: ['closed', 'under_investigation'],
  closed: [],
  rejected: [],
  duplicate: [],
};

export function canTransitionComplaint(
  from: string | null | undefined,
  to: ComplaintStatus,
): boolean {
  if (!from) return false;
  const allowed = COMPLAINT_TRANSITIONS[from as ComplaintStatus];
  return !!allowed && allowed.includes(to);
}

/**
 * Priority is stored as p1–p4. Non-technical users should never see the codes,
 * so every display surface renders these words instead.
 */
export const COMPLAINT_PRIORITY_LABELS: Record<string, string> = {
  p1: 'Critical',
  p2: 'High',
  p3: 'Medium',
  p4: 'Low',
};

export const COMPLAINT_PRIORITIES = ['p1', 'p2', 'p3', 'p4'] as const;

export function complaintPriorityLabel(p: string | null | undefined): string {
  if (!p) return '—';
  return COMPLAINT_PRIORITY_LABELS[String(p).toLowerCase()] ?? String(p);
}
