import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ConductDashboardMetrics {
  openComplaints: number;
  criticalComplaints: number;
  slaBreachedComplaints: number;
  openAlerts: number;
}

/**
 * Market Conduct metrics for the cross-module supervisory dashboard —
 * head-count-only versions of the same filters ConductDashboard.tsx applies
 * client-side over full rows, so the two surfaces stay consistent without
 * shipping row data to a summary tile.
 */
export function useConductDashboardMetrics(enabled = true) {
  return useQuery<ConductDashboardMetrics>({
    queryKey: ['conduct_dashboard_metrics'],
    enabled,
    queryFn: async () => {
      const nowIso = new Date().toISOString();

      const [openComplaintsRes, criticalRes, slaBreachedRes, openAlertsRes] = await Promise.all([
        supabase.from('complaints').select('*', { count: 'exact', head: true }).not('status', 'in', '("closed","resolved")'),
        supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('severity', 'critical'),
        supabase.from('complaints').select('*', { count: 'exact', head: true }).is('resolved_at', null).not('sla_due_at', 'is', null).lt('sla_due_at', nowIso),
        supabase.from('conduct_alerts').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      ]);

      for (const res of [openComplaintsRes, criticalRes, slaBreachedRes, openAlertsRes]) {
        if (res.error) throw res.error;
      }

      return {
        openComplaints: openComplaintsRes.count ?? 0,
        criticalComplaints: criticalRes.count ?? 0,
        slaBreachedComplaints: slaBreachedRes.count ?? 0,
        openAlerts: openAlertsRes.count ?? 0,
      };
    },
  });
}
