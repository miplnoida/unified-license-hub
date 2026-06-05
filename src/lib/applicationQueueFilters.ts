/**
 * Canonical application-queue status / SLA groupings.
 *
 * These constants are the single source of truth shared by:
 *   - the supervisory dashboard metric counts (useSupervisoryMetrics)
 *   - the dashboard drill-down links (SupervisoryDashboard)
 *   - the applications queue page (ApplicationsList)
 *   - the get_application_list_page SQL RPC
 *
 * Keep them in sync with the migration that defines v_submitted_set /
 * v_returned_set / SLA intervals in get_application_list_page. The wiring
 * test in src/test/applicationsQueueSlaWiring.test.ts asserts the latest
 * migration matches the values declared here.
 */

/** Pending = awaiting regulator action. Matches SQL v_submitted_set. */
export const APPLICATION_QUEUE_PENDING_STATUSES = ['submitted', 'in_progress'] as const;

/** Returned = sent back to applicant (resubmission/query). Matches SQL v_returned_set. */
export const APPLICATION_QUEUE_RETURNED_STATUSES = ['resubmission_requested', 'query_raised'] as const;

export const APPLICATION_QUEUE_SLA_BREACH_DAYS = 30;
export const APPLICATION_QUEUE_SLA_DUE_SOON_DAYS = 20;

export type ApplicationQueueSlaBucket = 'pending' | 'breached' | 'due_soon';
export type ApplicationQueueStatusGroup = 'pending' | 'returned' | 'approved' | 'rejected';

export function getApplicationQueueSlaCutoffIso(now: Date, days: number) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff.toISOString();
}

export function matchesApplicationQueueSla(
  status: string | null | undefined,
  submittedAt: string | null | undefined,
  sla: ApplicationQueueSlaBucket | null | undefined,
  now: Date = new Date(),
) {
  if (!sla) return true;

  const normalizedStatus = String(status || '').trim().toLowerCase();
  const isPendingStatus = APPLICATION_QUEUE_PENDING_STATUSES.includes(
    normalizedStatus as (typeof APPLICATION_QUEUE_PENDING_STATUSES)[number],
  );

  if (!isPendingStatus) return false;
  if (sla === 'pending') return true;

  if (!submittedAt) return false;

  const submittedTime = new Date(submittedAt).getTime();
  if (Number.isNaN(submittedTime)) return false;

  const breachCutoff = new Date(getApplicationQueueSlaCutoffIso(now, APPLICATION_QUEUE_SLA_BREACH_DAYS)).getTime();
  const dueSoonCutoff = new Date(getApplicationQueueSlaCutoffIso(now, APPLICATION_QUEUE_SLA_DUE_SOON_DAYS)).getTime();

  if (sla === 'breached') return submittedTime < breachCutoff;
  if (sla === 'due_soon') return submittedTime < dueSoonCutoff && submittedTime >= breachCutoff;

  return true;
}

export function matchesApplicationQueueStatusGroup(
  status: string | null | undefined,
  group: ApplicationQueueStatusGroup | null | undefined,
) {
  if (!group) return true;
  const normalized = String(status || '').trim().toLowerCase();
  switch (group) {
    case 'pending':
      return (APPLICATION_QUEUE_PENDING_STATUSES as readonly string[]).includes(normalized);
    case 'returned':
      return (APPLICATION_QUEUE_RETURNED_STATUSES as readonly string[]).includes(normalized);
    case 'approved':
      return normalized === 'approved';
    case 'rejected':
      return normalized === 'rejected';
    default:
      return true;
  }
}
