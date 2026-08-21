import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SupervisoryTrendPoint {
  month: string;      // 'YYYY-MM'
  label: string;       // 'Feb 2026'
  applications: number;
  complaints: number;
  enforcement: number;
  returns: number;
}

export interface SupervisoryTrendsOptions {
  applications: boolean;
  complaints: boolean;
  enforcement: boolean;
  returns: boolean;
}

const MONTHS_BACK = 6;

function monthKey(d: string | Date): string {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function lastNMonthKeys(n: number, now = new Date()): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

/**
 * Monthly volume trend (last 6 months) across the four modules the
 * Supervisory Dashboard already surfaces as KPI tiles — applications,
 * complaints, enforcement cases, and returns filed. Each series is only
 * fetched when the caller has access to that module (mirrors the `can.*`
 * permission gates already used throughout SupervisoryDashboard.tsx).
 */
export function useSupervisoryTrends(enabled: SupervisoryTrendsOptions) {
  const { data, isLoading } = useQuery({
    queryKey: ['supervisory_trends', enabled],
    queryFn: async () => {
      const since = new Date();
      since.setMonth(since.getMonth() - (MONTHS_BACK - 1));
      since.setDate(1);
      const sinceIso = since.toISOString();

      const [appsRes, complaintsRes, enforcementRes, returnsRes] = await Promise.all([
        enabled.applications
          ? supabase.from('applications').select('created_at').gte('created_at', sinceIso)
          : Promise.resolve({ data: [] as { created_at: string }[] }),
        enabled.complaints
          ? supabase.from('complaints').select('created_at').gte('created_at', sinceIso)
          : Promise.resolve({ data: [] as { created_at: string }[] }),
        enabled.enforcement
          ? supabase.from('enforcement_actions').select('date_opened').gte('date_opened', sinceIso)
          : Promise.resolve({ data: [] as { date_opened: string }[] }),
        // EPR-01: canonical returns volumes, aggregated server-side.
        enabled.returns
          ? fetchCanonicalReturnsTrend(MONTHS_BACK)
          : Promise.resolve([] as CanonicalReturnsTrendPoint[]),
      ]);

      const months = lastNMonthKeys(MONTHS_BACK);
      const buckets = new Map<string, SupervisoryTrendPoint>(
        months.map((m) => [m, { month: m, label: monthLabel(m), applications: 0, complaints: 0, enforcement: 0, returns: 0 }]),
      );

      for (const row of (appsRes.data ?? []) as { created_at: string }[]) {
        const b = buckets.get(monthKey(row.created_at));
        if (b) b.applications++;
      }
      for (const row of (complaintsRes.data ?? []) as { created_at: string }[]) {
        const b = buckets.get(monthKey(row.created_at));
        if (b) b.complaints++;
      }
      for (const row of (enforcementRes.data ?? []) as { date_opened: string }[]) {
        const b = buckets.get(monthKey(row.date_opened));
        if (b) b.enforcement++;
      }
      for (const point of returnsRes as CanonicalReturnsTrendPoint[]) {
        const b = buckets.get(point.month);
        if (b) b.returns += point.filings;
      }


      return months.map((m) => buckets.get(m)!);
    },
    staleTime: 60_000,
  });

  return { trends: data ?? [], isLoading };
}
