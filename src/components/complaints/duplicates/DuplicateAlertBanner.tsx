import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Copy, AlertCircle, RefreshCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

/**
 * Live pending-pair count via `pending_duplicate_count` RPC.
 *
 * Visibility rules:
 *  - loading         -> render nothing (no flash) but do not swallow the state
 *  - success, 0      -> render nothing (clean UI when there is nothing to do)
 *  - success, >0     -> render the actionable alert linking to the hub
 *  - error           -> render a visible, non-fatal error banner with retry.
 *                       Never silently hide a failure — that mis-represents
 *                       operational state to supervisors.
 */
export function DuplicateAlertBanner() {
  const {
    data: count = 0,
    isError,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['pending_duplicate_count'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('pending_duplicate_count');
      if (error) throw error;
      return (data as number) ?? 0;
    },
    staleTime: 60_000,
    retry: 1,
  });

  if (isLoading) return null;

  if (isError) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-3 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>
            Unable to load duplicate-review queue.
            <span className="ml-2 text-xs opacity-80">
              {(error as { message?: string })?.message ?? 'Please try again.'}
            </span>
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-red-900 hover:bg-red-100"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCcw className="h-3.5 w-3.5 mr-1" /> Retry
        </Button>
      </div>
    );
  }

  if (!count) return null;

  return (
    <Link
      to="/complaints/duplicates"
      className="flex items-center justify-between gap-3 rounded-md border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900 hover:bg-sky-100"
    >
      <div className="flex items-center gap-2">
        <Copy className="h-4 w-4" />
        <span>
          <strong>{count}</strong> suspected duplicate pair{count === 1 ? '' : 's'} awaiting review.
        </span>
      </div>
      <span className="text-xs underline">Open Duplicate Hub</span>
    </Link>
  );
}
