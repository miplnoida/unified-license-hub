import { supabase } from '@/integrations/supabase/client';

export const APPLICATION_STATUS = {
  DRAFT: 'draft',
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
} as const;

const TERMINAL_STATUSES = new Set([
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'cancelled',
  'withdrawn',
  'resubmission_requested',
  'query_raised',
]);

export function shouldMoveDraftToInProgress(status?: string | null) {
  return !status || String(status).toLowerCase() === 'draft';
}

export function isTerminalApplicationStatus(status?: string | null) {
  return TERMINAL_STATUSES.has(String(status || '').toLowerCase());
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
