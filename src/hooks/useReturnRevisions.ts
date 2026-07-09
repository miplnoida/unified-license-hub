import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ReturnRevision {
  id: string;
  return_id: string;
  revision_number: number;
  snapshot_reason: 'submitted' | 'edit_requested' | 'resubmitted' | 'admin_edit';
  previous_status: string | null;
  new_status: string | null;
  snapshot: Record<string, Record<string, any>>;
  form_version_ids: Record<string, string>;
  created_by: string | null;
  created_at: string;
}

export function useReturnRevisions(returnId?: string) {
  return useQuery({
    queryKey: ['return_data_revisions', returnId],
    enabled: !!returnId,
    queryFn: async (): Promise<ReturnRevision[]> => {
      const { data, error } = await (supabase as any).rpc('get_return_revisions', {
        _return_id: returnId!,
      });
      if (error) throw error;
      return (data || []) as ReturnRevision[];
    },
  });
}

/**
 * Snapshot the current return form data as an immutable revision.
 * Delegates to the SECURITY DEFINER RPC so numbering is consistent
 * regardless of who calls it.
 */
export async function snapshotReturnRevision(args: {
  returnId: string;
  reason: 'submitted' | 'edit_requested' | 'resubmitted' | 'admin_edit';
  previousStatus?: string | null;
  newStatus?: string | null;
}): Promise<string | null> {
  const { data, error } = await (supabase as any).rpc('snapshot_return_revision', {
    _return_id: args.returnId,
    _reason: args.reason,
    _previous_status: args.previousStatus ?? null,
    _new_status: args.newStatus ?? null,
    _actor_id: null,
  });
  if (error) {
    console.warn('[snapshotReturnRevision]', error.message);
    return null;
  }
  return (data as string) || null;
}

/**
 * Given the ordered revisions, returns the baseline revision that the current
 * form data should be compared against for edit highlighting.
 *
 * The baseline is the most recent 'edit_requested' revision — i.e. the state
 * of the return at the moment the reviewer asked for an edit. Any field that
 * differs between that baseline and the current data is considered "edited"
 * by the licensee during resubmission.
 */
export function pickEditBaseline(revisions: ReturnRevision[]): ReturnRevision | null {
  for (let i = revisions.length - 1; i >= 0; i--) {
    if (revisions[i].snapshot_reason === 'edit_requested') return revisions[i];
  }
  return null;
}
