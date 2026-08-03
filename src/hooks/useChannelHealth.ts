/**
 * Notification channel health.
 *
 * Reads the permission-gated `notification_channel_health()` RPC (requires
 * notification_management.view). The RPC returns booleans, counts and redacted
 * error text only — never SMTP credentials or message bodies.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ChannelHealthWorker {
  jobname: string;
  schedule: string;
  active: boolean;
  last_run_at: string | null;
  last_status: string | null;
}

export interface ChannelHealthError {
  id: string;
  event_key: string;
  channel: string;
  status: string;
  attempts: number | null;
  created_at: string;
  recipient_masked: string | null;
  error: string;
}

export interface ChannelHealth {
  smtp: { configured: boolean; host_set: boolean; enabled: boolean };
  sms: { configured: boolean; available: boolean; reason: string };
  email: {
    last_success_at: string | null;
    failures_1h: number;
    failures_24h: number;
    sent_24h: number;
    bounced_24h: number;
    poisoned: number;
  };
  in_app: { last_success_at: string | null; failures_24h: number };
  queue: {
    dispatch_pending: number;
    dispatch_oldest_pending_at: string | null;
    event_queue_pending: number;
    event_queue_dead: number;
    event_queue_oldest_pending_at: string | null;
    retry_backlog: number;
  };
  workers: ChannelHealthWorker[];
  recent_errors: ChannelHealthError[];
  generated_at: string;
}

export function useChannelHealth() {
  return useQuery({
    queryKey: ['notification_channel_health'],
    queryFn: async (): Promise<ChannelHealth> => {
      const { data, error } = await (supabase as any).rpc('notification_channel_health');
      if (error) throw error;
      return data as ChannelHealth;
    },
    refetchInterval: 60_000,
  });
}

export function useRetryDispatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (logId: string) => {
      const { data, error } = await supabase.functions.invoke('notification-retry', {
        body: { log_id: logId },
        headers: { 'x-triggered-by': 'admin' },
      });
      if (error) throw error;
      if (data && (data as any).ok === false) throw new Error((data as any).error || 'retry_failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification_channel_health'] });
    },
  });
}
