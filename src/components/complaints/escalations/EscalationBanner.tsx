import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Live pending escalation count via `pending_escalation_count` RPC.
 * Renders nothing when there are no pending cases (or when the RPC fails,
 * to avoid alarming users with stale/mock counts).
 */
export function EscalationBanner() {
  const { data: count = 0, isError } = useQuery({
    queryKey: ['pending_escalation_count'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('pending_escalation_count');
      if (error) throw error;
      return (data as number) ?? 0;
    },
    staleTime: 60_000,
  });

  if (isError || !count) return null;

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
