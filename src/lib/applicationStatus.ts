import { supabase } from '@/integrations/supabase/client';
import { APPLICATION_QUEUE_PENDING_STATUSES } from '@/lib/applicationQueueFilters';

export const APPLICATION_STATUS = {
  DRAFT: 'draft',
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
} as const;

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  under_review: 'Under Review',
  review: 'Review',
  pending_review: 'Pending Review',
  query_raised: 'Query Raised',
  resubmission_requested: 'Resubmission Requested',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  withdrawn: 'Withdrawn',
};

export const EDITABLE_APPLICATION_STATUSES = [
  'draft',
  'in_progress',
  'resubmission_requested',
  'query_raised',
];

export const SUBMITTED_APPLICATION_STATUSES = [
  ...APPLICATION_QUEUE_PENDING_STATUSES,
];

export const FINAL_APPLICATION_STATUSES = [
  'approved',
  'rejected',
  'cancelled',
  'withdrawn',
];

const TERMINAL_STATUSES = new Set([
  ...SUBMITTED_APPLICATION_STATUSES,
  ...FINAL_APPLICATION_STATUSES,
]);

export function normalizeApplicationStatus(status?: string | null) {
  return String(status || 'draft').trim().toLowerCase();
}

export function isApplicationEditable(status?: string | null) {
  return EDITABLE_APPLICATION_STATUSES.includes(normalizeApplicationStatus(status));
}

export function isApplicationSubmittedLike(status?: string | null) {
  return SUBMITTED_APPLICATION_STATUSES.includes(normalizeApplicationStatus(status));
}

export function isApplicationFinal(status?: string | null) {
  return FINAL_APPLICATION_STATUSES.includes(normalizeApplicationStatus(status));
}

export function shouldShowRequestEdit(status?: string | null) {
  return isApplicationSubmittedLike(status);
}

export function shouldMoveDraftToInProgress(status?: string | null) {
  return !status || normalizeApplicationStatus(status) === 'draft';
}

export function isTerminalApplicationStatus(status?: string | null) {
  return TERMINAL_STATUSES.has(normalizeApplicationStatus(status));
}

export function getApplicationStatusLabel(status?: string | null) {
  const normalizedStatus = normalizeApplicationStatus(status);
  return APPLICATION_STATUS_LABELS[normalizedStatus] || normalizedStatus.replace(/_/g, ' ');
}

/**
 * Promote an application from draft → in_progress after the first form save.
 * Never downgrades any other status.
 */
export async function markApplicationInProgressIfDraft(
  applicationId: string | null | undefined,
): Promise<string | null> {
  if (!applicationId) return null;

  const { data, error } = await supabase.rpc('mark_application_in_progress' as any, {
    _application_id: applicationId,
  } as any);

  if (error) {
    console.error('[applicationStatus] markApplicationInProgressIfDraft RPC failed:', error);
    throw error;
  }

  const result = (data || {}) as {
    error?: string;
    code?: string;
    status?: string;
    changed?: boolean;
  };

  if (result.error) {
    const rpcError = new Error(result.error);
    rpcError.name = result.code || 'MARK_APPLICATION_IN_PROGRESS_FAILED';
    console.error('[applicationStatus] markApplicationInProgressIfDraft business error:', result);
    throw rpcError;
  }

  return normalizeApplicationStatus(result.status || APPLICATION_STATUS.DRAFT);
}
