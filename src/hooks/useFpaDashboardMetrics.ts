import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FpaAssessmentTypeBucket {
  type: string;
  count: number;
  total: number;
}

export interface FpaDashboardMetrics {
  individuals: number;
  activeAssessments: number;
  openFindings: number;
  /** High-severity findings not yet finalized (confirmed or cleared) by a reviewer — the actionable risk indicator. */
  openHighSeverityFindings: number;
  /** Conditions not yet satisfied or waived — includes overdue ones, which are still "active". */
  activeConditions: number;
  assessmentTypeData: FpaAssessmentTypeBucket[];
}

/**
 * Fit & Proper metrics shared by FpaDashboard.tsx and the cross-module
 * supervisory dashboard, so both surfaces always report the same numbers.
 */
export function useFpaDashboardMetrics(enabled = true) {
  return useQuery<FpaDashboardMetrics>({
    queryKey: ['fpa_dashboard_metrics'],
    enabled,
    queryFn: async () => {
      const [
        individualsRes,
        activeAssessmentsRes,
        openFindingsRes,
        openHighSeverityRes,
        activeConditionsRes,
        assessmentTypesRes,
      ] = await Promise.all([
        supabase.from('fp_individuals').select('*', { count: 'exact', head: true }),
        supabase.from('fp_assessments').select('*', { count: 'exact', head: true }).not('status', 'in', '("closed","determined")'),
        supabase.from('fp_findings').select('*', { count: 'exact', head: true }).eq('resolution_status', 'open'),
        supabase.from('fp_findings').select('*', { count: 'exact', head: true }).eq('severity', 'high').not('resolution_status', 'in', '("confirmed","false_positive")'),
        supabase.from('fp_conditions').select('*', { count: 'exact', head: true }).in('status', ['open', 'overdue']),
        supabase.from('fp_assessments').select('assessment_type'),
      ]);

      for (const res of [individualsRes, activeAssessmentsRes, openFindingsRes, openHighSeverityRes, activeConditionsRes, assessmentTypesRes]) {
        if (res.error) throw res.error;
      }

      const rows = (assessmentTypesRes.data ?? []) as Array<{ assessment_type: string | null }>;
      const counts: Record<string, number> = {};
      for (const row of rows) {
        const t = row.assessment_type ?? 'unknown';
        counts[t] = (counts[t] ?? 0) + 1;
      }
      const total = rows.length;
      const assessmentTypeData = Object.entries(counts)
        .map(([type, count]) => ({ type, count, total }))
        .sort((a, b) => b.count - a.count);

      return {
        individuals: individualsRes.count ?? 0,
        activeAssessments: activeAssessmentsRes.count ?? 0,
        openFindings: openFindingsRes.count ?? 0,
        openHighSeverityFindings: openHighSeverityRes.count ?? 0,
        activeConditions: activeConditionsRes.count ?? 0,
        assessmentTypeData,
      };
    },
  });
}
