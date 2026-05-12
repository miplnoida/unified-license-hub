import { supabase } from '@/integrations/supabase/client';

export const APPLICATION_STATUS = {
  DRAFT: 'draft',
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
} as const;

export const EDITABLE_APPLICATION_STATUSES = [
  'draft',
  'in_progress',
  'resubmission_requested',
  'query_raised',
];

export const SUBMITTED_APPLICATION_STATUSES = [
  'submitted',
  'under_review',
  'review',
  'pending_review',
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

/**
 * Promote an application from draft → in_progress after the first form save.
 * Never downgrades any other status.
 */
export async function markApplicationInProgressIfDraft(
  applicationId: string | null | undefined,
): Promise<void> {
  if (!applicationId) return;
  try {
    await supabase.rpc('mark_application_in_progress' as any, {
      _application_id: applicationId,
    } as any);
  } catch (err) {
    console.warn('[applicationStatus] markApplicationInProgressIfDraft failed:', err);
  }
}
