/**
 * Runs the aggregation described by a report_dashboard_widgets row.
 *
 * Supports metric_config types:
 *   - count        { type:'count', filter?: WidgetFilter }
 *   - sum          { type:'sum', column, filter? }
 *   - ratio        { type:'ratio', numerator: filter, denominator: filter }
 *   - group_by     { type:'group_by', column }                         -> [{name,value}]
 *   - group_by_month { type:'group_by_month', column }                  -> [{month,count}]
 *   - sum_by_month  { type:'sum_by_month', column, filter? }            -> [{month,amount}]
 *
 * Filter shape:
 *   { status?:string, status_in?:string[], status_not_in?:string[], overdue?:true }
 *
 * Validates source against report_sources metadata (table_name resolution),
 * so arbitrary table names cannot be passed through widget config.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ReportDashboardWidget } from '../services/reportMetadataService';
import { useReportSources } from './useReportMetadata';

type WidgetFilter = {
  status?: string;
  status_in?: string[];
  status_not_in?: string[];
  overdue?: boolean;
};

export interface WidgetData {
  value: number | string;
  series: any[];
  raw?: any;
}

function applyFilter(q: any, f?: WidgetFilter) {
  if (!f) return q;
  if (f.status) q = q.eq('status', f.status);
  if (f.status_in?.length) q = q.in('status', f.status_in);
  if (f.status_not_in?.length) q = q.not('status', 'in', `(${f.status_not_in.map((s) => `"${s}"`).join(',')})`);
  if (f.overdue) q = q.lt('due_date', new Date().toISOString()).not('status', 'in', '("submitted","validated","approved")');
  return q;
}

async function fetchAllRows(table: string, cols: string, filter?: WidgetFilter): Promise<any[]> {
  let q: any = (supabase.from(table as any) as any).select(cols).limit(5000);
  q = applyFilter(q, filter);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

function monthKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

async function runWidget(widget: ReportDashboardWidget, tableName: string): Promise<WidgetData> {
  const cfg = widget.metricConfig || {};
  const t = cfg.type;

  if (t === 'count') {
    let q: any = (supabase.from(tableName as any) as any).select('id', { count: 'exact', head: true });
    q = applyFilter(q, cfg.filter);
    const { count, error } = await q;
    if (error) throw error;
    return { value: count ?? 0, series: [] };
  }

  if (t === 'sum') {
    const rows = await fetchAllRows(tableName, cfg.column || 'amount', cfg.filter);
    const total = rows.reduce((s, r) => s + (Number(r[cfg.column]) || 0), 0);
    return { value: total, series: [] };
  }

  if (t === 'ratio') {
    const [num, den] = await Promise.all([
      (async () => {
        let q: any = (supabase.from(tableName as any) as any).select('id', { count: 'exact', head: true });
        q = applyFilter(q, cfg.numerator); const { count } = await q; return count ?? 0;
      })(),
      (async () => {
        let q: any = (supabase.from(tableName as any) as any).select('id', { count: 'exact', head: true });
        q = applyFilter(q, cfg.denominator); const { count } = await q; return count ?? 0;
      })(),
    ]);
    const pct = den > 0 ? Math.round((num / den) * 100) : 0;
    return { value: pct, series: [] };
  }

  if (t === 'group_by') {
    const rows = await fetchAllRows(tableName, cfg.column, cfg.filter);
    const counts: Record<string, number> = {};
    rows.forEach((r) => { const k = String(r[cfg.column] ?? 'unknown'); counts[k] = (counts[k] || 0) + 1; });
    return { value: rows.length, series: Object.entries(counts).map(([name, value]) => ({ name, value })) };
  }

  if (t === 'group_by_month') {
    const rows = await fetchAllRows(tableName, cfg.column, cfg.filter);
    const buckets: Record<string, number> = {};
    rows.forEach((r) => {
      const v = r[cfg.column]; if (!v) return;
      const d = new Date(v); if (Number.isNaN(d.getTime())) return;
      const k = monthKey(d);
      buckets[k] = (buckets[k] || 0) + 1;
    });
    const series = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b))
      .slice(-12).map(([month, count]) => ({ month, count, expiring: count }));
    return { value: rows.length, series };
  }

  if (t === 'sum_by_month') {
    const rows = await fetchAllRows(tableName, `${cfg.column}, created_at`, cfg.filter);
    const buckets: Record<string, number> = {};
    rows.forEach((r) => {
      const d = new Date(r.created_at); if (Number.isNaN(d.getTime())) return;
      const k = monthKey(d);
      buckets[k] = (buckets[k] || 0) + (Number(r[cfg.column]) || 0);
    });
    const series = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b))
      .slice(-12).map(([month, amount]) => ({ month, amount }));
    return { value: series.reduce((s, p) => s + p.amount, 0), series };
  }

  return { value: 0, series: [] };
}

export function useWidgetData(widget: ReportDashboardWidget | null | undefined) {
  const { data: sources } = useReportSources();
  const src = sources?.find((s) => s.sourceKey === widget?.sourceKey);
  const table = src?.tableName;
  return useQuery({
    queryKey: ['reports', 'widget-data', widget?.id, table],
    queryFn: () => runWidget(widget!, table!),
    enabled: !!widget && !!table,
    staleTime: 60_000,
  });
}
