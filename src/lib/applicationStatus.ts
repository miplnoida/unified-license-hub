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
    const { data, error } = await supabase
      .from('applications')
      .select('id, status')
      .eq('id', applicationId)
      .maybeSingle();
    if (error || !data) return;
    if (!shouldMoveDraftToInProgress((data as any).status)) return;
    await supabase
      .from('applications')
      .update({ status: 'in_progress' as any, updated_at: new Date().toISOString() } as any)
      .eq('id', applicationId)
      .eq('status', 'draft');
  } catch (err) {
    console.warn('[applicationStatus] markApplicationInProgressIfDraft failed:', err);
  }
}
