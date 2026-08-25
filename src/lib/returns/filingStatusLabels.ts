/**
 * Friendly, non-technical labels for canonical return filing statuses.
 * Canonical status strings remain the internal truth — this only affects UI copy.
 */
export const FILING_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  CORRECTION_REQUESTED: 'Correction requested',
  REJECTED: 'Correction requested',
  ACCEPTED: 'Accepted',
  COMPLETED: 'Completed',
  WITHDRAWN: 'Withdrawn',
};

export function filingStatusLabel(status?: string | null): string {
  if (!status) return 'Not started';
  return FILING_STATUS_LABELS[status] ?? status.replace(/_/g, ' ').toLowerCase();
}

/** Statuses that must never lead to a new filing being created. */
export const SUBMITTED_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'COMPLETED'];

export function isSubmittedStatus(status?: string | null) {
  return !!status && SUBMITTED_STATUSES.includes(status);
}

export function isCorrectionStatus(status?: string | null) {
  return status === 'CORRECTION_REQUESTED' || status === 'REJECTED';
}

/** Quarter number derived from the configured period start (1-4). */
export function quarterOfPeriod(periodStart: string): number {
  const month = new Date(periodStart).getUTCMonth();
  return Math.floor(month / 3) + 1;
}
