export const APPLICATION_QUEUE_PENDING_STATUSES = ['submitted', 'in_progress'] as const;

export const APPLICATION_QUEUE_SLA_BREACH_DAYS = 30;

export const APPLICATION_QUEUE_SLA_DUE_SOON_DAYS = 20;

export function getApplicationQueueSlaCutoffIso(now: Date, days: number) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff.toISOString();
}

export function matchesApplicationQueueSla(
  status: string | null | undefined,
  submittedAt: string | null | undefined,
  sla: 'pending' | 'breached' | 'due_soon' | null | undefined,
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