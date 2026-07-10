import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Fit & Proper notification-dispatch log — mirrors the Returns module's
// useReturnEventConfigs/useReturnDispatchLog (src/hooks/useReturnsManagement.ts),
// scoped to fp_* event keys instead of return.*. Gives staff one place to see
// "every F&P notification sent", which previously had no consolidated view
// even after Phase 1 seeded the fp_* notification_event_configs rows.
export function useFpEventConfigs() {
  return useQuery({
    queryKey: ['fp_event_configs'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('notification_event_configs')
        .select('*')
        .like('event_key', 'fp\\_%')
        .order('event_key');
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useFpDispatchLog(filters?: { status?: string; channel?: string; eventKey?: string }) {
  return useQuery({
    queryKey: ['fp_dispatch_log', filters],
    queryFn: async () => {
      let q = (supabase as any)
        .from('notification_dispatch_log')
        .select('*')
        .like('event_key', 'fp\\_%')
        .order('created_at', { ascending: false })
        .limit(500);
      if (filters?.status) q = q.eq('status', filters.status);
      if (filters?.channel) q = q.eq('channel', filters.channel);
      if (filters?.eventKey) q = q.eq('event_key', filters.eventKey);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });
}
