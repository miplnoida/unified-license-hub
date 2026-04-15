import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SystemMetrics {
  totalUsers: number;
  activeUsers: number;
  totalApplications: number;
  pendingApplications: number;
  activeLicenses: number;
  totalRegulators: number;
  totalSectors: number;
  totalForms: number;
  totalWorkflows: number;
  totalFeeConfigs: number;
  totalReturns: number;
  overdueReturns: number;
  totalPayments: number;
  totalAuditLogs: number;
  totalComplaints: number;
  totalNotificationTemplates: number;
}

async function countTable(table: string, filter?: { column: string; op: 'eq' | 'in'; value: string | string[] }): Promise<number> {
  let query = supabase.from(table as any).select('*', { count: 'exact', head: true });
  if (filter) {
    if (filter.op === 'eq') {
      query = query.eq(filter.column, filter.value as string);
    } else if (filter.op === 'in') {
      query = query.in(filter.column, filter.value as string[]);
    }
  }
  const { count, error } = await query;
  if (error) throw new Error(`Failed to count ${table}: ${error.message}`);
  return count ?? 0;
}

async function fetchAllMetrics(): Promise<SystemMetrics> {
  const [
    totalUsers, activeUsers, totalApplications, pendingApplications,
    activeLicenses, totalRegulators, totalSectors, totalForms,
    totalWorkflows, totalFeeConfigs, totalReturns, overdueReturns,
    totalPayments, totalAuditLogs, totalComplaints, totalNotificationTemplates,
  ] = await Promise.all([
    countTable('profiles'),
    countTable('profiles', { column: 'status', op: 'eq', value: 'active' }),
    countTable('applications'),
    countTable('applications', { column: 'status', op: 'in', value: ['submitted', 'in_progress'] }),
    countTable('licenses', { column: 'status', op: 'eq', value: 'active' }),
    countTable('regulators'),
    countTable('sectors'),
    countTable('form_templates'),
    countTable('approval_workflows'),
    countTable('fee_configurations'),
    countTable('compliance_returns'),
    countTable('compliance_returns', { column: 'status', op: 'eq', value: 'overdue' }),
    countTable('payments'),
    countTable('audit_logs'),
    countTable('complaints'),
    countTable('notification_templates'),
  ]);

  return {
    totalUsers, activeUsers, totalApplications, pendingApplications,
    activeLicenses, totalRegulators, totalSectors, totalForms,
    totalWorkflows, totalFeeConfigs, totalReturns, overdueReturns,
    totalPayments, totalAuditLogs, totalComplaints, totalNotificationTemplates,
  };
}

export function useAdminMetrics() {
  return useQuery({
    queryKey: ['admin-metrics'],
    queryFn: fetchAllMetrics,
    staleTime: 60_000,
    retry: 2,
  });
}
