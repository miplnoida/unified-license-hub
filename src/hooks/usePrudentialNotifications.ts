import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const PRUDENTIAL_EVENT_PREFIX = 'prudential';

/**
 * Prudential notification dispatches from the shared notification engine.
 * Includes prudential_* events plus SLA breach/warning rows scoped to the
 * prudential module.
 */
export function usePrudentialDispatchLog(filters?: {
  status?: string;
  channel?: string;
  eventKey?: string;
}) {
  return useQuery({
    queryKey: ['prudential_dispatch_log', filters],
    queryFn: async () => {
      let q = (supabase as any)
        .from('notification_dispatch_log')
        .select('*')
        .or('event_key.like.prudential%,module.eq.prudential_supervision,module.eq.prudential')
        .order('created_at', { ascending: false })
        .limit(500);
      if (filters?.status) q = q.eq('status', filters.status);
      if (filters?.channel) q = q.eq('channel', filters.channel);
      if (filters?.eventKey) q = q.eq('event_key', filters.eventKey);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}
