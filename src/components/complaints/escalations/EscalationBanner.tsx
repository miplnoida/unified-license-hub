import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, AlertCircle, RefreshCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

/**
 * Live pending escalation count via `pending_escalation_count` RPC.
 *
 * Visibility rules mirror DuplicateAlertBanner: loading is silent, empty is
 * silent, populated shows the action link, and errors surface a retryable
 * alert instead of being hidden — supervisors need to know the queue is
 * unreachable, not see a false all-clear.
 */
export function EscalationBanner() {
  const {
    data: count = 0,
    isError,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['pending_escalation_count'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('pending_escalation_count');
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
            Unable to load escalation queue.
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
      to="/complaints/escalations"
      className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <span>
          <strong>{count}</strong> complaint{count === 1 ? '' : 's'} pending auto-escalation review.
        </span>
      </div>
      <span className="text-xs underline">Open Escalation Hub</span>
    </Link>
  );
}
