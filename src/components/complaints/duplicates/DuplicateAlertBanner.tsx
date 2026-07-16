import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Live pending-pair count via `pending_duplicate_count` RPC.
 * Renders nothing when there are no pending pairs (or the RPC fails).
 */
export function DuplicateAlertBanner() {
  const { data: count = 0, isError } = useQuery({
    queryKey: ['pending_duplicate_count'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('pending_duplicate_count');
      if (error) throw error;
      return (data as number) ?? 0;
    },
    staleTime: 60_000,
  });

  if (isError || !count) return null;

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
